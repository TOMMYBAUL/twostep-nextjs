/**
 * Contrat UI ↔ routes API POS (bug P0-1, wizard « Choisir une caisse »).
 *
 * Le wizard référençait 3 URLs `/api/pos/...` qui n'existaient PAS sur le disque
 * (`/[provider]/connect`, `/[provider]/sync`, `/[provider]/disconnect`) → 404
 * systématique sur les 3 actions, sans aucune erreur de build ni de type : le
 * routing App Router est un contrat FICHIER, invisible pour tsc.
 *
 * Ce test extrait TOUTE URL `/api/pos/...` des sources du wizard et échoue si
 * elle ne correspond pas à un `route.ts` réel sous `src/app/api/pos/**`.
 * Un segment interpolé (`${...}`) doit correspondre à un dossier dynamique
 * (`[param]`) ; un segment littéral à un dossier du même nom (ou dynamique).
 */
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const API_POS_DIR = join(ROOT, "src", "app", "api", "pos");

/** Sources du wizard POS dont les URLs doivent tenir le contrat. */
const WIZARD_SOURCES = [
    "src/app/dashboard/stock/pos/page.tsx",
    "src/app/dashboard/stock/pos/actions.tsx",
];

/** Extrait toutes les occurrences `/api/pos/...` d'un texte source (y compris
 *  les template literals : `${pos.id}` reste dans le match, coupé au quote/
 *  backtick/espace/`?` suivant). */
function extractPosUrls(source: string): string[] {
    return source.match(/\/api\/pos\/[^"'`\s?]*/g) ?? [];
}

/** Un segment interpolé ne peut matcher QUE un dossier dynamique `[param]` ;
 *  un segment littéral matche le dossier exact, sinon un dossier dynamique. */
function resolveRoute(url: string): { exists: boolean; resolved: string } {
    const segments = url.replace(/^\/api\/pos\/?/, "").split("/").filter(Boolean);
    let dir = API_POS_DIR;
    const resolvedParts: string[] = [];
    for (const seg of segments) {
        const dirs = readdirSync(dir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
        const dynamic = dirs.find((d) => /^\[.+\]$/.test(d));
        const next = seg.includes("${") ? dynamic : dirs.includes(seg) ? seg : dynamic;
        if (!next) return { exists: false, resolved: [...resolvedParts, `<aucun dossier pour "${seg}">`].join("/") };
        resolvedParts.push(next);
        dir = join(dir, next);
    }
    return { exists: existsSync(join(dir, "route.ts")), resolved: resolvedParts.join("/") };
}

describe("contrat routes POS — wizard « Choisir une caisse »", () => {
    const urlsByFile = WIZARD_SOURCES.map((rel) => ({
        file: rel,
        urls: extractPosUrls(readFileSync(join(ROOT, rel), "utf8")),
    }));

    it("les sources référencent bien des URLs /api/pos/ (test non vacant)", () => {
        // Si l'extraction ne trouve plus rien (refonte, regex cassée), le test
        // doit ÉCHOUER bruyamment plutôt que passer sur un ensemble vide.
        const all = urlsByFile.flatMap((f) => f.urls);
        expect(all.length).toBeGreaterThanOrEqual(3);
        expect(all.some((u) => u.includes("/auth"))).toBe(true);
        expect(all).toContain("/api/pos/sync");
        expect(all).toContain("/api/pos/disconnect");
    });

    it("chaque URL /api/pos/... référencée correspond à un route.ts existant", () => {
        const misses = urlsByFile.flatMap(({ file, urls }) =>
            urls
                .map((url) => ({ url, ...resolveRoute(url) }))
                .filter((r) => !r.exists)
                .map((r) => `${file} → "${r.url}" (résolu: src/app/api/pos/${r.resolved}) : PAS de route.ts`),
        );
        expect(misses, misses.join("\n")).toEqual([]);
    });

    it("aurait attrapé le bug P0-1 : les 3 anciennes URLs 404 échouent au contrat", () => {
        // Les URLs telles qu'elles apparaissaient dans le code bugué.
        // eslint-disable-next-line no-template-curly-in-string
        for (const buggy of ["/api/pos/${pos.id}/connect", "/api/pos/${provider}/sync", "/api/pos/${provider}/disconnect"]) {
            expect(resolveRoute(buggy).exists, `${buggy} devrait être détectée comme inexistante`).toBe(false);
        }
        // Sanité inverse : les routes réelles passent.
        // eslint-disable-next-line no-template-curly-in-string
        expect(resolveRoute("/api/pos/${id}/auth").exists).toBe(true);
        expect(resolveRoute("/api/pos/sync").exists).toBe(true);
        expect(resolveRoute("/api/pos/disconnect").exists).toBe(true);
    });
});
