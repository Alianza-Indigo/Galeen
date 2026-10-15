-- Provider connection management metadata. Credentials remain encrypted BYTEA.
-- Never edit migrations that have already been applied; use a new number instead.
ALTER TABLE provider_connections
  ADD COLUMN credential_hint varchar(12),
  ADD COLUMN health_status text NOT NULL DEFAULT 'untested',
  ADD COLUMN last_checked_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE provider_connections
  ADD CONSTRAINT provider_connections_health_check
  CHECK (health_status IN ('untested','healthy','invalid','limited','unavailable'));

CREATE INDEX provider_connections_health_idx
  ON provider_connections(organization_id,health_status,updated_at DESC);

-- Older connections must be re-tested before they can be enabled.
UPDATE provider_connections SET enabled=false, health_status='untested';
