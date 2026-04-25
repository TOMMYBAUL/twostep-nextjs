# Cycle 02 — Synthèse

## Top 3 insights

### Insight #4 — Panorama + The Last Step = leads prioritaires cachés
**Confiance 7/10.** Ces 2 boutiques indépendantes sneakers Toulouse rankent déjà organiquement sur "Nike AF1 Toulouse". Elles ont compris le retail digital. Conversion probable > 50% vs leads froids. **Action lundi** : ajouter à la shortlist avec Dear Skin.

### Insight #5 — Groq free tier = OK pour runtime, bloque le bootstrap
**Confiance 9/10.** 30 RPM / 6K TPM / 14400 RPD. Un bootstrap 30 produits ne peut pas être instantané (3.5x TPM limit). Un marchand uploadant 500 CSV = ~1h enrichment. Runtime continu = OK. **Action** : queue de jobs + rate limiter 25 RPM + envisager Dev tier Groq 5$/mo si 5+ marchands bootstrapent la même semaine.

### Insight #6 — Le pitch Two-Step doit devenir "alternative gratuite à 375€/mois"
**Confiance 6.5/10 (benchmark Shopping global, pas LIA isolé).** CPC Shopping FR 2026 = 0.75€ × 500 clics = 375€/mois. Two-Step à 19€ = **20x moins cher**. Ce ratio est un **argument GSM** directement utilisable : *"Les chaînes paient 375-1000€/mois en Google Ads. Vous, 19€ avec Two-Step, organique."*

## Impact concret sur Two-Step

### Décisions immédiates

1. **Ajouter Panorama + The Last Step** à la shortlist leads chauds semaine 1
2. **Script pitch updated** : inclure "20x moins cher que Google Ads" dans le 2 min pitch
3. **Queue de jobs à implémenter** avant 5e marchand CSV-uploader — c'est une dette technique qui va pourrir si ignorée
4. **Créer le groupe WhatsApp "Two-Step Saint-Étienne" dès le 2e marchand** (playbook S2)
5. **Reporter Meta Catalog à Phase 2** — pas Phase 1

### Architecture tech à ajuster

- `transformProductToGoogle` dans `src/lib/google/feed.ts` → rendre modulaire pour future `transformProductToMeta`
- `src/lib/enrichment/` → ajouter rate limiter global Groq + queue jobs (BullMQ ? Upstash Redis ? Supabase Queue ?)
- Sentry alert sur `GroqRateLimitError` + seuil quotidien

## Contradictions vs cycle 01

- Cycle 01 Q2 estimait -40-60% time savings via community WhatsApp → cycle 02 S2 le confirme avec playbook concret
- Pas de contradictions fortes. Les 2 cycles convergent vers les mêmes priorités business.

## Confirmations

- ✅ Insight #1 cycle 01 (plafond 40 marchands solo) renforcé par S2 (community bcp aidera)
- ✅ Insight #2 cycle 01 (Google LFP canal priorité) confirmé par S9 (Google Shopping FR = 2.5 Md€/an marché)
- ⚠️ Insight #3 cycle 01 (FLL auto) **pas testé** par S7 (limite WebSearch). Reste à tester par Thomas.

## Confidence globale cycle 02

**7/10** — plus élevée que cycle 01 (6.5) grâce à data Groq très solide et playbook WhatsApp concret.

**Insights cumulés sur 2 cycles : 6 (avec confiance moyenne 7.1/10).**
