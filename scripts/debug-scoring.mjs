function normalizeName(s) { return s.toLowerCase().replace(/[''`\-/().,"]/g, " ").replace(/\s+/g, " ").trim(); }
function levenshtein(a, b) { const m=a.length,n=b.length; const dp=Array.from({length:n+1},(_,j)=>j); for(let i=1;i<=m;i++){let prev=dp[0];dp[0]=i;for(let j=1;j<=n;j++){const tmp=dp[j];dp[j]=a[i-1]===b[j-1]?prev:1+Math.min(prev,dp[j],dp[j-1]);prev=tmp;}} return dp[n]; }
function scoreNameMatch(orig, cand, brand) {
  const no = normalizeName(brand ? brand+" "+orig : orig);
  const nc = normalizeName(cand);
  const maxLen = Math.max(no.length, nc.length);
  const levScore = maxLen > 0 ? 1 - levenshtein(no, nc) / maxLen : 1;
  const origWords = new Set(no.split(" ").filter(w => w.length > 2));
  const candWords = new Set(nc.split(" ").filter(w => w.length > 2));
  let overlap = 0;
  for (const w of origWords) { if (candWords.has(w)) overlap++; }
  const overlapScore = origWords.size > 0 ? overlap / origWords.size : 0;
  const total = levScore * 0.4 + overlapScore * 0.6;
  console.log("  lev:", levScore.toFixed(3), "overlap:", overlapScore.toFixed(3), "TOTAL:", total.toFixed(3));
  return total;
}

const tests = [
  ["Advanced Snail 96 Mucin Power Essence 100ml", "COSRX Advanced Snail 96 Mucin Power Essence 100ml", "COSRX"],
  ["Aloe Soothing Sun Cream SPF50+ 50ml", "Aloe Soothing Sun Cream", "COSRX"],
  ["Madagascar Centella Toning Toner 210ml", "Skin1004 Madagascar Centella Toning Toner 210ml", "Skin1004"],
  ["Clean It Zero Cleansing Balm Original 100ml", "Banila Co Clean It Zero Cleansing Balm Original 100ml", "Banila Co"],
  ["Bio-Collagen Real Deep Mask", "Biodance Bio-Collagen Real Deep Mask", "Biodance"],
  ["Heartleaf BHA Pore Deep Cleansing Foam 150ml", "ANUA Heartleaf Quercetinol Pore Deep Cleansing Foam", "Anua"],
  ["Azelaic Acid 10 Hyaluron Redness Soothing Serum 30ml", "Anua - Azelaic Acid 10% - Hyaluron Soothing Serum 30ml", "Anua"],
  // Bad match — should be REJECTED
  ["Heartleaf BHA Pore Deep Cleansing Foam 150ml", "ASA CX-2 Pathfinder Electronic Flight Computer", "Anua"],
];

for (const [orig, cand, brand] of tests) {
  console.log(brand + " | " + orig);
  console.log("  vs: " + cand);
  scoreNameMatch(orig, cand, brand);
  console.log();
}
