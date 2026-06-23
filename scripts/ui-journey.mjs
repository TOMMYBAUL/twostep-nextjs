// Parcours UI pilote (Playwright-core + Brave) — "yeux" token-legers.
// Usage: node scripts/ui-journey.mjs <url> [width] [height] [shotPath]
// Imprime un DIAGNOSTIC texte (overflow, max-width, layout) + un ARIA snapshot
// (structuré, ~peu de tokens) et SAUVEGARDE un screenshot sur disque (lu seulement
// si on a besoin de VOIR). Pas besoin d'un MCP : pilotable au terminal (et par la boucle).
import fs from "node:fs";
import { chromium } from "playwright-core";

const BRAVE = process.env.BRAVE_PATH || "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const url = process.argv[2] || "http://localhost:3000/discover";
const W = Number(process.argv[3] || 1920);
const H = Number(process.argv[4] || 1080);
const shot = process.argv[5] || `scripts/.ui-shots/shot-${W}x${H}.png`;

const browser = await chromium.launch({ executablePath: BRAVE, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
let status = "ERR";
try { const r = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }); status = r ? r.status() : "no-resp"; }
catch (e) { status = "GOTO_ERR " + e.message; }
await page.waitForTimeout(1500);

const diag = await page.evaluate(() => {
    const de = document.documentElement;
    const main = document.querySelector("main") || document.body;
    const cs = getComputedStyle(main);
    // Largeur réelle du plus large élément direct sous main (détecte un conteneur full-bleed)
    const kids = [...main.children].map((c) => ({ tag: c.tagName.toLowerCase(), w: Math.round(c.getBoundingClientRect().width), maxW: getComputedStyle(c).maxWidth }));
    return {
        innerWidth: window.innerWidth,
        scrollWidth: de.scrollWidth,
        overflowX_px: de.scrollWidth - window.innerWidth, // >0 = debordement horizontal = bug responsive
        title: document.title,
        main_maxWidth: cs.maxWidth,
        main_width: Math.round(main.getBoundingClientRect().width),
        topChildren: kids.slice(0, 6),
    };
});

console.log("URL", url, "@", W + "x" + H, "-> HTTP", status);
console.log("DIAG", JSON.stringify(diag, null, 2));
try {
    const aria = await page.locator("body").ariaSnapshot();
    console.log("ARIA (premiers 1800 car.) :\n" + aria.slice(0, 1800));
} catch (e) { console.log("aria snapshot failed:", e.message); }

fs.mkdirSync("scripts/.ui-shots", { recursive: true });
await page.screenshot({ path: shot, fullPage: true });
console.log("SHOT", shot);
await browser.close();
