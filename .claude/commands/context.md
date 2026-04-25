Donne-moi la synthèse cross-source complète sur le sujet `$ARGUMENTS`.

Si `$ARGUMENTS` est vide, demande-moi le sujet et arrête-toi là.

## Sources à interroger (dans cet ordre, en parallèle quand possible)

### 1. MEMORY.md auto-memory
Grep le sujet dans `C:/Users/thoma/.claude/projects/C--Users-thoma-Desktop-IA/memory/` :
```bash
grep -ril "<sujet>" /c/Users/thoma/.claude/projects/C--Users-thoma-Desktop-IA/memory/
```
Lis ensuite les fichiers matchés et extrais les points clés.

**⚠️ Règle R4 (CLAUDE.md) — détection des statuts périssables** :
- Si une entrée MEMORY matchée contient l'un de ces mots-clés : `bloqué`, `en attente`, `non testé`, `en cours`, `à faire`, `TODO`, `pending`, `pas encore`, `prochaine étape`, `priorité`, `NON TESTÉ`, `DÉJÀ FAIT` → c'est un STATUT
- Si l'entrée est taggée `[SNAPSHOT YYYY-MM-DD]` ou `[STATUT à vérifier]` → c'est un SNAPSHOT/STATUT
- Pour CHAQUE statut/snapshot cité : **exécuter la vérification correspondante** avant de le rapporter comme vérité actuelle :

| Type de statut | Vérification |
|---|---|
| Branche/merge | `git log main..<branche>` |
| Tests | `npm run test:run` (extrait pertinent) |
| Bug/fix | `git log --grep="<mot-clé>" --oneline \| head -10` |
| Feature implémentée ? | `gitnexus_query` + grep symbole |
| Marchands actifs | `grep "SELECT.*merchants"` dans code ou noter "non vérifiable sans accès DB" |
| Email / ticket | Noter "à vérifier dans inbox Gmail" |

**Dans la sortie** : chaque info extraite d'un statut DOIT être annotée `✅ confirmé` (vérifié), `⚠️ à confirmer` (non vérifiable ici), ou `❌ obsolète` (vérification contredit la mémoire — MAJ la mémoire recommandée).

### 2. Nexus Obsidian — graphify query
```bash
cd /c/Users/thoma/Desktop/IA/twostep-brain/TwoStep-Brain && graphify query "<sujet>" --budget 3000
```
Note les god-nodes connectés et les communities traversées. Si un god-node apparaît (cf. `~/.claude/CLAUDE.md` → Règles structurantes), signale-le explicitement avec ⚠️.

### 3. Nexus Obsidian — grep direct
```bash
grep -ril "<sujet>" /c/Users/thoma/Desktop/IA/twostep-brain/TwoStep-Brain/ --include="*.md" --exclude-dir="graphify-out"
```
Lis les 2-3 fiches les plus pertinentes (pas toutes). Note la date de dernière modif de chaque fiche — si > 7 jours et contient des statuts, **appliquer la règle R4**.

### 4. Code twostep-nextjs — gitnexus
Via MCP tool `gitnexus_query` avec la query correspondante. Si le sujet est un symbole de code (fonction, classe), utiliser `gitnexus_context` à la place.

### 5. Observations de session — claude-mem
Via MCP tool `mcp__plugin_claude-mem_mcp-search__smart_search` sur le sujet. Rapporte les décisions passées + gotchas rencontrés.

## Format de sortie (1 bloc concis)

```
# Contexte sur : <sujet>

## État actuel vérifié
<3-5 bullets : où on en est AUJOURD'HUI, chaque bullet avec un statut ✅/⚠️/❌>

## Fiches / fichiers pertinents
- Nexus : <liste fiches avec 1 ligne résumé + date si ancienne>
- Code : <fichiers + fonctions si gitnexus a matché>
- MEMORY.md : <entrées liées, avec leur tag [SNAPSHOT]/[STATUT] si présent>

## God-nodes Nexus touchés
<si aucun, dire "aucun">

## Statuts MEMORY obsolètes détectés (si applicable)
<entrées MEMORY qui contredisent ce que j'ai vérifié — suggestion de MAJ>

## Décisions passées (claude-mem)
<3 bullets max ou "aucune trouvée">

## Contradictions / angles morts détectés
<si le sujet a des tensions entre sources, liste-les ici — sinon "aucun détecté">

## Prochaine action suggérée
<1 phrase : ce qui est la suite logique vu l'état RÉEL vérifié>
```

## Règles

- Ne hallucine aucune fiche ou ligne de code. Si une source ne retourne rien : dis-le explicitement.
- **R4 strict** : ne JAMAIS rapporter un statut mémoire comme état actuel sans vérification. Si non vérifiable : annoter `⚠️ à confirmer` dans la sortie.
- Si le sujet touche un god-node Nexus (Pipeline enrichissement, Architecture overview, Plan 6 mois, Google LFP / LIA, Regard critique business, Cold start strategy, POS-ERP landscape FR, Concept V1, Pricing tiers, Unit economics), le signaler en haut du rapport avec ⚠️.
- Si un MCP est indisponible (gitnexus ou claude-mem), le noter dans la sortie (pas faire semblant).
- Rester sous 500 mots. C'est un brief, pas un rapport.
