create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  display_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint tenants_slug_lowercase check (slug = lower(slug)),
  constraint tenants_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint tenants_display_name_present check (length(btrim(display_name)) between 1 and 120),
  constraint tenants_status_valid check (status in ('active', 'suspended', 'deleted')),
  constraint tenants_slug_unique unique (slug)
);

create table principals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  clerk_user_id text,
  kind text not null,
  display_label text not null,
  email_ciphertext bytea,
  email_lookup_hmac bytea,
  email_key_version integer,
  status text not null default 'invited',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint principals_kind_valid check (kind in ('operator', 'returning_member', 'affected_member')),
  constraint principals_label_present check (length(btrim(display_label)) between 1 and 120),
  constraint principals_status_valid check (status in ('invited', 'active', 'revoked', 'deleted')),
  constraint principals_email_envelope_complete check (
    (email_ciphertext is null and email_lookup_hmac is null and email_key_version is null)
    or (email_ciphertext is not null and email_lookup_hmac is not null and email_key_version > 0)
  ),
  constraint principals_deleted_state_consistent check ((status = 'deleted') = (deleted_at is not null)),
  constraint principals_tenant_id_unique unique (tenant_id, id)
);

create index principals_tenant_kind_status_idx
  on principals (tenant_id, kind, status);
create unique index principals_active_email_kind_unique
  on principals (tenant_id, email_lookup_hmac, kind)
  where email_lookup_hmac is not null and deleted_at is null;
create unique index principals_clerk_user_unique
  on principals (tenant_id, clerk_user_id)
  where clerk_user_id is not null and deleted_at is null;

create table tenant_memberships (
  tenant_id uuid not null references tenants(id) on delete cascade,
  principal_id uuid not null,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key (tenant_id, principal_id),
  constraint tenant_memberships_role_valid check (role in ('owner', 'operator')),
  constraint tenant_memberships_status_valid check (status in ('active', 'suspended', 'revoked')),
  constraint tenant_memberships_principal_fk foreign key (tenant_id, principal_id)
    references principals(tenant_id, id) on delete cascade
);

create table capability_challenges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_id uuid not null,
  principal_id uuid not null,
  purpose text not null,
  token_hash bytea not null,
  boundary_version integer not null,
  expires_at timestamptz not null,
  presented_at timestamptz,
  exchanged_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint capability_challenges_purpose_valid check (
    purpose in ('participant_onboarding', 'contact_choice', 'contact_turn', 'contact_response')
  ),
  constraint capability_challenges_boundary_version_valid check (boundary_version >= 0),
  constraint capability_challenges_expiry_valid check (expires_at > created_at),
  constraint capability_challenges_exchange_order check (exchanged_at is null or exchanged_at >= created_at),
  constraint capability_challenges_revocation_order check (revoked_at is null or revoked_at >= created_at),
  constraint capability_challenges_token_hash_unique unique (token_hash),
  constraint capability_challenges_tenant_id_unique unique (tenant_id, id),
  constraint capability_challenges_principal_fk foreign key (tenant_id, principal_id)
    references principals(tenant_id, id) on delete cascade
);

create unique index capability_challenges_one_active_unique
  on capability_challenges (case_id, principal_id, purpose, boundary_version)
  where exchanged_at is null and revoked_at is null;

create table participant_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_id uuid not null,
  principal_id uuid not null,
  clerk_user_id text not null,
  role text not null,
  allowed_actions text[] not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint participant_grants_role_valid check (role in ('returning_member', 'affected_member')),
  constraint participant_grants_actions_present check (cardinality(allowed_actions) > 0),
  constraint participant_grants_expiry_valid check (expires_at > created_at),
  constraint participant_grants_revocation_order check (revoked_at is null or revoked_at >= created_at),
  constraint participant_grants_tenant_id_unique unique (tenant_id, id),
  constraint participant_grants_principal_fk foreign key (tenant_id, principal_id)
    references principals(tenant_id, id) on delete cascade
);

create index participant_grants_authorization_idx
  on participant_grants (tenant_id, case_id, principal_id, expires_at)
  where revoked_at is null;
