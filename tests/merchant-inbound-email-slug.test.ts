import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import { parseInboundAddress } from "@/lib/ingest/inbound-address";

/**
 * BUG P0-2 — email-in mort pour tout nouveau marchand.
 *
 * Le trigger DB `set_slug_on_insert` (012) ne pose que `merchants.slug` ; la 057
 * n'a backfillé `inbound_email_slug` qu'une fois. Résultat : tout marchand créé
 * après la 057 avait `inbound_email_slug = NULL` → `/api/email/inbound-address`
 * renvoyait `{address: null}` et `/api/inbound-email` ne routait JAMAIS ses emails
 * (factures + stock) — le canal d'ingestion primaire (Connect) était mort-né.
 *
 * Ces tests prouvent le fix applicatif (sans migration) : les DEUX chemins
 * d'insertion marchand (`POST /api/merchants` + `createMerchantFromMetadata`,
 * seuls inserts `merchants` du code, vérifié par grep) posent désormais
 * `inbound_email_slug` NON NULL au format EXACT de la 057 :
 *
 *   inbound_email_slug = merchants.slug  (sans préfixe — les préfixes
 *   `stock-`/`factures-` appartiennent à l'ADRESSE, cf. parseInboundAddress).
 *
 * On drive les VRAIS handlers ; seules les réponses DB ({data,error}) sont
 * contrôlées (motif tests/ingest-token-route.test.ts).
 */

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureMock(...a) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => null }));

// ─── Faux client Supabase (session) partagé par les deux chemins ─────────────
// Le slug que le trigger DB (012) poserait et renverrait via RETURNING.
const TRIGGER_SLUG = "boutique-de-lea-abc12345";
const MERCHANT_ID = "merch-1";

let authUser: { id: string } | null = { id: "user-1" };
// Réponse de l'INSERT … .select().single()
let insertResponse: { data: unknown; error: unknown } = {
    data: { id: MERCHANT_ID, slug: TRIGGER_SLUG },
    error: null,
};
// Réponse de l'UPDATE … .eq().is() (pose de inbound_email_slug)
let updateResult: { error: unknown } = { error: null };
// Réponse du check d'existence de createMerchantFromMetadata (maybeSingle)
let existingResponse: { data: unknown; error: unknown } = { data: null, error: null };

// Traces des écritures pour les assertions.
const inserts: Array<Record<string, unknown>> = [];
const updates: Array<{ payload: Record<string, unknown>; eq: unknown[]; is: unknown[] }> = [];

function makeFakeSupabase() {
    return {
        auth: { getUser: async () => ({ data: { user: authUser } }) },
        from: (table: string) => {
            if (table !== "merchants") throw new Error(`unexpected table ${table}`);
            return {
                // Check d'existence (createMerchantFromMetadata)
                select: () => ({ eq: () => ({ maybeSingle: async () => existingResponse }) }),
                insert: (row: Record<string, unknown>) => {
                    inserts.push(row);
                    return { select: () => ({ single: async () => insertResponse }) };
                },
                update: (payload: Record<string, unknown>) => ({
                    eq: (...eqArgs: unknown[]) => ({
                        is: async (...isArgs: unknown[]) => {
                            updates.push({ payload, eq: eqArgs, is: isArgs });
                            return updateResult;
                        },
                    }),
                }),
            };
        },
    };
}

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => makeFakeSupabase(),
}));

import { POST } from "@/app/api/merchants/route";
import { createMerchantFromMetadata } from "@/lib/auth/create-merchant-from-metadata";

function makeCreateRequest() {
    return new NextRequest("http://localhost/api/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Boutique de Léa", address: "1 rue Test", city: "Toulouse" }),
    });
}

beforeEach(() => {
    captureMock.mockClear();
    authUser = { id: "user-1" };
    insertResponse = { data: { id: MERCHANT_ID, slug: TRIGGER_SLUG }, error: null };
    updateResult = { error: null };
    existingResponse = { data: null, error: null };
    inserts.length = 0;
    updates.length = 0;
    // Pas de géocodage réseau dans les tests.
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
});

describe("POST /api/merchants — inbound_email_slug posé à la création", () => {
    it("un marchand nouvellement créé obtient inbound_email_slug NON NULL = slug (format 057)", async () => {
        const res = await POST(makeCreateRequest());
        expect(res.status).toBe(201);

        // L'écriture inbound_email_slug a eu lieu, dérivée du slug posé par le trigger DB.
        expect(updates).toHaveLength(1);
        const write = updates[0];
        expect(write.payload).toEqual({ inbound_email_slug: TRIGGER_SLUG });
        expect(write.payload.inbound_email_slug).not.toBeNull();
        // Ciblée sur CE marchand…
        expect(write.eq).toEqual(["id", MERCHANT_ID]);
        // …et UNIQUEMENT si la colonne est encore NULL (jamais d'écrasement d'une
        // adresse déjà communiquée à un fournisseur).
        expect(write.is).toEqual(["inbound_email_slug", null]);
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("FORMAT : la valeur posée route bien les adresses stock-{slug}@ et factures-{slug}@ (round-trip parseInboundAddress)", async () => {
        await POST(makeCreateRequest());
        const value = updates[0].payload.inbound_email_slug as string;

        // Exactement ce que /api/email/inbound-address affiche et que
        // /api/inbound-email résout via .eq("inbound_email_slug", parsed.slug).
        expect(parseInboundAddress(`stock-${value}@twostep.fr`, "twostep.fr")).toEqual({
            channel: "stock",
            slug: value,
        });
        expect(parseInboundAddress(`factures-${value}@twostep.fr`, "twostep.fr")).toEqual({
            channel: "invoice",
            slug: value,
        });
    });

    it("NON-FATAL : un échec de la pose inbound_email_slug ne casse pas la création (201) mais est VISIBLE (captureError)", async () => {
        updateResult = { error: { code: "57014", message: "statement timeout" } };
        const res = await POST(makeCreateRequest());
        // Le signup prime — la migration 108 (trigger+backfill) referme le trou.
        expect(res.status).toBe(201);
        expect(captureMock).toHaveBeenCalled();
    });

    it("anomalie : INSERT renvoyé sans slug → pas d'update aveugle, signal captureError (jamais muet)", async () => {
        insertResponse = { data: { id: MERCHANT_ID, slug: null }, error: null };
        const res = await POST(makeCreateRequest());
        expect(res.status).toBe(201);
        expect(updates).toHaveLength(0);
        expect(captureMock).toHaveBeenCalled();
    });
});

describe("createMerchantFromMetadata — même garantie sur le chemin signup/callback", () => {
    const merchantUser = {
        id: "user-1",
        user_metadata: {
            role: "merchant",
            merchant_name: "Boutique de Léa",
            merchant_address: "1 rue Test",
            merchant_city: "Toulouse",
        },
    } as never;

    it("pose inbound_email_slug = slug renvoyé par le RETURNING de l'insert", async () => {
        const supabase = makeFakeSupabase() as never;
        const result = await createMerchantFromMetadata(supabase, merchantUser);
        expect(result.created).toBe(true);

        expect(inserts).toHaveLength(1);
        expect(updates).toHaveLength(1);
        expect(updates[0].payload).toEqual({ inbound_email_slug: TRIGGER_SLUG });
        expect(updates[0].eq).toEqual(["id", MERCHANT_ID]);
        expect(updates[0].is).toEqual(["inbound_email_slug", null]);
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("échec de l'INSERT → pas de pose d'adresse, created:false, signal existant conservé", async () => {
        insertResponse = { data: null, error: { message: "insert failed" } };
        const supabase = makeFakeSupabase() as never;
        const result = await createMerchantFromMetadata(supabase, merchantUser);
        expect(result.created).toBe(false);
        expect(updates).toHaveLength(0);
        expect(captureMock).toHaveBeenCalled();
    });

    it("utilisateur non-marchand → aucun insert ni update", async () => {
        const supabase = makeFakeSupabase() as never;
        const result = await createMerchantFromMetadata(supabase, { id: "u", user_metadata: {} } as never);
        expect(result.created).toBe(false);
        expect(inserts).toHaveLength(0);
        expect(updates).toHaveLength(0);
    });
});
