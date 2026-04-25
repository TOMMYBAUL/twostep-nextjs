# AI Act Article 50 — préparation Two-Step

> Deadline : **2 août 2026** (entrée en vigueur règlement UE 2024/1689 art. 50).
> Owner : Thomas Bauland.
> Dernière revue : 2026-04-25 (Phase 0 Task 0.7).

## Contexte

L'article 50 du Règlement européen sur l'IA (UE 2024/1689) impose, à partir du 2 août 2026, une **obligation de transparence** envers les utilisateurs lorsqu'un contenu (texte, image, audio) est généré ou substantiellement modifié par un système d'IA, dans la mesure où cet utilisateur pourrait le confondre avec un contenu d'origine humaine.

Pour Two-Step, la **cascade enrichissement** (Couche 2 de l'architecture — cf. `docs/ARCHITECTURE-TWOSTEP.md`) utilise :

- **Claude Vision (Anthropic)** pour vérifier qu'une photo correspond à un produit (`ai-verify` step)
- **Serper + Claude Vision** en reverse-search pour matcher des images au catalogue
- **Claude Vision** pour extraire titre / marque / catégorie depuis une photo physique du produit (Phase 2)

Ces traitements modifient substantiellement le contenu exposé aux utilisateurs finaux (fiche produit enrichie). L'art. 50 s'applique.

Sources :
- Règlement UE 2024/1689 article 50 : <https://artificialintelligenceact.eu/article/50/>
- Anthropic Usage Policy : <https://www.anthropic.com/aup>

## État actuel (2026-04-25)

- **DB tracking** : **BLOQUÉ — Cas C**. La table `product_enrichment_trace` n'existe pas encore en base Supabase (`nagyprzjtheyeuuwxgpg`). Cette table est une dépendance de la Phase 2 (pipeline cascade enrichissement), qui n'est pas encore implémentée. La colonne `enrichment_method` sera créée avec la table lors de la migration Phase 2. Aucune migration créée dans cette task 0.7 — à intégrer directement dans la migration de création de la table.
- **CGU AI disclosure** : **PRÉSENTE** dans le brief avocat (`docs/juridique/drafts-emails-phase0.md`, ligne 27) — "Clause AI disclosure conforme à l'article 50 du Règlement européen sur l'IA (entrée en vigueur 2 août 2026) : Two-Step utilise Claude Vision (Anthropic) pour enrichir automatiquement les descriptions et catégories produit à partir de photos". La clause est dans le devis envoyé à l'avocat. À vérifier que la version finale des CGU signées reprend bien cette clause mot pour mot.
- **UI badge** : prévu Task 1.12 Phase 1 — badge "Vérifié par IA" sur la fiche produit dashboard marchand quand `enrichment_method = 'claude-vision'`. Pas dans cette task.

## Note d'implémentation pour Phase 2

Lors de la création de la migration `product_enrichment_trace`, inclure dès le départ :

```sql
-- Colonne enrichment_method avec contrainte CHECK sur les valeurs autorisées
enrichment_method TEXT CHECK (enrichment_method IN (
  'claude-vision',
  'serper-reverse',
  'manual',
  'cascade-tier1',
  'cascade-tier2',
  'cascade-tier3',
  'cascade-tier4',
  'cascade-tier5',
  'cascade-tier6',
  'unknown'
)),

COMMENT ON COLUMN product_enrichment_trace.enrichment_method
  IS 'Méthode d''enrichissement utilisée — obligatoire pour conformité AI Act art.50 (UE 2024/1689, deadline 2026-08-02)';
```

Et créer le helper TS `src/lib/enrichment/methods.ts` :

```typescript
export const ENRICHMENT_METHODS = [
  'claude-vision',
  'serper-reverse',
  'manual',
  'cascade-tier1',
  'cascade-tier2',
  'cascade-tier3',
  'cascade-tier4',
  'cascade-tier5',
  'cascade-tier6',
  'unknown',
] as const;

export type EnrichmentMethod = (typeof ENRICHMENT_METHODS)[number];
```

## Étapes restantes avant 2 août 2026

- [ ] **Phase 2 — migration `product_enrichment_trace`** : inclure `enrichment_method` avec CHECK constraint + COMMENT (voir Note d'implémentation ci-dessus)
- [ ] **Phase 2 — helper TS** : créer `src/lib/enrichment/methods.ts` + test Vitest minimal (10 valeurs dans le tuple)
- [ ] **Phase 2 — remplir systématiquement** `enrichment_method` dans chaque step de la cascade (cf. ADR-006 à créer)
- [ ] **Task 1.12 Phase 1** : badge UI "Vérifié par IA" sur fiche produit dashboard marchand quand `enrichment_method = 'claude-vision'`
- [ ] **CGU finales** : vérifier que la version signée avec l'avocat reprend la clause AI disclosure
- [ ] **Page publique** `/legal/ai-disclosure` en lien depuis CGU + footer site (avant 2026-08-02)
