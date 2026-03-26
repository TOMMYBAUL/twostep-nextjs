-- Add clothing size and shoe size preferences to consumer profiles
ALTER TABLE consumer_profiles
    ADD COLUMN IF NOT EXISTS preferred_clothing_size TEXT,
    ADD COLUMN IF NOT EXISTS preferred_shoe_size INTEGER;

-- Validate clothing size values
ALTER TABLE consumer_profiles
    ADD CONSTRAINT check_clothing_size
    CHECK (preferred_clothing_size IS NULL OR preferred_clothing_size IN ('XS', 'S', 'M', 'L', 'XL', 'XXL'));

-- Validate shoe size range (35-48)
ALTER TABLE consumer_profiles
    ADD CONSTRAINT check_shoe_size
    CHECK (preferred_shoe_size IS NULL OR (preferred_shoe_size >= 35 AND preferred_shoe_size <= 48));
