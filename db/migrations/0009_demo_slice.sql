-- File: db/migrations/0009_demo_slice.sql
create table if not exists demo_cases (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  state text not null check (state in ('draft','authorized','strategy_running','strategy_ready','returned','response_running','response_ready','closed','failed')),
  state_version integer not null default 0 check (state_version >= 0),
  authorized_topic text,
  authorized_at timestamptz,
  stable_alias text,
  mind_digest text check (mind_digest is null or mind_digest ~ '^[0-9a-f]{64}$'),
  strategy_artifact jsonb,
  strategy_digest text check (strategy_digest is null or strategy_digest ~ '^[0-9a-f]{64}$'),
  strategy_boundary jsonb,
  strategy_provenance jsonb,
  strategy_process_nonce uuid,
  strategy_ready_at timestamptz,
  return_message text,
  response_artifact jsonb,
  response_digest text check (response_digest is null or response_digest ~ '^[0-9a-f]{64}$'),
  response_boundary jsonb,
  response_provenance jsonb,
  response_process_nonce uuid,
  response_ready_at timestamptz,
  receipt_digest text check (receipt_digest is null or receipt_digest ~ '^[0-9a-f]{64}$'),
  receipt_evidence_classes text[],
  turn_consumed_at timestamptz,
  failure_stage text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((authorized_topic is null) = (authorized_at is null)),
  check ((strategy_artifact is null) = (strategy_digest is null)),
  check ((strategy_artifact is null) = (strategy_boundary is null)),
  check ((strategy_artifact is null) = (strategy_provenance is null)),
  check (strategy_provenance is null or strategy_process_nonce is not null),
  check ((response_artifact is null) = (response_digest is null)),
  check ((response_artifact is null) = (response_boundary is null)),
  check ((response_artifact is null) = (response_provenance is null)),
  check (response_provenance is null or response_process_nonce is not null),
  check ((failure_stage is null) = (failure_code is null)),
  check ((state = 'failed') = (failure_code is not null)),
  check ((state = 'closed') = (turn_consumed_at is not null)),
  check ((state = 'closed') = (receipt_digest is not null)),
  check ((receipt_digest is null) = (receipt_evidence_classes is null))
);

create table if not exists demo_case_events (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  case_id uuid not null references demo_cases(id) on delete cascade,
  aggregate_version integer not null,
  event_type text not null,
  redacted_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (case_id, aggregate_version, event_type)
);

create index if not exists demo_case_events_case_sequence_idx
  on demo_case_events(case_id, sequence asc);
