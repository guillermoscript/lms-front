-- Seed data for LMS V2 testing
-- This creates course categories
-- Users and course data will be created via seed-database.ts script

-- Create categories (with conflict handling)
INSERT INTO course_categories (name, description) VALUES
  ('Programming', 'Learn to code in various programming languages'),
  ('Design', 'Master design principles and tools'),
  ('Business', 'Business and entrepreneurship courses')
ON CONFLICT DO NOTHING;
