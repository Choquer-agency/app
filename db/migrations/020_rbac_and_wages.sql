-- Migration 020: RBAC role hierarchy and team member wages
-- Expand role_level from admin/member to 5-tier: owner, c_suite, bookkeeper, employee, intern
-- Add wage fields for profitability calculations

-- Map existing roles
UPDATE team_members SET role_level = 'owner' WHERE LOWER(email) = 'bryce@choquer.agency';
UPDATE team_members SET role_level = 'employee' WHERE role_level = 'member';
-- Any remaining 'admin' rows become c_suite
UPDATE team_members SET role_level = 'c_suite' WHERE role_level = 'admin';

-- Add wage fields
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(8,2);
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS salary NUMERIC(10,2);
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS pay_type VARCHAR(10) DEFAULT 'hourly';
