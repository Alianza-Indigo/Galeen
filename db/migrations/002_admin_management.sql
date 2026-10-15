-- Institutional administration and invitation-based sign-in.
-- Transaction and checksum are managed by scripts/migrate.mjs.
ALTER TABLE organizations ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE app_users ADD COLUMN password_hash text;
ALTER TABLE app_users ADD COLUMN last_login_at timestamptz;

CREATE TABLE organization_entitlements (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  plan_code text NOT NULL DEFAULT 'standard' CHECK (length(plan_code) BETWEEN 2 AND 64),
  max_users integer NOT NULL DEFAULT 50 CHECK (max_users BETWEEN 1 AND 1000000),
  max_monthly_requests bigint NOT NULL DEFAULT 10000 CHECK (max_monthly_requests >= 0),
  max_monthly_micro_usd bigint NOT NULL DEFAULT 100000000 CHECK (max_monthly_micro_usd >= 0),
  allowed_providers text[] NOT NULL DEFAULT ARRAY['openai','anthropic','google','openrouter']::text[],
  custom_domain_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (allowed_providers <@ ARRAY['openai','anthropic','google','openrouter','custom']::text[])
);
INSERT INTO organization_entitlements(organization_id)
SELECT id FROM organizations ON CONFLICT DO NOTHING;

CREATE TABLE organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','manager','member','auditor')),
  token_hash char(64) NOT NULL UNIQUE,
  invited_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(email) <= 254)
);
CREATE INDEX organization_invitations_org_time
  ON organization_invitations(organization_id,created_at DESC);
CREATE INDEX organization_invitations_email
  ON organization_invitations(lower(email));

CREATE TABLE auth_login_throttle (
  key_hash char(64) PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  window_started timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organization_members_org_status
  ON organization_members(organization_id,status);
CREATE INDEX audit_events_recent ON audit_events(created_at DESC);

ALTER TABLE organization_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped_entitlements ON organization_entitlements
  USING (organization_id::text = current_setting('galeen.tenant_id',true))
  WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));

ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped_invitations ON organization_invitations
  USING (organization_id::text = current_setting('galeen.tenant_id',true))
  WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));
