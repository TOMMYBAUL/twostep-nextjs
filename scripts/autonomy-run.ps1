# Wrapper d'autonomie headless Two-Step -- lance par la tache Windows "TwoStepAutonomy".
# IMPORTANT : fichier en ASCII PUR (pas d'accents/emoji). PowerShell 5.1 lit un .ps1
# UTF-8-sans-BOM en ANSI et casse le parsing (bug 2026-06-19 : exit 1, aucun run, aucune notif).
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\Thomas\Desktop\IA\twostep-nextjs'
Set-Location $repo
$env:NODE_OPTIONS = '--use-system-ca'
$env:GIT_SSH_COMMAND = 'ssh -o StrictHostKeyChecking=accept-new'
# Option A (valide Thomas 2026-06-19) : Norton intercepte le TLS, CA non approuvable.
# On desactive la verif TLS POUR CE SEUL PROCESS headless (interceptor = antivirus local).
$env:NODE_TLS_REJECT_UNAUTHORIZED = '0'

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = "logs\autonomy-$ts.log"

# Config notif locale non versionnee (CallMeBot/Telegram).
$notifyCfg = Join-Path $repo 'scripts\notify.local.ps1'
if (Test-Path $notifyCfg) { . $notifyCfg }

function Send-Notify([string]$text) {
    # Norton intercepte aussi le TLS .NET -> on neutralise la verif cert POUR CE PROCESS.
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    try { [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 } catch {}
    $t = $text
    if ($t.Length -gt 700) { $t = $t.Substring(0, 700) + ' ...' }
    # CallMeBot refuse les non-ASCII -> translitteration (Normalize FormD + strip > 127).
    if ($env:CALLMEBOT_PHONE -and $env:CALLMEBOT_APIKEY) {
        $norm = $t.Normalize([Text.NormalizationForm]::FormD)
        $sb = New-Object Text.StringBuilder
        foreach ($c in $norm.ToCharArray()) {
            if (([Globalization.CharUnicodeInfo]::GetUnicodeCategory($c) -ne [Globalization.UnicodeCategory]::NonSpacingMark) -and ([int]$c -lt 128)) { [void]$sb.Append($c) }
        }
        $enc = [uri]::EscapeDataString($sb.ToString())
        $url = "https://api.callmebot.com/whatsapp.php?phone=$($env:CALLMEBOT_PHONE)&text=$enc&apikey=$($env:CALLMEBOT_APIKEY)"
        try { Invoke-RestMethod -Uri $url -TimeoutSec 25 | Out-Null } catch {}
    }
    # Telegram : JSON + UTF-8 bytes (garde l'unicode).
    if ($env:TELEGRAM_BOT_TOKEN -and $env:TELEGRAM_CHAT_ID) {
        $tgUrl = "https://api.telegram.org/bot$($env:TELEGRAM_BOT_TOKEN)/sendMessage"
        $tgPayload = @{ chat_id = $env:TELEGRAM_CHAT_ID; text = $t } | ConvertTo-Json -Compress
        $tgBytes = [System.Text.Encoding]::UTF8.GetBytes($tgPayload)
        try { Invoke-RestMethod -Uri $tgUrl -Method Post -Body $tgBytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 25 | Out-Null } catch {}
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
"[$ts] START autonomy run (HEAD $before)" | Out-File -FilePath $log -Encoding utf8
claude -p $prompt --dangerously-skip-permissions *>> $log
$exit = $LASTEXITCODE
$after = (git rev-parse HEAD 2>$null)
"[{0}] END exit=$exit (HEAD $after)" -f (Get-Date -Format 'yyyyMMdd-HHmmss') | Out-File -FilePath $log -Append -Encoding utf8

# Resume "fait/trouve" + notification (best-effort).
if ($after -and $before -and ($after -ne $before)) {
    $commits = (git log --format='- %s' "$before..$after" 2>$null) -join "`n"
    $n = (git rev-list --count "$before..$after" 2>$null)
    $msg = "[OK] Two-Step - run autonome : $n commit(s)`n$commits`n(details: docs/worklog-autonomie.md)"
} else {
    $tail = if (Test-Path $log) { ((Get-Content $log -Tail 6) -join ' ').Trim() } else { '' }
    $msg = "[!] Two-Step - run autonome : AUCUN commit (exit=$exit). $tail"
}
Send-Notify $msg
