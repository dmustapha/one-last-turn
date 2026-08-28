create table idempotency_records (
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_id uuid not null,
  operation text not null,
  idempotency_key text not null,
  request_digest bytea not null,
  status_code integer not null,
  response_body jsonb not null,
  resource_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, operation, idempotency_key),
  constraint idempotency_records_operation_present check (length(btrim(operation)) between 1 and 120),
  constraint idempotency_records_key_present check (length(btrim(idempotency_key)) between 1 and 200),
  constraint idempotency_records_status_code_valid check (status_code between 100 and 599),
  constraint idempotency_records_expiry_valid check (expires_at > created_at),
  constraint idempotency_records_actor_fk foreign key (tenant_id, actor_id)
    references principals(tenant_id, id) on delete cascade
);

create table domain_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  aggregate_type text not null,
  aggregate_id uuid not null,
  aggregate_version integer not null,
  lane text not null,
  event_type text not null,
  actor_id uuid not null,
  request_id uuid not null,
  payload jsonb not null,
  occurred_at timestamptz not null default now(),
  constraint domain_events_aggregate_type_present check (length(btrim(aggregate_type)) between 1 and 100),
  constraint domain_events_event_type_present check (length(btrim(event_type)) between 1 and 120),
  constraint domain_events_lane_matches_aggregate check (
    (aggregate_type = 'access_workflow' and lane = 'access')
    or (aggregate_type = 'contact_workflow' and lane = 'contact')
  ),
  constraint domain_events_aggregate_version_valid check (aggregate_version > 0),
  constraint domain_events_aggregate_sequence_unique unique (aggregate_type, aggregate_id, aggregate_version),
  constraint domain_events_tenant_id_lane_unique unique (tenant_id, id, lane),
  constraint domain_events_actor_fk foreign key (tenant_id, actor_id)
    references principals(tenant_id, id) on delete restrict
);

create table outbox_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_event_id uuid not null,
  source_lane text not null,
  job_type text not null,
  dedupe_key text not null,
  payload jsonb not null,
  status text not null default 'pending',
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  locked_by text,
  locked_until timestamptz,
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint outbox_jobs_source_lane_valid check (source_lane in ('access', 'contact', 'system')),
  constraint outbox_jobs_type_present check (length(btrim(job_type)) between 1 and 120),
  constraint outbox_jobs_dedupe_present check (length(btrim(dedupe_key)) between 1 and 240),
  constraint outbox_jobs_status_valid check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  constraint outbox_jobs_attempts_valid check (attempt_count >= 0 and max_attempts > 0 and attempt_count <= max_attempts),
  constraint outbox_jobs_lock_pair check ((locked_by is null) = (locked_until is null)),
  constraint outbox_jobs_completion_consistent check ((status = 'completed') = (completed_at is not null)),
  constraint outbox_jobs_access_lane_only check (job_type <> 'apply_room_access' or source_lane = 'access'),
  constraint outbox_jobs_tenant_job_dedupe_unique unique (tenant_id, job_type, dedupe_key),
  constraint outbox_jobs_tenant_id_unique unique (tenant_id, id),
  constraint outbox_jobs_event_provenance_fk foreign key (tenant_id, source_event_id, source_lane)
    references domain_events(tenant_id, id, lane) on delete cascade
);

create index outbox_jobs_pending_available_idx
  on outbox_jobs (available_at, id)
  where status = 'pending';

create index outbox_jobs_processing_lock_idx
  on outbox_jobs (locked_until, id)
  where status = 'processing' and locked_until is not null;
