# Enregistre la tâche Windows "TwoStepAutonomy" qui lance le wrapper headless.
# À EXÉCUTER UNIQUEMENT une fois Norton réglé ET `claude -p` re-testé OK.
#   powershell -ExecutionPolicy Bypass -File scripts\register-autonomy-task.ps1
# Pour retirer :  Unregister-ScheduledTask -TaskName TwoStepAutonomy -Confirm:$false
$wrapper = 'C:\Users\Thomas\Desktop\IA\twostep-nextjs\scripts\autonomy-run.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ("-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$wrapper`"")
# ~13 runs/jour : 7j/7, toutes les 75 min sur 15 h depuis 08:17 (≈ 13 déclenchements,
# dans la fourchette 10-15 demandée). Idiome Windows : trigger Daily + répétition greffée.
$daily = New-ScheduledTaskTrigger -Daily -At 8:17am
$reps = New-ScheduledTaskTrigger -Once -At 8:17am `
    -RepetitionInterval (New-TimeSpan -Minutes 75) -RepetitionDuration (New-TimeSpan -Hours 15)
$daily.Repetition = $reps.Repetition
$triggers = @($daily)
# ExecutionTimeLimit 60 min < intervalle 75 min : un run bloqué ne mange jamais le suivant.
# MultipleInstances IgnoreNew : jamais 2 runs en parallèle (évite les conflits de push).
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 60) `
    -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'TwoStepAutonomy' -Action $action -Trigger $triggers `
    -Settings $settings -Description 'Two-Step: run autonomie headless (Collecte 2 et suite)' -Force
Write-Output "Tache TwoStepAutonomy enregistree (~13 runs/jour : toutes les 75 min sur 15h, 7j/7, depuis 08:17)."
