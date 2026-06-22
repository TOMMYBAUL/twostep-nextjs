import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

/**
 * VALIDATION MAILLON 8 du workflow cœur — CANAL EMAIL-IN STOCK (la PORTE des POS FR).
 *
 * North-star §1 : « capter le stock de N'IMPORTE QUELLE source en n'OUBLIANT RIEN ».
 * Pour les POS indépendants FR réels (Clictill / Fastmag), la porte = un CSV émaillé
 * en planifié vers `stock-{slug}@twostep.fr` (ADR-002, worklog 2026-06-21). C'est le
 * dernier maillon de la chaîne A (parse→triage→match→reconcile→confiance→affichage→
 * sortie Google) : l'ORCHESTRATION email-in elle-même.
 *
 * Méthode qualité (priorities §1bis) : pas « parseInboundAddress passe » ni
 * « ingestStockFileForMerchant passe » (déjà couverts isolément par
 * tests/inbound-address.test.ts + tests/ingest-stock-file.test.ts) — mais le CHEMIN
 * RÉEL de la route `POST /api/inbound-email` : signature Resend → routage de canal →
 * RÉSOLUTION du marchand → contrat snapshot-unique → décodage base64 sans perte →
 * câblage jusqu'à l'ingestion. Exactement le motif maillons 5/6/7 (un invariant qui
 * vit dans l'orchestration, pas dans une fonction pure).
 *
 * Bug réel prouvé ici (faux négatif de résolution = perte silencieuse n°1) :
 *   la résolution `merchants.inbound_email_slug` AVALAIT son `error`
 *   (`const { data: merchant } = ...`). Un blip DB → merchant=null → `resolved=null` →
 *   `200 OK "no matching merchant"` → Resend ne réessaie JAMAIS → l'email stock
 *   planifié est PERDU EN SILENCE (feed figé, 0 Sentry, 0 statut). Même classe que
 *   resolveWebhookProduct (LESSONS) : erreur DB ≠ « marchand inconnu ».
 *   Fix : retenir l'erreur ; si rien ne matche ET erreur DB → captureError + 500
 *   (Resend retry). Un slug réellement inconnu (spam) reste un 200 bénin.
 */

// La route capture RESEND_WEBHOOK_SECRET / INBOUND_EMAIL_DOMAIN au CHARGEMENT du module
// (const de tête) → il faut les poser AVANT l'import statique : vi.hoisted s'exécute en premier.
const { SECRET, DOMAIN } = vi.hoisted(() => {
    const SECRET = "whsec_test_maillon8";
    const DOMAIN = "twostep.fr";
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    process.env.INBOUND_EMAIL_DOMAIN = DOMAIN;
    process.env.RESEND_API_KEY = "re_test";
    return { SECRET, DOMAIN };
});

// ─── Mocks de module (deps de la route) ─────────────────────────────────────
const ingestMock = vi.fn();
vi.mock("@/lib/ingest/ingest-stock-file", () => ({
    ingestStockFileForMerchant: (...args: unknown[]) => ingestMock(...args),
}));

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...args: unknown[]) => captureMock(...args) }));

// Resend SDK : on stub `emails.get` pour rendre les pièces jointes du payload.
const resendGet = vi.fn();
vi.mock("resend", () => ({
    Resend: class {
        emails = { get: resendGet };
    },
}));

// getOrCreateIngestToken : garantit la ligne ingest_credentials (verrou/heartbeat) —
// inerté (sans effet) pour isoler l'orchestration.
vi.mock("@/lib/ingest/token", () => ({ getOrCreateIngestToken: vi.fn(async () => "tok") }));

// parseInvoice n'est touché que par le canal factures (non exercé ici) — stub léger.
vi.mock("@/lib/parser", () => ({ parseInvoice: vi.fn() }));
vi.mock("@/lib/parser/invoice-status", () => ({ invoiceStatusForParse: () => "parsed" }));

// Faux admin Supabase read-side : SEULE la résolution `merchants` est exercée par
// l'orchestration. On injecte data/error par configuration pour prouver la
// discrimination erreur-DB vs slug-inconnu.
const merchantsResponse = { current: { data: null as unknown, error: null as unknown } };
vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from: (_table: string) => {
            const api: Record<string, unknown> = {
                select: () => api,
                eq: () => api,
                maybeSingle: () => Promise.resolve(merchantsResponse.current),
            };
            return api;
        },
    }),
}));

import { POST } from "@/app/api/inbound-email/route";

beforeEach(() => {
    ingestMock.mockReset();
    captureMock.mockReset();
    resendGet.mockReset();
    merchantsResponse.current = { data: null, error: null };
});

// CSV FR « sale » réaliste (séparateur ;, accents, en-tête « Quantité ») — le genre
// de fichier qu'un Clictill/Fastmag émaille. On le passe en base64 comme une vraie
// pièce jointe Resend pour prouver le décodage sans perte.
const DIRTY_CSV = "Code-barres;Désignation;Quantité;Prix TTC\r\n3017620422003;Pâte à tartiner;6;4,90\r\n0036000291452;Gobelets;24;3,50\r\n";

function makeAttachment(filename: string, content: string, type = "text/csv") {
    return { filename, content: Buffer.from(content, "utf-8").toString("base64"), content_type: type };
}

function makeRequest(body: object, sign = true) {
    const raw = JSON.stringify(body);
    const signature = sign
        ? crypto.createHmac("sha256", SECRET).update(raw).digest("hex")
        : "deadbeef";
    return new Request("https://twostep.fr/api/inbound-email", {
        method: "POST",
        headers: { "resend-signature": signature, "content-type": "application/json" },
        body: raw,
    }) as unknown as Parameters<typeof POST>[0];
}

// La route récupère les pièces jointes via resend.emails.get(emailId) (stub resendGet),
// PAS depuis ce payload webhook — d'où l'absence d'attachments ici.
function emailReceived(to: string) {
    return {
        type: "email.received",
        data: { id: "email_abc123", from: "caisse@boutique.fr", to: [to] },
    };
}

describe("Maillon 8 — POST /api/inbound-email : sécurité de la porte", () => {
    it("signature invalide → 401, AUCUN traitement (la porte refuse le non-authentifié)", async () => {
        const res = await POST(makeRequest(emailReceived(`stock-boutique@${DOMAIN}`), false));
        expect(res.status).toBe(401);
        expect(resendGet).not.toHaveBeenCalled();
        expect(ingestMock).not.toHaveBeenCalled();
    });

    it("type ≠ email.received → 200 bénin, aucun traitement (autres events Resend ignorés)", async () => {
        const body = { type: "email.delivered", data: { id: "x" } };
        const res = await POST(makeRequest(body));
        expect(res.status).toBe(200);
        expect(ingestMock).not.toHaveBeenCalled();
    });
});

describe("Maillon 8 — résolution marchand : erreur DB ≠ slug inconnu (perte silencieuse)", () => {
    it("🔴→🟢 erreur DB sur la résolution slug → 500 + captureError (Resend RETRY), JAMAIS un 200 silencieux", async () => {
        // Le marchand EXISTE mais la lecture échoue (blip réseau / Supabase) :
        // l'email stock planifié ne doit pas s'évaporer derrière un 200.
        merchantsResponse.current = { data: null, error: { message: "timeout", code: "57014" } };
        resendGet.mockResolvedValue({ data: { attachments: [makeAttachment("stock.csv", DIRTY_CSV)] } });

        const res = await POST(makeRequest(emailReceived(`stock-boutique@${DOMAIN}`)));

        expect(res.status).toBe(500);
        expect(captureMock).toHaveBeenCalledTimes(1);
        const ctx = captureMock.mock.calls[0][1];
        expect(ctx).toMatchObject({ route: "inbound-email", step: "resolve_merchant" });
        // On n'a pas avalé : pas d'ingestion silencieuse, mais surtout pas de faux succès.
        expect(ingestMock).not.toHaveBeenCalled();
    });

    it("slug réellement inconnu (pas d'erreur) → 200 bénin « no matching merchant », SANS Sentry (ne pas faire boucler Resend sur du spam)", async () => {
        merchantsResponse.current = { data: null, error: null };
        const res = await POST(makeRequest(emailReceived(`stock-inconnu@${DOMAIN}`)));
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json.ignored).toBe("no matching merchant");
        expect(captureMock).not.toHaveBeenCalled();
        expect(ingestMock).not.toHaveBeenCalled();
    });
});

describe("Maillon 8 — canal stock : routage + contrat snapshot-unique + décodage sans perte", () => {
    beforeEach(() => {
        merchantsResponse.current = { data: { id: "merchant-42" }, error: null };
    });

    it("stock-{slug}@ + 1 CSV → résout le marchand, DÉCODE le base64 SANS PERTE et le câble à l'ingestion", async () => {
        resendGet.mockResolvedValue({ data: { attachments: [makeAttachment("stock.csv", DIRTY_CSV)] } });
        ingestMock.mockResolvedValue({ outcome: "ingested", status: "ok" });

        const res = await POST(makeRequest(emailReceived(`stock-boutique@${DOMAIN}`)));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json).toMatchObject({ ok: true, channel: "stock" });
        expect(ingestMock).toHaveBeenCalledTimes(1);
        const [, merchantId, buffer, filename] = ingestMock.mock.calls[0];
        expect(merchantId).toBe("merchant-42");
        expect(filename).toBe("stock.csv");
        // PREUVE de décodage sans perte : le buffer reçu == le CSV FR sale d'origine,
        // octet pour octet (un base64 corrompu perdrait silencieusement le fichier).
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect((buffer as Buffer).toString("utf-8")).toBe(DIRTY_CSV);
    });

    it("récupération Resend en ERREUR (data nulle) → 500 + captureError, JAMAIS un 200 « pas de pièce jointe » (l'email contenait pourtant le CSV)", async () => {
        // Le webhook prouve que l'email existe ; un blip sur emails.get ne doit pas
        // être confondu avec « email sans tableur » → sinon le CSV stock est perdu.
        resendGet.mockResolvedValue({ data: null, error: { message: "rate limited", statusCode: 429 } });
        const res = await POST(makeRequest(emailReceived(`stock-boutique@${DOMAIN}`)));
        expect(res.status).toBe(500);
        expect(captureMock).toHaveBeenCalledTimes(1);
        expect(ingestMock).not.toHaveBeenCalled();
    });

    it("canal stock SANS tableur exploitable (que des PDF) → captureError VISIBLE + ignored, pas un silence", async () => {
        resendGet.mockResolvedValue({ data: { attachments: [makeAttachment("scan.pdf", "%PDF-1.4", "application/pdf")] } });
        const res = await POST(makeRequest(emailReceived(`stock-boutique@${DOMAIN}`)));
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json.ignored).toBe("no stock spreadsheet attachment");
        expect(captureMock).toHaveBeenCalledTimes(1);
        expect(ingestMock).not.toHaveBeenCalled();
    });

    it("canal stock MULTI-fichiers (2 tableurs) → contrat snapshot-unique : captureError + AUCUNE ingestion (sinon le 2e réconcilie contre le 1er = stock faux)", async () => {
        resendGet.mockResolvedValue({
            data: { attachments: [makeAttachment("matin.csv", DIRTY_CSV), makeAttachment("soir.xlsx", DIRTY_CSV, "application/vnd.ms-excel")] },
        });
        const res = await POST(makeRequest(emailReceived(`stock-boutique@${DOMAIN}`)));
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json.ignored).toBe("multiple stock files; single snapshot expected");
        expect(captureMock).toHaveBeenCalledTimes(1);
        expect(ingestMock).not.toHaveBeenCalled();
    });

    it("ingestion non aboutie (no_exploitable) → captureError VISIBLE (un problème de données n'est jamais perdu)", async () => {
        resendGet.mockResolvedValue({ data: { attachments: [makeAttachment("stock.csv", DIRTY_CSV)] } });
        ingestMock.mockResolvedValue({ outcome: "no_exploitable", triage: { gtin_lines: 0, sku_lines: 0, rejected_lines: 2 } });
        const res = await POST(makeRequest(emailReceived(`stock-boutique@${DOMAIN}`)));
        expect(res.status).toBe(200);
        expect(captureMock).toHaveBeenCalledTimes(1);
        const ctx = captureMock.mock.calls[0][1];
        expect(ctx).toMatchObject({ route: "inbound-email", channel: "stock" });
    });

    it("ingestion « unchanged » (idempotence) → BÉNIN, pas d'alerte Sentry (export identique re-poussé)", async () => {
        resendGet.mockResolvedValue({ data: { attachments: [makeAttachment("stock.csv", DIRTY_CSV)] } });
        ingestMock.mockResolvedValue({ outcome: "unchanged" });
        const res = await POST(makeRequest(emailReceived(`stock-boutique@${DOMAIN}`)));
        expect(res.status).toBe(200);
        expect(captureMock).not.toHaveBeenCalled();
    });
});
