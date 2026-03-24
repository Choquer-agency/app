-- Migration 017: Full-text search index for tickets
-- Supports Phase 14: Global Search (Cmd+K)

-- 1. Add tsvector column
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Populate existing rows with weighted vectors
--    A = ticket_number + title (highest weight — exact match priority)
--    B = description (lower weight)
UPDATE tickets SET search_vector =
  setweight(to_tsvector('english', coalesce(ticket_number, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B');

-- 3. GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_tickets_search_vector ON tickets USING GIN(search_vector);

-- 4. Trigger function to auto-update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION tickets_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.ticket_number, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tickets_search_vector_trigger ON tickets;
CREATE TRIGGER tickets_search_vector_trigger
  BEFORE INSERT OR UPDATE OF ticket_number, title, description
  ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION tickets_search_vector_update();
