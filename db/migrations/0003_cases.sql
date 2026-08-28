create table cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  fixture_key text not null,
  title text not null,
  status text not null default 'draft',
  returning_principal_id uuid not null,
  affected_principal_id uuid,
  created_by uuid not null,
  retention_until timestamptz not null,
  closed_at timestamptz,
  close_reason text,
  state_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cases_fixture_key_present check (length(btrim(fixture_key)) between 1 and 80),
  constraint cases_title_present check (length(btrim(title)) between 1 and 160),
  constraint cases_status_valid check (status in ('draft', 'active', 'closed', 'purged')),
  constraint cases_state_version_valid check (state_version > 0),
  constraint cases_retention_valid check (retention_until > created_at),
  constraint cases_closure_consistent check (
    (status in ('closed', 'purged') and closed_at is not null and close_reason is not null)
    or (status in ('draft', 'active') and closed_at is null and close_reason is null)
  ),
  constraint cases_fixture_key_unique unique (tenant_id, fixture_key),
  constraint cases_tenant_id_unique unique (tenant_id, id),
  constraint cases_tenant_returning_unique unique (tenant_id, id, returning_principal_id),
  constraint cases_returning_principal_fk foreign key (tenant_id, returning_principal_id)
    references principals(tenant_id, id) on delete restrict,
  constraint cases_affected_principal_fk foreign key (tenant_id, affected_principal_id)
    references principals(tenant_id, id) on delete restrict,
  constraint cases_created_by_fk foreign key (tenant_id, created_by)
    references principals(tenant_id, id) on delete restrict
);

alter table capability_challenges
  add constraint capability_challenges_case_fk
  foreign key (tenant_id, case_id) references cases(tenant_id, id) on delete cascade;

alter table participant_grants
  add constraint participant_grants_case_fk
  foreign key (tenant_id, case_id) references cases(tenant_id, id) on delete cascade;

create table reentry_terms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_id uuid not null,
  version integer not null,
  terms_ciphertext bytea not null,
  terms_digest bytea not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint reentry_terms_version_valid check (version > 0),
  constraint reentry_terms_ciphertext_present check (octet_length(terms_ciphertext) > 0),
  constraint reentry_terms_digest_present check (octet_length(terms_digest) > 0),
  constraint reentry_terms_superseded_order check (superseded_at is null or superseded_at >= created_at),
  constraint reentry_terms_case_version_unique unique (case_id, version),
  constraint reentry_terms_tenant_id_unique unique (tenant_id, id),
  constraint reentry_terms_case_fk foreign key (tenant_id, case_id)
    references cases(tenant_id, id) on delete cascade,
  constraint reentry_terms_created_by_fk foreign key (tenant_id, created_by)
    references principals(tenant_id, id) on delete restrict
);
