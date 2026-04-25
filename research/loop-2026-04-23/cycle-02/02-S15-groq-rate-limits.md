# S15 — Rate limits Groq free tier — charge Two-Step AI verify

*Quotas cycle 2 réduit : 1 web_search (data complète disponible).*

## Findings

### Groq free tier limits 2026 (confirmé multi-sources)

| Limite | Valeur |
|---|---|
| **RPM (requests per minute)** | **30** |
| **TPM (tokens per minute)** | **6 000** |
| **Requests per day (RPD)** | **14 400** (la plupart modèles) |
| Llama 4 Maverick RPD | 500 |
| Reset quotidien | Midnight UTC |
| Tracking | Par API key, par modèle |

### Règle bloquante : whichever limit arrives first
Si tu envoies 30 petites requêtes en <1 min → RPM cap atteint même si TPM/RPD OK.

## Application Two-Step enrichissement

### Scénario bootstrap Square 30 produits

Pipeline actuel (cycle 01 ingestion) :
- 1 produit = ~1 AI verify call (~500-800 tokens in + ~200 tokens out)
- 30 produits bootstrap = **30 requests**

**Analyse RPM** :
- Si les 30 requests partent en parallèle → 30 RPM = **pile à la limite**. Probable tip throttle sur 1-2 requests.
- Si séquentiel (1/s) → 30 requests en 30 sec = pas de problème RPM

**Analyse TPM** :
- 30 × (500+200) = 21 000 tokens → **3.5x le TPM limit**
- Besoin d'étaler sur 3.5 minutes minimum = throttle forcé

**Conclusion burst** : un bootstrap 30 produits **ne peut pas être instantané** en free tier Groq. Il faut du backoff exponentiel OU passer en paid tier.

### Scénario runtime (enrichment continu 1 nouveau produit POS synced)

- 1 request à la fois, étalé sur la journée = **aucun risque**
- 14 400 RPD = largement au-dessus du besoin réel (100-200 produits/jour à l'échelle 20 marchands actifs)

### Scénario upload CSV 500 produits (marchand non-POS, onboarding)

- 500 × AI verify = **500 requests**
- TPM : 500 × 700 = 350K tokens → 58 minutes à 6K TPM pour tout passer
- RPM : 500 / 30 = 17 min si on respecte 30 RPM
- RPD : 500 / 14 400 = 3.5% usage quotidien → OK

**Conclusion onboarding CSV** : un marchand qui uploade 500 produits peut être enrichi en ~1h free tier. **Acceptable** si UX dit "ça va prendre 1h, on vous envoie un email quand c'est prêt" vs UX bloquante "wait loading spinner 1h".

## Risques identifiés

### Risque 1 — Burst collectif multi-marchands (Phase 2+)
Si 5 marchands uploadent leurs CSV le même après-midi = 2500 produits = explosion RPM.
**Mitigation** : queue de jobs côté serveur + rate limit global à 30 RPM shared.

### Risque 2 — Échec silencieux si pas de retry
En cas de 429 Groq, si le code fait juste "skip", le produit n'est pas enrichi. 
**Mitigation** : code doit respecter `retry-after` header + exponential backoff.

### Risque 3 — Si Groq tombe ou durcit les limits
Dépendance externe. Cascade Groq → Gemini → Anthropic existe déjà (brain), mais si Groq fail 40% des calls, on passe en Gemini qui a aussi ses limits.

## Recommandations actionnables

1. **Ajouter un rate limiter côté Two-Step** : max 25 RPM vers Groq (buffer 5 pour ne pas hit la limit)
2. **Queue de jobs pour bootstrap/CSV** : process batch asynchrone, feedback UX "enrichissement en cours"
3. **Alerter proactivement si 429 apparaît** : Sentry alert sur `GroqRateLimitError`
4. **Migration paid tier à surveiller** : Dev tier Groq = $5/mo = 1000 RPM + pas de RPD cap. Si Two-Step dépasse 3 marchands qui onboardent la même semaine → **payer Dev tier** (cost 5€/mois, gain masif fiabilité)
5. **Considérer Anthropic direct pour AI verify en priorité** : Claude Haiku est plus précis que Llama 3 sur des tâches de sémantique produit. Groq fallback en cas de rate limit.

## Confidence : 9/10

Data bien documentée, multi-sourcée, directement applicable.

## Sources

- [Groq Free Tier Limits 2026 — TokenMix](https://tokenmix.ai/blog/groq-free-tier-limits-2026)
- [Rate Limits — GroqDocs](https://console.groq.com/docs/rate-limits)
- [Groq API Free Tier — Grizzly Peak Software](https://www.grizzlypeaksoftware.com/articles/p/groq-api-free-tier-limits-in-2026-what-you-actually-get-uwysd6mb)
- [Groq Free Plan — CostBench](https://costbench.com/software/llm-api-providers/groq/free-plan/)
