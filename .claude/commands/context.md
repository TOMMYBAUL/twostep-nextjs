Donne-moi la synthèse cross-source complète sur le sujet `$ARGUMENTS`.

Si `$ARGUMENTS` est vide, demande-moi le sujet et arrête-toi là.

## Sources à interroger (dans cet ordre, en parallèle quand possible)

### 1. Mémoire auto Claude Code
Grep le sujet dans `C:/Users/Thomas/.claude/projects/C--Users-Thomas-Desktop-IA/memory/` :
```bash
grep -ril "<sujet>" /c/Users/Thomas/.claude/projects/C--Users-Thomas-Desktop-IA/memory/
```
Lis ensuite les fichiers matchés et extrais les points clés.

**⚠️ Règle R4 — détection des statuts périssables** :
- Si une entrée mémoire matchée contient : `bloqué`, `en attente`, `non testé`, `en cours`, `à faire`, `TODO`, `pending`, `pas encore`, `prochaine étape`, `priorité`, `DÉJÀ FAIT` → c'est un STATUT
- Pour CHAQUE statut : **exécuter la vérification correspondante** avant de le rapporter comme vérité actuelle :

| Type de statut | Vérification |
|---|---|
| Branche/merge | `git log main..<branche>` |
| Tests | `npm run test:run` (extrait pertinent) |
| Bug/fix | `git log --grep="<mot-clé>" --oneline \| head -10` |
| Feature implémentée ? | `gitnexus query` + grep symbole |
| Marchands actifs | requête Supabase MCP ou noter "non vérifiable sans accès DB" |
| Email / ticket | Noter "à vérifier dans inbox Gmail" |

**Dans la sortie** : chaque info issue d'un statut DOIT être annotée `✅ confirmé`, `⚠️ à confirmer`, ou `❌ obsolète` (→ MAJ mémoire recommandée).

### 2. Docs projet vivants
`docs/pipeline-state.md`, `docs/ARCHITECTURE-TWOSTEP.md`, `docs/SPEC/` — grep le sujet, lis les 2-3 fichiers les plus pertinents.

### 3. Code twostep-nextjs — GitNexus
Via MCP `query({query: "<sujet>"})`. Si le sujet est un symbole de code, utiliser `context({name: "..."})` à la place.

### 4. Archive historique (optionnel, si le sujet date d'avant mai 2026)
`C:/Users/Thomas/Desktop/IA/twostep-brain/TwoStep-Brain/` (vault Obsidian, dormant depuis avril 2026) et `C:/Users/Thomas/Desktop/IA/memory/` — grep direct, annoter systématiquement les trouvailles `[ARCHIVE avril 2026]`.

## Format de sortie (1 bloc concis)

```
# Contexte sur : <sujet>

## État actuel vérifié
<3-5 bullets : où on en est AUJOURD'HUI, chaque bullet avec ✅/⚠️/❌>

## Fiches / fichiers pertinents
- Docs : <fichiers + 1 ligne résumé + date si ancienne>
- Code : <fichiers + fonctions si GitNexus a matché>
- Mémoire : <entrées liées>

## Statuts mémoire obsolètes détectés (si applicable)
<entrées qui contredisent ce que j'ai vérifié — suggestion de MAJ>

## Contradictions / angles morts détectés
<tensions entre sources — sinon "aucun détecté">

## Prochaine action suggérée
<1 phrase : la suite logique vu l'état RÉEL vérifié>
```

## Règles

- Ne hallucine aucune fiche ou ligne de code. Si une source ne retourne rien : dis-le explicitement.
- **R4 strict** : ne JAMAIS rapporter un statut mémoire comme état actuel sans vérification. Si non vérifiable : `⚠️ à confirmer`.
- Si un MCP est indisponible (gitnexus, supabase), le noter dans la sortie (ne pas faire semblant).
- Rester sous 500 mots. C'est un brief, pas un rapport.
