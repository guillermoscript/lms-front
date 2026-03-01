-- Ensure review_id exists in reviews table
DO $$
BEGIN
    -- Check if review_id exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'review_id') THEN
        -- Check if 'id' exists, which might be the intended primary key
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'id') THEN
            ALTER TABLE reviews RENAME COLUMN id TO review_id;
        ELSE
            -- If neither exists, add review_id
            ALTER TABLE reviews ADD COLUMN review_id SERIAL PRIMARY KEY;
        END IF;
    END IF;
END $$;
