// Database schema. Runs automatically on first connection (idempotent).
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT 'HR Admin',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cloud TEXT,
  city TEXT,
  revenue_cr REAL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cloud TEXT,
  city TEXT,
  revenue_cr REAL,
  signal TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  client_id INT REFERENCES clients(id) ON DELETE SET NULL,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  openings INT NOT NULL DEFAULT 1,
  employment_type TEXT NOT NULL DEFAULT 'Permanent',
  work_mode TEXT NOT NULL DEFAULT 'Hybrid',
  location TEXT,
  exp_min REAL, exp_max REAL,
  ctc_min REAL, ctc_max REAL,
  joining_timeline TEXT,
  mandatory_skills JSONB NOT NULL DEFAULT '[]',
  preferred_skills JSONB NOT NULL DEFAULT '[]',
  description TEXT,
  screening_questions JSONB NOT NULL DEFAULT '[]',
  interview_rounds JSONB NOT NULL DEFAULT '[]',
  client_contact JSONB NOT NULL DEFAULT '{}',
  hm_notes JSONB NOT NULL DEFAULT '{}',
  public_company TEXT,
  min_score INT NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS job_postings (
  id SERIAL PRIMARY KEY,
  job_id INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  portal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_posted',
  url TEXT,
  posted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, portal)
);

CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Unknown',
  email TEXT,
  phone TEXT,
  current_title TEXT,
  current_company TEXT,
  location TEXT,
  total_exp REAL,
  cctc REAL,
  ectc REAL,
  notice_days INT,
  availability TEXT,
  skills JSONB NOT NULL DEFAULT '[]',
  summary TEXT,
  experience JSONB NOT NULL DEFAULT '[]',
  education JSONB NOT NULL DEFAULT '[]',
  resume_text TEXT,
  client_resume JSONB,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidates_email_idx ON candidates (lower(email));
CREATE INDEX IF NOT EXISTS candidates_phone_idx ON candidates (phone);

CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  candidate_id INT REFERENCES candidates(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime TEXT,
  size INT,
  data BYTEA,
  source TEXT,
  parse_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  job_id INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id INT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'pending',
  source TEXT,
  match_score INT,
  match_detail JSONB,
  reject_reason TEXT,
  client_decision TEXT,
  client_reason TEXT,
  client_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, candidate_id)
);

-- Match score of every candidate against every job they were scored for (0-100 = match %).
CREATE TABLE IF NOT EXISTS candidate_scores (
  candidate_id INT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  score INT NOT NULL,
  detail JSONB,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, job_id)
);
INSERT INTO candidate_scores (candidate_id, job_id, score, detail)
  SELECT candidate_id, job_id, match_score, match_detail FROM applications WHERE match_score IS NOT NULL
  ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  candidate_id INT REFERENCES candidates(id) ON DELETE CASCADE,
  application_id INT REFERENCES applications(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS screenings (
  id SERIAL PRIMARY KEY,
  application_id INT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  slot_at TIMESTAMPTZ,
  consent BOOLEAN NOT NULL DEFAULT false,
  attempts INT NOT NULL DEFAULT 0,
  provider TEXT,
  provider_call_id TEXT,
  transcript TEXT,
  answers JSONB,
  score REAL,
  summary TEXT,
  recording_url TEXT,
  duration_sec INT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shares (
  id SERIAL PRIMARY KEY,
  job_id INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  application_ids JSONB NOT NULL DEFAULT '[]',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS interviews (
  id SERIAL PRIMARY KEY,
  application_id INT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  round TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  meeting_link TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  outcome TEXT,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offers (
  id SERIAL PRIMARY KEY,
  application_id INT UNIQUE NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  offered_ctc REAL,
  status TEXT NOT NULL DEFAULT 'negotiating',
  joining_date DATE,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  to_addr TEXT,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hiring announcements shared on social media (LinkedIn feed, WhatsApp, X, Facebook…).
CREATE TABLE IF NOT EXISTS social_posts (
  id SERIAL PRIMARY KEY,
  job_id INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'shared',
  url TEXT,
  error TEXT,
  posted_by INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS screening_questions JSONB NOT NULL DEFAULT '[]';
INSERT INTO social_posts (job_id, platform, body, status, url, created_at)
  SELECT p.job_id, p.portal, 'Job posted on the portal', 'posted', p.url, COALESCE(p.posted_at, p.updated_at) FROM job_postings p
  WHERE p.portal IN ('indeed', 'naukri') AND p.status = 'posted'
    AND NOT EXISTS (SELECT 1 FROM social_posts s WHERE s.job_id = p.job_id AND s.platform = p.portal);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contacts JSONB NOT NULL DEFAULT '[]';
UPDATE clients SET contacts = jsonb_build_array(jsonb_build_object('post', '', 'name', COALESCE(contact_name, ''), 'email', COALESCE(contact_email, ''), 'phone', COALESCE(contact_phone, ''), 'remarks', '', 'primary', true))
  WHERE contacts = '[]'::jsonb AND (contact_name IS NOT NULL OR contact_email IS NOT NULL OR contact_phone IS NOT NULL);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS required_certs JSONB NOT NULL DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS preferred_certs JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
`;
