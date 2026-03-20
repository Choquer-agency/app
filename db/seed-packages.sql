-- Seed: Choquer Agency service packages from choquer.agency
-- Run after migration to populate the packages table

-- Web Development packages (category: website)
INSERT INTO packages (name, description, default_price, category, billing_frequency, hours_included, setup_fee, included_services) VALUES
('Web Dev - Minimum', 'Webflow development for smaller projects', 4900, 'website', 'monthly', NULL, 0,
  '{"12-15 pages","1 Designer + 1 Developer","1 Dedicated Project Manager"}'),
('Web Dev - Growth', 'Webflow development for growing businesses', 6900, 'website', 'monthly', NULL, 0,
  '{"20-30 pages","1 Designer + 2 Developers","1 Dedicated Project Manager"}'),
('Web Dev - Corporate', 'Full-team Webflow development for enterprise', 10250, 'website', 'monthly', NULL, 0,
  '{"40+ pages","2 Designers + 2 Developers","1 Dedicated Project Manager","Direct team access communication"}');

-- Retainer packages (category: retainer)
INSERT INTO packages (name, description, default_price, category, billing_frequency, hours_included, setup_fee, included_services) VALUES
('Retainer - 10 Hours', 'Monthly retainer with 10 hours of work', 2200, 'retainer', 'monthly', 10, 0,
  '{"UI/UX Design","Brand Development/Identity","Copywriting","SEO Strategy","Dedicated Slack Channel","Monthly Meetings"}'),
('Retainer - 15 Hours', 'Monthly retainer with 15 hours of work', 3150, 'retainer', 'monthly', 15, 0,
  '{"UI/UX Design","Brand Development/Identity","Copywriting","SEO Strategy","Dedicated Slack Channel","Monthly Meetings"}'),
('Retainer - 20 Hours', 'Monthly retainer with 20 hours of work', 4000, 'retainer', 'monthly', 20, 0,
  '{"UI/UX Design","Brand Development/Identity","Copywriting","SEO Strategy","Dedicated Slack Channel","Monthly Meetings"}'),
('Retainer - 30 Hours', 'Monthly retainer with 30 hours of work (Most Popular)', 5700, 'retainer', 'monthly', 30, 0,
  '{"UI/UX Design","Brand Development/Identity","Copywriting","SEO Strategy","Dedicated Slack Channel","Monthly Meetings"}'),
('Retainer - 40 Hours', 'Monthly retainer with 40 hours of work', 7200, 'retainer', 'monthly', 40, 0,
  '{"UI/UX Design","Brand Development/Identity","Copywriting","SEO Strategy","Dedicated Slack Channel","Monthly Meetings"}');

-- Google Ads packages (category: google_ads)
INSERT INTO packages (name, description, default_price, category, billing_frequency, hours_included, setup_fee, included_services) VALUES
('Google Ads - Tier 1 ($500-$2,499 Ad Spend)', 'Google Ads management for $500-$2,499/mo ad spend', 625, 'google_ads', 'monthly', NULL, 2000,
  '{"Free $600 Ads Credit","Image Generation Assistance","Account Creation","Keyword Research","Ad Optimization"}'),
('Google Ads - Tier 2 ($2,500-$4,499 Ad Spend)', 'Google Ads management for $2,500-$4,499/mo ad spend', 995, 'google_ads', 'monthly', NULL, 2000,
  '{"Free $600 Ads Credit","Image Generation Assistance","Account Creation","Keyword Research","Ad Optimization"}'),
('Google Ads - Tier 3 ($4,500-$7,499 Ad Spend)', 'Google Ads management for $4,500-$7,499/mo ad spend', 1335, 'google_ads', 'monthly', NULL, 2000,
  '{"Free $600 Ads Credit","Image Generation Assistance","Account Creation","Keyword Research","Ad Optimization"}'),
('Google Ads - Tier 4 ($7,500-$15,000 Ad Spend)', 'Google Ads management for $7,500-$15,000/mo ad spend (Most Popular)', 1695, 'google_ads', 'monthly', NULL, 2000,
  '{"Free $600 Ads Credit","Image Generation Assistance","Account Creation","Keyword Research","Ad Optimization"}');

-- SEO packages (category: seo)
INSERT INTO packages (name, description, default_price, category, billing_frequency, hours_included, setup_fee, included_services) VALUES
('SEO - Starter', 'Entry-level organic SEO services', 2500, 'seo', 'monthly', NULL, 0,
  '{"1 Monthly Blog Post","1 Quarterly Landing Page","Basic Backlink & Citation Building","GBP Optimization","Quarterly Strategy Meeting","Quarterly Competitor Snapshot","Standard Keyword Reporting","48hr Email Support"}'),
('SEO - Ranking Master', 'Mid-tier SEO with active link building', 3500, 'seo', 'monthly', NULL, 0,
  '{"2 Monthly Blog Posts","1 Quarterly Landing Page","Active Backlink & Citation Building (4-6 links/mo)","GBP Optimization & Weekly Posts","Monthly Strategy Meeting","Quarterly CRO Landing Page Audit","Monthly Competitor Snapshot","Standard Keyword Reporting","24hr Email Support"}'),
('SEO - Corporate', 'Full-service SEO for maximum organic growth (Most Popular)', 6000, 'seo', 'monthly', NULL, 0,
  '{"4 Monthly Blog Posts","2-3 Monthly Landing Pages","Aggressive Backlink & Citation Building (8-12 links/mo)","GBP Optimization + Weekly Posts + Q&A Strategy","Monthly & On-Demand Strategy Meetings","Monthly CRO Recommendations","Weekly Competitor Snapshot","Full Custom Keyword Dashboard & Reporting","Slack & Email Same Day Response"}');

-- AI Chatbot (category: other)
INSERT INTO packages (name, description, default_price, category, billing_frequency, hours_included, setup_fee, included_services) VALUES
('AI Chatbot', 'Custom AI chatbot trained on your business content', 50, 'other', 'monthly', NULL, 500,
  '{"Ongoing Conversation Flow Monitoring","Escalation Path Review (Handoff to Human/CRM)","Monthly Performance Summary","Brand Voice & Tone Configuration","Custom Chatbot Trained on Your Business Content","Embedded Across All Pages of Website","CRM or Email System Integration"}');
