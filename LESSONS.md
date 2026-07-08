# LESSONS — Erreurs récurrentes et solutions

Mémoire long-terme du projet — à lire en début de session.
Version curée du 2026-07-07 — archive complète : docs/LESSONS-archive-2026-07-07.md

## Format
2-4 lignes par entrée max. Fichier ≤ 5 KB : curer avant d'ajouter.

## Supabase — migrations & RPC
- `DROP`+`CREATE FUNCTION` réinitialise l'ACL → re-`REVOKE FROM anon, authenticated` dans la même migration ; grep les REVOKE historiques vs signature courante.
- DDL sur fonction chaude : `SET LOCAL lock_timeout='3s'` + heure creuse.
- Changer une signature RPC : DROP+CREATE, jamais 2 overloads du même nom (PGRST203) ; toute `admin.rpc("nom")` doit exister dans les migrations.
- Nouvelle valeur d'enum/statut : grep le CHECK existant dans les migrations AVANT.
- Un backfill de colonne dérivée doit couvrir les inserts FUTURS (trigger ou tous les chemins `.insert`).
- RLS : tester sur base vide = faux négatif ; un REVOKE colonne casse les policies cross-table (→ SECURITY DEFINER) ; re-tester en anon après REVOKE.

## Supabase — échelle
- SELECT non borné = troncature SILENCIEUSE à 1000 (`max-rows`, même avec `.limit`) → `fetchAllRows`/`streamRows` (paginate.ts, KEYSET : curseur UNIQUE NOT NULL, `maxPages`, fail-loud). Grep aussi post-pass (groupVariantsByEAN) et crons de monitoring.
- `.in()` non borné → `chunk()` par 500. UPDATE hétérogènes : grouper par forme de colonnes (upsert écrit l'UNION → null injecté), dédup par PK intra-lot, repli mono-ligne sur échec.
- Cron non borné : `maxDuration` + budget temps en-deçà, statut « partial » + Sentry sur interruption, curseur de reprise persisté (sinon famine) ; retry/backoff deadline-aware.

## Silent failures
- `const { data } =` qui jette `error` : destructurer quand vide ≠ erreur cause une perte. `data=null` SANS error = échec aussi (`?? []` le masque). Read-modify-write : sur erreur de lecture, NE PAS écrire.
- Canal machine (webhook, jeton) : erreur DB ≠ no-match → 500 (retry) ; 401/200 = VRAI no-match (PGRST116). SELECT de liste d'un cron avalé = tous les items perdus.
- Chemins/adapters JUMEAUX : gestion d'erreur identique ; celui qui diverge est le trou. Grep tous les writers/readers du même champ.
- Symbole rendu throwant : chaque `catch` des callers doit `captureError`. Compteurs = succès réels uniquement. Effet post-write d'un webhook = non-fatal (capture-continue), jamais 500.
- `captureError(PostgrestError)` = « [object Object] » → src/lib/error.ts promeut en Error.

## Gates, feeds & vérification
- « verify » : jamais `true` sur erreur ; fail-CLOSED si la donnée serait publiée ; distinguer « pas pu vérifier » de « vérifié OK ».
- Objet verdict d'une lib émis en JSON : PROJETER les champs publics (un champ debug `reason` fuyait des agrégats RLS sur routes anonymes). Lot RLS vide SANS erreur ≠ « 0 stock » → trip-wire sur lot large 100 % vide.
- Garde posée au WRITE à rejouer au READ si un opérande peut changer → 1 helper unique traversé par tous.
- Défauts DB permissifs (visible=true, review_status='validated') : tout `.from("products").insert` doit poser le gate EXPLICITEMENT (grep tous les inserts). Une garde vivant dans le moteur de score (runCascade/D7) ne protège pas un chemin qui adopte l'identité HORS moteur → extraire la garde en helper leaf.
- N canaux vers le même tiers = MÊME ensemble émis (prédicat partagé, flags inclus) ; un KPI qui prédit un gate réutilise SON prédicat. Push async → read-back du statut.
- Présence : `!== null && !== ""`. Rollup qui remplace une valeur autoritaire : no-op si entrée vide, jamais 0.
- Identifiant LOCAL (SKU) : toujours scoper `merchant_id`. Clé de jointure externe (store_code, GTIN canonique) : source UNIQUE — fusionner les doublons.

## Parsing / données produit
- `Number(x) || défaut` détruit un 0 légitime ; `Number(null)===0` → tester la présence brute avant `Number.isFinite`.
- CSV POS FR legacy = Windows-1252 → TextDecoder utf-8 `{fatal:true}` puis repli. Regex XML : décoder les entités (`&amp;` en dernier). Match SKU en lowercase des 2 côtés.
- Parseur LLM : LÈVE sur malformé (`Array.isArray`) ; marquer « tenté » sinon retry payant infini ; ne re-tenter que l'échec transitoire gratuit.
- EAN = IDENTITÉ seulement (jamais taille/qté, jamais terme de recherche image). Brand/catégorie : allow-list (0 invention), taxo externe → slugs FR, inconnu → null.
- Coût API : cache négatif TTL pour les not-found (écrit AVANT le spend) ; si un gate aval rejette 100 %, court-circuiter EN AMONT de l'achat.

## Next.js / Vercel
- `vercel env add` par stdin PowerShell = valeurs VIDES → `--value` ou API REST ; vérifier par `env pull`.
- Script npm `prepare` (hooksPath) casse le build Vercel (pas de .git) → try/catch.
- Hot-reload turbopack rate parfois une lib importée par une route API → redémarrer le dev server avant de conclure au faux fix.
- Routing App Router = contrat FICHIER invisible pour tsc → test route-contract (URLs UI ↔ `src/app/api/**/route.ts`) ; jamais de `<Link>` vers une route API (prefetch = exécution).

## UI client
- Fetch client : gater `r.ok` ; lecture qui aiguille l'affichage : garder `error` (échec ≠ vide). Vaut pour vue, handlers d'action, Server Components (jamais redirect sur blip), consommateurs de hooks.
- Un verdict serveur s'AFFICHE, ne se recalcule pas côté client. États vides = porte de sortie (CTA).
- Dérivation d'état en helper PUR testable sans RTL ; le rendu visuel = l'œil de Thomas décide.

## Windows / environnement
- NetLimiter intercepte le TLS → git en SSH ; pre-push déterministe (tests réseau live isolés dans `test:db`) ; e2e local : le dev server doit HÉRITER du contournement TLS (relancer depuis le shell courant), sinon `fetch failed` côté serveur.
- winget ET npm installent Claude Code → maj les deux. `.ps1` planifié : ASCII pur ou UTF-8 BOM.

## Git / workflow / tests
- Jamais de commit sur main (branche feat/) ; email git = bauland@twostep.fr ; `npm run test:run` avant push.
- `git add -A` happe les fichiers régénérés par hooks → stager des chemins explicites. Fix de code → grep la valeur dans `tests/`.
- Au démarrage : lire `git status` — du WIP sain d'un run interrompu se FINIT, pas se jette.
- Prouver une écriture = faux client Supabase STATEFUL (idempotence, 0 doublon) ; dryRun ne prouve que les lectures. Webhooks : tester la ROUTE.
- ~70 % des findings de revue non vérifiés sont FAUX → vérifier au code réel ; prémisse d'un détecteur à valider sur données PROD.
- Watchdog d'invariant : exclure les états DÉLIBÉRÉS (marqueur d'intention) sinon alarm fatigue.
- Outil payant : vérifier d'abord si la gratuité officielle suffit.
