-- One connected school account may be served by a browser worker or a CLI worker.
-- The worker's browser profile and login session remain on the school's host.
ALTER TABLE galeen_local_agents
  ADD COLUMN IF NOT EXISTS agent_kind text NOT NULL DEFAULT 'cli'
  CHECK (agent_kind IN ('cli','browser'));
