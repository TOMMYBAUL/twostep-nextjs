import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "assets", "meta-ads", "export");
const IMG_DIR = path.join(__dirname, "..", "assets", "meta-ads");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Each card as a standalone HTML page at 1080x1080
const cards = [
  // CONCEPT 1
  { name: "C1-card1", img: "img-hook-sm.jpg", overlay: "bottom",
    html: `<div class="tag">CONCEPT 1</div><div class="hook">Tu attends <em>5 jours</em> un colis...<br>alors que c'est dispo <em>a 200m</em>.</div>` },
  { name: "C1-card2", img: "img-rue-sm.jpg", overlay: "bottom",
    html: `<div class="tag warm">POURTANT</div><div class="hook">Les boutiques de ton quartier ont <em>exactement</em> ce que tu cherches.</div>` },
  { name: "C1-card3", img: null, bg: "linear-gradient(135deg, #4268FF 0%, #2B4FE0 100%)",
    html: `<div class="tag white">DONC</div><div class="hook">On te montre le <em class="underline-white">stock reel</em> autour de toi.</div><div class="body">Marques. Tailles. Dispo. En temps reel.</div>` },
  { name: "C1-card4", img: "img-entering-sm.jpg", overlay: "bottom",
    html: `<div class="hook">Verifie. <em>Trouve.</em> Vas-y.</div><div class="body">Plus de colis. Plus d'attente. Tu l'as dans les mains aujourd'hui.</div>` },
  { name: "C1-card5", img: null, bg: "linear-gradient(135deg, #1A1F36 0%, #0A0C14 100%)",
    html: `<div class="hook small">Le stock de ton quartier,<br><em>a deux pas.</em></div><div class="cta">Essaie gratuitement →</div><div class="body small">twostep.fr · Gratuit</div>` },

  // CONCEPT 2
  { name: "C2-card1", img: "img-couch-sm.jpg", overlay: "darktop",
    html: `<div class="hook">Tu <em>commandes en ligne</em> par reflexe ?</div><div class="body">Et si tu pouvais savoir ce qui est dispo a cote... avant de commander ?</div>` },
  { name: "C2-card2", img: null, bg: "linear-gradient(135deg, #4268FF 0%, #2B4FE0 100%)",
    html: `<div class="tag white">IMAGINE</div><div class="hook">Savoir <em class="underline-white">avant</em> si c'est dispo.</div><div class="body">La bonne taille. Le bon magasin. Avant de bouger.</div>` },
  { name: "C2-card3", img: "img-rue-sm.jpg", overlay: "blue",
    html: `<div class="hook small">Stock <em class="white">reel</em>. Temps <em class="white">reel</em>.<br>Autour de <em class="white">toi</em>.</div><div class="divider"></div><div class="body">Two-Step se connecte aux caisses des boutiques et te montre ce qui est vraiment disponible.</div>` },
  { name: "C2-card4", img: null, bg: "linear-gradient(135deg, #0A0C14 0%, #1a2340 50%, #4268FF 100%)",
    html: `<div class="hook small">Ne commande plus <em>les yeux fermes</em>.</div><div class="cta">Decouvrir Two-Step →</div><div class="body small">Gratuit · twostep.fr</div>` },

  // CONCEPT 3
  { name: "C3-card1", img: "img-invisible-sm.jpg", overlay: "full",
    html: `<div class="stat">90%</div><div class="stat-label">des boutiques sont <em>invisibles</em> en ligne.</div>` },
  { name: "C3-card2", img: "img-boutique-sm.jpg", overlay: "bottom",
    html: `<div class="tag warm">POURTANT</div><div class="hook">Elles ont <em>exactement</em> ce que tu cherches.</div><div class="body">La bonne marque, la bonne taille, le bon prix. A cote de chez toi.</div>` },
  { name: "C3-card3", img: null, bg: "linear-gradient(135deg, #4268FF 0%, #2B4FE0 100%)",
    html: `<div class="hook small">On les a <em class="underline-white">connectees</em>.</div><div class="divider light"></div><div class="body">Leur stock apparait en temps reel sur Two-Step. Tu cherches, tu trouves, tu y vas.</div>` },
  { name: "C3-card4", img: null, bg: "linear-gradient(135deg, #0A0C14 0%, #1a2340 50%, #4268FF 100%)",
    html: `<div class="hook small">Decouvre ce qui t'attend <em>a deux pas</em>.</div><div class="cta">Explorer les boutiques →</div><div class="body small">Gratuit · twostep.fr</div>` },

  // CONCEPT 4
  { name: "C4-card1", img: "img-owner-alone-sm.jpg", overlay: "bottom",
    html: `<div class="hook">Vos clients vous cherchent <em>en ligne</em>...</div><div class="body">Ils tapent le produit. La marque. La taille.</div>` },
  { name: "C4-card2", img: null, bg: "linear-gradient(135deg, #1A1F36 0%, #0A0C14 100%)",
    html: `<div class="tag red">MAIS</div><div class="hook">Ils trouvent les <em class="red">boutiques en ligne</em> a la place.</div><div class="body">Chaque recherche sans resultat local = une vente perdue pour vous.</div>` },
  { name: "C4-card3", img: null, bg: "linear-gradient(135deg, #4268FF 0%, #2B4FE0 100%)",
    html: `<div class="tag white">DONC</div><div class="hook small">Two-Step connecte <em class="underline-white">votre caisse</em>.</div><div class="body">Vos produits apparaissent automatiquement. Zero saisie. 2 minutes.</div>` },
  { name: "C4-card4", img: "img-busy-sm.jpg", overlay: "bottom",
    html: `<div class="tag green">RESULTAT</div><div class="hook"><em>Ils viennent</em> chez vous.</div><div class="body">Les clients voient votre stock, verifient leur taille, et se deplacent.</div>` },
  { name: "C4-card5", img: null, bg: "linear-gradient(135deg, #1A1F36 0%, #0A0C14 100%)",
    html: `<div class="hook small"><em>Gratuit</em> pendant 3 mois.</div><div class="body price">Puis 49 EUR/mois. Annulable a tout moment.</div><div class="cta">Connecter ma boutique →</div><div class="body small">twostep.fr</div>` },
];

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1080px; height:1080px; overflow:hidden; font-family:'Inter',sans-serif; }
  .card { width:1080px; height:1080px; position:relative; overflow:hidden; }
  .card-img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }

  .overlay { position:absolute; inset:0; display:flex; flex-direction:column; padding:80px; color:white; }
  .overlay.bottom { justify-content:flex-end; background:linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.0) 100%); }
  .overlay.full { justify-content:center; align-items:center; text-align:center; background:rgba(0,0,0,0.6); }
  .overlay.blue { justify-content:center; align-items:center; text-align:center; background:rgba(66,104,255,0.82); }
  .overlay.darktop { justify-content:flex-end; background:linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.2) 35%, rgba(0,0,0,0.0) 60%, rgba(0,0,0,0.8) 100%); }
  .overlay.solid { justify-content:center; align-items:center; text-align:center; }

  .hook { font-size:72px; font-weight:900; line-height:1.12; letter-spacing:-1.5px; }
  .hook.small { font-size:60px; }
  .hook em { font-style:normal; color:#4268FF; }
  .hook em.white { color:white; }
  .hook em.underline-white { color:white; text-decoration:underline; text-underline-offset:8px; }
  .hook em.red { color:#FF6B6B; }

  .body { font-size:36px; line-height:1.45; margin-top:24px; color:rgba(255,255,255,0.75); }
  .body.small { font-size:28px; opacity:0.5; margin-top:20px; }
  .body.price { font-size:40px; font-weight:600; opacity:1; margin-top:16px; }

  .tag { display:inline-block; background:rgba(255,255,255,0.2); color:white; padding:10px 28px; border-radius:16px; font-size:30px; font-weight:800; margin-bottom:24px; letter-spacing:1px; }
  .tag.warm { background:rgba(66,104,255,0.15); color:#4268FF; }
  .tag.white { background:rgba(255,255,255,0.25); }
  .tag.red { background:rgba(255,66,66,0.15); color:#FF6B6B; }
  .tag.green { background:rgba(66,255,130,0.15); color:#42FF82; }

  .stat { font-size:180px; font-weight:900; color:#4268FF; letter-spacing:-6px; line-height:1; }
  .stat-label { font-size:48px; font-weight:700; margin-top:20px; }
  .stat-label em { font-style:normal; color:#4268FF; }

  .cta { display:inline-flex; align-items:center; background:#4268FF; color:white; padding:36px 72px; border-radius:28px; font-size:42px; font-weight:700; margin-top:40px; }

  .divider { width:100px; height:6px; background:rgba(255,255,255,0.4); border-radius:3px; margin:40px auto; }
  .divider.light { background:rgba(255,255,255,0.3); }

  .logo { position:absolute; bottom:36px; right:40px; font-size:28px; font-weight:800; color:rgba(255,255,255,0.45); letter-spacing:-0.5px; }
  .logo span { color:#4268FF; }
`;

const browser = await puppeteer.launch({ headless: true });

for (const card of cards) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });

  let imgTag = "";
  if (card.img) {
    const imgPath = path.join(IMG_DIR, card.img).replace(/\\/g, "/");
    imgTag = `<img class="card-img" src="file:///${imgPath}" />`;
  }

  const overlayClass = card.img
    ? (card.overlay || "bottom")
    : "solid";

  const bgStyle = card.bg ? `background:${card.bg};` : "";

  const html = `<!DOCTYPE html><html><head><style>${CSS}</style></head><body>
    <div class="card" style="${bgStyle}">
      ${imgTag}
      <div class="overlay ${overlayClass}">
        ${card.html}
      </div>
      <div class="logo">two<span>step</span></div>
    </div>
  </body></html>`;

  await page.setContent(html, { waitUntil: "networkidle0" });
  // Extra wait for large images
  if (card.img) await new Promise(r => setTimeout(r, 3000));

  const outPath = path.join(OUTPUT_DIR, `${card.name}.png`);
  await page.screenshot({ path: outPath, type: "png" });

  const buf = fs.readFileSync(outPath);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  console.log(`  ${card.name}.png  ${w}x${h}  ${Math.round(buf.length / 1024)} KB`);

  await page.close();
}

await browser.close();
console.log(`\nDone! Cards exported to: ${OUTPUT_DIR}`);
