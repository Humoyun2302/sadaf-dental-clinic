-- ============================================================
-- Sadaf Dental Clinic — Supabase Schema
-- Run this in your Supabase Dashboard → SQL Editor
-- ============================================================

-- Doctors table
CREATE TABLE IF NOT EXISTS doctors (
  slug           TEXT PRIMARY KEY,
  page_title     TEXT,
  name           TEXT,
  hero_subtitle  TEXT,
  initials       TEXT,
  has_photo      BOOLEAN DEFAULT FALSE,
  photo_data     TEXT,          -- base64 JPEG string (only for photo doctors)
  fields         JSONB DEFAULT '{}'::jsonb,
  card_name      TEXT,          -- name shown on index page card
  card_spec      TEXT,          -- specialty shown on index page card
  card_initials  TEXT,          -- initials shown on index page card
  no_photo       BOOLEAN DEFAULT FALSE,  -- yellow border on index card
  sort_order     INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Clinic info table (key-value store for index page settings)
CREATE TABLE IF NOT EXISTS clinic_info (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Insert default clinic info
INSERT INTO clinic_info (key, value) VALUES
  ('clinic_name', 'Sadaf Dental Clinic'),
  ('clinic_sub',  'Наши специалисты — Ташкент')
ON CONFLICT (key) DO NOTHING;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS doctors_updated_at ON doctors;
CREATE TRIGGER doctors_updated_at
  BEFORE UPDATE ON doctors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable Row Level Security (disable anon access, allow service key)
ALTER TABLE doctors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_info  ENABLE ROW LEVEL SECURITY;

-- Allow full access via service role key (used by admin server + build script)
CREATE POLICY "Service role full access" ON doctors
  FOR ALL USING (true);

CREATE POLICY "Service role full access" ON clinic_info
  FOR ALL USING (true);
