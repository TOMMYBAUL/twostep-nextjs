# Copie ce fichier en  scripts\notify.local.ps1  (NON versionné, ignoré par git) et
# remplis tes valeurs. Le wrapper autonomy-run.ps1 le charge automatiquement s'il existe.
# Tu peux remplir CallMeBot, Telegram, ou les DEUX (les deux recevront la notif).

# ── CallMeBot (WhatsApp) ─────────────────────────────────────────────────────
# 1. Ajoute le bot CallMeBot en contact WhatsApp (numéro fourni dans sa réponse).
# 2. Envoie-lui :  I allow callmebot to send me messages
# 3. Il te renvoie ton apikey.
$env:CALLMEBOT_PHONE  = '+33XXXXXXXXX'   # ⚠️ TON numéro perso (celui qui RECOIT), PAS le numéro du bot
$env:CALLMEBOT_APIKEY = 'XXXXXXX'

# ── Telegram (recommandé : gratuit + robuste) ───────────────────────────────
# 1. Sur Telegram, écris à @BotFather → /newbot → tu obtiens un TOKEN.
# 2. Envoie un message a TON nouveau bot, puis le chat_id se recupere via getUpdates
#    (Claude peut le faire automatiquement si tu lui donnes le token).
$env:TELEGRAM_BOT_TOKEN = ''             # ex: 123456:ABC-DEF...
$env:TELEGRAM_CHAT_ID   = ''             # ton chat_id (numerique)
