# Wrapper d'autonomie headless Two-Step — lancé par la tâche Windows "TwoStepAutonomy".
# Mode PROPRE : aucune désactivation TLS. Requiert que Norton n'intercepte plus
# node/claude (sinon claude -p se fige). Voir docs/AUTONOMY.md §9 et le worklog.
$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\Thomas\Desktop\IA\twostep-nextjs'
$env:NODE_OPTIONS = '--use-system-ca'
$env:GIT_SSH_COMMAND = 'ssh -o StrictHostKeyChecking=accept-new'
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = "logs\autonomy-$ts.log"

$prompt = @'
[RUN AUTONOME — Two-Step] Tu reprends la responsabilité du projet en autonomie.
1. Lis docs/AUTONOMY.md (le contrat), docs/worklog-autonomie.md (où on en est) et docs/session-handoff-2026-06-12.md section « 0ter ». Vérifie la branche feat/pipeline-v1-handoff-2026-06-12.
2. Avance UNIQUEMENT du travail RÉVERSIBLE sur la sous-étape produit en cours (par défaut : Collecte ② — sync catalogue initial des 4 POS : pagination, gestion d'erreurs, mapping des champs, robustesse). Cherche failles, angles morts, coûts cachés. Décide toi-même ce qui sert le mieux l'objectif.
3. AVANT d'éditer un symbole : gitnexus_impact. Écris/ajuste les tests.
4. Vérifie : npm run test:run + npx tsc --noEmit. Si vert → commit + git push (SSH, SANS SKIP_PRE_PUSH).
5. NE FRANCHIS AUCUN GARDE-FOU sans humain : pas de migration prod, pas de merge main, pas d'email. Si tu en atteins un, finis la sous-étape, ou es bloqué : écris un résumé + la question dans docs/worklog-autonomie.md, commit/push, et ARRÊTE-TOI.
Honnêteté radicale : si un test casse, dis-le dans le worklog ; ne maquille rien.
'@

"[$ts] START autonomy run" | Out-File -FilePath $log -Encoding utf8
claude -p $prompt --dangerously-skip-permissions *>> $log
"[{0}] END exit=$LASTEXITCODE" -f (Get-Date -Format 'yyyyMMdd-HHmmss') | Out-File -FilePath $log -Append -Encoding utf8
