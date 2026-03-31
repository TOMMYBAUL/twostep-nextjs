# Phase C — Dashboard Google complet : Design

> **Statut** : Design validé par Thomas
> **Date** : 2026-03-31
> **Dépend de** : Phase B (Google Local Inventory) — déployé ✅

## Contexte

La Phase B a livré une page dashboard Google minimaliste (statut connexion + compteur produits). La Phase C upgrade cette page avec un score de visibilité, des suggestions actionnables, et des compteurs d'amélioration — le tout calculé depuis les données Supabase (pas besoin de l'API Google Merchant Reporting).

## Décisions de design

| Décision | Choix | Raison |
|---|---|---|
| Layout | **Option B — Score visibilité + Suggestions** | Gamifié, motivant, actionnable pour le marchand |
| Source de données | **Supabase uniquement** | Disponible dès le jour 1 sans trafic Google |
| Métriques Google (impressions, clics) | **Reporté** | Nécessite du trafic réel, pas prioritaire |

## Ce qu'on affiche

### 1. Score de visibilité (en-tête)

Gros pourcentage + barre de progression :
- **Calcul** : `produits éligibles Google / total produits visibles`
- Un produit est "éligible Google" s'il a : EAN + prix + visible = true
- Exemple : "142 / 186 produits visibles — 76%"

### 2. Suggestions actionnables

Liste de suggestions concrètes avec impact chiffré :
- **"+X produits"** — X produits sans photo ne sont pas envoyés à Google → "Ajoutez une photo"
- **"+X produits"** — X produits sans EAN (code-barres) ne sont pas envoyés → "Complétez le code-barres dans votre caisse"
- **"+X produits"** — X produits sans prix ne sont pas envoyés → "Ajoutez un prix"

Chaque suggestion montre combien de produits supplémentaires seraient visibles si corrigé.

### 3. Statut sync

- Dernière mise à jour : "il y a 2h" / "En attente"
- Statut : "Succès" ✓ ou "Erreur : [message]"
- Prochaine sync : "Demain 3h00"

### 4. Connexion/Déconnexion

- Non connecté : bouton "Connecter à Google" + explication (existant Phase B)
- Connecté : Merchant ID + bouton "Déconnecter" (existant Phase B)

## État quand le marchand n'a pas connecté Google

Afficher quand même le score de visibilité et les suggestions, avec un message :
- "Si vous connectez Google, X produits seront visibles immédiatement sur Google Shopping"
- Ça motive le marchand à connecter

## Données à récupérer (une seule requête SQL)

```sql
SELECT
    COUNT(*) FILTER (WHERE visible = true) as total_visible,
    COUNT(*) FILTER (WHERE visible = true AND ean IS NOT NULL AND price IS NOT NULL) as eligible_google,
    COUNT(*) FILTER (WHERE visible = true AND ean IS NULL) as missing_ean,
    COUNT(*) FILTER (WHERE visible = true AND photo_url IS NULL AND photo_processed_url IS NULL) as missing_photo,
    COUNT(*) FILTER (WHERE visible = true AND price IS NULL) as missing_price
FROM products
WHERE merchant_id = $1;
```

## Fichiers impactés

### Modifiés
| Fichier | Modification |
|---|---|
| `src/app/dashboard/google/page.tsx` | Remplacer le contenu actuel par le nouveau layout complet |

### Nouveaux
| Fichier | Responsabilité |
|---|---|
| `src/app/api/google/stats/route.ts` | API route qui retourne les stats de visibilité pour le marchand connecté |

## Hors scope

- Métriques Google (impressions, clics, taux) — futur, quand il y a du trafic
- Produits rejetés par Google — nécessite l'API Merchant Reporting
- Aperçu visuel "Comment ça apparaît sur Google"
