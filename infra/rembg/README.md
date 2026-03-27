# rembg — Détourage images Two-Step

## Déploiement sur VPS Hetzner

1. Commander un VPS CX22 (2 vCPU, 4 GB RAM, 3.29€/mois) sur https://console.hetzner.cloud
2. SSH sur le serveur : `ssh root@IP`
3. Installer Docker : `curl -fsSL https://get.docker.com | sh`
4. Copier ce dossier sur le serveur
5. Lancer : `docker compose up -d`
6. Tester : `curl -F "file=@test.jpg" http://localhost:7000/api/remove --output result.png`

## Variables dans Vercel

REMBG_API_URL=http://IP_DU_VPS:7000
REMBG_API_KEY= (optionnel — rembg n'a pas d'auth native)
