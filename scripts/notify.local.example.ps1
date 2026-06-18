# Copie ce fichier en  scripts\notify.local.ps1  (NON versionné) et remplis tes valeurs.
# Le wrapper autonomy-run.ps1 le charge automatiquement s'il existe.
#
# Setup CallMeBot WhatsApp (gratuit, ~3 min) :
#   1. Ajoute le numéro  +34 644 51 95 23  à tes contacts WhatsApp.
#   2. Envoie-lui par WhatsApp :  I allow callmebot to send me messages
#   3. Tu reçois en retour ton apikey personnel.
# Puis renseigne :
$env:CALLMEBOT_PHONE  = '+33XXXXXXXXX'   # ton numéro WhatsApp au format international
$env:CALLMEBOT_APIKEY = 'XXXXXXX'        # apikey reçu de CallMeBot
