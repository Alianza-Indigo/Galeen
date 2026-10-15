-- GALEEN multi-tenant foundation (repository-controlled migration)
-- Applied to GALEEN production Neon by the repository migration runner.
-- Application sessions must verify tenant membership before setting galeen.tenant_id.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  auth_subject TEXT UNIQUE,
  display_name TEXT,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX app_users_lower_email_uidx ON app_users(lower(email));

CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','member','auditor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended','revoked')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,user_id)
);

CREATE TABLE provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai','anthropic','google','openrouter','custom')),
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'official_api' CHECK (kind IN ('official_api','enterprise_gateway')),
  encrypted_credential BYTEA NOT NULL,
  nonce BYTEA NOT NULL,
  encryption_key_version INTEGER NOT NULL CHECK (encryption_key_version > 0),
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id)
);
CREATE INDEX provider_connections_org_idx ON provider_connections(organization_id,enabled);

CREATE TABLE usage_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('daily','weekly','monthly')),
  max_requests BIGINT CHECK (max_requests IS NULL OR max_requests > 0),
  max_micro_usd BIGINT CHECK (max_micro_usd IS NULL OR max_micro_usd > 0),
  max_effective_tokens BIGINT CHECK (max_effective_tokens IS NULL OR max_effective_tokens > 0),
  enabled BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX usage_policies_tenant_user_idx ON usage_policies(organization_id,user_id);

CREATE TABLE inference_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id),
  connection_id UUID,
  idempotency_key TEXT NOT NULL,
  model_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved','in_progress','settled','released','expired','failed')),
  reserved_micro_usd BIGINT NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0),
  actual_micro_usd BIGINT CHECK (actual_micro_usd IS NULL OR actual_micro_usd >= 0),
  input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  UNIQUE (organization_id,idempotency_key),
  FOREIGN KEY (organization_id,connection_id)
    REFERENCES provider_connections(organization_id,id)
);
CREATE INDEX inference_requests_tenant_time_idx ON inference_requests(organization_id,created_at DESC);
CREATE INDEX inference_requests_open_idx ON inference_requests(organization_id,expires_at)
  WHERE state IN ('reserved','in_progress');

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES app_users(id),
  title TEXT NOT NULL DEFAULT 'Nueva conversación',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id)
);
CREATE INDEX conversations_owner_idx ON conversations(organization_id,owner_user_id,created_at DESC);

CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,conversation_id)
    REFERENCES conversations(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX conversation_messages_tenant_idx ON conversation_messages(organization_id,conversation_id,created_at);

CREATE TABLE platform_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  processor TEXT NOT NULL DEFAULT 'stripe',
  external_customer_id TEXT,
  external_subscription_id TEXT UNIQUE,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'incomplete',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX platform_subscriptions_org_idx ON platform_subscriptions(organization_id);

CREATE TABLE audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_tenant_time_idx ON audit_events(organization_id,created_at DESC);

-- Tenant boundary defense in depth. Database role used by the app MUST NOT
-- own tables or have BYPASSRLS; auth must be independently verified.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped_organizations ON organizations
  USING (id::text = current_setting('galeen.tenant_id',true))
  WITH CHECK (id::text = current_setting('galeen.tenant_id',true));

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped_members ON organization_members
  USING (organization_id::text = current_setting('galeen.tenant_id',true))
  WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));

ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped_connections ON provider_connections
  USING (organization_id::text = current_setting('galeen.tenant_id',true))
  WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));

ALTER TABLE usage_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped_policies ON usage_policies
  USING (organization_id::text = current_setting('galeen.tenant_id',true))
  WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));

ALTER TABLE inference_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped_requests ON inference_requests
  USING (organization_id::text = current_setting('galeen.tenant_id',true))
  WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped_conversations ON conversations
  USING (organization_id::text = current_setting('galeen.tenant_id',true))
  WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));

ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped_messages ON conversation_messages
  USING (organization_id::text = current_setting('galeen.tenant_id',true))
  WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));

ALTER TABLE platform_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped_subscriptions ON platform_subscriptions
  USING (organization_id::text = current_setting('galeen.tenant_id',true))
  WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped_audit ON audit_events
  USING (organization_id::text = current_setting('galeen.tenant_id',true))
  WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));

