-- ============================================================
-- 🃏 CARDED — PostgreSQL Schema
-- Run this once on your Neon database to set up all tables
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- ─── Visiting Cards (My Cards) ───────────────────────────────
CREATE TABLE IF NOT EXISTS cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname        TEXT NOT NULL,
  name            TEXT NOT NULL,
  designation     TEXT NOT NULL,
  company         TEXT NOT NULL,
  email1          TEXT NOT NULL,
  email2          TEXT NOT NULL DEFAULT '',
  phone1          TEXT NOT NULL,
  phone2          TEXT NOT NULL DEFAULT '',
  website         TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  template_index  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);

-- ─── Collected Cards (Scanned from others) ───────────────────
CREATE TABLE IF NOT EXISTS collected_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auto_name       TEXT NOT NULL,
  name            TEXT NOT NULL,
  designation     TEXT NOT NULL DEFAULT '',
  company         TEXT NOT NULL DEFAULT '',
  email1          TEXT NOT NULL DEFAULT '',
  email2          TEXT NOT NULL DEFAULT '',
  phone1          TEXT NOT NULL DEFAULT '',
  phone2          TEXT NOT NULL DEFAULT '',
  website         TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  template_index  INTEGER NOT NULL DEFAULT 0,
  category        TEXT NOT NULL DEFAULT '',
  lead_type       TEXT NOT NULL DEFAULT '',
  remarks         TEXT NOT NULL DEFAULT '',
  scanned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collected_user_id ON collected_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_collected_scanned_at ON collected_cards(scanned_at DESC);

-- ─── Auto-update updated_at trigger ──────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_users_updated_at ON users;
CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_cards_updated_at ON cards;
CREATE TRIGGER set_cards_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_collected_updated_at ON collected_cards;
CREATE TRIGGER set_collected_updated_at
  BEFORE UPDATE ON collected_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Add photo_url to cards (run if tables already exist) ────
ALTER TABLE cards ADD COLUMN IF NOT EXISTS photo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE collected_cards ADD COLUMN IF NOT EXISTS photo_url TEXT NOT NULL DEFAULT '';

-- Write your SQL query here
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token                TEXT NOT NULL,           -- 6-digit OTP
  expires_at           TIMESTAMPTZ NOT NULL,
  used                 BOOLEAN NOT NULL DEFAULT false,
  reset_token          TEXT,                    -- after OTP verify
  reset_token_expires  TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Google Sign-In support ───────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url  TEXT;
ALTER TABLE users ALTER COLUMN phone SET DEFAULT '';
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash SET DEFAULT '';
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
-- Drop the original UNIQUE constraint on phone so multiple Google users can have empty phone
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;
-- Partial unique indexes: only enforce uniqueness for non-empty values
DROP INDEX IF EXISTS idx_users_phone_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL AND phone <> '';
DROP INDEX IF EXISTS idx_users_google_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

ALTER TABLE collected_cards ADD COLUMN IF NOT EXISTS scan_type TEXT NOT NULL DEFAULT 'carded';
ALTER TABLE collected_cards ADD COLUMN IF NOT EXISTS card_image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE collected_cards ADD COLUMN IF NOT EXISTS qr_raw_data TEXT NOT NULL DEFAULT '';

-- ─── Auth audit / rate-limit events ──────────────────────────
CREATE TABLE IF NOT EXISTS auth_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL,
  email       TEXT,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  ip          TEXT,
  user_agent  TEXT,
  success     BOOLEAN NOT NULL DEFAULT false,
  meta        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_events_action_created
  ON auth_events(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_email_action_created
  ON auth_events(email, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_ip_action_created
  ON auth_events(ip, action, created_at DESC);