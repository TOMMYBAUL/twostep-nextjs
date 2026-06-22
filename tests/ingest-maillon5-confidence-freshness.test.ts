import { describe, it, expect } from "vitest";
import { productConfidence, stockRowToConfidenceInput } from "@/lib/stock/product-confidence";
import type { StockRowForConfidence } from "@/lib/stock/product-confidence";

/**
 * MAILLON 5 — Confiance / fraîcheur : preuve réelle que la fraîcheur affichée se lit
 * sur `stock.source_ts` (heure RÉELLE de l'observation source, migration 104) et JAMAIS
 * sur `stock.updated_at` (heure d'écriture DB).
 *
 * Contexte du bug réel (cosmetic-guard) : la migration 104 a ajouté `source_ts` ET les
 * webhooks le remplissent avec l'heure de l'événement (commentaire route shopify :
 * « source_ts = horodatage de la vérité source … → confidence 'vu il y a X' honnête »).
 * Pourtant les 3 routes consommatrices (`by-ean`, `by-merchants`, `[id]`) passaient
 * `stock.updated_at` à la confidence → la garde était cosmétique : un webhook traité avec
 * retard (retry/outage POS) affichait « vu à l'instant / Disponible » pour une vente
 * observée des heures plus tôt. Ce fichier prouve le mapping correct et la divergence.
 */

const now = new Date("2026-06-22T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

describe("maillon 5 — stockRowToConfidenceInput : la fraîcheur vient de source_ts", () => {
    it("lit source_ts (vérité source), PAS updated_at (écriture DB)", () => {
        const row: StockRowForConfidence = {
            quantity: 9,
            source: "webhook",
            source_ts: hoursAgo(3), // la vente a été observée il y a 3 h
            updated_at: hoursAgo(0), // mais la ligne DB vient d'être (ré)écrite à l'instant
        };
        const input = stockRowToConfidenceInput(row);
        expect(input.lastEventAt).toBe(hoursAgo(3)); // source_ts, jamais updated_at
        expect(input.quantity).toBe(9);
        expect(input.storedSource).toBe("webhook");
    });

    it("normalise la forme TABLEAU de PostgREST (stock(...) en jointure)", () => {
        const input = stockRowToConfidenceInput([
            { quantity: 4, source: "pos_sync", source_ts: hoursAgo(1), updated_at: hoursAgo(0) },
        ]);
        expect(input.lastEventAt).toBe(hoursAgo(1));
        expect(input.storedSource).toBe("pos_sync");
        expect(input.quantity).toBe(4);
    });

    it("repli défensif sur updated_at uniquement si source_ts absent (ligne pré-104 théorique)", () => {
        const input = stockRowToConfidenceInput({ quantity: 2, source: "manual", updated_at: hoursAgo(5) });
        expect(input.lastEventAt).toBe(hoursAgo(5));
    });

    it("PLAFONNE source_ts à updated_at : un source_ts plus RÉCENT que l'écriture DB est un artefact (DEFAULT now() de la 104 sur ligne back-fillée, ou dérive d'horloge) → on prend le plus ancien (jamais plus frais que la réalité)", () => {
        const input = stockRowToConfidenceInput({
            quantity: 3,
            source: "pos_sync",
            source_ts: hoursAgo(0), // artefact : migration a posé now() à l'ALTER
            updated_at: hoursAgo(120), // vraie dernière écriture : il y a 5 j
        });
        expect(input.lastEventAt).toBe(hoursAgo(120)); // honnête : on n'affiche pas « frais »
    });

    it("stock absent (null/undefined/tableau vide) → quantité 0, pas de fraîcheur, source nulle", () => {
        for (const empty of [null, undefined, [] as StockRowForConfidence[]]) {
            const input = stockRowToConfidenceInput(empty);
            expect(input).toEqual({ quantity: 0, lastEventAt: null, storedSource: null });
        }
    });
});

describe("maillon 5 — DIVERGENCE prouvée : updated_at mentait, source_ts dit vrai", () => {
    // Webhook livré avec 30 h de retard (retry storm / backfill après outage POS).
    // source_ts = heure réelle de la vente (30 h) ; updated_at = traitement à l'instant.
    const delayedWebhook: StockRowForConfidence = {
        quantity: 9,
        source: "webhook",
        source_ts: hoursAgo(30),
        updated_at: hoursAgo(0),
    };

    it("ANCIEN câblage (updated_at) → mensonge : Disponible + « vu à l'instant »", () => {
        // Reproduit le bug : si on avait passé updated_at comme lastEventAt.
        const lying = productConfidence({
            quantity: delayedWebhook.quantity!,
            lastEventAt: delayedWebhook.updated_at!,
            storedSource: delayedWebhook.source,
            posItemId: null,
            merchantHasIngest: false,
            recentNotInStoreReports: 0,
            now,
        });
        expect(lying.state).toBe("available");
        expect(lying.freshnessLabel).toBe("vu à l'instant");
    });

    it("NOUVEAU câblage (source_ts via helper) → honnête : 30 h > limite realtime 24 h → probable + « vu il y a 1 j »", () => {
        const honest = productConfidence({
            ...stockRowToConfidenceInput(delayedWebhook),
            posItemId: null,
            merchantHasIngest: false,
            recentNotInStoreReports: 0,
            now,
        });
        expect(honest.state).toBe("probable");
        expect(honest.reason).toBe("stale");
        expect(honest.freshnessLabel).toBe("vu il y a 1 j");
    });

    it("retard modéré (3 h < 24 h) reste Disponible MAIS la fraîcheur est honnête (« vu il y a 3 h », pas « à l'instant »)", () => {
        const honest = productConfidence({
            ...stockRowToConfidenceInput({ quantity: 9, source: "webhook", source_ts: hoursAgo(3), updated_at: hoursAgo(0) }),
            posItemId: null,
            merchantHasIngest: false,
            recentNotInStoreReports: 0,
            now,
        });
        expect(honest.state).toBe("available");
        expect(honest.freshnessLabel).toBe("vu il y a 3 h");
    });
});

describe("maillon 5 — non-régression : le chemin courant (source_ts≈updated_at) est inchangé", () => {
    it("file_push frais (source_ts = updated_at = il y a 5 min via now()) → Disponible, comportement identique", () => {
        const fresh = stockRowToConfidenceInput({
            quantity: 7,
            source: "file_push",
            source_ts: new Date(now.getTime() - 5 * 60_000).toISOString(),
            updated_at: new Date(now.getTime() - 5 * 60_000).toISOString(),
        });
        const r = productConfidence({
            ...fresh,
            posItemId: null,
            merchantHasIngest: true,
            recentNotInStoreReports: 0,
            now,
        });
        expect(r.state).toBe("available");
        expect(r.freshnessLabel).toBe("vu il y a 5 min");
    });
});
