create table receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_id uuid not null,
  version integer not null,
  schema_version text not null,
  projection jsonb not null,
  canonical_digest bytea not null,
  sealed_at timestamptz not null default now(),
  supersedes_receipt_id uuid,
  constraint receipts_version_valid check (version > 0),
  constraint receipts_schema_version_present check (length(btrim(schema_version)) between 1 and 40),
  constraint receipts_digest_present check (octet_length(canonical_digest) > 0),
  constraint receipts_case_version_unique unique (case_id, version),
  constraint receipts_tenant_id_unique unique (tenant_id, id),
  constraint receipts_case_fk foreign key (tenant_id, case_id)
    references cases(tenant_id, id) on delete cascade,
  constraint receipts_supersedes_fk foreign key (tenant_id, supersedes_receipt_id)
    references receipts(tenant_id, id) on delete restrict
);

create table retention_tombstones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  deletion_reason text not null,
  prior_digest bytea not null,
  purged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint retention_tombstones_resource_type_present check (length(btrim(resource_type)) between 1 and 100),
  constraint retention_tombstones_reason_valid check (deletion_reason in ('retention_expired', 'consent_withdrawn', 'case_closed', 'operator_purge')),
  constraint retention_tombstones_digest_present check (octet_length(prior_digest) > 0),
  constraint retention_tombstones_time_order check (purged_at >= created_at),
  constraint retention_tombstones_resource_unique unique (tenant_id, resource_type, resource_id)
);
