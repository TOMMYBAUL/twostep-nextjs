# Enregistre la tâche Windows "TwoStepAutonomy" qui lance le wrapper headless.
# À EXÉCUTER UNIQUEMENT une fois Norton réglé ET `claude -p` re-testé OK.
#   powershell -ExecutionPolicy Bypass -File scripts\register-autonomy-task.ps1
# Pour retirer :  Unregister-ScheduledTask -TaskName TwoStepAutonomy -Confirm:$false
$wrapper = 'C:\Users\Thomas\Desktop\IA\twostep-nextjs\scripts\autonomy-run.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ("-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$wrapper`"")
# Jours ouvrés, 3 créneaux/jour (modéré pour ne pas épuiser le quota d'abonnement).
$days = 'Monday','Tuesday','Wednesday','Thursday','Friday'
$triggers = @(
    New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At 10:07am
    New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At 2:07pm
    New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At 6:07pm
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'TwoStepAutonomy' -Action $action -Trigger $triggers `
    -Settings $settings -Description 'Two-Step : run autonomie headless (Collecte ② et suite)' -Force
Write-Output "Tâche TwoStepAutonomy enregistrée (jours ouvrés 10h07 / 14h07 / 18h07)."
