-- Shared-account scheduling is GALEEN-local. It does NOT authenticate to AI providers.
-- A shared resource must be owned/authorized by its institution; only provider-supported
-- integrations may ever exchange data with a third-party provider.
CREATE TABLE shared_account_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai','anthropic','google','microsoft','other')),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 120),
  account_alias text NOT NULL CHECK (length(trim(account_alias)) BETWEEN 2 AND 120),
  max_assignees integer NOT NULL DEFAULT 5 CHECK (max_assignees BETWEEN 1 AND 1000),
  max_concurrent integer NOT NULL DEFAULT 1 CHECK (max_concurrent BETWEEN 1 AND 50),
  lease_minutes integer NOT NULL DEFAULT 30 CHECK (lease_minutes BETWEEN 5 AND 120),
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('active','paused','retired')),
  connection_status text NOT NULL DEFAULT 'not_connected'
    CHECK (connection_status IN ('not_connected','pending_authorized_connector')),
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id)
);
CREATE INDEX shared_account_resources_org_idx
 ON shared_account_resources (organization_id,status,created_at DESC);

CREATE TABLE shared_account_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 resource_id uuid NOT NULL,
 user_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
 assigned_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 UNIQUE (organization_id,resource_id,user_id),
 FOREIGN KEY (organization_id,resource_id)
   REFERENCES shared_account_resources(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY (organization_id,user_id)
   REFERENCES organization_members(organization_id,user_id)
);
CREATE INDEX shared_account_members_org_user
 ON shared_account_members(organization_id,user_id,status);

CREATE TABLE shared_account_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 resource_id uuid NOT NULL,
 user_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','expired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 ended_at timestamptz,
 FOREIGN KEY (organization_id,resource_id)
   REFERENCES shared_account_resources(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY (organization_id,user_id)
   REFERENCES organization_members(organization_id,user_id)
);
CREATE INDEX shared_account_reservations_current
 ON shared_account_reservations(organization_id,resource_id,status,expires_at);
CREATE INDEX shared_account_reservations_user
 ON shared_account_reservations(organization_id,user_id,status);
CREATE UNIQUE INDEX shared_account_reservations_one_active
 ON shared_account_reservations(organization_id,resource_id,user_id)
 WHERE status='active';

ALTER TABLE shared_account_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_account_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY scoped_shared_account_resources ON shared_account_resources
 USING (organization_id::text = current_setting('galeen.tenant_id',true))
 WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));
CREATE POLICY scoped_shared_account_members ON shared_account_members
 USING (organization_id::text = current_setting('galeen.tenant_id',true))
 WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));
CREATE POLICY scoped_shared_account_reservations ON shared_account_reservations
 USING (organization_id::text = current_setting('galeen.tenant_id',true))
 WITH CHECK (organization_id::text = current_setting('galeen.tenant_id',true));
