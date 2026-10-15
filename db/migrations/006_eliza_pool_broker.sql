-- GALEEN broker adapter for a tenant-owned ElizaOS pool-meter key.
-- No personal passwords, browser cookies or provider OAuth sessions are stored in GALEEN.
ALTER TABLE shared_account_resources
  ADD COLUMN pool_key_encrypted bytea,
  ADD COLUMN pool_key_nonce bytea,
  ADD COLUMN pool_key_version integer,
  ADD COLUMN pool_key_hint text,
  ADD COLUMN pool_model text,
  ADD COLUMN pool_verified_at timestamptz;
ALTER TABLE shared_account_resources
  DROP CONSTRAINT IF EXISTS shared_account_resources_connection_status_check;
ALTER TABLE shared_account_resources
  ADD CONSTRAINT shared_account_resources_connection_status_check
  CHECK (connection_status IN ('not_connected','pending_authorized_connector','connected','invalid','unavailable'));
ALTER TABLE shared_account_resources
  ADD CONSTRAINT shared_account_resources_pool_secret_check
  CHECK (
    (pool_key_encrypted IS NULL AND pool_key_nonce IS NULL AND pool_key_version IS NULL)
    OR (pool_key_encrypted IS NOT NULL AND pool_key_nonce IS NOT NULL AND pool_key_version > 0)
  );

CREATE TABLE shared_account_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai','anthropic')),
  model_id text NOT NULL CHECK (length(model_id) BETWEEN 2 AND 100),
  state text NOT NULL CHECK (state IN ('running','settled','failed')),
  input_characters integer NOT NULL DEFAULT 0 CHECK (input_characters >= 0),
  output_characters integer NOT NULL DEFAULT 0 CHECK (output_characters >= 0),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  FOREIGN KEY (organization_id,resource_id)
    REFERENCES shared_account_resources(organization_id,id) ON DELETE CASCADE,
  FOREIGN KEY (reservation_id)
    REFERENCES shared_account_reservations(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id,user_id)
    REFERENCES organization_members(organization_id,user_id)
);
CREATE UNIQUE INDEX shared_account_executions_one_running
  ON shared_account_executions(organization_id,reservation_id)
  WHERE state='running';
CREATE INDEX shared_account_executions_org_time
  ON shared_account_executions(organization_id,started_at DESC);
CREATE INDEX shared_account_executions_user_time
  ON shared_account_executions(organization_id,user_id,started_at DESC);
ALTER TABLE shared_account_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped_shared_account_executions ON shared_account_executions
  USING (organization_id::text = current_setting('galeen.tenant_id',true))
  WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));
