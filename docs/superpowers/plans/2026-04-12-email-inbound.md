# Email Inbound — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre aux marchands de recevoir leurs factures fournisseurs automatiquement via une adresse email dédiée `factures-{slug}@in.twostep.fr`, sans OAuth ni accès à leur boîte mail.

**Architecture:** Resend Inbound reçoit les emails sur le sous-domaine `in.twostep.fr` (catch-all), POST un webhook vers `/api/inbound-email`. L'API extrait le slug du destinataire, identifie le marchand, télécharge les pièces jointes PDF/CSV/XLSX via l'API Resend, et les injecte dans le pipeline de parsing existant (`parseInvoice`). L'UI affiche un bandeau dans l'onglet Entrées avec l'adresse à copier et un guide de configuration du transfert automatique.

**Tech Stack:** Next.js App Router, Resend SDK (déjà installé), Supabase, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-12-email-inbound-design.md`

---

## File Structure

| Action | Path | Responsabilité |
|--------|------|----------------|
| Create | `supabase/migrations/057_inbound_email_slug.sql` | Ajoute `inbound_email_slug` sur `merchants` |
| Create | `src/app/api/inbound-email/route.ts` | Webhook Resend — reçoit emails, extrait PJ, lance parsing |
| Create | `src/app/api/email/inbound-address/route.ts` | GET — retourne l'adresse inbound du marchand |
| Create | `src/components/dashboard/email-inbound-banner.tsx` | Bandeau UI (état non connecté / connecté) |
| Create | `src/components/dashboard/email-setup-guide.tsx` | Guide "Comment activer le transfert" |
| Modify | `src/app/dashboard/invoices/page.tsx` | Intégrer le bandeau + afficher source dans le tableau |

---

### Task 1: Migration Supabase — `inbound_email_slug`

**Files:**
- Create: `supabase/migrations/057_inbound_email_slug.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- 057_inbound_email_slug.sql
-- Adresse email dédiée par marchand pour réception automatique de factures
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS inbound_email_slug text;

-- Générer le slug pour les marchands existants (basé sur leur slug existant)
UPDATE merchants SET inbound_email_slug = slug WHERE inbound_email_slug IS NULL AND slug IS NOT NULL;

-- Contrainte d'unicité (après population pour éviter les conflits)
ALTER TABLE merchants ADD CONSTRAINT merchants_inbound_email_slug_unique UNIQUE (inbound_email_slug);
```

- [ ] **Step 2: Appliquer la migration sur Supabase**

Run: `npx supabase db push` (ou appliquer manuellement via le dashboard Supabase)

- [ ] **Step 3: Vérifier**

Dans le dashboard Supabase → Table `merchants` → vérifier que la colonne `inbound_email_slug` existe et que les valeurs sont peuplées depuis `slug`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/057_inbound_email_slug.sql
git commit -m "feat(db): add inbound_email_slug to merchants for email forwarding"
```

---

### Task 2: API GET `/api/email/inbound-address`

**Files:**
- Create: `src/app/api/email/inbound-address/route.ts`

- [ ] **Step 1: Créer la route API**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN ?? "in.twostep.fr";

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id, inbound_email_slug")
        .eq("user_id", user.id)
        .single();

    if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

    const slug = merchant.inbound_email_slug;
    if (!slug) return NextResponse.json({ error: "No inbound slug" }, { status: 404 });

    const address = `factures-${slug}@${INBOUND_DOMAIN}`;

    // Check if any invoice arrived via email
    const { data: lastEmail } = await supabase
        .from("invoices")
        .select("received_at")
        .eq("merchant_id", merchant.id)
        .eq("source", "email")
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    return NextResponse.json({
        address,
        has_received: !!lastEmail,
        last_received_at: lastEmail?.received_at ?? null,
    });
}
```

- [ ] **Step 2: Tester manuellement**

Démarrer le dev server (`npm run dev` sur port 3001), se connecter en tant que marchand, puis :

```bash
curl http://localhost:3001/api/email/inbound-address -H "Cookie: <session_cookie>"
```

Expected: `{"address":"factures-dear-skin-xxxxxxxx@in.twostep.fr","has_received":false,"last_received_at":null}`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/email/inbound-address/route.ts
git commit -m "feat(api): add GET /api/email/inbound-address — returns merchant inbound email"
```

---

### Task 3: API POST `/api/inbound-email` — Webhook Resend

**Files:**
- Create: `src/app/api/inbound-email/route.ts`

- [ ] **Step 1: Créer la route webhook**

```typescript
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseInvoice } from "@/lib/parser";
import { captureError } from "@/lib/error";

const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN ?? "in.twostep.fr";
const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET ?? "";

const ACCEPTED_EXTENSIONS = new Set([".pdf", ".xlsx", ".xls", ".csv"]);

function getExtension(filename: string): string {
    const dot = filename.lastIndexOf(".");
    return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function verifyWebhookSignature(body: string, signature: string): boolean {
    if (!WEBHOOK_SECRET) return true; // Skip in dev
    const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
    const rawBody = await request.text();

    // Verify Resend webhook signature
    const signature = request.headers.get("resend-signature") ?? "";
    if (WEBHOOK_SECRET && !verifyWebhookSignature(rawBody, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    // Resend inbound webhook sends { type: "email.received", data: { ... } }
    if (payload.type !== "email.received") {
        return NextResponse.json({ ok: true });
    }

    const emailData = payload.data;
    const emailId = emailData.id;
    const from = emailData.from?.[0]?.email ?? emailData.from ?? "unknown";
    const toList: string[] = Array.isArray(emailData.to)
        ? emailData.to.map((t: { email?: string } | string) => typeof t === "string" ? t : t.email ?? "")
        : [emailData.to ?? ""];

    // Find which merchant this email is for
    const supabase = createAdminClient();
    let merchantId: string | null = null;
    let matchedAddress = "";

    for (const toAddr of toList) {
        const lower = toAddr.toLowerCase();
        if (!lower.endsWith(`@${INBOUND_DOMAIN}`)) continue;

        // Extract slug: "factures-dear-skin-abc12345@in.twostep.fr" → "dear-skin-abc12345"
        const prefix = lower.replace(`@${INBOUND_DOMAIN}`, "");
        const slug = prefix.replace(/^factures-/, "");

        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("inbound_email_slug", slug)
            .maybeSingle();

        if (merchant) {
            merchantId = merchant.id;
            matchedAddress = toAddr;
            break;
        }
    }

    if (!merchantId) {
        // No matching merchant — ignore silently
        return NextResponse.json({ ok: true, ignored: "no matching merchant" });
    }

    try {
        // Fetch attachments via Resend API
        const resend = new Resend(process.env.RESEND_API_KEY);
        const attachmentsRes = await resend.emails.get(emailId);

        const attachments = (attachmentsRes.data as { attachments?: { filename: string; content: string; content_type: string }[] })?.attachments ?? [];

        // Filter for invoice file types
        const invoiceAttachments = attachments.filter(
            (att) => ACCEPTED_EXTENSIONS.has(getExtension(att.filename))
        );

        if (invoiceAttachments.length === 0) {
            // No relevant attachments — ignore
            return NextResponse.json({ ok: true, ignored: "no invoice attachments" });
        }

        // Process each attachment through the existing pipeline
        for (const att of invoiceAttachments) {
            const buffer = Buffer.from(att.content, "base64");

            // Dedup: hash file content
            const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
            const { data: existing } = await supabase
                .from("invoices")
                .select("id")
                .eq("merchant_id", merchantId)
                .eq("file_hash", fileHash)
                .maybeSingle();

            if (existing) continue; // Already imported

            // Upload to storage
            const storagePath = `${merchantId}/${Date.now()}_${att.filename}`;
            const { error: storageError } = await supabase.storage
                .from("invoices")
                .upload(storagePath, buffer, { contentType: att.content_type });

            if (storageError) {
                console.error("[inbound-email] Storage upload failed:", storageError);
                continue;
            }

            const { data: signedUrlData } = await supabase.storage
                .from("invoices")
                .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

            const fileUrl = signedUrlData?.signedUrl ?? storagePath;

            // Create invoice record
            const { data: invoice, error: insertError } = await supabase
                .from("invoices")
                .insert({
                    merchant_id: merchantId,
                    source: "email",
                    status: "extracting",
                    file_url: fileUrl,
                    file_hash: fileHash,
                    sender_email: from,
                    supplier_name: null,
                    received_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (insertError || !invoice) {
                console.error("[inbound-email] Invoice insert failed:", insertError);
                continue;
            }

            // Parse the invoice
            try {
                const parsed = await parseInvoice(buffer, att.filename);

                await supabase
                    .from("invoices")
                    .update({
                        status: "parsed",
                        supplier_name: parsed.supplier_name ?? null,
                        parsed_at: new Date().toISOString(),
                    })
                    .eq("id", invoice.id);

                if (parsed.items.length > 0) {
                    await supabase.from("invoice_items").insert(
                        parsed.items.map((item) => ({
                            invoice_id: invoice.id,
                            name: item.name,
                            quantity: item.quantity,
                            unit_price_ht: item.unit_price,
                            ean: item.ean,
                            sku: item.sku,
                            status: "detected",
                        })),
                    );
                }
            } catch (parseError) {
                await supabase
                    .from("invoices")
                    .update({ status: "failed" })
                    .eq("id", invoice.id);
                console.error("[inbound-email] Parse failed:", att.filename, parseError);
            }
        }

        return NextResponse.json({ ok: true, processed: invoiceAttachments.length });
    } catch (e) {
        captureError(e, { route: "inbound-email", merchantId });
        return NextResponse.json({ error: "Processing error" }, { status: 500 });
    }
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `cd twostep-nextjs && npx tsc --noEmit`
Expected: 0 erreurs liées au nouveau fichier.

Note : la structure exacte du payload Resend Inbound (`payload.data.attachments` vs API séparée) devra être vérifiée lors du test réel. L'implémentation ci-dessus utilise `resend.emails.get(emailId)` comme fallback si les attachments ne sont pas dans le webhook payload. Adapter selon la doc Resend au moment du test.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/inbound-email/route.ts
git commit -m "feat(api): add POST /api/inbound-email — Resend webhook for automatic invoice intake"
```

---

### Task 4: Composant `EmailInboundBanner`

**Files:**
- Create: `src/components/dashboard/email-inbound-banner.tsx`

- [ ] **Step 1: Créer le composant**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/components/dashboard/toast";

type InboundStatus = {
    address: string;
    has_received: boolean;
    last_received_at: string | null;
};

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days}j`;
}

export function EmailInboundBanner({ onShowGuide }: { onShowGuide: () => void }) {
    const { merchant } = useMerchant();
    const { toast } = useToast();
    const [status, setStatus] = useState<InboundStatus | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!merchant) return;
        fetch("/api/email/inbound-address")
            .then((r) => r.json())
            .then((data) => setStatus(data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [merchant]);

    const copyAddress = useCallback(() => {
        if (!status?.address) return;
        navigator.clipboard.writeText(status.address);
        toast("Adresse copiée !");
    }, [status, toast]);

    if (loading || !status) return null;

    // État 2 : email actif
    if (status.has_received) {
        return (
            <div className="mb-6 rounded-xl border border-success bg-success-secondary p-4">
                <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success-primary/10">
                        <svg className="size-[18px] text-success-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
                        </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-success-primary">Transfert email actif</p>
                        <p className="mt-0.5 text-xs text-success-primary/80">
                            {status.address}
                            {status.last_received_at && ` — Dernière facture ${timeAgo(status.last_received_at)}`}
                        </p>
                    </div>
                    <button
                        onClick={copyAddress}
                        className="shrink-0 rounded-lg border border-success px-3 py-1.5 text-xs font-medium text-success-primary transition hover:bg-success-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                    >
                        Copier l'adresse
                    </button>
                </div>
            </div>
        );
    }

    // État 1 : email non configuré
    return (
        <div className="mb-6 rounded-xl border border-brand/20 bg-brand-secondary/30 p-5">
            <div className="flex items-start gap-3.5">
                <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-secondary">
                    <svg className="size-[22px] text-brand-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="M22 7l-10 7L2 7" />
                    </svg>
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-primary">Recevez vos factures automatiquement</p>
                    <p className="mt-1 text-xs leading-relaxed text-tertiary">
                        Activez le transfert automatique depuis votre boîte mail. Vos factures fournisseurs arriveront ici toutes seules.
                    </p>

                    <div className="mt-3.5 flex items-center gap-2">
                        <div className="min-w-0 flex-1 rounded-lg border border-secondary bg-primary px-3.5 py-2.5 font-mono text-[13px] text-primary">
                            {status.address}
                        </div>
                        <button
                            onClick={copyAddress}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-solid px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-brand-solid_hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                        >
                            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <rect x="9" y="9" width="13" height="13" rx="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                            Copier
                        </button>
                    </div>

                    <button
                        onClick={onShowGuide}
                        className="mt-2.5 text-xs font-medium text-brand-secondary transition hover:text-brand-secondary_hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                    >
                        Comment activer le transfert automatique ? →
                    </button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `cd twostep-nextjs && npx tsc --noEmit`
Expected: 0 erreurs.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/email-inbound-banner.tsx
git commit -m "feat(ui): add EmailInboundBanner — shows inbound address + copy button"
```

---

### Task 5: Composant `EmailSetupGuide`

**Files:**
- Create: `src/components/dashboard/email-setup-guide.tsx`

- [ ] **Step 1: Créer le composant guide**

```tsx
"use client";

import { useState } from "react";

type Provider = "gmail" | "outlook" | "yahoo" | "other";

const PROVIDERS: { id: Provider; name: string; subtitle: string }[] = [
    { id: "gmail", name: "Gmail", subtitle: "3 étapes — 30 secondes" },
    { id: "outlook", name: "Outlook / Hotmail", subtitle: "3 étapes — 30 secondes" },
    { id: "yahoo", name: "Yahoo", subtitle: "3 étapes — 30 secondes" },
    { id: "other", name: "Autre (Orange, Free, SFR...)", subtitle: "Guide général" },
];

const STEPS: Record<Provider, { step: string; detail: string }[]> = {
    gmail: [
        { step: "Ouvrez les paramètres Gmail", detail: "Cliquez sur ⚙️ en haut à droite → \"Voir tous les paramètres\"" },
        { step: "Onglet \"Transfert et POP/IMAP\"", detail: "Cliquez sur \"Ajouter une adresse de transfert\" et collez votre adresse Two-Step" },
        { step: "Confirmez", detail: "Gmail enverra un email de vérification — cliquez le lien, puis activez \"Transférer une copie\"" },
    ],
    outlook: [
        { step: "Ouvrez les paramètres", detail: "Cliquez sur ⚙️ → \"Afficher tous les paramètres d'Outlook\"" },
        { step: "Courrier → Transfert", detail: "Activez le transfert et collez votre adresse Two-Step" },
        { step: "Enregistrez", detail: "Cochez \"Conserver une copie des messages transférés\" et enregistrez" },
    ],
    yahoo: [
        { step: "Ouvrez les paramètres", detail: "Cliquez sur ⚙️ → \"Autres paramètres de messagerie\"" },
        { step: "Boîtes aux lettres → Transfert", detail: "Collez votre adresse Two-Step et vérifiez" },
        { step: "Confirmez", detail: "Yahoo enverra un code de vérification — entrez-le pour activer" },
    ],
    other: [
        { step: "Ouvrez les paramètres de votre boîte mail", detail: "Cherchez \"Transfert\", \"Redirection\" ou \"Forwarding\"" },
        { step: "Ajoutez l'adresse Two-Step", detail: "Collez votre adresse factures-...@in.twostep.fr" },
        { step: "Activez et confirmez", detail: "Certains fournisseurs demandent une vérification par email" },
    ],
};

export function EmailSetupGuide({ address, onClose }: { address: string; onClose: () => void }) {
    const [selected, setSelected] = useState<Provider | null>(null);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Guide de configuration email">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-overlay" onClick={onClose} />

            {/* Sheet */}
            <div className="relative w-full max-w-lg rounded-t-2xl bg-primary p-6 shadow-xl sm:rounded-2xl" style={{ overscrollBehavior: "contain" }}>
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-primary">
                        {selected ? PROVIDERS.find((p) => p.id === selected)!.name : "Activez le transfert en 30 secondes"}
                    </h2>
                    <button
                        onClick={selected ? () => setSelected(null) : onClose}
                        className="flex size-8 items-center justify-center rounded-lg text-tertiary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        aria-label={selected ? "Retour" : "Fermer"}
                    >
                        {selected ? "←" : "✕"}
                    </button>
                </div>

                {!selected ? (
                    /* Provider list */
                    <div className="space-y-2.5">
                        {PROVIDERS.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => setSelected(p.id)}
                                className="flex w-full items-center gap-3 rounded-xl border border-secondary p-4 text-left transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                            >
                                <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-secondary">
                                    {p.id === "gmail" ? "G" : p.id === "outlook" ? "O" : p.id === "yahoo" ? "Y!" : "✉"}
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-primary">{p.name}</p>
                                    <p className="text-xs text-tertiary">{p.subtitle}</p>
                                </div>
                                <svg className="size-4 text-quaternary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path d="M9 18l6-6-6-6" />
                                </svg>
                            </button>
                        ))}

                        <div className="mt-4 rounded-xl bg-secondary p-3.5">
                            <p className="text-xs leading-relaxed text-tertiary">
                                <strong className="text-secondary">Besoin d'aide ?</strong> Lors de notre prochaine visite, nous pouvons l'activer ensemble en 30 secondes sur votre téléphone.
                            </p>
                        </div>
                    </div>
                ) : (
                    /* Steps for selected provider */
                    <div>
                        {/* Address reminder */}
                        <div className="mb-4 rounded-lg bg-secondary px-3.5 py-2.5">
                            <p className="text-[11px] text-tertiary">Votre adresse à coller :</p>
                            <p className="mt-0.5 font-mono text-xs font-medium text-primary">{address}</p>
                        </div>

                        <div className="space-y-4">
                            {STEPS[selected].map((s, i) => (
                                <div key={i} className="flex gap-3">
                                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-secondary text-xs font-bold text-brand-secondary">
                                        {i + 1}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-primary">{s.step}</p>
                                        <p className="mt-0.5 text-xs leading-relaxed text-tertiary">{s.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={onClose}
                            className="mt-6 w-full rounded-xl bg-brand-solid py-3 text-sm font-semibold text-white transition hover:bg-brand-solid_hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                        >
                            C'est fait !
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `cd twostep-nextjs && npx tsc --noEmit`
Expected: 0 erreurs.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/email-setup-guide.tsx
git commit -m "feat(ui): add EmailSetupGuide — step-by-step forwarding instructions per provider"
```

---

### Task 6: Intégrer dans la page Entrées

**Files:**
- Modify: `src/app/dashboard/invoices/page.tsx`

- [ ] **Step 1: Ajouter les imports et le state pour le guide**

Au début du fichier, ajouter les imports :

```typescript
import { EmailInboundBanner } from "@/components/dashboard/email-inbound-banner";
import { EmailSetupGuide } from "@/components/dashboard/email-setup-guide";
```

Dans le composant `InvoicesPage`, ajouter le state :

```typescript
const [showGuide, setShowGuide] = useState(false);
const [inboundAddress, setInboundAddress] = useState("");
```

Et un `useEffect` pour récupérer l'adresse (pour le guide) :

```typescript
useEffect(() => {
    fetch("/api/email/inbound-address")
        .then((r) => r.json())
        .then((data) => { if (data.address) setInboundAddress(data.address); })
        .catch(() => {});
}, []);
```

- [ ] **Step 2: Insérer le bandeau entre les MetricCards et la zone d'upload**

Après le bloc `<div className="mb-8 grid grid-cols-2 ...">` (les MetricCards) et avant le bloc `{/* Deliveries pending confirmation */}`, ajouter :

```tsx
<EmailInboundBanner onShowGuide={() => setShowGuide(true)} />
```

- [ ] **Step 3: Ajouter le guide modal en fin de JSX**

Juste avant le `</>` fermant du return, ajouter :

```tsx
{showGuide && inboundAddress && (
    <EmailSetupGuide
        address={inboundAddress}
        onClose={() => setShowGuide(false)}
    />
)}
```

- [ ] **Step 4: Ajouter la source dans le tableau des factures**

Dans le `<tbody>`, sous la cellule fournisseur, ajouter un indicateur de source. Remplacer :

```tsx
<td className="text-primary px-4 py-3 font-medium">
    {invoice.supplier_name ?? invoice.sender_email ?? "—"}
</td>
```

Par :

```tsx
<td className="px-4 py-3">
    <p className="text-primary font-medium">
        {invoice.supplier_name ?? invoice.sender_email ?? "—"}
    </p>
    <p className="text-tertiary text-[11px]">
        {invoice.source === "email" ? "via email" : "upload manuel"}
    </p>
</td>
```

- [ ] **Step 5: Vérifier visuellement**

Run: `cd twostep-nextjs && npm run dev` (port 3001)

Ouvrir http://localhost:3001/dashboard/invoices et vérifier :
- Le bandeau bleu s'affiche avec l'adresse et le bouton Copier
- Le bouton "Copier" copie l'adresse dans le presse-papiers
- Le lien "Comment activer ?" ouvre le guide modal
- Le guide affiche les 4 fournisseurs, chacun avec 3 étapes
- La zone d'upload est toujours visible en dessous

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/invoices/page.tsx
git commit -m "feat(ui): integrate email inbound banner + setup guide in Entrées tab"
```

---

### Task 7: Nettoyage — Supprimer l'ancien code OAuth

**Files:**
- Delete: `src/app/api/email/connect/route.ts`
- Delete: `src/app/api/email/connect/callback/route.ts`
- Delete: `src/app/api/email/disconnect/route.ts`
- Delete: `src/app/api/cron/scan-emails/route.ts`
- Delete: `src/lib/email/gmail.ts`
- Delete: `src/lib/email/outlook.ts`
- Delete: `src/lib/email/imap.ts`
- Delete: `src/lib/email/encryption.ts`
- Delete: `src/hooks/use-email.ts`
- Keep: `src/lib/email/types.ts` (utilisé potentiellement ailleurs)
- Keep: `src/lib/email/resend.ts` (envoi d'emails transactionnels)
- Keep: `src/app/api/email/status/route.ts` (peut être réutilisé ou supprimé plus tard)

- [ ] **Step 1: Supprimer les fichiers OAuth**

```bash
cd twostep-nextjs
rm src/app/api/email/connect/route.ts
rm src/app/api/email/connect/callback/route.ts
rm -rf src/app/api/email/connect  # dossier vide après suppression
rm src/app/api/email/disconnect/route.ts
rm -rf src/app/api/email/disconnect
rm src/app/api/cron/scan-emails/route.ts
rm -rf src/app/api/cron/scan-emails
rm src/lib/email/gmail.ts
rm src/lib/email/outlook.ts
rm src/lib/email/imap.ts
rm src/lib/email/encryption.ts
rm src/hooks/use-email.ts
```

- [ ] **Step 2: Vérifier qu'aucun import ne référence les fichiers supprimés**

Run: `cd twostep-nextjs && npx tsc --noEmit`

Si des erreurs apparaissent, supprimer les imports orphelins.

- [ ] **Step 3: Vérifier que le build passe**

Run: `cd twostep-nextjs && npm run build`
Expected: Build réussi sans erreurs.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy OAuth email flow — replaced by inbound forwarding"
```

---

## Prérequis Thomas (hors code)

Ces étapes ne peuvent pas être faites par Claude Code — Thomas doit les faire manuellement :

1. **Créer un compte Resend** sur resend.com (si pas déjà fait — le SDK est déjà installé)
2. **Ajouter le domaine `in.twostep.fr`** dans le dashboard Resend
3. **Ajouter le MX record** sur le sous-domaine `in.twostep.fr` chez Infomaniak (Resend fournit les valeurs exactes)
4. **Créer un webhook** dans Resend pointant vers `https://twostep.fr/api/inbound-email` pour l'événement `email.received`
5. **Ajouter les variables d'environnement** sur Vercel :
   - `RESEND_API_KEY` (déjà existante ?)
   - `RESEND_WEBHOOK_SECRET` (fourni par Resend)
   - `INBOUND_EMAIL_DOMAIN=in.twostep.fr`
6. **Appliquer la migration 057** sur Supabase production
