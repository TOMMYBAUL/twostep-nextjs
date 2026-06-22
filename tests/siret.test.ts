import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * VALIDATION — vérification SIRET (porte d'entrée de l'onboarding marchand).
 *
 * North-star : « afficher honnêtement », zéro faux positif silencieux. La vérification
 * SIRET était un MENSONGE SILENCIEUX à 3 niveaux :
 *   1. `verifySIRET` fail-open en `valid:true` SANS signal quand l'INSEE ne peut pas être
 *      joint (token absent — cas prod ! — / token expiré / 5xx / réseau) → le caller ne
 *      peut pas distinguer « vérifié » de « passé sans contrôle ».
 *   2. La route renvoie `valid:false` au statut **400**, mais les 2 forms testaient
 *      `res.status === 404` → un SIRET introuvable / fermé tombait en SILENCE à l'étape
 *      profil (le blocage « introuvable » était mort).
 *   3. La route ne renvoyait NI `company` NI `pending` que les forms consomment
 *      (`data.company` → pré-remplissage ; `data.pending` → `merchant_siret_pending` →
 *      `create-merchant-from-metadata` `status: pending|active`). Conséquence : en prod
 *      (sans INSEE_API_TOKEN) **100 % des marchands self-signup étaient créés `active`
 *      (confiance pleine) sans AUCUNE vérification** — la machinerie « pending » existait
 *      de bout en bout mais le signal ne circulait jamais.
 *
 * On prouve le contrat HONNÊTE : non vérifié = `pending:true` (le marchand passe mais son
 * compte est marqué en attente), erreurs INSEE inattendues rendues VISIBLES (captureError),
 * et la route émet `company`/`pending` réellement consommables.
 */

vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));

const VALID_SIRET = "12345678900012";

// Réponse INSEE V3.11 d'un établissement actif, diffusible.
const INSEE_OK = {
    etablissement: {
        periodesEtablissement: [{ etatAdministratifEtablissement: "A" }],
        uniteLegale: { denominationUniteLegale: "BOUTIQUE TEST SARL", activitePrincipaleUniteLegale: "47.71Z" },
        adresseEtablissement: {
            numeroVoieEtablissement: "12",
            typeVoieEtablissement: "RUE",
            libelleVoieEtablissement: "DU TEMPLE",
            libelleCommuneEtablissement: "TOULOUSE",
            codePostalEtablissement: "31000",
        },
    },
};

// Établissement NON-DIFFUSIBLE : actif mais champs identité/adresse masqués par `[ND]`.
const INSEE_NON_DIFFUSIBLE = {
    etablissement: {
        periodesEtablissement: [{ etatAdministratifEtablissement: "A" }],
        uniteLegale: { denominationUniteLegale: "[ND]", activitePrincipaleUniteLegale: "[ND]" },
        adresseEtablissement: {
            numeroVoieEtablissement: "[ND]",
            libelleVoieEtablissement: "[ND]",
            libelleCommuneEtablissement: "[ND]",
            codePostalEtablissement: "[ND]",
        },
    },
};

const INSEE_CLOSED = {
    etablissement: {
        periodesEtablissement: [{ etatAdministratifEtablissement: "F" }],
        uniteLegale: {},
        adresseEtablissement: {},
    },
};

function mockFetchOnce(impl: { status: number; ok: boolean; body?: unknown } | (() => never)) {
    if (typeof impl === "function") {
        vi.stubGlobal("fetch", vi.fn(impl));
        return;
    }
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
            status: impl.status,
            ok: impl.ok,
            json: async () => impl.body,
        }),
    );
}

describe("verifySIRET — contrat honnête (pending vs verified)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.INSEE_API_TOKEN;
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.INSEE_API_TOKEN;
    });

    it("format invalide → valid:false, pending:false (rejet dur, pas de fail-open)", async () => {
        const { verifySIRET } = await import("@/lib/siret");
        const r = await verifySIRET("abc");
        expect(r.valid).toBe(false);
        expect(r.pending).toBe(false);
        expect(r.error).toMatch(/14 chiffres/);
    });

    it("token INSEE ABSENT (cas prod) → valid:true mais pending:true, SANS captureError (config attendue)", async () => {
        const { verifySIRET } = await import("@/lib/siret");
        const { captureError } = await import("@/lib/error");
        const r = await verifySIRET(VALID_SIRET);
        // Le marchand passe (fail-open assumé) MAIS on ne ment pas : non vérifié = pending.
        expect(r.valid).toBe(true);
        expect(r.pending).toBe(true);
        expect(r.name).toBeNull();
        // L'absence de token est de la config, PAS une erreur à remonter en Sentry.
        expect(vi.mocked(captureError)).not.toHaveBeenCalled();
    });

    it("INSEE 404 → valid:false « introuvable », pending:false", async () => {
        process.env.INSEE_API_TOKEN = "tok";
        mockFetchOnce({ status: 404, ok: false });
        const { verifySIRET } = await import("@/lib/siret");
        const r = await verifySIRET(VALID_SIRET);
        expect(r.valid).toBe(false);
        expect(r.pending).toBe(false);
        expect(r.error).toMatch(/introuvable/i);
    });

    it("établissement FERMÉ (etat 'F') → valid:false « fermé »", async () => {
        process.env.INSEE_API_TOKEN = "tok";
        mockFetchOnce({ status: 200, ok: true, body: INSEE_CLOSED });
        const { verifySIRET } = await import("@/lib/siret");
        const r = await verifySIRET(VALID_SIRET);
        expect(r.valid).toBe(false);
        expect(r.error).toMatch(/fermé/i);
    });

    it("INSEE répond mal AVEC token (401 expiré) → pending:true ET captureError (rendu VISIBLE)", async () => {
        process.env.INSEE_API_TOKEN = "tok";
        mockFetchOnce({ status: 401, ok: false });
        const { verifySIRET } = await import("@/lib/siret");
        const { captureError } = await import("@/lib/error");
        const r = await verifySIRET(VALID_SIRET);
        expect(r.valid).toBe(true);
        expect(r.pending).toBe(true);
        expect(vi.mocked(captureError)).toHaveBeenCalledTimes(1);
    });

    it("erreur réseau (fetch throw) → pending:true ET captureError (≠ panne silencieuse)", async () => {
        process.env.INSEE_API_TOKEN = "tok";
        mockFetchOnce(() => {
            throw new Error("ECONNRESET");
        });
        const { verifySIRET } = await import("@/lib/siret");
        const { captureError } = await import("@/lib/error");
        const r = await verifySIRET(VALID_SIRET);
        expect(r.valid).toBe(true);
        expect(r.pending).toBe(true);
        expect(vi.mocked(captureError)).toHaveBeenCalledTimes(1);
    });

    it("200 sans `etablissement` → pending:true ET captureError (forme inattendue, non vérifié)", async () => {
        process.env.INSEE_API_TOKEN = "tok";
        mockFetchOnce({ status: 200, ok: true, body: {} });
        const { verifySIRET } = await import("@/lib/siret");
        const { captureError } = await import("@/lib/error");
        const r = await verifySIRET(VALID_SIRET);
        expect(r.valid).toBe(true);
        expect(r.pending).toBe(true);
        expect(vi.mocked(captureError)).toHaveBeenCalledTimes(1);
    });

    it("succès diffusible → valid:true, pending:false, identité pré-remplie depuis l'INSEE", async () => {
        process.env.INSEE_API_TOKEN = "tok";
        mockFetchOnce({ status: 200, ok: true, body: INSEE_OK });
        const { verifySIRET } = await import("@/lib/siret");
        const r = await verifySIRET(VALID_SIRET);
        expect(r).toMatchObject({
            valid: true,
            pending: false,
            active: true,
            name: "BOUTIQUE TEST SARL",
            address: "12 RUE DU TEMPLE",
            city: "TOULOUSE",
            postalCode: "31000",
            nafCode: "47.71Z",
        });
    });

    it("NON-DIFFUSIBLE ([ND]) → valid:true (existence confirmée), pending:false, champs masqués → null (PAS de crash, pas de '[ND]' affiché)", async () => {
        process.env.INSEE_API_TOKEN = "tok";
        mockFetchOnce({ status: 200, ok: true, body: INSEE_NON_DIFFUSIBLE });
        const { verifySIRET } = await import("@/lib/siret");
        const r = await verifySIRET(VALID_SIRET);
        expect(r.valid).toBe(true);
        expect(r.pending).toBe(false);
        // Aucun champ ne doit contenir la chaîne de masquage INSEE.
        expect(r.name).toBeNull();
        expect(r.address).toBeNull();
        expect(r.city).toBeNull();
        expect(r.nafCode).toBeNull();
    });
});

describe("POST /api/auth/verify-siret — contrat consommé par les forms (company + pending)", () => {
    let ip = 0;
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.INSEE_API_TOKEN;
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.INSEE_API_TOKEN;
    });

    function post(siret: unknown) {
        // IP distincte par appel → ne pas heurter le rate-limit in-memory (10/min/clé).
        ip += 1;
        return new NextRequest("http://localhost/api/auth/verify-siret", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${ip}` },
            body: JSON.stringify({ siret }),
        });
    }

    it("SIRET vérifié → 200 avec `company` OBJET (pré-remplissage) + pending:false", async () => {
        process.env.INSEE_API_TOKEN = "tok";
        mockFetchOnce({ status: 200, ok: true, body: INSEE_OK });
        const { POST } = await import("@/app/api/auth/verify-siret/route");
        const res = await POST(post(VALID_SIRET));
        expect(res.status).toBe(200);
        const data = await res.json();
        // Le bug historique : la route renvoyait des champs PLATS, les forms lisaient
        // `data.company` (toujours undefined) → pré-remplissage MORT. Désormais objet.
        expect(data.company).toEqual({
            name: "BOUTIQUE TEST SARL",
            address: "12 RUE DU TEMPLE",
            city: "TOULOUSE",
            postalCode: "31000",
            nafCode: "47.71Z",
        });
        expect(data.pending).toBe(false);
    });

    it("non vérifié (token absent) → 200, company:null, pending:true (signal qui pilote status pending)", async () => {
        const { POST } = await import("@/app/api/auth/verify-siret/route");
        const res = await POST(post(VALID_SIRET));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.company).toBeNull();
        expect(data.pending).toBe(true);
    });

    it("introuvable → 400 + error (les forms doivent bloquer ; le bug status===404 est mort)", async () => {
        process.env.INSEE_API_TOKEN = "tok";
        mockFetchOnce({ status: 404, ok: false });
        const { POST } = await import("@/app/api/auth/verify-siret/route");
        const res = await POST(post(VALID_SIRET));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.valid).toBe(false);
        expect(data.error).toMatch(/introuvable/i);
    });
});
