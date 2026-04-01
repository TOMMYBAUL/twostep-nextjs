-- ============================================================
-- Migration 041: Categories tree (L1 + L2 seed data)
-- ============================================================

-- Table
CREATE TABLE categories (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug       TEXT        UNIQUE NOT NULL,
    label      TEXT        NOT NULL,
    emoji      TEXT,
    parent_id  UUID        REFERENCES categories(id) ON DELETE CASCADE,
    sort_order INTEGER     NOT NULL DEFAULT 0,
    is_active  BOOLEAN     NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_parent ON categories(parent_id, sort_order);
CREATE INDEX idx_categories_slug   ON categories(slug);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Everyone can read active categories
CREATE POLICY "categories_public_read" ON categories
    FOR SELECT USING (is_active = true);

-- Authenticated users (merchants) can insert / update / delete
CREATE POLICY "categories_auth_write" ON categories
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Level 1 categories
-- ============================================================
INSERT INTO categories (slug, label, emoji, sort_order) VALUES
    ('mode',               'Mode',               '👗',  1),
    ('chaussures',         'Chaussures',         '👟',  2),
    ('beaute',             'Beauté',             '💄',  3),
    ('bijoux-accessoires', 'Bijoux & Accessoires','💎',  4),
    ('sport-outdoor',      'Sport & Outdoor',    '⚽',  5),
    ('tech-electronique',  'Tech & Électronique','📱',  6),
    ('maison-deco',        'Maison & Déco',      '🏠',  7),
    ('alimentation',       'Alimentation',       '🍷',  8),
    ('enfants',            'Enfants',            '🧸',  9),
    ('culture-loisirs',    'Culture & Loisirs',  '📚', 10),
    ('sante-bien-etre',    'Santé & Bien-être',  '💊', 11),
    ('animaux',            'Animaux',            '🐾', 12),
    ('auto-mobilite',      'Auto & Mobilité',    '🚗', 13),
    ('bricolage-jardin',   'Bricolage & Jardin', '🔧', 14),
    ('seconde-main',       'Seconde Main',       '♻️', 15);

-- ============================================================
-- Level 2 — mode
-- ============================================================
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('mode-femme',        'Femme',        1),
    ('mode-homme',        'Homme',        2),
    ('mode-enfant',       'Enfant',       3),
    ('mode-lingerie',     'Lingerie',     4),
    ('mode-grande-taille','Grande taille',5),
    ('mode-vintage',      'Vintage',      6),
    ('mode-ceremonie',    'Cérémonie',    7)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'mode';

-- Level 2 — chaussures
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('chaussures-sneakers','Sneakers', 1),
    ('chaussures-ville',   'Ville',    2),
    ('chaussures-sport',   'Sport',    3),
    ('chaussures-enfant',  'Enfant',   4),
    ('chaussures-bottes',  'Bottes',   5),
    ('chaussures-sandales','Sandales', 6)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'chaussures';

-- Level 2 — beaute
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('beaute-parfums',    'Parfums',      1),
    ('beaute-maquillage', 'Maquillage',   2),
    ('beaute-soins',      'Soins',        3),
    ('beaute-cheveux',    'Cheveux',      4),
    ('beaute-barbe',      'Barbe',        5),
    ('beaute-bio',        'Bio / Naturel',6)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'beaute';

-- Level 2 — bijoux-accessoires
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('bijoux-bijoux',       'Bijoux',      1),
    ('bijoux-montres',      'Montres',     2),
    ('bijoux-lunettes',     'Lunettes',    3),
    ('bijoux-sacs',         'Sacs',        4),
    ('bijoux-maroquinerie', 'Maroquinerie',5),
    ('bijoux-chapeaux',     'Chapeaux',    6)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'bijoux-accessoires';

-- Level 2 — sport-outdoor
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('sport-running',       'Running',        1),
    ('sport-velo',          'Vélo',           2),
    ('sport-fitness',       'Fitness',        3),
    ('sport-raquettes',     'Raquettes',      4),
    ('sport-montagne',      'Montagne',       5),
    ('sport-glisse',        'Glisse',         6),
    ('sport-equitation',    'Équitation',     7),
    ('sport-arts-martiaux', 'Arts martiaux',  8)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'sport-outdoor';

-- Level 2 — tech-electronique
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('tech-telephones',  'Téléphones',    1),
    ('tech-audio-hifi',  'Audio / Hi-Fi', 2),
    ('tech-photo',       'Photo',         3),
    ('tech-gaming',      'Gaming',        4),
    ('tech-informatique','Informatique',  5),
    ('tech-domotique',   'Domotique',     6)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'tech-electronique';

-- Level 2 — maison-deco
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('maison-deco-deco',      'Déco',       1),
    ('maison-deco-cuisine',   'Cuisine',    2),
    ('maison-deco-linge',     'Linge',      3),
    ('maison-deco-luminaires','Luminaires', 4),
    ('maison-deco-bougies',   'Bougies',    5),
    ('maison-deco-literie',   'Literie',    6),
    ('maison-deco-jardin',    'Jardin',     7)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'maison-deco';

-- Level 2 — alimentation
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('alim-vins',       'Vins & Spiritueux',1),
    ('alim-epicerie',   'Épicerie fine',    2),
    ('alim-the-cafe',   'Thé & Café',       3),
    ('alim-bio',        'Bio',              4),
    ('alim-chocolat',   'Chocolat',         5),
    ('alim-biere-craft','Bière craft',      6)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'alimentation';

-- Level 2 — enfants
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('enfants-jouets',         'Jouets',          1),
    ('enfants-puericulture',   'Puériculture',    2),
    ('enfants-jeux-societe',   'Jeux de société', 3),
    ('enfants-figurines',      'Figurines',       4),
    ('enfants-modelisme',      'Modélisme',       5)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'enfants';

-- Level 2 — culture-loisirs
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('culture-livres',      'Livres',      1),
    ('culture-bd-manga',    'BD & Manga',  2),
    ('culture-vinyles',     'Vinyles',     3),
    ('culture-instruments', 'Instruments', 4),
    ('culture-papeterie',   'Papeterie',   5),
    ('culture-beaux-arts',  'Beaux-arts',  6)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'culture-loisirs';

-- Level 2 — sante-bien-etre
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('sante-pharmacie',         'Pharmacie',         1),
    ('sante-optique',           'Optique',           2),
    ('sante-parapharmacie',     'Parapharmacie',     3),
    ('sante-herboristerie',     'Herboristerie',     4),
    ('sante-nutrition-sportive','Nutrition sportive',5)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'sante-bien-etre';

-- Level 2 — animaux
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('animaux-chien-chat',    'Chien & Chat',  1),
    ('animaux-aquariophilie', 'Aquariophilie', 2),
    ('animaux-equitation',    'Équitation',    3)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'animaux';

-- Level 2 — auto-mobilite
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('auto-accessoires',   'Accessoires auto',  1),
    ('auto-moto',          'Moto',              2),
    ('auto-velo-electrique','Vélo électrique',  3),
    ('auto-trottinette',   'Trottinette',       4)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'auto-mobilite';

-- Level 2 — bricolage-jardin
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('brico-outillage',    'Outillage',    1),
    ('brico-quincaillerie','Quincaillerie',2),
    ('brico-peinture',     'Peinture',     3),
    ('brico-jardinerie',   'Jardinerie',   4),
    ('brico-piscine',      'Piscine',      5)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'bricolage-jardin';

-- Level 2 — seconde-main
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT s.slug, s.label, p.id, s.sort_order
FROM (VALUES
    ('sm-depot-vente-luxe',    'Dépôt-vente luxe',    1),
    ('sm-tech-reconditionne',  'Tech reconditionné',  2),
    ('sm-brocante',            'Brocante',            3)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'seconde-main';

-- ============================================================
-- RPC: get_categories_tree
-- Returns all active categories with their parent_slug
-- ============================================================
CREATE OR REPLACE FUNCTION get_categories_tree()
RETURNS TABLE (
    id         UUID,
    slug       TEXT,
    label      TEXT,
    emoji      TEXT,
    parent_id  UUID,
    parent_slug TEXT,
    sort_order INTEGER,
    is_active  BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        c.id,
        c.slug,
        c.label,
        c.emoji,
        c.parent_id,
        p.slug AS parent_slug,
        c.sort_order,
        c.is_active
    FROM categories c
    LEFT JOIN categories p ON p.id = c.parent_id
    WHERE c.is_active = true
    ORDER BY
        COALESCE(p.sort_order, c.sort_order),
        c.sort_order;
$$;
