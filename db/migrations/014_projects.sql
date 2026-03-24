-- Phase 10: Projects, Templates & Personal Boards

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(300) NOT NULL,
  description TEXT DEFAULT '',
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  is_template BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',  -- active, completed, on_hold
  archived BOOLEAN DEFAULT false,
  start_date DATE,
  due_date DATE,
  created_by_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_template ON projects(is_template);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(archived);

-- FK on existing tickets.project_id column
ALTER TABLE tickets ADD CONSTRAINT fk_tickets_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- Template day offsets (for calculating dates when duplicating)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS day_offset_start INTEGER;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS day_offset_due INTEGER;

-- Personal board flag
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_tickets_personal ON tickets(is_personal, created_by_id);
CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id);

-- Ticket dependencies (blocking relationships)
CREATE TABLE IF NOT EXISTS ticket_dependencies (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  depends_on_ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  UNIQUE(ticket_id, depends_on_ticket_id)
);
CREATE INDEX IF NOT EXISTS idx_ticket_deps_ticket ON ticket_dependencies(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_deps_depends ON ticket_dependencies(depends_on_ticket_id);
