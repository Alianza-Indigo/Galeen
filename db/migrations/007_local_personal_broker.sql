-- GALEEN: local execution broker. Existing app_users, memberships, resources and reservations are reused.
-- Original migrations are unchanged. No provider credentials are stored here.
CREATE TABLE galeen_local_pairings (
 organization_id uuid NOT NULL,
 resource_id uuid NOT NULL,
 code_digest char(64) NOT NULL,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY (organization_id,resource_id),
 FOREIGN KEY (organization_id,resource_id) REFERENCES shared_account_resources(organization_id,id) ON DELETE CASCADE
);
CREATE TABLE galeen_local_agents (
 organization_id uuid NOT NULL,
 resource_id uuid NOT NULL,
 token_digest char(64) NOT NULL UNIQUE,
 agent_name text NOT NULL CHECK (length(agent_name) BETWEEN 1 AND 100),
 last_seen_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,resource_id),
 FOREIGN KEY (organization_id,resource_id) REFERENCES shared_account_resources(organization_id,id) ON DELETE CASCADE
);
CREATE TABLE galeen_local_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 resource_id uuid NOT NULL,
 reservation_id uuid NOT NULL REFERENCES shared_account_reservations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider IN ('openai','anthropic')),
 model_id text,
 prompt text NOT NULL CHECK(length(prompt) BETWEEN 1 AND 12000),
 result text,
 error text,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','completed','failed','canceled')),
 run_id uuid,
 attempts integer NOT NULL DEFAULT 0,
 lease_expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 FOREIGN KEY (organization_id,resource_id) REFERENCES shared_account_resources(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY (organization_id,user_id) REFERENCES organization_members(organization_id,user_id)
);
CREATE INDEX galeen_local_jobs_dispatch ON galeen_local_jobs(organization_id,resource_id,state,created_at);
CREATE INDEX galeen_local_jobs_user ON galeen_local_jobs(organization_id,user_id,created_at DESC);
CREATE INDEX galeen_local_jobs_running ON galeen_local_jobs(organization_id,resource_id,lease_expires_at) WHERE state='running';
ALTER TABLE galeen_local_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE galeen_local_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE galeen_local_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY local_pair_tenant ON galeen_local_pairings
 USING (organization_id::text=current_setting('galeen.tenant_id',true))
 WITH CHECK (organization_id::text=current_setting('galeen.tenant_id',true));
CREATE POLICY local_agents_tenant ON galeen_local_agents
 USING (organization_id::text=current_setting('galeen.tenant_id',true))
 WITH CHECK (organization_id::text=current_setting('galeen.tenant_id',true));
CREATE POLICY local_jobs_tenant ON galeen_local_jobs
 USING (organization_id::text=current_setting('galeen.tenant_id',true))
 WITH CHECK (organization_id::text=current_setting('galeen.tenant_id',true));
