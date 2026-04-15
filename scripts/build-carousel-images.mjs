import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG_DIR = path.join(__dirname, "..", "assets", "meta-ads");
const OUTPUT_DIR = path.join(IMG_DIR, "export");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const SIZE = 1080;

// SVG text overlay generator — uses xml:space="preserve" to keep spaces
function textOverlay({ hook, body, tag, position = "bottom", hookColor = "#4268FF" }) {
  const isCenter = position === "center";
  const x = isCenter ? 540 : 80;
  const anchor = isCenter ? ' text-anchor="middle"' : "";

  // Tag badge — position higher on bottom-aligned cards to avoid overlap
  const tagY = isCenter ? 300 : 580;
  const tagSvg = tag
    ? `<rect x="${isCenter ? 540 - (tag.text.length * 11 + 28) : 80}" y="${tagY}" width="${tag.text.length * 22 + 56}" height="52" rx="16" fill="${tag.bg || "rgba(255,255,255,0.2)"}"/>
       <text x="${isCenter ? 540 : 108}" y="${tagY + 36}" font-family="Inter,Helvetica,Arial,sans-serif" font-size="28" font-weight="800" fill="${tag.color || "white"}" letter-spacing="1"${anchor}>${tag.text}</text>`
    : "";

  // Hook text — strip <em> and render as plain text with colored words via separate text elements
  const hookY = isCenter ? (tag ? 420 : 450) : (tag ? 670 : 680);
  const hookLines = hook.split("\n");

  let hookSvgs = "";
  for (let i = 0; i < hookLines.length; i++) {
    const line = hookLines[i];
    const y = hookY + i * 78;

    // Split line into segments: normal text and <em> text
    const segments = [];
    let remaining = line;
    while (remaining.length > 0) {
      const emStart = remaining.indexOf("<em>");
      if (emStart === -1) {
        segments.push({ text: remaining, color: "white" });
        break;
      }
      if (emStart > 0) {
        segments.push({ text: remaining.slice(0, emStart), color: "white" });
      }
      const emEnd = remaining.indexOf("</em>");
      segments.push({ text: remaining.slice(emStart + 4, emEnd), color: hookColor });
      remaining = remaining.slice(emEnd + 5);
    }

    // Build single text element with tspans, preserving spaces
    const tspans = segments.map(s => `<tspan fill="${s.color}">${s.text}</tspan>`).join("");
    hookSvgs += `<text xml:space="preserve" x="${x}" y="${y}" font-family="Inter,Helvetica,Arial,sans-serif" font-size="64" font-weight="900" fill="white" letter-spacing="-1"${anchor}>${tspans}</text>\n`;
  }

  // Body text
  const bodyY = hookY + hookLines.length * 78 + 24;
  const bodySvg = body
    ? `<text x="${x}" y="${bodyY}" font-family="Inter,Helvetica,Arial,sans-serif" font-size="32" fill="rgba(255,255,255,0.75)"${anchor}>${body}</text>`
    : "";

  // Logo
  const logo = `<text xml:space="preserve" x="1000" y="1044" font-family="Inter,Helvetica,Arial,sans-serif" font-size="26" font-weight="800" text-anchor="end"><tspan fill="rgba(255,255,255,0.45)">two</tspan><tspan fill="${hookColor}">step</tspan></text>`;

  return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
    ${tagSvg}
    ${hookSvgs}
    ${bodySvg}
    ${logo}
  </svg>`;
}

// Gradient overlay
function gradientOverlay(type = "bottom") {
  if (type === "bottom") {
    return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="black" stop-opacity="0"/>
        <stop offset="45%" stop-color="black" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.88"/>
      </linearGradient></defs>
      <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>
    </svg>`;
  }
  if (type === "full") {
    return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${SIZE}" height="${SIZE}" fill="black" fill-opacity="0.6"/>
    </svg>`;
  }
  if (type === "blue") {
    return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${SIZE}" height="${SIZE}" fill="#4268FF" fill-opacity="0.82"/>
    </svg>`;
  }
  return "";
}

// Solid color card (no image)
async function solidCard(filename, { bg, hook, body, tag, hookColor, cta }) {
  // Create gradient background
  const bgSvg = `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      ${bg.stops.map((s, i) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join("")}
    </linearGradient></defs>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  </svg>`;

  const layers = [{ input: Buffer.from(bgSvg), top: 0, left: 0 }];

  const svgText = textOverlay({ hook, body, tag, position: "center", hookColor: hookColor || "#4268FF" });
  layers.push({ input: Buffer.from(svgText), top: 0, left: 0 });

  if (cta) {
    const ctaY = 750;
    const ctaW = cta.length * 24 + 120;
    const ctaX = (SIZE - ctaW) / 2;
    const ctaSvg = `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="72" rx="24" fill="#4268FF"/>
      <text x="540" y="${ctaY + 48}" font-family="Inter,Helvetica,Arial,sans-serif" font-size="36" font-weight="700" fill="white" text-anchor="middle">${cta}</text>
    </svg>`;
    layers.push({ input: Buffer.from(ctaSvg), top: 0, left: 0 });
  }

  await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite(layers)
    .png()
    .toFile(path.join(OUTPUT_DIR, filename));

  console.log("  " + filename + " (solid)");
}

// Photo card with overlay
async function photoCard(filename, { imgFile, overlayType, hook, body, tag, hookColor }) {
  const imgPath = path.join(IMG_DIR, imgFile);

  const base = await sharp(imgPath)
    .resize(SIZE, SIZE, { fit: "cover" })
    .toBuffer();

  const layers = [];

  // Gradient overlay
  const gradSvg = gradientOverlay(overlayType || "bottom");
  if (gradSvg) layers.push({ input: Buffer.from(gradSvg), top: 0, left: 0 });

  // Text overlay
  const svgText = textOverlay({
    hook, body, tag,
    position: overlayType === "full" || overlayType === "blue" ? "center" : "bottom",
    hookColor: hookColor || "#4268FF"
  });
  layers.push({ input: Buffer.from(svgText), top: 0, left: 0 });

  await sharp(base)
    .composite(layers)
    .png()
    .toFile(path.join(OUTPUT_DIR, filename));

  console.log("  " + filename + " (photo)");
}

// ══════════════════════════════════════════════
// BUILD ALL CARDS
// ══════════════════════════════════════════════

console.log("Building carousel cards...\n");

// ── CONCEPT 1 ──
console.log("CONCEPT 1 — Ta taille est a 200m");

await photoCard("C1-card1.png", {
  imgFile: "img-hook-sm.jpg",
  overlayType: "bottom",
  hook: "Tu attends <em>5 jours</em> un\ncolis... alors que c'est\ndispo <em>a 200m</em>.",
});

await photoCard("C1-card2.png", {
  imgFile: "img-rue-sm.jpg",
  overlayType: "bottom",
  tag: { text: "POURTANT", bg: "rgba(66,104,255,0.3)", color: "#93AAFF" },
  hook: "Les boutiques de ton\nquartier ont <em>exactement</em>\nce que tu cherches.",
});

await solidCard("C1-card3.png", {
  bg: { stops: [{ offset: "0%", color: "#4268FF" }, { offset: "100%", color: "#2B4FE0" }] },
  tag: { text: "DONC", bg: "rgba(255,255,255,0.25)", color: "white" },
  hook: "On te montre le\n<em>stock reel</em> autour\nde chez toi.",
  body: "Marques. Tailles. Dispo. En temps reel.",
  hookColor: "white",
});

await photoCard("C1-card4.png", {
  imgFile: "img-entering-sm.jpg",
  overlayType: "bottom",
  hook: "Cherche.\n<em>Trouve.</em>\nFonce.",
});

await solidCard("C1-card5.png", {
  bg: { stops: [{ offset: "0%", color: "#1A1F36" }, { offset: "100%", color: "#0A0C14" }] },
  hook: "Le stock de ton\nquartier, <em>a deux pas</em>.",
  cta: "Essaie gratuitement →",
  body: "twostep.fr · Gratuit",
});

// ── CONCEPT 2 ──
console.log("\nCONCEPT 2 — Le trajet inutile");

await photoCard("C2-card1.png", {
  imgFile: "img-couch-sm.jpg",
  overlayType: "bottom",
  hook: "Tu <em>commandes en ligne</em>\npar reflexe ?",
  body: "Et si c'etait dispo a cote de chez toi ?",
});

await solidCard("C2-card2.png", {
  bg: { stops: [{ offset: "0%", color: "#4268FF" }, { offset: "100%", color: "#2B4FE0" }] },
  tag: { text: "IMAGINE", bg: "rgba(255,255,255,0.25)", color: "white" },
  hook: "Savoir <em>avant</em>\nsi c'est dispo.",
  body: "La bonne taille. Le bon magasin.",
  hookColor: "white",
});

await photoCard("C2-card3.png", {
  imgFile: "img-rue-sm.jpg",
  overlayType: "blue",
  hook: "Stock <em>reel</em>.\nTemps <em>reel</em>.\nAutour de <em>chez toi</em>.",
  hookColor: "white",
});

await solidCard("C2-card4.png", {
  bg: { stops: [{ offset: "0%", color: "#0A0C14" }, { offset: "50%", color: "#1a2340" }, { offset: "100%", color: "#4268FF" }] },
  hook: "Ne commande plus\n<em>les yeux fermes</em>.",
  cta: "Decouvrir Two-Step →",
});

// ── CONCEPT 3 ──
console.log("\nCONCEPT 3 — 90% invisibles");

await photoCard("C3-card1.png", {
  imgFile: "img-invisible-sm.jpg",
  overlayType: "full",
  hook: "<em>90%</em>\ndes boutiques sont\n<em>invisibles</em> en ligne.",
});

await photoCard("C3-card2.png", {
  imgFile: "img-boutique-sm.jpg",
  overlayType: "bottom",
  tag: { text: "POURTANT", bg: "rgba(66,104,255,0.3)", color: "#93AAFF" },
  hook: "Elles ont <em>exactement</em>\nce que tu cherches.",
});

await solidCard("C3-card3.png", {
  bg: { stops: [{ offset: "0%", color: "#4268FF" }, { offset: "100%", color: "#2B4FE0" }] },
  hook: "On les a\n<em>connectees</em>.",
  body: "Stock en temps reel sur Two-Step.",
  hookColor: "white",
});

await solidCard("C3-card4.png", {
  bg: { stops: [{ offset: "0%", color: "#0A0C14" }, { offset: "50%", color: "#1a2340" }, { offset: "100%", color: "#4268FF" }] },
  hook: "Decouvre ce qui\nt'attend <em>a deux pas</em>.",
  cta: "Explorer les boutiques →",
});

// ── CONCEPT 4 ──
console.log("\nCONCEPT 4 — Vos clients vous cherchent");

await photoCard("C4-card1.png", {
  imgFile: "img-owner-alone-sm.jpg",
  overlayType: "bottom",
  hook: "Vos clients vous\ncherchent <em>en ligne</em>...",
  body: "Ils tapent le produit. La marque.",
});

await solidCard("C4-card2.png", {
  bg: { stops: [{ offset: "0%", color: "#1A1F36" }, { offset: "100%", color: "#0A0C14" }] },
  tag: { text: "MAIS", bg: "rgba(255,66,66,0.2)", color: "#FF6B6B" },
  hook: "Ils trouvent les\n<em>boutiques en ligne</em>\na la place.",
  hookColor: "#FF6B6B",
  body: "Chaque recherche = une vente perdue.",
});

await solidCard("C4-card3.png", {
  bg: { stops: [{ offset: "0%", color: "#4268FF" }, { offset: "100%", color: "#2B4FE0" }] },
  tag: { text: "DONC", bg: "rgba(255,255,255,0.25)", color: "white" },
  hook: "Two-Step connecte\n<em>votre caisse</em>.",
  body: "Zero saisie. 2 minutes.",
  hookColor: "white",
});

await photoCard("C4-card4.png", {
  imgFile: "img-busy-sm.jpg",
  overlayType: "bottom",
  tag: { text: "RESULTAT", bg: "rgba(66,255,130,0.2)", color: "#42FF82" },
  hook: "<em>Ils viennent</em>\nchez vous.",
  hookColor: "#42FF82",
});

await solidCard("C4-card5.png", {
  bg: { stops: [{ offset: "0%", color: "#1A1F36" }, { offset: "100%", color: "#0A0C14" }] },
  hook: "<em>Gratuit</em> pendant\n3 mois.",
  body: "Puis 49 EUR/mois. Annulable.",
  cta: "Connecter ma boutique →",
});

console.log("\nDone! 18 cards in:", OUTPUT_DIR);
