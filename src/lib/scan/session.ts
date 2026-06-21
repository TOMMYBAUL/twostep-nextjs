import { classifyScannedCode, type ScannedCodeKind } from "@/lib/barcode/classify";

/**
 * Session de scan en lot ("mode réception / inventaire").
 *
 * Modélise le geste : le marchand balaie ses articles, chaque code tombe dans une
 * liste qui s'accumule. Re-scanner le même code INCRÉMENTE la quantité (5 articles
 * identiques = 5 scans = qté 5) au lieu de créer un doublon. C'est le cœur logique
 * du batch ; la couche caméra/overlay AR (et le multi-codes-par-image via
 * zxing-wasm) se branche par-dessus. Pur → testable sans navigateur.
 */

export type ScanLine = {
    code: string;
    kind: ScannedCodeKind;
    quantity: number;
    firstSeenAt: string;
    lastSeenAt: string;
};

export type ScanSession = {
    lines: ScanLine[];
};

export function emptyScanSession(): ScanSession {
    return { lines: [] };
}

/**
 * Ajoute un scan à la session. Déduplique par valeur de code (incrémente la
 * quantité). Ignore les codes invalides. `now` injecté pour testabilité.
 */
export function addScan(session: ScanSession, raw: string, now: Date): ScanSession {
    const classified = classifyScannedCode(raw);
    if (classified.kind === "invalid") return session;

    const iso = now.toISOString();
    const idx = session.lines.findIndex((l) => l.code === classified.value);

    if (idx >= 0) {
        const updated = { ...session.lines[idx], quantity: session.lines[idx].quantity + 1, lastSeenAt: iso };
        const lines = session.lines.slice();
        lines[idx] = updated;
        return { lines };
    }

    return {
        lines: [
            ...session.lines,
            { code: classified.value, kind: classified.kind, quantity: 1, firstSeenAt: iso, lastSeenAt: iso },
        ],
    };
}

/** Ajuste manuellement la quantité d'une ligne (saisie marchand après scan colis). */
export function setLineQuantity(session: ScanSession, code: string, quantity: number): ScanSession {
    const q = Math.max(0, Math.trunc(quantity));
    return {
        lines: session.lines.map((l) => (l.code === code ? { ...l, quantity: q } : l)),
    };
}

/** Total d'unités scannées dans la session. */
export function sessionTotalUnits(session: ScanSession): number {
    return session.lines.reduce((n, l) => n + l.quantity, 0);
}
