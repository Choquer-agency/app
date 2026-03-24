-- Migration 021: Add is_meeting flag to tickets
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS is_meeting BOOLEAN DEFAULT false;

-- Mark existing template meeting tickets
UPDATE tickets SET is_meeting = true
WHERE title ILIKE '%meeting%' OR title ILIKE '%presentation%';
