create table access_workflows (
  case_id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  state text not null default 'draft',
  eligibility_code text,
  effective_at timestamptz,
  terms_version integer,
  authorization_id uuid,
  access_event_id uuid,
  state_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_workflows_state_valid check (
    state in ('draft', 'eligibility_recorded', 'brief_published', 'access_apply_pending', 'access_applied', 'access_apply_failed')
  ),
  constraint access_workflows_eligibility_valid check (eligibility_code is null or eligibility_code in ('eligible', 'ineligible')),
  constraint access_workflows_terms_version_valid check (terms_version is null or terms_version > 0),
  constraint access_workflows_state_version_valid check (state_version > 0),
  constraint access_workflows_evidence_pair check (
    (authorization_id is null) = (access_event_id is null)
  ),
  constraint access_workflows_applied_evidence check (
    state <> 'access_applied' or (authorization_id is not null and access_event_id is not null)
  ),
  constraint access_workflows_tenant_case_unique unique (tenant_id, case_id),
  constraint access_workflows_case_fk foreign key (tenant_id, case_id)
    references cases(tenant_id, id) on delete cascade
);

create table access_authorizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_id uuid not null,
  principal_id uuid not null,
  authorized_role text not null,
  authorized_by uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint access_authorizations_role_valid check (authorized_role in ('listener', 'speaker')),
  constraint access_authorizations_expiry_valid check (expires_at > created_at),
  constraint access_authorizations_revocation_order check (revoked_at is null or revoked_at >= created_at),
  constraint access_authorizations_tenant_case_id_unique unique (tenant_id, case_id, id),
  constraint access_authorizations_evidence_unique unique (
    tenant_id, case_id, id, principal_id, authorized_role
  ),
  constraint access_authorizations_case_fk foreign key (tenant_id, case_id)
    references cases(tenant_id, id) on delete cascade,
  constraint access_authorizations_principal_fk foreign key (tenant_id, principal_id)
    references principals(tenant_id, id) on delete cascade,
  constraint access_authorizations_returning_member_fk foreign key (tenant_id, case_id, principal_id)
    references cases(tenant_id, id, returning_principal_id) on delete cascade,
  constraint access_authorizations_authorizer_fk foreign key (tenant_id, authorized_by)
    references principals(tenant_id, id) on delete restrict
);

create table access_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_id uuid not null,
  room_id uuid not null,
  principal_id uuid not null,
  before_role text not null,
  after_role text not null,
  authorization_id uuid not null,
  operation_id uuid not null,
  applied_at timestamptz not null default now(),
  reversed_at timestamptz,
  constraint access_events_before_role_valid check (before_role in ('listener', 'speaker')),
  constraint access_events_after_role_valid check (after_role in ('listener', 'speaker')),
  constraint access_events_role_changes check (before_role <> after_role),
  constraint access_events_reversal_order check (reversed_at is null or reversed_at >= applied_at),
  constraint access_events_operation_unique unique (operation_id),
  constraint access_events_tenant_case_evidence_unique unique (tenant_id, case_id, id, authorization_id),
  constraint access_events_case_fk foreign key (tenant_id, case_id)
    references cases(tenant_id, id) on delete cascade,
  constraint access_events_principal_fk foreign key (tenant_id, principal_id)
    references principals(tenant_id, id) on delete restrict,
  constraint access_events_authorization_fk foreign key (
    tenant_id, case_id, authorization_id, principal_id, after_role
  ) references access_authorizations(
    tenant_id, case_id, id, principal_id, authorized_role
  ) on delete restrict
);

alter table access_workflows
  add constraint access_workflows_authorization_fk
  foreign key (tenant_id, case_id, authorization_id)
  references access_authorizations(tenant_id, case_id, id) on delete restrict;

alter table access_workflows
  add constraint access_workflows_event_fk
  foreign key (tenant_id, case_id, access_event_id, authorization_id)
  references access_events(tenant_id, case_id, id, authorization_id) on delete restrict;
