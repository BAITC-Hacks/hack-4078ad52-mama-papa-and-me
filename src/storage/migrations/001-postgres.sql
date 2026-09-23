BEGIN;
CREATE TABLE IF NOT EXISTS scenarios (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS analyses (
  id text PRIMARY KEY,
  request_id text UNIQUE NOT NULL,
  session_id text NOT NULL,
  created_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  locked_until timestamptz,
  lock_token text
);
CREATE INDEX IF NOT EXISTS analysis_session_date ON analyses(session_id, created_at);
CREATE TABLE IF NOT EXISTS analysis_quota(day date PRIMARY KEY, used integer NOT NULL);
COMMIT;
