-- Migration 016: Reports & Analytics
-- Add available_hours_per_week to team_members for utilization rate calculation
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS available_hours_per_week NUMERIC(4,1) DEFAULT 40;
