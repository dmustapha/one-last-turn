create table contact_workflows (
  case_id uuid primary key references cases(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  consent_state text not null default 'not_asked',
  turn_state text not null default 'not_invited',
  boundary_version integer not null default 0,
  message_attempt_count integer not null default 0,
  latest_observation_id uuid,
  state_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_workflows_consent_state_valid check (
    consent_state in ('not_asked', 'granted', 'declined', 'withdrawn', 'no_contact')
  ),
  constraint contact_workflows_turn_state_valid check (
    turn_state in ('not_invited', 'invited', 'boundary_saved', 'evaluating', 'revise', 'abstained', 'room_open', 'completed', 'aborted', 'reported', 'expired')
  ),
  constraint contact_workflows_boundary_version_valid check (boundary_version >= 0),
  constraint contact_workflows_attempt_count_valid check (message_attempt_count between 0 and 2),
  constraint contact_workflows_state_version_valid check (state_version >= 0)
);

create table consent_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  principal_id uuid not null references principals(id) on delete restrict,
  scope text not null,
  decision text not null,
  disclosure_version text not null,
  privacy_notice_version text not null,
  provider text not null,
  data_categories text[] not null,
  projection_digest bytea,
  recorded_at timestamptz not null default now(),
  effective_until timestamptz,
  supersedes_event_id uuid references consent_events(id) on delete restrict,
  constraint consent_events_scope_valid check (scope in ('email_contact', 'persistent_processing', 'bounded_turn')),
  constraint consent_events_decision_valid check (decision in ('granted', 'declined', 'withdrawn', 'no_contact')),
  constraint consent_events_data_categories_present check (cardinality(data_categories) > 0),
  constraint consent_events_effective_order check (effective_until is null or effective_until > recorded_at),
  constraint consent_events_projection_for_processing check (
    scope <> 'persistent_processing' or decision <> 'granted' or projection_digest is not null
  )
);

create table contact_boundaries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  version integer not null,
  source_ciphertext bytea not null,
  projection_ciphertext bytea not null,
  projection_digest bytea not null,
  approved_by uuid not null references principals(id) on delete restrict,
  consent_event_id uuid not null references consent_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  purged_at timestamptz,
  constraint contact_boundaries_version_valid check (version > 0),
  constraint contact_boundaries_source_present check (octet_length(source_ciphertext) > 0),
  constraint contact_boundaries_projection_present check (octet_length(projection_ciphertext) > 0),
  constraint contact_boundaries_digest_present check (octet_length(projection_digest) > 0),
  constraint contact_boundaries_purge_order check (purged_at is null or purged_at >= created_at),
  constraint contact_boundaries_case_version_unique unique (case_id, version)
);

create table mind_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  lane text not null default 'contact',
  stable_alias text not null,
  mind_id text not null,
  consent_event_id uuid not null references consent_events(id) on delete restrict,
  latest_fingerprint bytea,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint mind_conversations_lane_contact_only check (lane = 'contact'),
  constraint mind_conversations_alias_present check (length(btrim(stable_alias)) between 1 and 160),
  constraint mind_conversations_mind_id_present check (length(btrim(mind_id)) between 1 and 200),
  constraint mind_conversations_status_valid check (status in ('active', 'closed', 'failed')),
  constraint mind_conversations_closure_consistent check ((status = 'active') = (closed_at is null)),
  constraint mind_conversations_alias_unique unique (stable_alias),
  constraint mind_conversations_case_lane_unique unique (case_id, lane)
);

create table mind_exchanges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references mind_conversations(id) on delete cascade,
  operation_id uuid not null,
  purpose text not null,
  input_digest bytea not null,
  message_id text,
  reply_id text,
  before_fingerprint bytea,
  after_fingerprint bytea,
  decision text,
  reason_code text,
  schema_version text not null,
  cognition_before bytea,
  cognition_after bytea,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_code text,
  constraint mind_exchanges_purpose_valid check (purpose in ('open', 'revision', 'history_verification')),
  constraint mind_exchanges_decision_valid check (decision is null or decision in ('open', 'revise', 'abstain')),
  constraint mind_exchanges_completion_order check (completed_at is null or completed_at >= started_at),
  constraint mind_exchanges_terminal_consistent check (
    completed_at is null or ((reply_id is not null and decision is not null) or failure_code is not null)
  ),
  constraint mind_exchanges_operation_unique unique (operation_id),
  constraint mind_exchanges_reply_unique unique (reply_id)
);

create table contact_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  logical_invitation_id uuid not null,
  case_id uuid not null references cases(id) on delete cascade,
  recipient_principal_id uuid not null references principals(id) on delete restrict,
  purpose text not null,
  capability_challenge_id uuid not null references capability_challenges(id) on delete restrict,
  status text not null default 'queued',
  delivery_deadline timestamptz not null,
  verified_session_ttl interval not null,
  created_at timestamptz not null default now(),
  human_verified_at timestamptz,
  revoked_at timestamptz,
  constraint contact_invitations_purpose_valid check (purpose in ('contact_choice', 'contact_turn', 'contact_response')),
  constraint contact_invitations_status_valid check (status in ('queued', 'sent', 'delivered', 'verified', 'failed', 'expired', 'revoked')),
  constraint contact_invitations_delivery_deadline_valid check (delivery_deadline > created_at),
  constraint contact_invitations_session_ttl_valid check (verified_session_ttl > interval '0 seconds'),
  constraint contact_invitations_verification_order check (human_verified_at is null or human_verified_at >= created_at),
  constraint contact_invitations_revocation_order check (revoked_at is null or revoked_at >= created_at),
  constraint contact_invitations_logical_id_unique unique (tenant_id, logical_invitation_id)
);

create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  sender_principal_id uuid not null references principals(id) on delete restrict,
  attempt_number integer not null,
  content_ciphertext bytea not null,
  content_digest bytea not null,
  boundary_version integer not null,
  consent_event_id uuid not null references consent_events(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  purged_at timestamptz,
  constraint contact_messages_attempt_valid check (attempt_number in (1, 2)),
  constraint contact_messages_content_present check (octet_length(content_ciphertext) > 0),
  constraint contact_messages_digest_present check (octet_length(content_digest) > 0),
  constraint contact_messages_boundary_version_valid check (boundary_version > 0),
  constraint contact_messages_purge_order check (purged_at is null or purged_at >= submitted_at),
  constraint contact_messages_attempt_unique unique (case_id, sender_principal_id, attempt_number)
);

create table contact_observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  message_id uuid not null references contact_messages(id) on delete cascade,
  mind_exchange_id uuid not null references mind_exchanges(id) on delete restrict,
  result text not null,
  reason_code text not null,
  created_at timestamptz not null default now(),
  constraint contact_observations_result_valid check (result in ('matches_scope', 'request_revision', 'abstain')),
  constraint contact_observations_reason_present check (length(btrim(reason_code)) between 1 and 100),
  constraint contact_observations_message_unique unique (message_id)
);

alter table contact_workflows
  add constraint contact_workflows_observation_fk
  foreign key (latest_observation_id) references contact_observations(id) on delete set null;

create table turn_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  principal_id uuid not null references principals(id) on delete restrict,
  response_kind text not null,
  content_ciphertext bytea,
  content_digest bytea,
  submitted_at timestamptz not null default now(),
  purged_at timestamptz,
  constraint turn_responses_kind_valid check (response_kind in ('message', 'close', 'report')),
  constraint turn_responses_content_consistent check (
    (response_kind = 'message' and content_ciphertext is not null and content_digest is not null)
    or (response_kind in ('close', 'report') and content_ciphertext is null and content_digest is null)
  ),
  constraint turn_responses_purge_order check (purged_at is null or purged_at >= submitted_at),
  constraint turn_responses_actor_unique unique (case_id, principal_id)
);

create table delivery_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  invitation_id uuid not null references contact_invitations(id) on delete cascade,
  provider text not null,
  provider_message_id text,
  template_version text not null,
  recipient_hmac bytea not null,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  last_failure_code text,
  sent_at timestamptz,
  provider_delivered_at timestamptz,
  bounced_at timestamptz,
  constraint delivery_messages_provider_valid check (provider in ('resend')),
  constraint delivery_messages_status_valid check (status in ('queued', 'sent', 'delivered', 'bounced', 'failed')),
  constraint delivery_messages_attempt_count_valid check (attempt_count between 0 and 12),
  constraint delivery_messages_terminal_exclusive check (provider_delivered_at is null or bounced_at is null)
);

create unique index delivery_messages_provider_message_unique
  on delivery_messages (provider, provider_message_id)
  where provider_message_id is not null;

create table provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload_digest bytea not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  failure_code text,
  constraint provider_webhook_events_provider_valid check (provider in ('resend')),
  constraint provider_webhook_events_type_present check (length(btrim(event_type)) between 1 and 120),
  constraint provider_webhook_events_processing_order check (processed_at is null or processed_at >= received_at),
  constraint provider_webhook_events_provider_id_unique unique (provider, provider_event_id)
);

alter table contact_workflows
  add constraint contact_workflows_tenant_case_unique unique (tenant_id, case_id);
alter table consent_events
  add constraint consent_events_tenant_id_unique unique (tenant_id, id);
alter table contact_boundaries
  add constraint contact_boundaries_tenant_id_unique unique (tenant_id, id);
alter table mind_conversations
  add constraint mind_conversations_tenant_id_unique unique (tenant_id, id);
alter table mind_exchanges
  add constraint mind_exchanges_tenant_id_unique unique (tenant_id, id);
alter table contact_invitations
  add constraint contact_invitations_tenant_id_unique unique (tenant_id, id);
alter table contact_messages
  add constraint contact_messages_tenant_id_unique unique (tenant_id, id);
alter table contact_observations
  add constraint contact_observations_tenant_id_unique unique (tenant_id, id);
alter table turn_responses
  add constraint turn_responses_tenant_id_unique unique (tenant_id, id);
alter table delivery_messages
  add constraint delivery_messages_tenant_id_unique unique (tenant_id, id);
alter table provider_webhook_events
  add constraint provider_webhook_events_tenant_id_unique unique (tenant_id, id);

alter table contact_workflows
  drop constraint contact_workflows_case_id_fkey,
  add constraint contact_workflows_case_fk foreign key (tenant_id, case_id)
    references cases(tenant_id, id) on delete cascade;

alter table consent_events
  drop constraint consent_events_case_id_fkey,
  drop constraint consent_events_principal_id_fkey,
  drop constraint consent_events_supersedes_event_id_fkey,
  add constraint consent_events_case_fk foreign key (tenant_id, case_id)
    references cases(tenant_id, id) on delete cascade,
  add constraint consent_events_principal_fk foreign key (tenant_id, principal_id)
    references principals(tenant_id, id) on delete restrict,
  add constraint consent_events_supersedes_fk foreign key (tenant_id, supersedes_event_id)
    references consent_events(tenant_id, id) on delete restrict;

alter table contact_boundaries
  drop constraint contact_boundaries_case_id_fkey,
  drop constraint contact_boundaries_approved_by_fkey,
  drop constraint contact_boundaries_consent_event_id_fkey,
  add constraint contact_boundaries_case_fk foreign key (tenant_id, case_id)
    references cases(tenant_id, id) on delete cascade,
  add constraint contact_boundaries_approved_by_fk foreign key (tenant_id, approved_by)
    references principals(tenant_id, id) on delete restrict,
  add constraint contact_boundaries_consent_fk foreign key (tenant_id, consent_event_id)
    references consent_events(tenant_id, id) on delete restrict;

alter table mind_conversations
  drop constraint mind_conversations_case_id_fkey,
  drop constraint mind_conversations_consent_event_id_fkey,
  add constraint mind_conversations_case_fk foreign key (tenant_id, case_id)
    references cases(tenant_id, id) on delete cascade,
  add constraint mind_conversations_consent_fk foreign key (tenant_id, consent_event_id)
    references consent_events(tenant_id, id) on delete restrict;

alter table mind_exchanges
  drop constraint mind_exchanges_conversation_id_fkey,
  add constraint mind_exchanges_conversation_fk foreign key (tenant_id, conversation_id)
    references mind_conversations(tenant_id, id) on delete cascade;

alter table contact_invitations
  drop constraint contact_invitations_case_id_fkey,
  drop constraint contact_invitations_recipient_principal_id_fkey,
  drop constraint contact_invitations_capability_challenge_id_fkey,
  add constraint contact_invitations_case_fk foreign key (tenant_id, case_id)
    references cases(tenant_id, id) on delete cascade,
  add constraint contact_invitations_recipient_fk foreign key (tenant_id, recipient_principal_id)
    references principals(tenant_id, id) on delete restrict,
  add constraint contact_invitations_capability_fk foreign key (tenant_id, capability_challenge_id)
    references capability_challenges(tenant_id, id) on delete restrict;

alter table contact_messages
  drop constraint contact_messages_case_id_fkey,
  drop constraint contact_messages_sender_principal_id_fkey,
  drop constraint contact_messages_consent_event_id_fkey,
  add constraint contact_messages_case_fk foreign key (tenant_id, case_id)
    references cases(tenant_id, id) on delete cascade,
  add constraint contact_messages_sender_fk foreign key (tenant_id, sender_principal_id)
    references principals(tenant_id, id) on delete restrict,
  add constraint contact_messages_consent_fk foreign key (tenant_id, consent_event_id)
    references consent_events(tenant_id, id) on delete restrict;

alter table contact_observations
  drop constraint contact_observations_case_id_fkey,
  drop constraint contact_observations_message_id_fkey,
  drop constraint contact_observations_mind_exchange_id_fkey,
  add constraint contact_observations_case_fk foreign key (tenant_id, case_id)
    references cases(tenant_id, id) on delete cascade,
  add constraint contact_observations_message_fk foreign key (tenant_id, message_id)
    references contact_messages(tenant_id, id) on delete cascade,
  add constraint contact_observations_exchange_fk foreign key (tenant_id, mind_exchange_id)
    references mind_exchanges(tenant_id, id) on delete restrict;

alter table contact_workflows
  drop constraint contact_workflows_observation_fk,
  add constraint contact_workflows_observation_fk foreign key (tenant_id, latest_observation_id)
    references contact_observations(tenant_id, id) on delete set null (latest_observation_id);

alter table turn_responses
  drop constraint turn_responses_case_id_fkey,
  drop constraint turn_responses_principal_id_fkey,
  add constraint turn_responses_case_fk foreign key (tenant_id, case_id)
    references cases(tenant_id, id) on delete cascade,
  add constraint turn_responses_principal_fk foreign key (tenant_id, principal_id)
    references principals(tenant_id, id) on delete restrict;

alter table delivery_messages
  drop constraint delivery_messages_invitation_id_fkey,
  add constraint delivery_messages_invitation_fk foreign key (tenant_id, invitation_id)
    references contact_invitations(tenant_id, id) on delete cascade;
