-- Add RLS policies for category management by admins
-- This migration adds INSERT, UPDATE, and DELETE policies for job_categories table

-- Drop existing policies first (idempotent)
DROP POLICY IF EXISTS "Admins can create categories" ON job_categories;
DROP POLICY IF EXISTS "Admins can update categories" ON job_categories;
DROP POLICY IF EXISTS "Admins can delete categories" ON job_categories;

-- Allow admins to insert new categories
CREATE POLICY "Admins can create categories"
  ON job_categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Allow admins to update categories
CREATE POLICY "Admins can update categories"
  ON job_categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Allow admins to delete categories
CREATE POLICY "Admins can delete categories"
  ON job_categories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
