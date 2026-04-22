Donne-moi la synthèse cross-source complète sur le sujet `$ARGUMENTS`.

Si `$ARGUMENTS` est vide, demande-moi le sujet et arrête-toi là.

## Sources à interroger (dans cet ordre, en parallèle quand possible)

### 1. MEMORY.md auto-memory
Grep le sujet dans `C:/Users/thoma/.claude/projects/C--Users-thoma-Desktop-IA/memory/` :
```bash
grep -ril "<sujet>" /c/Users/thoma/.claude/projects/C--Users-thoma-Desktop-IA/memory/
```
Lis ensuite les fichiers matchés et extrais les points clés.

### 2. Nexus Obsidian — graphify query
```bash
cd /c/Users/thoma/Desktop/IA/twostep-brain/TwoStep-Brain && graphify query "<sujet>" --budget 3000
```
Note les god-nodes connectés et les communities traversées. Si un god-node apparaît (cf. `~/.claude/CLAUDE.md` → Règles structurantes), signale-le explicitement.

### 3. Nexus Obsidian — grep direct
```bash
grep -ril "<sujet>" /c/Users/thoma/Desktop/IA/twostep-brain/TwoStep-Brain/ --include="*.md" --exclude-dir="graphify-out"
```
Lis les 2-3 fiches les plus pertinentes (pas toutes).

### 4. Code twostep-nextjs — gitnexus
Via MCP tool `gitnexus_query` avec la query correspondante. Si le sujet est un symbole de code (fonction, classe), utiliser `gitnexus_context` à la place.

### 5. Observations de session — claude-mem
Via MCP tool `mcp__plugin_claude-mem_mcp-search__smart_search` sur le sujet. Rapporte les décisions passées + gotchas rencontrés.

## Format de sortie (1 bloc concis)

```
# Contexte sur : <sujet>

## État actuel (source: MEMORY.md + Nexus)
<3-5 bullets : où on en est, derniers événements significatifs>

## Fiches / fichiers pertinents
- Nexus : <liste fiches avec 1 ligne résumé chacune>
- Code : <fichiers + fonctions si gitnexus a matché>
- MEMORY.md : <entrées liées>

## God-nodes Nexus touchés
<si aucun, dire "aucun">

## Décisions passées (claude-mem)
<3 bullets max ou "aucune trouvée">

## Contradictions / angles morts détectés
<si le sujet a des tensions entre sources, liste-les ici — sinon "aucun détecté">

## Prochaine action suggérée
<1 phrase : ce qui est la suite logique vu l'état>
```

## Règles

- Ne hallucine aucune fiche ou ligne de code. Si une source ne retourne rien : dis-le explicitement.
- Si le sujet touche un god-node Nexus (Pipeline enrichissement, Architecture overview, Plan 6 mois, Google LFP / LIA, Regard critique business, Cold start strategy, POS-ERP landscape FR, Concept V1, Pricing tiers, Unit economics), le signaler en haut du rapport avec ⚠️.
- Si un MCP est indisponible (gitnexus ou claude-mem), le noter dans la sortie (pas faire semblant).
- Rester sous 400 mots. C'est un brief, pas un rapport.
