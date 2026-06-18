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
2. Avance du travail RÉVERSIBLE sur le BACKLOG pré-autorisé (AUTONOMY.md §5) : Collecte ③ (stock) → ④ → ⑤ → Triage → Enrichissement → Stockage → Exploitation. Prends la PREMIÈRE sous-étape non terminée selon le worklog, fais-la, puis ENCHAÎNE la suivante (validation par lots, pas à chaque sous-étape). Commit après chaque petit pas. Cherche failles, angles morts, coûts cachés.
3. AVANT d'éditer un symbole : analyse l'impact (callers). Écris/ajuste les tests.
4. Vérifie : npm run test:run + npx tsc --noEmit. Si vert → commit + git push (SSH, SANS SKIP_PRE_PUSH). NE PUSH JAMAIS si le gate est rouge.
5. GARDE-FOUS DURS (jamais sans humain) : pas de migration prod, pas de merge main, pas d'email, pas de dépense. Si tu en atteins un, ou es vraiment bloqué : écris un résumé + la question dans docs/worklog-autonomie.md, commit/push, et ARRÊTE-TOI.
Honnêteté radicale : si un test casse, dis-le dans le worklog ; ne maquille rien.
'@

"[$ts] START autonomy run" | Out-File -FilePath $log -Encoding utf8
claude -p $prompt --dangerously-skip-permissions *>> $log
"[{0}] END exit=$LASTEXITCODE" -f (Get-Date -Format 'yyyyMMdd-HHmmss') | Out-File -FilePath $log -Append -Encoding utf8
