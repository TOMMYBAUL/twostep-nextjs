import { describe, it, expect } from "vitest";
import { emptyScanSession, addScan, setLineQuantity, sessionTotalUnits } from "@/lib/scan/session";

const now = new Date("2026-06-12T12:00:00Z");

describe("#10 session de scan en lot", () => {
    it("accumule les codes scannés", () => {
        let s = emptyScanSession();
        s = addScan(s, "3017620422003", now);
        s = addScan(s, "4006381333931", now);
        expect(s.lines).toHaveLength(2);
    });

    it("re-scanner le même code incrémente la quantité (pas de doublon)", () => {
        let s = emptyScanSession();
        s = addScan(s, "3017620422003", now);
        s = addScan(s, "3017620422003", now);
        s = addScan(s, "3017620422003", now);
        expect(s.lines).toHaveLength(1);
        expect(s.lines[0].quantity).toBe(3);
        expect(sessionTotalUnits(s)).toBe(3);
    });

    it("ignore un code invalide (vide)", () => {
        let s = emptyScanSession();
        s = addScan(s, "", now);
        expect(s.lines).toHaveLength(0);
    });

    it("classe un code carton ITF-14 comme gtin14_case", () => {
        let s = emptyScanSession();
        s = addScan(s, "13017620422000", now);
        expect(s.lines[0].kind).toBe("gtin14_case");
    });

    it("permet d'ajuster la quantité manuellement (scan colis → +N)", () => {
        let s = emptyScanSession();
        s = addScan(s, "13017620422000", now);
        s = setLineQuantity(s, "13017620422000", 24);
        expect(s.lines[0].quantity).toBe(24);
        expect(sessionTotalUnits(s)).toBe(24);
    });
});
