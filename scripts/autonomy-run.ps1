# Wrapper d'autonomie headless Two-Step — lancé par la tâche Windows "TwoStepAutonomy".
# Mode PROPRE : aucune désactivation TLS sauf Option A ci-dessous (Norton).
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\Thomas\Desktop\IA\twostep-nextjs'
Set-Location $repo
$env:NODE_OPTIONS = '--use-system-ca'
$env:GIT_SSH_COMMAND = 'ssh -o StrictHostKeyChecking=accept-new'
# Option A (validée Thomas 2026-06-19) : Norton intercepte le TLS sortant et sa CA n'est
# pas approuvable (capture impossible). On désactive la vérif TLS POUR CE SEUL PROCESS
# HEADLESS. Risque borné : l'intercepteur est l'antivirus LOCAL (pas un attaquant), Norton
# valide le vrai cert Anthropic en sortie, et le travail est branche-only/revertable.
# À RETIRER si un jour Norton exclut proprement claude.exe (cf. worklog).
$env:NODE_TLS_REJECT_UNAUTHORIZED = '0'

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = "logs\autonomy-$ts.log"

# ── Notification WhatsApp (best-effort, ne casse JAMAIS le run) ───────────────
# Config locale NON versionnée : scripts\notify.local.ps1 doit définir
#   $env:CALLMEBOT_PHONE  (ex: '+33XXXXXXXXX')  et  $env:CALLMEBOT_APIKEY
$notifyCfg = Join-Path $repo 'scripts\notify.local.ps1'
if (Test-Path $notifyCfg) { . $notifyCfg }

function Send-Notify([string]$text) {
    # Norton intercepte aussi le TLS .NET/schannel → on neutralise la vérif cert POUR CE
    # PROCESS (même raisonnement qu'Option A : l'intercepteur est l'antivirus local).
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    try { [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 } catch {}
    $t = $text
    if ($t.Length -gt 700) { $t = $t.Substring(0, 700) + ' …' }

    # CallMeBot (WhatsApp) — CALLMEBOT_PHONE = TON numéro perso (celui qui reçoit).
    # CallMeBot REFUSE les non-ASCII (emoji/accents/tirets typo) → translittération ASCII.
    if ($env:CALLMEBOT_PHONE -and $env:CALLMEBOT_APIKEY) {
        $a = $t -replace '[•·]', '-' -replace '[—–]', '-' -replace '✅', '[OK]' -replace '⚠', '[!]'
        $norm = $a.Normalize([Text.NormalizationForm]::FormD)
        $sb = New-Object Text.StringBuilder
        foreach ($c in $norm.ToCharArray()) {
            if (([Globalization.CharUnicodeInfo]::GetUnicodeCategory($c) -ne [Globalization.UnicodeCategory]::NonSpacingMark) -and ([int]$c -lt 128)) { [void]$sb.Append($c) }
        }
        $enc = [uri]::EscapeDataString($sb.ToString())
        $url = "https://api.callmebot.com/whatsapp.php?phone=$($env:CALLMEBOT_PHONE)&text=$enc&apikey=$($env:CALLMEBOT_APIKEY)"
        try { Invoke-RestMethod -Uri $url -TimeoutSec 25 | Out-Null } catch {}
    }
    # Telegram — JSON + UTF-8 bytes (le form-hashtable mangle les emoji/accents en PS 5.1).
    if ($env:TELEGRAM_BOT_TOKEN -and $env:TELEGRAM_CHAT_ID) {
        $tgUrl = "https://api.telegram.org/bot$($env:TELEGRAM_BOT_TOKEN)/sendMessage"
        $tgPayload = @{ chat_id = $env:TELEGRAM_CHAT_ID; text = $t } | ConvertTo-Json -Compress
        $tgBytes = [System.Text.Encoding]::UTF8.GetBytes($tgPayload)
        try { Invoke-RestMethod -Uri $tgUrl -Method Post -Body $tgBytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 25 | Out-Null } catch {}
    }
}

$prompt = @'
[RUN AUTONOME — Two-Step] Tu reprends la responsabilité du projet en autonomie.
1. Lis docs/AUTONOMY.md (le contrat), docs/worklog-autonomie.md (où on en est) et docs/session-handoff-2026-06-12.md section « 0ter ». Vérifie la branche feat/pipeline-v1-handoff-2026-06-12.
2. Avance du travail RÉVERSIBLE sur le BACKLOG pré-autorisé (AUTONOMY.md §5) : Collecte ③ (stock) → ④ → ⑤ → Triage → Enrichissement → Stockage → Exploitation. Prends la PREMIÈRE sous-étape non terminée selon le worklog, fais-la, puis ENCHAÎNE la suivante (validation par lots, pas à chaque sous-étape). Commit après chaque petit pas. Cherche failles, angles morts, coûts cachés.
3. AVANT d'éditer un symbole : analyse l'impact (callers). Écris/ajuste les tests.
4. Vérifie : npm run test:run + npx tsc --noEmit. Si vert → commit + git push (SSH, SANS SKIP_PRE_PUSH). NE PUSH JAMAIS si le gate est rouge.
5. GARDE-FOUS DURS (jamais sans humain) : pas de migration prod, pas de merge main, pas d'email, pas de dépense. Si tu en atteins un, ou es vraiment bloqué : écris un résumé + la question dans docs/worklog-autonomie.md, commit/push, et ARRÊTE-TOI.
Honnêteté radicale : si un test casse, dis-le dans le worklog ; ne maquille rien.
'@

$before = (git rev-parse HEAD 2>$null)
"[$ts] START autonomy run (HEAD $before)" | Out-File -FilePath $log -Encoding utf8
claude -p $prompt --dangerously-skip-permissions *>> $log
$exit = $LASTEXITCODE
$after = (git rev-parse HEAD 2>$null)
"[{0}] END exit=$exit (HEAD $after)" -f (Get-Date -Format 'yyyyMMdd-HHmmss') | Out-File -FilePath $log -Append -Encoding utf8

# ── Construire le résumé "ce qu'il a fait / trouvé" + notifier ───────────────
if ($after -and $before -and ($after -ne $before)) {
    $commits = (git log --format='• %s' "$before..$after" 2>$null) -join "`n"
    $n = (git rev-list --count "$before..$after" 2>$null)
    $msg = "✅ Two-Step — run autonome : $n commit(s)`n$commits`n(détails: docs/worklog-autonomie.md)"
} else {
    $tail = if (Test-Path $log) { ((Get-Content $log -Tail 6) -join ' ').Trim() } else { '' }
    $msg = "⚠️ Two-Step — run autonome : AUCUN commit (exit=$exit). $tail"
}
Send-Notify $msg
