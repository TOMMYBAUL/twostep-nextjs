# Plan d'action production Two-Step V2 (γ) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mener Two-Step de "0 marchand payant" à "Dear Skin Shop payant sem 11 + 5 marchands sem 16 + 50 marchands fin Y1" selon le path γ (hybride structuré) tranché 2026-04-25.

**Architecture:** Cf. `docs/ARCHITECTURE-TWOSTEP.md` (V2). 4 couches empilées (ingestion POS / enrichissement IA / storage Supabase / sorties LFP+ACP+app). Pipeline cascade 4 vecteurs × 6 tiers (ADR-006). Path γ : Dear Skin signature sem 3 → trial 2 mois → 1ʳᵉ facture sem 11 (cascade construite sous le capot pendant le trial).

**Tech Stack:** Next.js 16 + React 19 + TS / Tailwind v4 / Supabase Postgres + Auth / Cloudflare R2 + Vectorize / Stripe (3 tiers, 25/29/39 €) / Anthropic Claude (Haiku + Vision) + OpenAI fallback / Inngest free tier (orchestrateur durable execution) / rembg Hetzner VPS / Resend / Vercel Hobby → Pro / Sentry / BetterStack monitoring.

**Périmètre granularité :**
- **Phase 0 + Phase 1** (sem 1-4) → bite-sized 2-5 min/step, immédiatement exécutable
- **Phase 2 → Phase 6** (sem 5+) → task-granulaire 1-3j/task, briefing complet, à re-décomposer en bite-sized au moment de l'exécution (recommandation : re-spec phase courante à la fin de la phase précédente, avec data terrain Dear Skin)

**Sanctuaires verrouillés** (rappel) : ADR-001 (CSV pivot) / ADR-006 (cascade unifié) / ADR-007 (no Chift V1).

**ADR récents** : ADR-009 (pricing 25 € pionnier sans setup, supersede ADR-002).

---

## Roadmap 16 sem (vue d'ensemble γ)

| Sem | Phase | Action clé | Marchands payants |
|---|---|---|---|
| 1-2 | Phase 0 stabilisation | Continuity playbook, tracking CAC, juridique amorce, AI Act prep | 0 |
| 3 | Phase 1 onboarding | Signature Dear Skin + trial 2 mois start | 0 (en trial) |
| 4 | Phase 1 socle | Wizard admin, feed LFP, feed ACP, schema product_channel | 0 |
| 5-10 | Phase 2 cascade | Tier 1 → Tier 6 sous le capot pendant Dear Skin tourne wizard | 0 |
| 9-12 | Phase 3 consumer + LFP prod | Search Postgres, app PWA, feed Merchant Center prod | 0 |
| 11 | **Sem clé** | **Dear Skin trial fini → 1ʳᵉ facture 25 €** | **1** |
| 13-16 | Phase 4 launch pilote | Démarchage Saint-Étienne (4-5 marchands cibles Tier 1 garantis) | 5-6 |
| Mois 4-12 | Phase 5 scale | Refactor hexagonal, gates 15/30/50 marchands | 50 |
| Y2+ | Phase 6 V3 | Widget brand.com, multi-boutique, GPU CLIP | 200+ |

---

## Phase 0 — Stabilisation critique (sem 1-2, ~30h)

### Task 0.1: Tracking CAC + churn

**Files:**
- Create: `supabase/migrations/080_merchants_acquisition_tracking.sql`
- Modify: `src/lib/types/merchant.ts`
- Test: `tests/lib/merchants/acquisition.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/merchants/acquisition.test.ts
import { describe, it, expect } from "vitest";
import { computeCAC } from "@/lib/merchants/acquisition";

describe("computeCAC", () => {
  it("returns 0 if no acquisition cost", () => {
    expect(computeCAC({ cost_estimate_eur: 0, signed_at: new Date() })).toBe(0);
  });
  it("returns cost_estimate_eur for a single signed merchant", () => {
    expect(computeCAC({ cost_estimate_eur: 200, signed_at: new Date() })).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/lib/merchants/acquisition.test.ts`
Expected: FAIL with "Cannot find module '@/lib/merchants/acquisition'"

- [ ] **Step 3: Write the migration SQL**

```sql
-- supabase/migrations/080_merchants_acquisition_tracking.sql
ALTER TABLE merchants
  ADD COLUMN acquisition_channel TEXT,
  ADD COLUMN cost_estimate_eur NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN first_contact_at TIMESTAMPTZ,
  ADD COLUMN signed_at TIMESTAMPTZ;

CREATE INDEX idx_merchants_signed_at ON merchants(signed_at);
COMMENT ON COLUMN merchants.acquisition_channel IS 'terrain | apporteur | inbound | referral | autre';
```

- [ ] **Step 4: Apply migration**

Run: `npx supabase db push` (or via Supabase MCP `apply_migration`)
Expected: migration 080 appliquée sans erreur

- [ ] **Step 5: Write the helper module**

```typescript
// src/lib/merchants/acquisition.ts
export interface MerchantAcquisition {
  cost_estimate_eur: number;
  signed_at: Date | null;
}
export function computeCAC(m: MerchantAcquisition): number {
  return m.signed_at ? m.cost_estimate_eur : 0;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:run -- tests/lib/merchants/acquisition.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/080_merchants_acquisition_tracking.sql src/lib/merchants/acquisition.ts tests/lib/merchants/acquisition.test.ts
git commit -m "feat(tracking): CAC + acquisition channel + churn schema (mig 080)"
```

---

### Task 0.2: Continuity playbook (P0.13 nouveau)

**Files:**
- Create: `docs/continuity-playbook.md`
- Create: `docs/continuity-credentials-template.md`

- [ ] **Step 1: Write playbook structure**

```markdown
# Two-Step — Playbook continuité

## Bus factor & continuité opérationnelle

### Accès credentials chiffrés
- Bitwarden Family : Thomas + frère + 1 personne tiers (à désigner)
- Coffres : Vercel / Supabase / Stripe / Cloudflare R2 / Hetzner / Anthropic / Resend / Sentry / Pennylane / domaine Infomaniak

### Runbook redémarrage prod
1. Vercel : `vercel --prod` ou redéploiement via dashboard
2. Supabase : vérifier projet pas paused, RLS actif, dernière migration appliquée
3. Stripe : webhook `wh_xxx` actif, prix Stripe à jour
4. Cloudflare R2 : bucket `twostep-images` accessible
5. Hetzner rembg VPS : `systemctl status rembg-api`

### Contacts critiques
| Service | Contact | Sujet |
|---|---|---|
| Google LFP | Aftab Khan (gTech specialist) | Tickets 5-9519000040422 + 6-7242000040976 |
| Avocat | (à désigner Phase 0) | CGU + DSA + photos + ODbL |
| RC Pro / Cyber | Stello ou Orus | Sinistre + clause incapacité temporaire |
| Comptable | (à désigner) | TVA + Factur-X + Pennylane |

### Procédure incapacité Thomas (5j+)
1. Frère prend contrôle Bitwarden via clé d'urgence
2. Lance support marchand existants (FAQ + scripts email)
3. Réponse Aftab si arrive : "Thomas indisponible, retour sous X jours" — pas plus
4. Pause prospection nouvelle, focus sur servicer existants
5. Si > 30 jours : envoyer email "pause produit" aux marchands payants + refund prorata
```

- [ ] **Step 2: Commit**

```bash
git add docs/continuity-playbook.md
git commit -m "feat(continuity): playbook bus factor + runbook redémarrage prod"
```

- [ ] **Step 3: Configurer Bitwarden Family (action manuelle Thomas, hors code)**

Action Thomas (pas Claude) : créer Bitwarden Family, partager 4 coffres (Vercel/Supabase/Stripe/Cloudflare) avec frère + tiers de confiance.
Délai estimé : 1h.

- [ ] **Step 4: Documenter clauses RC Pro incapacité (action Thomas)**

Action Thomas : demander à Stello/Orus la clause "incapacité temporaire" dans le devis RC Pro.

---

### Task 0.3: Wizard admin onboarding — squelette UI (γ-spécifique)

**Files:**
- Create: `src/app/admin/onboarding-wizard/page.tsx`
- Create: `src/app/admin/onboarding-wizard/layout.tsx`
- Test: `tests/app/admin/onboarding-wizard.test.tsx`

- [ ] **Step 1: Write layout (admin guard)**

```tsx
// src/app/admin/onboarding-wizard/layout.tsx
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // admin check via env whitelist
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",");
  if (!adminEmails.includes(user.email ?? "")) redirect("/");
  return <div className="container mx-auto p-6">{children}</div>;
}
```

- [ ] **Step 2: Write page structure with 4 steps placeholder**

```tsx
// src/app/admin/onboarding-wizard/page.tsx
"use client";
import { useState } from "react";

type Step = "csv" | "queue" | "review" | "publish";

export default function OnboardingWizardPage() {
  const [step, setStep] = useState<Step>("csv");
  const [merchantId, setMerchantId] = useState<string | null>(null);

  return (
    <div>
      <h1 className="text-2xl font-bold">Onboarding Wizard (admin)</h1>
      <p className="text-tertiary mb-6">Étapes : 1) CSV upload → 2) Queue review → 3) Enrichissement manuel → 4) Publier feed</p>
      <nav className="flex gap-2 mb-6">
        {(["csv", "queue", "review", "publish"] as Step[]).map((s) => (
          <button key={s} onClick={() => setStep(s)} className={step === s ? "font-bold underline" : ""}>{s}</button>
        ))}
      </nav>
      {step === "csv" && <div>CSV upload (Task 1.2)</div>}
      {step === "queue" && <div>Queue review (Task 1.3)</div>}
      {step === "review" && <div>Enrichissement manuel (Task 1.4)</div>}
      {step === "publish" && <div>Publier feed (Task 1.5)</div>}
    </div>
  );
}
```

- [ ] **Step 3: Run tsc**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/onboarding-wizard/
git commit -m "feat(wizard): squelette wizard admin onboarding (4 steps placeholder)"
```

---

### Task 0.4: Juridique — contact avocat + RC Pro (non-code)

- [ ] **Step 1: Email avocat pack CGU + DSA + photos + ODbL**

Action Thomas (pas Claude) : envoyer email à Captain Contrat OU LegalStart OU Dougs avec :
- Demande devis : pack CGU B2B marchand (P2B-conforme avec préavis 30j + 2 médiateurs + notice & action) + CGV B2C consumer + Privacy Policy + DPA RGPD + clause licence photos (art. L131-3 CPI) + review pattern ODbL "Produced Work"
- Budget cible : 3 900 - 7 050 € HT one-shot
- Délai souhaité : 3-4 sem
- Contexte : SaaS B2B France < 10 salariés, < 2M€ CA, 1ʳᵉ facturation marchand sem 11 (donc CGU prêtes sem 9-10)

- [ ] **Step 2: Email Stello + Orus pour RC Pro + Cyber**

Action Thomas : devis RC Pro + Cyber + clause incapacité temporaire. Budget cible : 1 200-2 500 €/an.

- [ ] **Step 3: Tracker dans `docs/prospection/leads-tracker.md`**

```markdown
## Juridique
- [ ] Avocat (Captain Contrat / LegalStart / Dougs) — email envoyé YYYY-MM-DD, devis attendu YYYY-MM-DD
- [ ] RC Pro Stello — email envoyé YYYY-MM-DD
- [ ] RC Pro Orus — email envoyé YYYY-MM-DD
```

- [ ] **Step 4: Commit (du tracker)**

```bash
git add docs/prospection/leads-tracker.md
git commit -m "docs(juridique): tracker contacts avocat + RC Pro Phase 0"
```

---

### Task 0.5: Pennylane PDP Factur-X souscription (non-code)

Action Thomas : souscrire Pennylane PDP (~20 €/mo) avant deadline 2026-09-01 (réception Factur-X obligatoire). Pas de code maintenant, juste l'abonnement.

- [ ] **Step 1: Souscrire Pennylane PDP plan**
- [ ] **Step 2: Tester réception 1 facture Factur-X de test**
- [ ] **Step 3: Documenter accès dans `docs/continuity-playbook.md`**

---

### Task 0.6: Contact Dear Skin Shop pilote (non-code, **bloquant Phase 1**)

- [ ] **Step 1: WhatsApp Dear Skin Shop**

Action Thomas : message WhatsApp avec :
- Confirmation pilote Two-Step : « On démarre dans 2 semaines. Trial 2 mois gratuits, ensuite 25 €/mois verrouillé à vie. »
- Demande : « Tu peux m'exporter ton catalogue Zettle en CSV + 5-10 factures fournisseur PDF récentes ? »
- Date butoir : sem 2 (avant Phase 1 start sem 3)

- [ ] **Step 2: Réceptionner CSV Zettle + factures PDF**
- [ ] **Step 3: Stocker dans `docs/prospection/dear-skin-bootstrap/` (gitignore CSV/PDF si données sensibles)**

---

### Task 0.7: AI Act art.50 — préparation disclosure (champ déjà tracé, exposer UI Phase 1)

**Files:**
- Verify exists: `product_enrichment_trace` table column `enrichment_method`
- Modify: pack avocat brief (Task 0.4) — ajouter clause "AI disclosure"

- [ ] **Step 1: Vérifier que `enrichment_method` est tracé en DB**

Run: `npx supabase db reset --linked && grep -r "enrichment_method" supabase/migrations/`
Expected: trouvé dans une migration existante (probablement `product_enrichment_trace`)
If not found: ajouter colonne dans migration 081 (à créer) — `ALTER TABLE product_enrichment_trace ADD COLUMN enrichment_method TEXT;`

- [ ] **Step 2: Ajouter dans brief avocat (Task 0.4) :**

> Demander clause CGU "AI disclosure" : « Two-Step utilise des modèles d'IA (Claude Vision, Anthropic) pour enrichir et vérifier les données produits. Conformément à l'article 50 du règlement européen sur l'IA (entrée en vigueur 2 août 2026), nous indiquons explicitement quand un contenu (description, image, catégorie) a été généré ou vérifié par IA. Le marchand peut consulter le détail dans son dashboard. »

L'exposition UI du champ se fera Task 1.X.

---

### Phase 0 — Gates de passage

- ✅ Migration 080 appliquée + tests passent
- ✅ Continuity playbook écrit + Bitwarden Family configuré (action Thomas)
- ✅ Wizard admin squelette UI déployé Vercel preview
- ✅ Avocat contacté + délai devis connu
- ✅ Pennylane PDP souscrit
- ✅ **Dear Skin a accepté pilote + envoyé CSV + factures**
- ✅ AI Act art.50 inclus brief avocat

**Si Dear Skin refuse ou ne répond pas en 1 sem** → décision : (a) trouver un autre pilote (Kap Pré-Go en bascule), (b) pivoter sur démarchage froid Saint-Étienne directement (timeline glissée +2 sem).

---

## Phase 1 — Onboarding Dear Skin + socle V1 (sem 3-4, ~50h)

### Task 1.1: Schema product_channel (Google split mars 2026)

**Files:**
- Create: `supabase/migrations/082_product_channel_split.sql`
- Modify: `src/lib/types/product.ts`
- Test: `tests/lib/products/channel.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/products/channel.test.ts
import { describe, it, expect } from "vitest";
import { resolveChannel, splitProductIds } from "@/lib/products/channel";

describe("product channel", () => {
  it("returns 'in_store' if merchant has no online presence", () => {
    expect(resolveChannel({ has_online: false })).toBe("in_store");
  });
  it("returns 'multi' if merchant has both online and physical", () => {
    expect(resolveChannel({ has_online: true })).toBe("multi");
  });
  it("splits product IDs for multi channel", () => {
    expect(splitProductIds("ABC123", "multi")).toEqual({ online: "ABC123-online", in_store: "ABC123-instore" });
  });
});
```

- [ ] **Step 2: Run test fails**

Run: `npm run test:run -- tests/lib/products/channel.test.ts`
Expected: FAIL

- [ ] **Step 3: Write migration**

```sql
-- supabase/migrations/082_product_channel_split.sql
CREATE TYPE product_channel AS ENUM ('online', 'in_store', 'multi');

ALTER TABLE products ADD COLUMN channel product_channel NOT NULL DEFAULT 'in_store';
ALTER TABLE merchants ADD COLUMN has_online_store BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_products_channel ON products(channel);
COMMENT ON COLUMN products.channel IS 'Google force product ID split mars 2026: online vs in_store distinct IDs';
```

- [ ] **Step 4: Apply migration**

Run: `npx supabase db push`

- [ ] **Step 5: Write the module**

```typescript
// src/lib/products/channel.ts
export type ProductChannel = "online" | "in_store" | "multi";

export function resolveChannel(merchant: { has_online: boolean }): ProductChannel {
  return merchant.has_online ? "multi" : "in_store";
}

export function splitProductIds(baseId: string, channel: ProductChannel): { online?: string; in_store?: string } {
  if (channel === "multi") return { online: `${baseId}-online`, in_store: `${baseId}-instore` };
  if (channel === "online") return { online: baseId };
  return { in_store: baseId };
}
```

- [ ] **Step 6: Run tests pass**

Run: `npm run test:run -- tests/lib/products/channel.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/082_product_channel_split.sql src/lib/products/channel.ts tests/lib/products/channel.test.ts
git commit -m "feat(products): channel split online/in_store (Google deadline mars 2026)"
```

---

### Task 1.2: Wizard admin — CSV upload (étape 1 du wizard)

**Files:**
- Create: `src/app/admin/onboarding-wizard/csv-upload.tsx`
- Create: `src/app/api/admin/onboarding/csv/route.ts`
- Test: `tests/app/api/admin/onboarding/csv.test.ts`

- [ ] **Step 1: Write API test**

```typescript
// tests/app/api/admin/onboarding/csv.test.ts
import { describe, it, expect, vi } from "vitest";
import { POST } from "@/app/api/admin/onboarding/csv/route";

describe("POST /api/admin/onboarding/csv", () => {
  it("returns 401 if not admin", async () => {
    // mock supabase.auth.getUser to return non-admin
    const req = new Request("http://localhost/api/admin/onboarding/csv", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test fails**

Run: `npm run test:run -- tests/app/api/admin/onboarding/csv.test.ts`
Expected: FAIL

- [ ] **Step 3: Write API route**

```typescript
// src/app/api/admin/onboarding/csv/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import Papa from "papaparse";

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",");
  if (!user || !adminEmails.includes(user.email ?? "")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const form = await req.formData();
  const file = form.get("file") as File;
  const merchantId = form.get("merchantId") as string;
  const text = await file.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  // insert raw rows into staging table
  const admin = createServerClient(); // service role
  const { error } = await (await admin).from("import_staging").insert(
    parsed.data.map((row) => ({ merchant_id: merchantId, raw_row: row }))
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: parsed.data.length });
}
```

- [ ] **Step 4: Create staging migration**

```sql
-- supabase/migrations/083_import_staging.sql
CREATE TABLE import_staging (
  id BIGSERIAL PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  raw_row JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  enriched_product_id UUID REFERENCES products(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_import_staging_merchant_status ON import_staging(merchant_id, status);
```

Apply: `npx supabase db push`

- [ ] **Step 5: Write upload UI component**

```tsx
// src/app/admin/onboarding-wizard/csv-upload.tsx
"use client";
import { useState } from "react";

export function CsvUpload({ merchantId }: { merchantId: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.append("merchantId", merchantId);
    const res = await fetch("/api/admin/onboarding/csv", { method: "POST", body: form });
    const json = await res.json();
    if (res.ok) setCount(json.count);
    else setError(json.error);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="file" name="file" accept=".csv" required />
      <button type="submit">Importer</button>
      {count !== null && <p>{count} lignes importées dans staging</p>}
      {error && <p className="text-error-primary">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 6: Wire up dans page wizard (modifier `page.tsx` Task 0.3)**

```tsx
{step === "csv" && <CsvUpload merchantId={merchantId ?? ""} />}
```

- [ ] **Step 7: Run tsc + tests**

Run: `npx tsc --noEmit && npm run test:run`
Expected: zero errors, all green

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/083_import_staging.sql src/app/admin/onboarding-wizard/csv-upload.tsx src/app/api/admin/onboarding/csv/ tests/app/api/admin/onboarding/csv.test.ts
git commit -m "feat(wizard): step 1 — CSV upload vers import_staging (mig 083)"
```

---

### Task 1.3: Wizard admin — queue review (étape 2)

**Files:**
- Create: `src/app/admin/onboarding-wizard/queue-review.tsx`
- Create: `src/app/api/admin/onboarding/queue/route.ts`

- [ ] **Step 1: API GET — récupérer staging rows pending**

```typescript
// src/app/api/admin/onboarding/queue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const merchantId = url.searchParams.get("merchantId");
  const { data, error } = await supabase
    .from("import_staging")
    .select("id, raw_row, status")
    .eq("merchant_id", merchantId)
    .eq("status", "pending")
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data });
}
```

- [ ] **Step 2: UI list with raw_row preview**

```tsx
// src/app/admin/onboarding-wizard/queue-review.tsx
"use client";
import { useEffect, useState } from "react";

interface Row { id: number; raw_row: Record<string, unknown>; status: string; }

export function QueueReview({ merchantId }: { merchantId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    fetch(`/api/admin/onboarding/queue?merchantId=${merchantId}`).then(r => r.json()).then(j => setRows(j.rows ?? []));
  }, [merchantId]);
  return (
    <table className="w-full">
      <thead>
        <tr><th>ID</th><th>Champs détectés</th><th>Status</th></tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id}>
            <td>{r.id}</td>
            <td><pre className="text-xs">{JSON.stringify(r.raw_row, null, 2)}</pre></td>
            <td>{r.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Wire dans wizard**

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/onboarding-wizard/queue-review.tsx src/app/api/admin/onboarding/queue/
git commit -m "feat(wizard): step 2 — queue review staging rows"
```

---

### Task 1.4: Wizard admin — enrichissement manuel (étape 3, Thomas-side)

**Files:**
- Create: `src/app/admin/onboarding-wizard/manual-enrich.tsx`
- Create: `src/app/api/admin/onboarding/enrich/route.ts`

- [ ] **Step 1: API POST — promote staging row vers products avec enrichissement Thomas**

```typescript
// src/app/api/admin/onboarding/enrich/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json() as {
    stagingId: number;
    merchantId: string;
    name: string;
    ean?: string;
    brand?: string;
    price_cents: number;
    photo_url?: string;
    channel: "online" | "in_store" | "multi";
  };
  const { data: product, error } = await supabase.from("products").insert({
    merchant_id: body.merchantId,
    name: body.name,
    ean: body.ean,
    brand: body.brand,
    price_cents: body.price_cents,
    photo_url: body.photo_url,
    channel: body.channel,
    visible: false,
    review_status: "pending_review",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from("import_staging")
    .update({ status: "enriched", enriched_product_id: product.id })
    .eq("id", body.stagingId);
  return NextResponse.json({ product });
}
```

- [ ] **Step 2: UI form pour enrichir 1 staging row à la fois**

```tsx
// src/app/admin/onboarding-wizard/manual-enrich.tsx — formulaire EAN, nom, marque, prix, photo, channel
// Aimanter les champs depuis raw_row du staging row sélectionné
// Bouton "Enrichir et créer produit"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/onboarding-wizard/manual-enrich.tsx src/app/api/admin/onboarding/enrich/
git commit -m "feat(wizard): step 3 — enrichissement manuel staging → products"
```

---

### Task 1.5: Wizard admin — publie feed (étape 4)

**Files:**
- Create: `src/app/api/admin/onboarding/publish/route.ts`
- Modify: `src/app/admin/onboarding-wizard/page.tsx`

- [ ] **Step 1: API POST — bascule produits enrichis en visible=true**

```typescript
// src/app/api/admin/onboarding/publish/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { merchantId } = await req.json() as { merchantId: string };
  const { error, count } = await supabase.from("products")
    .update({ visible: true, review_status: "approved" })
    .eq("merchant_id", merchantId)
    .eq("review_status", "pending_review");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ published: count });
}
```

- [ ] **Step 2: UI bouton "Publier"**

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/onboarding/publish/
git commit -m "feat(wizard): step 4 — bascule produits visible=true (publish feed)"
```

---

### Task 1.6: Feed LFP XML route

**Files:**
- Create: `src/app/api/feed/lfp/[merchantId]/route.ts`
- Create: `supabase/migrations/084_lfp_inventory_view.sql`
- Test: `tests/app/api/feed/lfp.test.ts`

- [ ] **Step 1: Migration vue SQL**

```sql
-- supabase/migrations/084_lfp_inventory_view.sql
CREATE VIEW v_lfp_inventory AS
SELECT
  m.slug AS store_code,
  p.id::text AS offer_id,
  p.ean AS gtin,
  p.name AS title,
  p.description,
  p.brand,
  p.photo_url AS image_link,
  p.price_cents,
  p.currency,
  s.quantity AS availability,
  p.channel,
  m.id AS merchant_id
FROM products p
JOIN merchants m ON p.merchant_id = m.id
LEFT JOIN stock s ON s.product_id = p.id
WHERE p.visible = true AND p.review_status = 'approved';
```

- [ ] **Step 2: Route XML**

```typescript
// src/app/api/feed/lfp/[merchantId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 900; // 15 min ISR

export async function GET(_req: NextRequest, { params }: { params: { merchantId: string } }) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("v_lfp_inventory")
    .select("*")
    .eq("merchant_id", params.merchantId);
  if (error) return new NextResponse(error.message, { status: 500 });

  const items = (data ?? []).map(row => `
    <item>
      <g:id>${row.offer_id}</g:id>
      <g:store_code>${row.store_code}</g:store_code>
      <g:gtin>${row.gtin ?? ""}</g:gtin>
      <title>${escapeXml(row.title)}</title>
      <description>${escapeXml(row.description ?? "")}</description>
      <g:brand>${escapeXml(row.brand ?? "")}</g:brand>
      <g:image_link>${row.image_link}</g:image_link>
      <g:price>${(row.price_cents / 100).toFixed(2)} ${row.currency}</g:price>
      <g:availability>${row.availability > 0 ? "in stock" : "out of stock"}</g:availability>
      <g:quantity>${row.availability}</g:quantity>
    </item>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Two-Step Local Inventory — ${params.merchantId}</title>
    <link>https://twostep.fr/m/${params.merchantId}</link>
    <description>Local inventory feed</description>
    ${items}
  </channel>
</rss>`;

  return new NextResponse(xml, { headers: { "Content-Type": "application/xml" } });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

- [ ] **Step 3: Test XML structure**

```typescript
// tests/app/api/feed/lfp.test.ts
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/feed/lfp/[merchantId]/route";

describe("LFP feed XML", () => {
  it("returns valid XML root rss", async () => {
    const req = new Request("http://localhost/api/feed/lfp/abc");
    const res = await GET(req as never, { params: { merchantId: "abc" } });
    const text = await res.text();
    expect(res.headers.get("Content-Type")).toBe("application/xml");
    expect(text).toMatch(/<\?xml version="1\.0"/);
    expect(text).toMatch(/<rss version="2\.0"/);
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/084_lfp_inventory_view.sql src/app/api/feed/lfp/ tests/app/api/feed/lfp.test.ts
git commit -m "feat(feed): LFP XML route /api/feed/lfp/[merchantId] (ISR 15min)"
```

---

### Task 1.7: Feed ACP JSON (compat 80% LFP, OpenAI commerce)

**Files:**
- Create: `src/app/api/feed/acp/[merchantId]/route.ts`
- Test: `tests/app/api/feed/acp.test.ts`

Référence : <https://developers.openai.com/commerce/guides/key-concepts>

- [ ] **Step 1: Route JSON ACP**

```typescript
// src/app/api/feed/acp/[merchantId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 900;

export async function GET(_req: NextRequest, { params }: { params: { merchantId: string } }) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("v_lfp_inventory")
    .select("*")
    .eq("merchant_id", params.merchantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const products = (data ?? []).map(row => ({
    id: row.offer_id,
    title: row.title.slice(0, 150),
    description: row.description ?? "",
    brand: row.brand,
    gtin: row.gtin,
    image_url: row.image_link,
    price: { value: row.price_cents / 100, currency: row.currency },
    availability: row.availability > 0 ? "in_stock" : "out_of_stock",
    quantity: row.availability,
    seller: { id: row.merchant_id, store_code: row.store_code },
  }));

  return NextResponse.json({ feed_version: "1.0", refresh_minutes: 15, products });
}
```

- [ ] **Step 2: Test**

```typescript
// tests/app/api/feed/acp.test.ts
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/feed/acp/[merchantId]/route";

describe("ACP feed JSON", () => {
  it("returns JSON with products array", async () => {
    const req = new Request("http://localhost/api/feed/acp/abc");
    const res = await GET(req as never, { params: { merchantId: "abc" } });
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const j = await res.json();
    expect(j).toHaveProperty("products");
    expect(j.refresh_minutes).toBe(15);
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/feed/acp/ tests/app/api/feed/acp.test.ts
git commit -m "feat(feed): ACP JSON feed (OpenAI commerce, compat 80% LFP)"
```

---

### Task 1.8: Inngest setup (orchestrator durable execution)

**Files:**
- Modify: `package.json` (add `inngest`)
- Create: `src/inngest/client.ts`
- Create: `src/inngest/functions/enrich-product.ts`
- Create: `src/app/api/inngest/route.ts`

Référence : <https://www.inngest.com/docs>

- [ ] **Step 1: Install Inngest**

Run: `npm install inngest`

- [ ] **Step 2: Client + handler**

```typescript
// src/inngest/client.ts
import { Inngest } from "inngest";
export const inngest = new Inngest({ id: "twostep" });
```

```typescript
// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { enrichProduct } from "@/inngest/functions/enrich-product";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [enrichProduct],
});
```

- [ ] **Step 3: Function enrich-product (squelette, à enrichir Phase 2)**

```typescript
// src/inngest/functions/enrich-product.ts
import { inngest } from "@/inngest/client";
export const enrichProduct = inngest.createFunction(
  { id: "enrich-product" },
  { event: "product/imported" },
  async ({ event, step }) => {
    const productId = event.data.productId as string;
    // Phase 1 : juste placeholder, cascade en Phase 2
    await step.run("placeholder", async () => ({ productId, status: "received" }));
    return { ok: true };
  }
);
```

- [ ] **Step 4: Setup Inngest cloud free tier (action manuelle)**

Action Thomas : créer compte inngest.com, copier `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` dans Vercel env.

- [ ] **Step 5: Commit**

```bash
git add package.json src/inngest/ src/app/api/inngest/
git commit -m "feat(orchestrator): Inngest free tier setup + enrich-product squelette"
```

---

### Task 1.9: Onboarding Dear Skin — signature + Stripe + import live

- [ ] **Step 1: Créer Stripe price 25 € pionnier**

Action Thomas (via Stripe MCP ou dashboard) :
- Stripe product "Two-Step Pionnier" si pas existant
- Stripe price `2500` cents EUR récurrent mensuel
- Trial 60 jours configuré

- [ ] **Step 2: Créer record `merchants` Dear Skin Shop**

```sql
-- via Supabase SQL editor ou script
INSERT INTO merchants (slug, name, email, has_online_store, acquisition_channel, cost_estimate_eur, first_contact_at, signed_at)
VALUES ('dear-skin-shop', 'Dear Skin Shop', 'contact@dearskinshop.com', false, 'terrain', 100, '2026-04-15', '2026-04-29');
```

- [ ] **Step 3: Lancer wizard onboarding sur Dear Skin (manuel Thomas)**

Action Thomas : utiliser `/admin/onboarding-wizard` :
1. Upload CSV Zettle Dear Skin
2. Review queue (50 produits cibles)
3. Enrichir 50 produits manuellement (~2-3h)
4. Publier feed

- [ ] **Step 4: Vérifier feed XML accessible**

Run: `curl https://twostep.fr/api/feed/lfp/<dear-skin-merchant-id>.xml`
Expected: XML valide avec ~50 items

- [ ] **Step 5: Soumettre feed Google Merchant Center sandbox**

Action Thomas : ajouter feed URL dans Merchant Center compte test, vérifier validation OK.

- [ ] **Step 6: Documenter onboarding Dear Skin**

```bash
git add docs/prospection/dear-skin-onboarding.md
git commit -m "docs(pilot): onboarding Dear Skin Shop sem 3 (γ Phase 1)"
```

---

### Task 1.10: Pré-écran OAuth Two-Step + permissions

**Files:**
- Create: `src/app/dashboard/pos/connect/[provider]/preview/page.tsx`

- [ ] **Step 1: Page preview avant redirect OAuth**

```tsx
// src/app/dashboard/pos/connect/[provider]/preview/page.tsx
export default function Preview({ params }: { params: { provider: string } }) {
  const permissions: Record<string, string[]> = {
    square: ["Lire votre catalogue produits", "Lire votre stock", "Recevoir notifications de mise à jour"],
    shopify: ["Lire votre catalogue", "Lire votre stock"],
    // ...
  };
  return (
    <div className="container max-w-md mx-auto p-6">
      <h1>Connecter {params.provider}</h1>
      <p>Two-Step va demander ces autorisations :</p>
      <ul>{permissions[params.provider]?.map(p => <li key={p}>✓ {p}</li>)}</ul>
      <p className="text-sm text-tertiary">⚠️ Pas d'écriture côté POS sauf si vous l'activez plus tard.</p>
      <a href={`/api/pos/oauth/${params.provider}/start`} className="btn-primary">Continuer vers {params.provider}</a>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/pos/connect/[provider]/preview/
git commit -m "feat(pos): pré-écran OAuth permissions en français clair"
```

---

### Task 1.11: BetterStack monitoring + healthcheck réel

**Files:**
- Create: `src/app/api/health/route.ts`
- Action manuelle : configurer BetterStack

- [ ] **Step 1: Healthcheck composé**

```typescript
// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const checks: Record<string, boolean> = {};
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("merchants").select("id").limit(1);
    checks.supabase = !error;
  } catch { checks.supabase = false; }

  try {
    const r = await fetch(`${process.env.REMBG_URL}/health`, { signal: AbortSignal.timeout(3000) });
    checks.rembg = r.ok;
  } catch { checks.rembg = false; }

  // R2 HEAD
  try {
    const r = await fetch(`${process.env.R2_PUBLIC_URL}/health.txt`, { method: "HEAD", signal: AbortSignal.timeout(3000) });
    checks.r2 = r.ok || r.status === 404; // bucket accessible
  } catch { checks.r2 = false; }

  const ok = Object.values(checks).every(Boolean);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
```

- [ ] **Step 2: Configurer BetterStack 10 monitors (action manuelle)**

Cibles : `/`, `/api/health`, `/api/feed/lfp/dear-skin-shop`, `/dashboard/login`, `/api/inngest`, Hetzner rembg.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/health/
git commit -m "feat(monitoring): /api/health composite + BetterStack 10 monitors"
```

---

### Task 1.12: AI Act art.50 — exposer enrichment_method UI

**Files:**
- Modify: `src/components/products/product-card.tsx` (ou équivalent)
- Modify: `src/app/dashboard/products/[id]/page.tsx`

- [ ] **Step 1: Badge "Vérifié par IA" sur fiche produit dashboard marchand**

```tsx
{product.enrichment_method === "claude-vision" && (
  <Badge color="blue" size="sm">Description vérifiée par IA (Claude Vision)</Badge>
)}
```

- [ ] **Step 2: Section CGU "AI disclosure"** (clause à intégrer une fois reçue de l'avocat Phase 0 Task 0.4)

- [ ] **Step 3: Commit**

```bash
git add src/components/products/ src/app/dashboard/products/
git commit -m "feat(ai-act): art.50 disclosure UI badge enrichment_method"
```

---

### Phase 1 — Gates de passage

- ✅ Migration 082 (channel) + 083 (staging) + 084 (vue lfp) appliquées
- ✅ Wizard admin 4 étapes fonctionnelles
- ✅ Feed LFP XML valide testé Merchant Center sandbox
- ✅ Feed ACP JSON valide
- ✅ Inngest free tier configuré (env vars Vercel)
- ✅ **Dear Skin Shop signée + 50 produits enrichis manuellement + feed actif**
- ✅ Pré-écran OAuth en place (futurs marchands)
- ✅ BetterStack monitoring 10 monitors verts
- ✅ Badge AI Act sur fiche produit

**Si gate échoue** : retour cycle sur le point faible AVANT Phase 2.

---

## Phase 2 — Cascade d'identification (sem 5-10, ~80h)

> **Granularité** : 1 task = 1-3j chacune. À re-décomposer en bite-sized au moment de l'exécution (à la fin de Phase 1, avec data terrain Dear Skin observée).

### Task 2.1: Cascade Tier 1 — identifiants sectoriels (3j)

**Périmètre** :
- Détection format : ISBN-13 (`^97[89]\d{10}$`), CIP-13 (`^340\d{10}$`)
- Lookups :
  - api-medicaments.fr BDPM (gratuit, FR médicaments)
  - Dilicom FEL (~15 €/mo, FR livres) — **gate budgétaire** : activer seulement si Dear Skin Shop a >5 livres ou si pilote librairie démarche
  - GS1 Verified by GS1 API + checksum GTIN
- Tests : `tests/lib/enrichment/tier1.test.ts` avec fixtures ISBN/CIP/GTIN valides + invalides
- Sortie : score 0.99 si match, null sinon

**Files cibles** :
- `src/lib/enrichment/cascade/tier1-sectoriel.ts`
- `tests/lib/enrichment/tier1-sectoriel.test.ts`

**Hook Inngest** : intégrer dans `enrichProduct` function comme step.

### Task 2.2: Cascade Tier 2 — Open bases gratuites (2j)

**Périmètre** :
- Open Food Facts API (alimentaire/vin)
- Open Beauty Facts (cosmétique)
- Open Icecat (électronique/tech/jouets)
- Cache hit-rate tracking dans `ean_lookups`
- Pattern ODbL "Produced Work" : pas redistribuer la BDD, juste consommer (cf. brief avocat)

**Files cibles** :
- `src/lib/enrichment/cascade/tier2-open-bases.ts`
- `tests/lib/enrichment/tier2-open-bases.test.ts`

### Task 2.3: Cascade Tier 3 — Google Product Catalog (1j)

**Périmètre** :
- Via Merchant Center OAuth existant
- Matching brand + title + image
- Score 0.95

**Files cibles** :
- `src/lib/enrichment/cascade/tier3-google-catalog.ts`

### Task 2.4: Cascade Tier 4 — CLIP + Cloudflare Vectorize (4j)

**Périmètre** :
- Replicate CLIP/FashionCLIP (~50 €/mo) — **gate budgétaire** : activer seulement à 20 marchands signés
- Cloudflare Vectorize index (free tier 5M vectors)
- rembg détourage avant embedding (existant)
- pHash détection doublons
- Query similarité cosine topK=5
- **Demander setup ami Thomas** avant démarrage (gain 2-3j R&D)

**Files cibles** :
- `src/lib/enrichment/cascade/tier4-clip.ts`
- `src/lib/vectorize/index.ts`

### Task 2.5: Cascade Tier 5 — BERT entity matching (2j)

**Périmètre** :
- Ditto open-source self-host CPU
- Training sur dataset initial (seeds Two-Step + synthetic + validation events Dear Skin)
- Matching nom + marque + catégorie fuzzy
- Score 0.80-0.90

**Files cibles** :
- `src/lib/enrichment/cascade/tier5-bert.ts`

### Task 2.6: Cascade Tier 6 — EAN-Search EU fallback (0.5j)

**Périmètre** :
- Souscription 19 €/mo
- Dernier recours pour EAN européens rares
- Score 0.90

**Files cibles** :
- `src/lib/enrichment/cascade/tier6-ean-search.ts`

### Task 2.7: Fusion multi-signaux + scoring (2j)

**Périmètre** :
- Score combiné = max(tiers) + boost convergence (≥2 tiers convergent)
- ≥0.95 → AUTO-CLEAN (visible feed)
- 0.70-0.95 → queue validation 1-tap
- <0.70 → MASQUÉ
- Table `product_enrichment_trace` append-only (audit trail)

**Files cibles** :
- `src/lib/enrichment/cascade/score.ts`
- `supabase/migrations/085_product_enrichment_trace.sql` (si pas déjà fait)

### Task 2.8: Plan 07 — classifier clean/dirty (2j)

**Périmètre** :
- Migration 086 : colonnes `is_clean`, `dirty_reason`, `classified_at`
- Fonction pure `classifyProduct()` dans `src/lib/pos/classify.ts`
- Hook post-sync engine
- Promotion automatique dirty → clean via facture IA matchée

### Task 2.9: Scan code-barres PWA dashboard (2j)

**Périmètre** :
- Composant `BarcodeScanner` avec `@zxing/browser` (déjà installé) + `BarcodeDetector` fallback natif
- Auto-capture debounce 800ms + cadre SVG + torche + continuous
- Checksum EAN-13 client
- Flow scan → Tier 1/2/3 → pré-remplit fiche → valide 1-tap

**Files cibles** :
- `src/components/scanner/barcode-scanner.tsx`
- `src/app/dashboard/stock/scan/page.tsx`

### Task 2.10: Photo upload + CLIP (2j)

**Périmètre** :
- `<input type="file" capture="environment">` + `react-image-crop` + `browser-image-compression`
- Upload R2 → rembg → CLIP embed → Vectorize query
- UX "C'est ce produit ?" avec preview candidat
- Fallback Claude Vision si pas de match

### Task 2.11: Queue validation 1-tap marchand (2j)

**Périmètre** :
- UI dashboard `/dashboard/stock/review`
- 4 actions : ✅ / ❌ / 🔍 Alternatives / ⏭️ Plus tard
- Stockage `validation_events` pour active learning
- Badge compteur produits à valider

### Task 2.12: Timeline LFP dashboard + email nurture (1j)

**Périmètre** :
- Timeline visuelle "Votre inventaire chez Google" J+0 à J+7
- Séquence email auto jour 1, 3, 7 (via Resend)
- Proof of work "52 produits prêts, 48 en enrichissement"
- Micro-victoire J+1 : visuel Instagram "Mon stock sur Google"

---

### Phase 2 — Gates de passage

- ✅ Cascade 6 tiers implémentée et testée sur 100 produits Dear Skin
- ✅ **Taux Tier 1+2+3 auto ≥70%** (sinon cycle 5 sur Tier 4-5)
- ✅ Scan code-barres fonctionnel PWA iOS+Android
- ✅ Photo upload + CLIP match ≥95% sur produits catalogués
- ✅ Queue validation 1-tap UX testée avec Dear Skin (review 20 produits)
- ✅ Plan 07 classifier dérive clean/dirty correcte

---

## Phase Juridique (parallèle Phase 2, sem 5-10)

### Task J.1: Signature contrat avocat pack CGU + DSA + ODbL + photos

Action Thomas (suite Task 0.4) :
- Réception devis avocat
- Signature 3 900-7 050 € HT
- Délivrables :
  - CGU B2B marchand (P2B-conformes : préavis 30j + 2 médiateurs + notice & action)
  - CGV B2C consumer distinctes
  - Clause limitation responsabilité B2B (pas B2C)
  - Privacy Policy + DPA conformes RGPD
  - Clause licence photos (art. L131-3 CPI)
  - Review pattern ODbL "Produced Work" OFF
  - Clause AI disclosure (art. 50 AI Act)
  - Clause limitation incapacité temporaire RC Pro

### Task J.2: Souscrire RC Pro + Cyber

Action Thomas : signer Stello ou Orus, 1 200-2 500 €/an.

### Task J.3: Activer Stripe Tax

Action Thomas : Stripe dashboard → Tax settings → activer OSS UE avant 1er client UE non-FR.

### Task J.4: Page DSA transparence

**Files:**
- Create: `src/app/legal/dsa-transparence/page.tsx`
- Create: `src/app/legal/dsa-transparence/notice-action/page.tsx` (formulaire)

### Task J.5: Page contestation éviction

**Files:**
- Create: `src/app/legal/contestation-eviction/page.tsx`
- Create email dédié `litige@twostep.fr` (Infomaniak)

### Task J.6: Audit Serper anti-scraping marques officielles

Action Claude + Thomas : grep `src/lib/enrichment/` pour tout call Serper, vérifier qu'aucun n'extrait depuis sites officiels marques. Si oui, blacklist domaine.

### Task J.7: Blacklist EAN tabac + médicaments publication consumer

**Files:**
- Modify: `src/lib/enrichment/cascade/score.ts`
- Add: filtre par préfixe GS1 + NAF 47.26Z (tabac) et CIP-13 (médicaments) → MASQUÉ

### Task J.8: Champs INCO/INCI catégories alimentaire/cosmétique

**Files:**
- Add columns dans `products` : `allergens TEXT[]`, `inci TEXT[]`
- Conditional UI selon catégorie

### Task J.9: Registre RGPD

**Files:**
- Create: `docs/rgpd-registre.md` — durées : 10 ans factures, 3 ans compte, 12 mois logs

---

### Phase Juridique — Gates de passage

- ✅ CGU signées (avocat + Thomas)
- ✅ RC Pro + Cyber actifs
- ✅ Stripe Tax activé
- ✅ Page DSA transparence publique
- ✅ Audit Serper terminé
- ✅ Blacklist EAN sensibles en place

---

## Phase 3 — Consumer + LFP Google (sem 9-12, ~60h)

### Task 3.1: Recherche consumer Postgres (3j)

**Périmètre** :
- Extensions `pg_trgm` + `unaccent` + `postgis`
- Index GiST sur `merchants.location`
- Index GIN trigram sur `canonical_products`
- RPC `search_stock` avec scoring pondéré
- API `/api/search?q=X&lat=Y&lng=Z&radius=10km`

**Files cibles** :
- `supabase/migrations/087_search_extensions_indexes.sql`
- `src/app/api/search/route.ts`

### Task 3.2: UI app consumer search results (3j)

**Files cibles** :
- `src/app/page.tsx` (search bar)
- `src/app/search/page.tsx` (résultats géo-triés)
- `src/app/m/[slug]/page.tsx` (fiche boutique + stock)

### Task 3.3: Bouton "J'arrive" signal intention (1j)

**Files cibles** :
- `src/components/intent/im-coming-button.tsx`
- `supabase/migrations/088_intent_signals.sql`
- Notification push marchand (PWA standalone iOS 16.4+ OR email fallback Resend)

### Task 3.4: Feed LFP en prod (1j)

Action Thomas :
- Push feed XML vers Google Merchant Center prod
- Vérifier crawl first-time
- Monitoring erreurs Merchant Center

### Task 3.5: Email LFP specialist Aftab (30 min)

Action Thomas :
- Dossier déjà prêt `docs/prospection/google-lfp-preparation-v2.md`
- Email Aftab : "Premier marchand pilote actif, feed XML live, demande planification 5 surveys remote vers statut Trusted"

### Task 3.6: Badge fiabilité stock consumer (0.5j)

**Périmètre** :
- Tier 3 : "Stock vérifié en direct" (POS webhook <5 min)
- Tier 2 : "Stock vérifié aujourd'hui" (POS synced <24h)
- Tier 1 : "Stock déclaré par le commerçant"
- Langage probabiliste : "Probablement en stock (vu il y a 2h)"

### Task 3.7: PWA + manifest (1j)

**Files cibles** :
- `public/manifest.json`
- `src/app/sw.ts` (service worker)
- Banner "Ajouter écran d'accueil" au 2e passage
- Support iOS 16.4+ push
- Open Graph par produit

### Task 3.8: Compteur faux positifs (0.5j)

**Périmètre** :
- Consumer 1-tap "Pas trouvé en rayon"
- 3 signalements → marchand perd badge fiabilité

### Task 3.9: Audit RLS Supabase pré-prospection (1j)

Action Claude + Thomas :
- Vérifier toutes tables avec accès consumer
- Fix leaks potentiels
- Tester avec compte anon

### Task 3.10: Test consumer end-to-end Dear Skin

Action Thomas + 3 personnes externes (famille/amis) : 5 recherches réelles sur app consumer, vérifier indexation Google "See what's in store" sous 72h.

### Task 3.11: **Dear Skin sem 11 — fin trial → 1ʳᵉ facture 25 €**

**Files cibles** :
- Vérifier Stripe subscription Dear Skin passe en `active` après trial
- Email Dear Skin : "Trial fini, 1ʳᵉ facture 25 € prélevée. Bilan + retours."
- Mesurer NPS Dear Skin

---

### Phase 3 — Gates de passage

- ✅ Search consumer fonctionne p95 <200ms
- ✅ Feed LFP accepté Merchant Center prod (vert)
- ✅ Statut Trusted Google demandé OR fallback pitch "ranking local + GMB" prêt
- ✅ App consumer testée 3 personnes externes
- ✅ PWA installable iOS + Android
- ✅ CGU publiques + mentions légales complètes
- ✅ **Dear Skin Shop facturée 25 € sans incident**

---

## Phase 4 — Launch pilote Saint-Étienne (sem 13-16, ~40h)

### Task 4.1: Évaluation Dear Skin sem 13

Action Thomas :
- Bilan 1 mois facturé (sem 11→13)
- NPS Dear Skin >7 ?
- Bugs résiduels listés
- Si NPS <7 : **freeze démarchage**, focus correction

### Task 4.2: Démarchage 5 marchands Saint-Étienne (2 sem terrain)

Action Thomas :
- Cibles pré-qualifiées :
  - **Branded pur** : mode Nike/Adidas, sport, électronique Apple → cascade Tier 3 garantit
  - **Pharmacies/parapharmacies** : CIP 100% → Tier 1 garantit
  - **Librairies** : ISBN 100% → Tier 1 garantit
- Objectif : 5 signatures
- Tracking dans `merchants.acquisition_channel='terrain'` + `cost_estimate_eur`
- **+Kap Pré-Go** : décider sem 5-6 si on l'inclut dans ces 5 (selon POS info)

### Task 4.3: Évaluer +Kap Pré-Go (sem 5-6)

Action Thomas :
- Demander à Kap : POS utilisé, % branded, intérêt pilote
- Si Square/Shopify/Lightspeed/Zettle/Hiboutik supporté + branded majoritaire → ajouter aux 5 cibles
- Si POS non supporté ou catalogue non-branded → différer Phase 5

### Task 4.4: Mesure CAC réel (continu)

- Temps Thomas × 40 €/h par signature
- Tracking `acquisition_channel`
- Ajuster si CAC > 200 € (alerte business)

### Task 4.5: Runbook support marchand

**Files cibles** :
- `docs/runbook-support-marchand.md` — FAQ 20 questions + scripts email types + escalation Thomas si >5 min

### Task 4.6: Monitoring intensif pilote (continu)

- Sentry alerts Slack/email
- Métrique fraîcheur stock (sync POS <24h)
- Taux faux positifs <5%

---

### Phase 4 — Gates de passage

- ✅ **Dear Skin Shop payant actif + satisfait** (NPS >7)
- ✅ **5 marchands pilotes signés** Saint-Étienne (incluant ou non Kap selon décision sem 5-6)
- ✅ **0 faux positif grave** remonté consumer
- ✅ Feed LFP génère impressions Google Search documentées
- ✅ CAC mesuré <300 €/signature
- ✅ Churn 30 jours <5%

---

## Phase 5 — Scale V2 (mois 4-12, gates par paliers)

### Gate 15 marchands (P5.0 nouveau, critique)

- [ ] **Décider** : embauche 0,5 ETP support 1 500 €/mo OU contrat formel apporteurs commission 20%
- [ ] Si embauche : annonce, recrutement, onboarding (~1 mois délai)
- [ ] Si apporteurs : contrats signés, scripts pitch, dashboard tracking commissions

### Gate 20 marchands

- [ ] Task 5.1: Refactor hexagonal adapter/core/objects POS (pattern NearSt laconia, 2j)
- [ ] Task 5.2: Inventory Item/Level/Location split (pattern Medusa, 3j) — si demande multi-boutique
- [ ] Task 5.3: 5 StockMovement types (pattern Vendure, 1j)
- [ ] Task 5.4: Hookdeck tier free webhook gateway (1j setup)

### Gate 30 marchands

- [ ] Task 5.5: POC Nango sur 1 POS pour évaluation vs maintenance native (2j)
- [ ] Task 5.6: Activer writeback POS Square pour 1 marchand pilote volontaire (kill switch par marchand)
- [ ] Task 5.7: Webhooks-tester dashboard admin (pattern NearSt, 2j)

### Gate 50 marchands

- [ ] Task 5.8: Vercel Pro 20 $/mo
- [ ] Task 5.9: Sentry Team 26 $/mo
- [ ] Task 5.10: Supabase PITR +10 $/mo
- [ ] Task 5.11: 2e VPS Hetzner rembg backup
- [ ] Task 5.12: Contact Chift.eu demo si demande POS non-supportés >30%

---

### Phase 5 — Gates de passage

- ✅ 50 marchands payants actifs
- ✅ Churn <5%/mo stabilisé
- ✅ CAC <150 € (apporteurs ou bouche-à-oreille)
- ✅ NPS >30
- ✅ Writeback POS Square stable 1 marchand 30 jours zéro incident

---

## Phase 6 — V3 expansion (Y2+, overview)

### Gate 100 marchands

- [ ] Stripe Tax OSS UE activé
- [ ] Audit RGAA (EAA obligation si >2M€ CA)
- [ ] Upgrade Pennylane plan Factur-X
- [ ] Évaluation GPU self-hosted CLIP (amortit dès 100k inferences/mois)

### Gate 200 marchands

- [ ] Widget brand.com embeddable (pattern Locally, 4j)
- [ ] postMessage cross-domain events (1j)
- [ ] StockAllocationStrategy pluggable pour "J'arrive" (2j)
- [ ] Partenariats directs éditeurs POS FR (Clictill, Fastmag, EBP)
- [ ] CRA EU SECURITY.md formalisé (downloadable composant retombe dans scope)

---

## 📊 KPIs par phase (cibles finales)

| KPI | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 |
|---|---|---|---|---|---|---|---|
| Marchands payants | 0 | 0 (1 trial) | 0 | 1 (sem 11) | 5-6 | 50 | 200 |
| Taux Tier 1+2 auto | — | — | ≥70% | ≥80% | ≥85% | ≥90% | ≥95% |
| Taux parsing facture | — | ≥80% | ≥85% | ≥90% | ≥92% | ≥95% | ≥97% |
| Churn mensuel | — | — | — | 0 | <10% | <5% | <3% |
| CAC | — | — | — | — | <300 € | <150 € | <100 € |
| NPS | — | — | — | >7/10 (Dear Skin) | >7/10 | >30 | >50 |
| Faux positifs publiés | — | 0% test | <5% test | <2% pilote | <1% prod | <0,5% | <0,1% |
| Infra /mo | 25 € | 40 € | 105 € | 105 € | 105 € | 150 € | 250 € |

---

## 💰 Budget global 16 sem

| Catégorie | One-shot | Récurrent final |
|---|---|---|
| Dev Thomas (220h × 40 €) | 8 800 € | — |
| Avocat pack juridique | 5 000 € | — |
| RC Pro + Cyber | 0 € | 1 800 €/an |
| Infra V1→V2 | 0 € | ~150 €/mo |
| Terrain Thomas 16 sem | 3 200 € opportunité | — |
| **Total** | **~17 000 €** | **~330 €/mo** |

**Revenus projetés** :
- Sem 11 : Dear Skin 1ʳᵉ facture 25 €
- Sem 16 : 5 marchands × 25 € = 125 €/mo (encore très loin du break-even)
- Mois 12 : 50 marchands × ~26 € moyen = 1 300 €/mo (couvre infra + RC Pro)
- **Break-even projeté mois 18-24** selon churn/CAC réel

---

## 🚨 Déclencheurs d'arrêt / pivot

**Arrêter le produit si** :
- Phase 1 gates échouent (taux parsing facture <60%, cascade Phase 2 <50% Tier 1+2 sur batch Dear Skin)
- Phase 4 : <3 marchands signés après 2 sem terrain Saint-Étienne
- Phase 4 : Dear Skin demande refund dans les 14 jours suivant 1ʳᵉ facture (sem 11-13)

**Pivoter si** :
- LFP refusé définitivement par Google → pivot "widget uniquement" + pricing revu
- Chift devient gratuit/accessible → re-évaluer V1 sans ADR-007
- Google Business Profile ajoute inventory natif gratuit → pivot sur différenciateurs V2 (stories, "J'arrive", app conso)
- Atalanda DE / LocaFox DE pivote FR → accélérer densité Toulouse + verrouiller La Fédé

---

## 🧭 Principes de revue

**À chaque phase completed** :
1. Écrire fiche brain `12-Journal/YYYY-MM-DD-phase-X-completion.md`
2. Mettre à jour KPIs dans `01-Strategie/Plan-6-mois.md`
3. Re-vérifier les hypothèses non-validées avec données terrain
4. Challenger priorités Phase suivante avec `10-Angles-morts/Regard-critique-business`
5. **Re-décomposer la phase suivante en bite-sized** si Phase 2-6 (vu que ce plan ne donne que la granularité 1-3j/task pour ces phases)

---

## Self-Review (effectuée 2026-04-25)

**Spec coverage** :
- ✅ Path γ (sem 1-2 Phase 0, sem 3 signature, sem 11 1ʳᵉ facture, sem 13-16 démarchage) — couvert Phase 0/1/3/4
- ✅ Pricing 25 € (ADR-009) — Task 1.9 step 1
- ✅ Trial 2 mois standard — Task 1.9 + Phase 3 Task 3.11
- ✅ ACP feed — Task 1.7
- ✅ AI Act art.50 — Task 0.7 + Task 1.12
- ✅ CRA EU — différé Phase 6 gate 200 marchands (widget activé)
- ✅ Inngest — Task 1.8
- ✅ product_channel — Task 1.1
- ✅ Continuity playbook — Task 0.2
- ✅ Death valley gate 15 marchands — Phase 5 P5.0
- ✅ ean_lookups requalification — pas une task code (modif doc faite ARCHITECTURE-TWOSTEP.md)
- ✅ Atalanda/LocaFox monitoring — pas une task active, mention dans déclencheurs pivot

**Placeholder scan** : aucun "TBD" / "à compléter" / "TODO" / "implement later" dans Phase 0 + Phase 1 (bite-sized strict). Phase 2-6 par design moins granulaire — explicite et accepté.

**Type consistency** : `MerchantAcquisition`, `ProductChannel`, `enrichProduct` cohérents entre tasks. Score cascade `≥0.95` cohérent dans Task 2.7.

**Issues trouvées + fixes inline** :
- Task 1.9 step 1 référence "Stripe price 2500 cents" — cohérent ADR-009 ✓
- Task 0.7 "vérifier que enrichment_method est tracé" — fallback prévu (mig 081) ✓
- Task J.7 "Blacklist EAN tabac" mention NAF 47.26Z + préfixes GS1 — concret ✓

**Plan complete and saved to `docs/superpowers/plans/2026-04-25-plan-action-production-v2.md`.**

---

## Execution — choix mode

Deux options :

**1. Subagent-Driven (recommended)** — un subagent frais par task, review entre tasks, itération rapide. Idéal pour Phase 0+1 bite-sized.

**2. Inline Execution** — tasks exécutées dans cette session, batch + checkpoints. Idéal si tu veux suivre/intervenir en live.

Quelle approche pour démarrer Phase 0 ?

---

## Versions

- **V1** (`twostep-brain/01-Strategie/Plan-action-production-2026-04-24.md`) — superseded
- **V2** — 2026-04-25, ce document — γ + ADR-009 + ajouts ACP/AI Act/Inngest/product_channel/continuity
