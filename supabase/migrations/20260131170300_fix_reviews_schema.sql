-- Fix Reviews Table Schema
-- Ensure all necessary columns exist and RLS policies are correct
-- NOTE: Reviews table uses entity_type/entity_id pattern, not course_id
-- entity_type enum values: 'lessons', 'courses', 'exams'

-- Enable RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Anyone can view reviews" ON reviews;
DROP POLICY IF EXISTS "Students can view reviews" ON reviews;
DROP POLICY IF EXISTS "Users can create reviews for enrolled courses" ON reviews;
DROP POLICY IF EXISTS "Users can update own reviews" ON reviews;
DROP POLICY IF EXISTS "Users can delete own reviews" ON reviews;

-- Anyone can view reviews (public)
CREATE POLICY "Anyone can view reviews"
ON reviews FOR SELECT
TO authenticated
USING (true);

-- Users can create reviews for courses they're enrolled in
-- entity_type must be 'courses' (plural) and entity_id is the course_id
CREATE POLICY "Users can create reviews for enrolled courses"
ON reviews FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id AND
  entity_type = 'courses' AND
  EXISTS (
    SELECT 1 FROM enrollments
    WHERE course_id = reviews.entity_id
    AND user_id = auth.uid()
    AND status = 'active'
  )
);

-- Users can update their own reviews
CREATE POLICY "Users can update own reviews"
ON reviews FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reviews
CREATE POLICY "Users can delete own reviews"
ON reviews FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Ensure unique constraint: one review per user per entity
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique_user_entity 
ON reviews(user_id, entity_type, entity_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_reviews_entity ON reviews(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);
