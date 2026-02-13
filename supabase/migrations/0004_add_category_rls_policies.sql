-- Add RLS policies for category management by admins
-- This migration adds INSERT, UPDATE, and DELETE policies for job_categories table

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
