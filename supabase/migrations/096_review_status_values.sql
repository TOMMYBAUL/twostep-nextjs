-- 096_review_status_values.sql
-- Fix : la migration 081 a posé CHECK (review_status IN ('pending_review',
-- 'validated', 'rejected')) et la 089 a introduit les gates cascade
-- ('pending' = queue 1-tap, 'masked' = masqué public) SANS élargir la
-- contrainte. Résultat : toute création de produit par le pipeline d'ingestion
-- (snapshot, catalog/import) violait products_review_status_check en prod.
-- Découvert par le e2e d'ingestion du 2026-06-13.
--
-- On élargit en conservant les valeurs héritées (des lignes 'pending_review' /
-- 'rejected' peuvent exister, et products/[id]/reject écrit encore 'rejected').

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_review_status_check;
ALTER TABLE products ADD CONSTRAINT products_review_status_check
    CHECK (review_status IN ('pending_review', 'pending', 'validated', 'rejected', 'masked'));

COMMENT ON COLUMN products.review_status IS
    'Gate identité : validated (≥0,95 auto-publié) | pending (0,70-0,95 queue 1-tap) | masked (<0,70 masqué public) | pending_review/rejected (hérités, flux facture/review).';
