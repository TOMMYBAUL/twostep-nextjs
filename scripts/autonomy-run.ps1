# Wrapper d'autonomie headless Two-Step -- lance par la tache Windows "TwoStepAutonomy".
# REGLES DE ROBUSTESSE (apprises a la dure le 2026-06-19) :
#  1. ASCII PUR obligatoire (pas d'accents/emoji) : PS 5.1 lit un .ps1 UTF-8-sans-BOM en
#     ANSI -> erreur de parsing -> exit 1, le script ne demarre meme pas, aucun log.
#  2. Log ecrit EN PREMIER : tout echec d'execution laisse une trace diagnosticable.
#  3. dot-source de la config en try/catch : une config cassee ne tue pas le run.
#  4. CallMeBot via curl.exe (le TLS .NET echoue a travers Norton) ; Telegram en JSON UTF-8.
# Verifier apres toute edition : [Parser]::ParseFile + 0 octet > 127.
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\Thomas\Desktop\IA\twostep-nextjs'
Set-Location $repo
$env:NODE_OPTIONS = '--use-system-ca'
$env:GIT_SSH_COMMAND = 'ssh -o StrictHostKeyChecking=accept-new'
# Option A (Thomas 2026-06-19) : Norton intercepte le TLS, CA non approuvable.
# Verif TLS desactivee POUR CE SEUL PROCESS headless (interceptor = antivirus local).
$env:NODE_TLS_REJECT_UNAUTHORIZED = '0'

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = "logs\autonomy-$ts.log"
"[$ts] START autonomy run" | Out-File -FilePath $log -Encoding utf8

# Config notif locale non versionnee (CallMeBot/Telegram) -- jamais fatale.
$notifyCfg = Join-Path $repo 'scripts\notify.local.ps1'
if (Test-Path $notifyCfg) {
    try { . $notifyCfg } catch { "[$ts] notify config error: $($_.Exception.Message)" | Out-File -FilePath $log -Append -Encoding utf8 }
}

function Send-Notify([string]$text) {
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    try { [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 } catch {}
    $t = $text
    if ($t.Length -gt 700) { $t = $t.Substring(0, 700) + ' ...' }
    # CallMeBot refuse les non-ASCII -> translitteration (Normalize FormD + strip > 127),
    # puis curl.exe (PAS Invoke-RestMethod : le TLS .NET echoue a travers Norton).
    if ($env:CALLMEBOT_PHONE -and $env:CALLMEBOT_APIKEY) {
        try {
            $norm = $t.Normalize([Text.NormalizationForm]::FormD)
            $sb = New-Object Text.StringBuilder
            foreach ($c in $norm.ToCharArray()) {
                if (([Globalization.CharUnicodeInfo]::GetUnicodeCategory($c) -ne [Globalization.UnicodeCategory]::NonSpacingMark) -and ([int]$c -lt 128)) { [void]$sb.Append($c) }
            }
            & curl.exe -k -s -G "https://api.callmebot.com/whatsapp.php" --data-urlencode "phone=$($env:CALLMEBOT_PHONE)" --data-urlencode "text=$($sb.ToString())" --data-urlencode "apikey=$($env:CALLMEBOT_APIKEY)" | Out-Null
        } catch {}
    }
    # Telegram : JSON + UTF-8 bytes (garde l'unicode) -- .NET fonctionne pour Telegram.
    if ($env:TELEGRAM_BOT_TOKEN -and $env:TELEGRAM_CHAT_ID) {
        try {
            $tgUrl = "https://api.telegram.org/bot$($env:TELEGRAM_BOT_TOKEN)/sendMessage"
            $tgPayload = @{ chat_id = $env:TELEGRAM_CHAT_ID; text = $t } | ConvertTo-Json -Compress
            $tgBytes = [System.Text.Encoding]::UTF8.GetBytes($tgPayload)
            Invoke-RestMethod -Uri $tgUrl -Method Post -Body $tgBytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 25 | Out-Null
        } catch {}
    }
}

$prompt = @'
[RUN AUTONOME -- Two-Step] Tu reprends la responsabilite du projet en autonomie.
1. Lis docs/AUTONOMY.md (le contrat), docs/worklog-autonomie.md (ou on en est) et docs/session-handoff-2026-06-12.md section "0ter". Verifie la branche feat/pipeline-v1-handoff-2026-06-12.
2. Avance du travail REVERSIBLE sur le BACKLOG pre-autorise (AUTONOMY.md section 5) : Collecte 3 (stock) -> 4 -> 5 -> Triage -> Enrichissement -> Stockage -> Exploitation. Prends la PREMIERE sous-etape non terminee selon le worklog, fais-la, puis ENCHAINE la suivante (validation par lots, pas a chaque sous-etape). Commit apres chaque petit pas. Cherche failles, angles morts, couts caches. Si la sous-etape courante n'a plus que des restes BLOQUES (migration/design-gated ou garde-fou dur), documente-les dans le worklog (commit) puis PASSE a la suivante -- ne t'arrete PAS pour si peu. Ne t'arrete QUE si TOUT le backlog est bloque, ou garde-fou dur, ou test casse.
3. AVANT d'editer un symbole : analyse l'impact (callers). Ecris/ajuste les tests.
4. Verifie : npm run test:run + npx tsc --noEmit. Si vert -> commit + git push (SSH, SANS SKIP_PRE_PUSH). NE PUSH JAMAIS si le gate est rouge.
5. GARDE-FOUS DURS (jamais sans humain) : pas de migration prod, pas de merge main, pas d'email, pas de depense. Si tu en atteins un, finis la sous-etape, ou es bloque : ecris un resume + la question dans docs/worklog-autonomie.md, commit/push, et ARRETE-TOI.
Honnetete radicale : si un test casse, dis-le dans le worklog ; ne maquille rien.
'@

$before = (git rev-parse HEAD 2>$null)
"[$ts] claude start (HEAD $before)" | Out-File -FilePath $log -Append -Encoding utf8
claude -p $prompt --dangerously-skip-permissions *>> $log
$exit = $LASTEXITCODE
$after = (git rev-parse HEAD 2>$null)
"[{0}] END exit=$exit (HEAD $after)" -f (Get-Date -Format 'yyyyMMdd-HHmmss') | Out-File -FilePath $log -Append -Encoding utf8

# Resume "fait/trouve" + notification (best-effort, jamais fatale).
if ($after -and $before -and ($after -ne $before)) {
    $commits = (git log --format='- %s' "$before..$after" 2>$null) -join "`n"
    $n = (git rev-list --count "$before..$after" 2>$null)
    $msg = "[OK] Two-Step - run autonome : $n commit(s)`n$commits`n(details: docs/worklog-autonomie.md)"
} else {
    $tail = if (Test-Path $log) { ((Get-Content $log -Tail 6) -join ' ').Trim() } else { '' }
    $msg = "[!] Two-Step - run autonome : AUCUN commit (exit=$exit). $tail"
}
try { Send-Notify $msg } catch {}
