# Enregistre la tache Windows "TwoStepAutonomy" qui lance le wrapper headless.
# A EXECUTER UNIQUEMENT une fois Norton regle ET `claude -p` re-teste OK.
#   powershell -ExecutionPolicy Bypass -File scripts\register-autonomy-task.ps1
# Pour retirer :  Unregister-ScheduledTask -TaskName TwoStepAutonomy -Confirm:$false
$wrapper = 'C:\Users\Thomas\Desktop\IA\twostep-nextjs\scripts\autonomy-run.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ("-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$wrapper`"")
# Poll toutes les 75 min sur 15 h depuis 08:17, 7j/7. Avec IgnoreNew + ExecutionTimeLimit
# 90 min, un run profond (feature/UI/e2e) a le temps de finir une vraie unite ; le prochain
# trigger pendant qu'un run tourne est ignore -> jamais 2 en parallele (throttle naturel).
# Idiome Windows : trigger Daily + repetition greffee.
$daily = New-ScheduledTaskTrigger -Daily -At 8:17am
$reps = New-ScheduledTaskTrigger -Once -At 8:17am `
    -RepetitionInterval (New-TimeSpan -Minutes 75) -RepetitionDuration (New-TimeSpan -Hours 15)
$daily.Repetition = $reps.Repetition
$triggers = @($daily)
# ExecutionTimeLimit 90 min : laisse une unite de travail profonde se terminer (un kill a
# 60 min en plein milieu = gachis). MultipleInstances IgnoreNew : jamais 2 runs en parallele
# (evite conflits de push ET borne le cout en tokens = un seul run a la fois).
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 90) `
    -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'TwoStepAutonomy' -Action $action -Trigger $triggers `
    -Settings $settings -Description 'Two-Step: run autonomie headless (sprint 2 semaines, sourcing v2)' -Force
Write-Output "Tache TwoStepAutonomy enregistree (poll 75 min sur 15h, 7j/7, ExecutionTimeLimit 90 min, depuis 08:17)."
