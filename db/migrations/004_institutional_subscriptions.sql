-- GALEEN: institution-owned AI subscriptions and individual seat assignments.
-- Provider-managed identities only. No passwords, browser sessions, or OAuth tokens.
CREATE TABLE institutional_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai','anthropic','google','microsoft','other')),
  product_name text NOT NULL CHECK (length(trim(product_name)) BETWEEN 2 AND 120),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 120),
  seat_capacity integer NOT NULL CHECK (seat_capacity BETWEEN 1 AND 100000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  access_mode text NOT NULL DEFAULT 'provider_managed'
    CHECK (access_mode IN ('provider_managed','enterprise_sso','pending_integration')),
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id)
);
CREATE INDEX subscriptions_org_status_idx
  ON institutional_subscriptions(organization_id,status,created_at DESC);

CREATE TABLE subscription_seat_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','revoked')),
  assigned_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (organization_id,subscription_id,user_id),
  FOREIGN KEY (organization_id,subscription_id)
    REFERENCES institutional_subscriptions(organization_id,id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id,user_id)
    REFERENCES organization_members(organization_id,user_id)
);
CREATE INDEX seat_allocations_org_user_idx
  ON subscription_seat_allocations(organization_id,user_id,status);
CREATE INDEX seat_allocations_subscription_idx
  ON subscription_seat_allocations(organization_id,subscription_id,status);

ALTER TABLE institutional_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped_institutional_subscriptions ON institutional_subscriptions
  USING (organization_id::text = current_setting('galeen.tenant_id',true))
  WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));

ALTER TABLE subscription_seat_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped_seat_allocations ON subscription_seat_allocations
  USING (organization_id::text = current_setting('galeen.tenant_id',true))
  WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));
