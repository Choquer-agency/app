-- Migration 019: Project Groups & Template Roles
-- Adds structured group/phase management and custom roles for project templates

-- ============================================
-- 1. Project Groups (phases within a project)
-- ============================================
CREATE TABLE IF NOT EXISTS project_groups (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  color VARCHAR(20),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_groups_project ON project_groups(project_id);

-- ============================================
-- 2. Project Template Roles (custom roles per template)
-- ============================================
CREATE TABLE IF NOT EXISTS project_template_roles (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_roles_project ON project_template_roles(project_id);

-- ============================================
-- 3. Ticket table additions
-- ============================================
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS group_id INT REFERENCES project_groups(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS template_role_id INT REFERENCES project_template_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_group ON tickets(group_id);
CREATE INDEX IF NOT EXISTS idx_tickets_template_role ON tickets(template_role_id);
