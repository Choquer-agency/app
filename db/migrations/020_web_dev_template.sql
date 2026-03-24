-- Migration 020: Seed Web Development Project Template
-- Recreates the ClickUp web development project template with all tickets, groups, and roles

-- 1. Create the template project
INSERT INTO projects (name, description, is_template, status, archived, created_by_id)
VALUES ('Website Project', 'Full web development project template — from onboarding through launch and post-launch.', true, 'active', false, 1)
ON CONFLICT DO NOTHING;

-- Get the template project ID
DO $$
DECLARE
  tmpl_id INT;
  g_kickoff INT;
  g_wireframe INT;
  g_development INT;
  g_launch INT;
  r_pm INT;
  r_seo INT;
  r_designer INT;
  r_developer INT;
  r_copywriter INT;
  r_client INT;
BEGIN
  SELECT id INTO tmpl_id FROM projects WHERE name = 'Website Project' AND is_template = true LIMIT 1;
  IF tmpl_id IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;

  -- 2. Create groups/phases
  INSERT INTO project_groups (project_id, name, color, sort_order) VALUES (tmpl_id, 'Kick Off', '#F59E0B', 0) RETURNING id INTO g_kickoff;
  INSERT INTO project_groups (project_id, name, color, sort_order) VALUES (tmpl_id, 'Wireframe', '#3B82F6', 1) RETURNING id INTO g_wireframe;
  INSERT INTO project_groups (project_id, name, color, sort_order) VALUES (tmpl_id, 'Development', '#EF4444', 2) RETURNING id INTO g_development;
  INSERT INTO project_groups (project_id, name, color, sort_order) VALUES (tmpl_id, 'Launch', '#10B981', 3) RETURNING id INTO g_launch;

  -- 3. Create roles
  INSERT INTO project_template_roles (project_id, name, sort_order) VALUES (tmpl_id, 'Project Manager', 0) RETURNING id INTO r_pm;
  INSERT INTO project_template_roles (project_id, name, sort_order) VALUES (tmpl_id, 'SEO Strategist', 1) RETURNING id INTO r_seo;
  INSERT INTO project_template_roles (project_id, name, sort_order) VALUES (tmpl_id, 'Designer', 2) RETURNING id INTO r_designer;
  INSERT INTO project_template_roles (project_id, name, sort_order) VALUES (tmpl_id, 'Developer', 3) RETURNING id INTO r_developer;
  INSERT INTO project_template_roles (project_id, name, sort_order) VALUES (tmpl_id, 'Copywriter', 4) RETURNING id INTO r_copywriter;
  INSERT INTO project_template_roles (project_id, name, sort_order) VALUES (tmpl_id, 'Client', 5) RETURNING id INTO r_client;

  -- 4. Create tickets
  -- Day offsets are relative to project start date (day 0)
  -- The system will adjust for weekends when duplicating

  -- ========== KICK OFF ==========
  INSERT INTO tickets (ticket_number, title, project_id, group_id, template_role_id, status, priority, day_offset_start, day_offset_due, sort_order, is_personal, archived)
  VALUES
    (nextval('ticket_number_seq')::text, 'Client Signs Up - Welcome Email', tmpl_id, g_kickoff, r_pm, 'needs_attention', 'normal', 0, 2, 1, false, false),
    (nextval('ticket_number_seq')::text, 'Pre Onboarding Meeting', tmpl_id, g_kickoff, NULL, 'needs_attention', 'normal', 0, 2, 2, false, false),
    (nextval('ticket_number_seq')::text, 'Audit', tmpl_id, g_kickoff, r_seo, 'needs_attention', 'normal', 2, 2, 3, false, false),
    (nextval('ticket_number_seq')::text, 'Research', tmpl_id, g_kickoff, NULL, 'needs_attention', 'normal', 2, 2, 4, false, false),
    (nextval('ticket_number_seq')::text, 'Competitor Analysis', tmpl_id, g_kickoff, NULL, 'needs_attention', 'normal', 2, 2, 5, false, false),
    (nextval('ticket_number_seq')::text, 'Onboarding Meeting', tmpl_id, g_kickoff, NULL, 'needs_attention', 'normal', 4, 4, 6, false, false),
    (nextval('ticket_number_seq')::text, 'Post Onboarding Meeting', tmpl_id, g_kickoff, NULL, 'needs_attention', 'normal', 4, 4, 7, false, false),
    (nextval('ticket_number_seq')::text, 'Follow Up Email', tmpl_id, g_kickoff, r_pm, 'needs_attention', 'normal', 4, 4, 8, false, false),
    (nextval('ticket_number_seq')::text, 'Sitemap', tmpl_id, g_kickoff, r_designer, 'needs_attention', 'normal', 5, 9, 9, false, false),
    (nextval('ticket_number_seq')::text, 'Keyword Map', tmpl_id, g_kickoff, r_seo, 'needs_attention', 'normal', 5, 9, 10, false, false),
    (nextval('ticket_number_seq')::text, 'Keyword Heatmap', tmpl_id, g_kickoff, r_seo, 'needs_attention', 'normal', 5, 9, 11, false, false),
    (nextval('ticket_number_seq')::text, 'Access To Google My Business', tmpl_id, g_kickoff, r_seo, 'needs_attention', 'normal', 5, 9, 12, false, false),
    (nextval('ticket_number_seq')::text, 'Access To Website', tmpl_id, g_kickoff, r_seo, 'needs_attention', 'normal', 5, 9, 13, false, false),
    (nextval('ticket_number_seq')::text, 'Access To Tag Manager', tmpl_id, g_kickoff, r_seo, 'needs_attention', 'normal', 5, 9, 14, false, false),
    (nextval('ticket_number_seq')::text, 'Access To Analytics', tmpl_id, g_kickoff, r_seo, 'needs_attention', 'normal', 5, 9, 15, false, false),
    (nextval('ticket_number_seq')::text, 'Example Of Keyword Use On Website', tmpl_id, g_kickoff, r_seo, 'needs_attention', 'normal', 5, 9, 16, false, false),
    (nextval('ticket_number_seq')::text, 'Add Clarity To Website', tmpl_id, g_kickoff, r_seo, 'needs_attention', 'normal', 5, 9, 17, false, false),
    (nextval('ticket_number_seq')::text, 'Google Folder Created', tmpl_id, g_kickoff, r_seo, 'needs_attention', 'normal', 5, 9, 18, false, false),
    (nextval('ticket_number_seq')::text, '3 Directions Wireframe', tmpl_id, g_kickoff, r_designer, 'needs_attention', 'normal', 5, 9, 19, false, false),
    (nextval('ticket_number_seq')::text, '2 Month Strategy', tmpl_id, g_kickoff, r_seo, 'needs_attention', 'normal', 5, 9, 20, false, false),
    (nextval('ticket_number_seq')::text, 'Internal Final Review Meeting', tmpl_id, g_kickoff, r_seo, 'needs_attention', 'normal', 10, 10, 21, false, false),
    (nextval('ticket_number_seq')::text, 'Kick Off Meeting', tmpl_id, g_kickoff, r_pm, 'needs_attention', 'normal', 11, 11, 22, false, false);

  -- ========== WIREFRAME ==========
  INSERT INTO tickets (ticket_number, title, project_id, group_id, template_role_id, status, priority, day_offset_start, day_offset_due, sort_order, is_personal, archived)
  VALUES
    (nextval('ticket_number_seq')::text, 'SEO Page Outlines Strategy', tmpl_id, g_wireframe, r_seo, 'needs_attention', 'normal', 12, 17, 1, false, false),
    (nextval('ticket_number_seq')::text, 'Email Outline To Client For Approval', tmpl_id, g_wireframe, r_pm, 'needs_attention', 'normal', 18, 18, 2, false, false),
    (nextval('ticket_number_seq')::text, 'Copy Creation', tmpl_id, g_wireframe, r_copywriter, 'needs_attention', 'normal', 12, 20, 3, false, false),
    (nextval('ticket_number_seq')::text, 'Wireframe', tmpl_id, g_wireframe, r_designer, 'needs_attention', 'normal', 12, 23, 4, false, false),
    (nextval('ticket_number_seq')::text, 'Internal QA - Wireframe', tmpl_id, g_wireframe, r_pm, 'needs_attention', 'normal', 24, 24, 5, false, false),
    (nextval('ticket_number_seq')::text, 'Wireframe Presentation', tmpl_id, g_wireframe, r_pm, 'needs_attention', 'normal', 25, 25, 6, false, false),
    (nextval('ticket_number_seq')::text, 'Client - Wireframe Revisions Due R1', tmpl_id, g_wireframe, r_client, 'needs_attention', 'normal', 25, 27, 7, false, false),
    (nextval('ticket_number_seq')::text, 'Implement Wireframe Revisions R1', tmpl_id, g_wireframe, r_designer, 'needs_attention', 'normal', 28, 31, 8, false, false),
    (nextval('ticket_number_seq')::text, 'Wireframe Presentation R2', tmpl_id, g_wireframe, r_designer, 'needs_attention', 'normal', 32, 32, 9, false, false),
    (nextval('ticket_number_seq')::text, 'Client - Wireframe Revisions Due R2', tmpl_id, g_wireframe, r_client, 'needs_attention', 'normal', 32, 34, 10, false, false),
    (nextval('ticket_number_seq')::text, 'Implement Wireframe Revisions R2', tmpl_id, g_wireframe, r_designer, 'needs_attention', 'normal', 35, 38, 11, false, false),
    (nextval('ticket_number_seq')::text, 'Wireframe Presentation R3', tmpl_id, g_wireframe, r_designer, 'needs_attention', 'normal', 39, 39, 12, false, false),
    (nextval('ticket_number_seq')::text, 'Final Wireframe Touches / Sign Off', tmpl_id, g_wireframe, r_designer, 'needs_attention', 'normal', 40, 41, 13, false, false);

  -- ========== DEVELOPMENT ==========
  INSERT INTO tickets (ticket_number, title, project_id, group_id, template_role_id, status, priority, day_offset_start, day_offset_due, sort_order, is_personal, archived)
  VALUES
    (nextval('ticket_number_seq')::text, 'Development', tmpl_id, g_development, r_developer, 'needs_attention', 'normal', 39, 55, 1, false, false),
    (nextval('ticket_number_seq')::text, 'Internal QA - Development', tmpl_id, g_development, r_pm, 'needs_attention', 'normal', 56, 59, 2, false, false),
    (nextval('ticket_number_seq')::text, 'Development QA Changes', tmpl_id, g_development, NULL, 'needs_attention', 'normal', 56, 59, 3, false, false),
    (nextval('ticket_number_seq')::text, 'SEO Optimization', tmpl_id, g_development, r_seo, 'needs_attention', 'normal', 59, 62, 4, false, false),
    (nextval('ticket_number_seq')::text, 'Development Presentation', tmpl_id, g_development, r_pm, 'needs_attention', 'normal', 60, 60, 5, false, false),
    (nextval('ticket_number_seq')::text, 'Client Revisions Due - Dev R1', tmpl_id, g_development, r_client, 'needs_attention', 'normal', 60, 62, 6, false, false),
    (nextval('ticket_number_seq')::text, 'Implement Development Revisions R1', tmpl_id, g_development, r_developer, 'needs_attention', 'normal', 63, 66, 7, false, false),
    (nextval('ticket_number_seq')::text, 'Development Presentation R2', tmpl_id, g_development, r_developer, 'needs_attention', 'normal', 67, 67, 8, false, false),
    (nextval('ticket_number_seq')::text, 'Client Revisions Due - Dev R2', tmpl_id, g_development, r_client, 'needs_attention', 'normal', 67, 69, 9, false, false),
    (nextval('ticket_number_seq')::text, 'Implement Development Revisions R2', tmpl_id, g_development, r_developer, 'needs_attention', 'normal', 70, 73, 10, false, false),
    (nextval('ticket_number_seq')::text, 'Development Presentation R3', tmpl_id, g_development, r_developer, 'needs_attention', 'normal', 74, 74, 11, false, false),
    (nextval('ticket_number_seq')::text, 'Client Sign Off - Schedule Launch!', tmpl_id, g_development, r_pm, 'needs_attention', 'normal', 74, 76, 12, false, false);

  -- ========== LAUNCH ==========
  INSERT INTO tickets (ticket_number, title, project_id, group_id, template_role_id, status, priority, day_offset_start, day_offset_due, sort_order, is_personal, archived)
  VALUES
    (nextval('ticket_number_seq')::text, 'Development Pre Launch Checklist', tmpl_id, g_launch, r_developer, 'needs_attention', 'normal', 77, 80, 1, false, false),
    (nextval('ticket_number_seq')::text, 'Check pages on Google Chrome', tmpl_id, g_launch, r_developer, 'needs_attention', 'normal', NULL, NULL, 2, false, false),
    (nextval('ticket_number_seq')::text, 'Check pages on Safari', tmpl_id, g_launch, r_developer, 'needs_attention', 'normal', NULL, NULL, 3, false, false),
    (nextval('ticket_number_seq')::text, 'Check pages on Firefox', tmpl_id, g_launch, r_developer, 'needs_attention', 'normal', NULL, NULL, 4, false, false),
    (nextval('ticket_number_seq')::text, 'Upload custom Fav Icon and Web Clip', tmpl_id, g_launch, r_developer, 'needs_attention', 'normal', NULL, NULL, 5, false, false),
    (nextval('ticket_number_seq')::text, 'Remove Webflow Branding', tmpl_id, g_launch, r_developer, 'needs_attention', 'normal', NULL, NULL, 6, false, false),
    (nextval('ticket_number_seq')::text, 'Timezone should be set to the clients timezone', tmpl_id, g_launch, r_developer, 'needs_attention', 'normal', NULL, NULL, 7, false, false),
    (nextval('ticket_number_seq')::text, 'Custom branding logo should be added', tmpl_id, g_launch, r_developer, 'needs_attention', 'normal', NULL, NULL, 8, false, false),
    (nextval('ticket_number_seq')::text, 'Launch Website', tmpl_id, g_launch, r_developer, 'needs_attention', 'normal', 81, 81, 9, false, false),
    (nextval('ticket_number_seq')::text, 'SEO Post Launch Checklist', tmpl_id, g_launch, r_seo, 'needs_attention', 'normal', 81, 82, 10, false, false),
    (nextval('ticket_number_seq')::text, 'Insight Pulse', tmpl_id, g_launch, r_seo, 'needs_attention', 'normal', NULL, NULL, 11, false, false),
    (nextval('ticket_number_seq')::text, 'Analytics', tmpl_id, g_launch, r_seo, 'needs_attention', 'normal', NULL, NULL, 12, false, false),
    (nextval('ticket_number_seq')::text, 'Tag Manager', tmpl_id, g_launch, r_seo, 'needs_attention', 'normal', NULL, NULL, 13, false, false),
    (nextval('ticket_number_seq')::text, 'Search Console', tmpl_id, g_launch, r_seo, 'needs_attention', 'normal', NULL, NULL, 14, false, false),
    (nextval('ticket_number_seq')::text, 'Clarity', tmpl_id, g_launch, r_seo, 'needs_attention', 'normal', NULL, NULL, 15, false, false),
    (nextval('ticket_number_seq')::text, 'Google My Business', tmpl_id, g_launch, r_seo, 'needs_attention', 'normal', NULL, NULL, 16, false, false),
    (nextval('ticket_number_seq')::text, 'Meta Titles / Meta Descriptions', tmpl_id, g_launch, r_seo, 'needs_attention', 'normal', NULL, NULL, 17, false, false),
    (nextval('ticket_number_seq')::text, 'Plan and organise redirects from the old site', tmpl_id, g_launch, r_seo, 'needs_attention', 'normal', NULL, NULL, 18, false, false),
    (nextval('ticket_number_seq')::text, 'Schema Markup', tmpl_id, g_launch, r_seo, 'needs_attention', 'normal', NULL, NULL, 19, false, false),
    (nextval('ticket_number_seq')::text, 'Image Alt Texts', tmpl_id, g_launch, r_seo, 'needs_attention', 'normal', NULL, NULL, 20, false, false),
    (nextval('ticket_number_seq')::text, 'Post Launch Meeting', tmpl_id, g_launch, r_pm, 'needs_attention', 'normal', 95, 95, 21, false, false),
    (nextval('ticket_number_seq')::text, '6 Month Strategy', tmpl_id, g_launch, r_seo, 'needs_attention', 'normal', NULL, NULL, 22, false, false);

  -- Fix ticket numbers to CHQ-XXX format
  UPDATE tickets
  SET ticket_number = 'CHQ-' || LPAD(ticket_number, 3, '0')
  WHERE project_id = tmpl_id AND ticket_number NOT LIKE 'CHQ-%';

END $$;
