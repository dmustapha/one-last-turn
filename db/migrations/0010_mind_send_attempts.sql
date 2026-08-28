-- File: db/migrations/0010_mind_send_attempts.sql
create table if not exists demo_mind_send_attempts (
  id uuid primary key,
  case_id uuid not null references demo_cases(id) on delete restrict,
  phase text not null check (phase in ('strategy', 'response')),
  case_version integer not null check (case_version >= 0),
  state text not null check (state in (
    'prepared', 'pre_send_failed', 'send_outcome_unknown',
    'send_acknowledged', 'exchange_recorded'
  )),
  alias_digest text not null check (alias_digest ~ '^[0-9a-f]{64}$'),
  mind_digest text not null check (mind_digest ~ '^[0-9a-f]{64}$'),
  prompt_digest text not null check (prompt_digest ~ '^[0-9a-f]{64}$'),
  process_nonce_digest text not null check (process_nonce_digest ~ '^[0-9a-f]{64}$'),
  process_instance_digest text not null check (process_instance_digest ~ '^[0-9a-f]{64}$'),
  sdk_version text not null,
  expected_boundary_digest text check (
    expected_boundary_digest is null or expected_boundary_digest ~ '^[0-9a-f]{64}$'
  ),
  before_boundary_digest text check (
    before_boundary_digest is null or before_boundary_digest ~ '^[0-9a-f]{64}$'
  ),
  send_gate_opened_at timestamptz,
  provider_message_id_digest text check (
    provider_message_id_digest is null or provider_message_id_digest ~ '^[0-9a-f]{64}$'
  ),
  send_acknowledged_at timestamptz,
  send_resolution text check (send_resolution is null or send_resolution in ('acknowledged', 'history_recovered')),
  after_boundary_digest text check (
    after_boundary_digest is null or after_boundary_digest ~ '^[0-9a-f]{64}$'
  ),
  outbound_message_id_digest text check (
    outbound_message_id_digest is null or outbound_message_id_digest ~ '^[0-9a-f]{64}$'
  ),
  outbound_content_digest text check (
    outbound_content_digest is null or outbound_content_digest ~ '^[0-9a-f]{64}$'
  ),
  reply_message_id_digest text check (
    reply_message_id_digest is null or reply_message_id_digest ~ '^[0-9a-f]{64}$'
  ),
  reply_content_digest text check (
    reply_content_digest is null or reply_content_digest ~ '^[0-9a-f]{64}$'
  ),
  exchange_evidence_digest text check (
    exchange_evidence_digest is null or exchange_evidence_digest ~ '^[0-9a-f]{64}$'
  ),
  exchange_recorded_at timestamptz,
  safe_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, phase),
  check ((phase = 'response') = (expected_boundary_digest is not null)),
  check ((state in ('prepared', 'pre_send_failed')) = (send_gate_opened_at is null)),
  check (state <> 'send_acknowledged' or
    (provider_message_id_digest is not null and send_acknowledged_at is not null)),
  check (state <> 'exchange_recorded' or
    (before_boundary_digest is not null and send_resolution is not null and
     after_boundary_digest is not null and outbound_message_id_digest is not null and
     outbound_content_digest = prompt_digest and reply_message_id_digest is not null and
     reply_content_digest is not null and exchange_evidence_digest is not null and
     exchange_recorded_at is not null))
);
