--
-- PostgreSQL database dump
--

\restrict iw2W10ZtnosdghloXjegxHUJlCx4lR9Sg19fqhCPA6CBp5lWKOoR6pqX2bJ7hT5

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_authorizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_authorizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    authorized_role text NOT NULL,
    authorized_by uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_authorizations_expiry_valid CHECK ((expires_at > created_at)),
    CONSTRAINT access_authorizations_revocation_order CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at))),
    CONSTRAINT access_authorizations_role_valid CHECK ((authorized_role = ANY (ARRAY['listener'::text, 'speaker'::text])))
);


--
-- Name: access_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid NOT NULL,
    room_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    before_role text NOT NULL,
    after_role text NOT NULL,
    authorization_id uuid NOT NULL,
    operation_id uuid NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    reversed_at timestamp with time zone,
    CONSTRAINT access_events_after_role_valid CHECK ((after_role = ANY (ARRAY['listener'::text, 'speaker'::text]))),
    CONSTRAINT access_events_before_role_valid CHECK ((before_role = ANY (ARRAY['listener'::text, 'speaker'::text]))),
    CONSTRAINT access_events_reversal_order CHECK (((reversed_at IS NULL) OR (reversed_at >= applied_at))),
    CONSTRAINT access_events_role_changes CHECK ((before_role <> after_role))
);


--
-- Name: access_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_workflows (
    case_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    state text DEFAULT 'draft'::text NOT NULL,
    eligibility_code text,
    effective_at timestamp with time zone,
    terms_version integer,
    authorization_id uuid,
    access_event_id uuid,
    state_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_workflows_applied_evidence CHECK (((state <> 'access_applied'::text) OR ((authorization_id IS NOT NULL) AND (access_event_id IS NOT NULL)))),
    CONSTRAINT access_workflows_eligibility_valid CHECK (((eligibility_code IS NULL) OR (eligibility_code = ANY (ARRAY['eligible'::text, 'ineligible'::text])))),
    CONSTRAINT access_workflows_evidence_pair CHECK (((authorization_id IS NULL) = (access_event_id IS NULL))),
    CONSTRAINT access_workflows_state_valid CHECK ((state = ANY (ARRAY['draft'::text, 'eligibility_recorded'::text, 'brief_published'::text, 'access_apply_pending'::text, 'access_applied'::text, 'access_apply_failed'::text]))),
    CONSTRAINT access_workflows_state_version_valid CHECK ((state_version > 0)),
    CONSTRAINT access_workflows_terms_version_valid CHECK (((terms_version IS NULL) OR (terms_version > 0)))
);


--
-- Name: capability_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capability_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    purpose text NOT NULL,
    token_hash bytea NOT NULL,
    boundary_version integer NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    presented_at timestamp with time zone,
    exchanged_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT capability_challenges_boundary_version_valid CHECK ((boundary_version >= 0)),
    CONSTRAINT capability_challenges_exchange_order CHECK (((exchanged_at IS NULL) OR (exchanged_at >= created_at))),
    CONSTRAINT capability_challenges_expiry_valid CHECK ((expires_at > created_at)),
    CONSTRAINT capability_challenges_purpose_valid CHECK ((purpose = ANY (ARRAY['participant_onboarding'::text, 'contact_choice'::text, 'contact_turn'::text, 'contact_response'::text]))),
    CONSTRAINT capability_challenges_revocation_order CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at)))
);


--
-- Name: cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    fixture_key text NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    returning_principal_id uuid NOT NULL,
    affected_principal_id uuid,
    created_by uuid NOT NULL,
    retention_until timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    close_reason text,
    state_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cases_closure_consistent CHECK ((((status = ANY (ARRAY['closed'::text, 'purged'::text])) AND (closed_at IS NOT NULL) AND (close_reason IS NOT NULL)) OR ((status = ANY (ARRAY['draft'::text, 'active'::text])) AND (closed_at IS NULL) AND (close_reason IS NULL)))),
    CONSTRAINT cases_fixture_key_present CHECK (((length(btrim(fixture_key)) >= 1) AND (length(btrim(fixture_key)) <= 80))),
    CONSTRAINT cases_retention_valid CHECK ((retention_until > created_at)),
    CONSTRAINT cases_state_version_valid CHECK ((state_version > 0)),
    CONSTRAINT cases_status_valid CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text, 'purged'::text]))),
    CONSTRAINT cases_title_present CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 160)))
);


--
-- Name: consent_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    scope text NOT NULL,
    decision text NOT NULL,
    disclosure_version text NOT NULL,
    privacy_notice_version text NOT NULL,
    provider text NOT NULL,
    data_categories text[] NOT NULL,
    projection_digest bytea,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_until timestamp with time zone,
    supersedes_event_id uuid,
    CONSTRAINT consent_events_data_categories_present CHECK ((cardinality(data_categories) > 0)),
    CONSTRAINT consent_events_decision_valid CHECK ((decision = ANY (ARRAY['granted'::text, 'declined'::text, 'withdrawn'::text, 'no_contact'::text]))),
    CONSTRAINT consent_events_effective_order CHECK (((effective_until IS NULL) OR (effective_until > recorded_at))),
    CONSTRAINT consent_events_projection_for_processing CHECK (((scope <> 'persistent_processing'::text) OR (decision <> 'granted'::text) OR (projection_digest IS NOT NULL))),
    CONSTRAINT consent_events_scope_valid CHECK ((scope = ANY (ARRAY['email_contact'::text, 'persistent_processing'::text, 'bounded_turn'::text])))
);


--
-- Name: contact_boundaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_boundaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid NOT NULL,
    version integer NOT NULL,
    source_ciphertext bytea NOT NULL,
    projection_ciphertext bytea NOT NULL,
    projection_digest bytea NOT NULL,
    approved_by uuid NOT NULL,
    consent_event_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    purged_at timestamp with time zone,
    CONSTRAINT contact_boundaries_digest_present CHECK ((octet_length(projection_digest) > 0)),
    CONSTRAINT contact_boundaries_projection_present CHECK ((octet_length(projection_ciphertext) > 0)),
    CONSTRAINT contact_boundaries_purge_order CHECK (((purged_at IS NULL) OR (purged_at >= created_at))),
    CONSTRAINT contact_boundaries_source_present CHECK ((octet_length(source_ciphertext) > 0)),
    CONSTRAINT contact_boundaries_version_valid CHECK ((version > 0))
);


--
-- Name: contact_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    logical_invitation_id uuid NOT NULL,
    case_id uuid NOT NULL,
    recipient_principal_id uuid NOT NULL,
    purpose text NOT NULL,
    capability_challenge_id uuid NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    delivery_deadline timestamp with time zone NOT NULL,
    verified_session_ttl interval NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    human_verified_at timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT contact_invitations_delivery_deadline_valid CHECK ((delivery_deadline > created_at)),
    CONSTRAINT contact_invitations_purpose_valid CHECK ((purpose = ANY (ARRAY['contact_choice'::text, 'contact_turn'::text, 'contact_response'::text]))),
    CONSTRAINT contact_invitations_revocation_order CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at))),
    CONSTRAINT contact_invitations_session_ttl_valid CHECK ((verified_session_ttl > '00:00:00'::interval)),
    CONSTRAINT contact_invitations_status_valid CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'delivered'::text, 'verified'::text, 'failed'::text, 'expired'::text, 'revoked'::text]))),
    CONSTRAINT contact_invitations_verification_order CHECK (((human_verified_at IS NULL) OR (human_verified_at >= created_at)))
);


--
-- Name: contact_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid NOT NULL,
    sender_principal_id uuid NOT NULL,
    attempt_number integer NOT NULL,
    content_ciphertext bytea NOT NULL,
    content_digest bytea NOT NULL,
    boundary_version integer NOT NULL,
    consent_event_id uuid NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    purged_at timestamp with time zone,
    CONSTRAINT contact_messages_attempt_valid CHECK ((attempt_number = ANY (ARRAY[1, 2]))),
    CONSTRAINT contact_messages_boundary_version_valid CHECK ((boundary_version > 0)),
    CONSTRAINT contact_messages_content_present CHECK ((octet_length(content_ciphertext) > 0)),
    CONSTRAINT contact_messages_digest_present CHECK ((octet_length(content_digest) > 0)),
    CONSTRAINT contact_messages_purge_order CHECK (((purged_at IS NULL) OR (purged_at >= submitted_at)))
);


--
-- Name: contact_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_observations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid NOT NULL,
    message_id uuid NOT NULL,
    mind_exchange_id uuid NOT NULL,
    result text NOT NULL,
    reason_code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contact_observations_reason_present CHECK (((length(btrim(reason_code)) >= 1) AND (length(btrim(reason_code)) <= 100))),
    CONSTRAINT contact_observations_result_valid CHECK ((result = ANY (ARRAY['matches_scope'::text, 'request_revision'::text, 'abstain'::text])))
);


--
-- Name: contact_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_workflows (
    case_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    consent_state text DEFAULT 'not_asked'::text NOT NULL,
    turn_state text DEFAULT 'not_invited'::text NOT NULL,
    boundary_version integer DEFAULT 0 NOT NULL,
    message_attempt_count integer DEFAULT 0 NOT NULL,
    latest_observation_id uuid,
    state_version integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contact_workflows_attempt_count_valid CHECK (((message_attempt_count >= 0) AND (message_attempt_count <= 2))),
    CONSTRAINT contact_workflows_boundary_version_valid CHECK ((boundary_version >= 0)),
    CONSTRAINT contact_workflows_consent_state_valid CHECK ((consent_state = ANY (ARRAY['not_asked'::text, 'granted'::text, 'declined'::text, 'withdrawn'::text, 'no_contact'::text]))),
    CONSTRAINT contact_workflows_state_version_valid CHECK ((state_version >= 0)),
    CONSTRAINT contact_workflows_turn_state_valid CHECK ((turn_state = ANY (ARRAY['not_invited'::text, 'invited'::text, 'boundary_saved'::text, 'evaluating'::text, 'revise'::text, 'abstained'::text, 'room_open'::text, 'completed'::text, 'aborted'::text, 'reported'::text, 'expired'::text])))
);


--
-- Name: delivery_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    invitation_id uuid NOT NULL,
    provider text NOT NULL,
    provider_message_id text,
    template_version text NOT NULL,
    recipient_hmac bytea NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_failure_code text,
    sent_at timestamp with time zone,
    provider_delivered_at timestamp with time zone,
    bounced_at timestamp with time zone,
    CONSTRAINT delivery_messages_attempt_count_valid CHECK (((attempt_count >= 0) AND (attempt_count <= 12))),
    CONSTRAINT delivery_messages_provider_valid CHECK ((provider = 'resend'::text)),
    CONSTRAINT delivery_messages_status_valid CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'delivered'::text, 'bounced'::text, 'failed'::text]))),
    CONSTRAINT delivery_messages_terminal_exclusive CHECK (((provider_delivered_at IS NULL) OR (bounced_at IS NULL)))
);


--
-- Name: domain_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.domain_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    aggregate_version integer NOT NULL,
    lane text NOT NULL,
    event_type text NOT NULL,
    actor_id uuid NOT NULL,
    request_id uuid NOT NULL,
    payload jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT domain_events_aggregate_type_present CHECK (((length(btrim(aggregate_type)) >= 1) AND (length(btrim(aggregate_type)) <= 100))),
    CONSTRAINT domain_events_aggregate_version_valid CHECK ((aggregate_version > 0)),
    CONSTRAINT domain_events_event_type_present CHECK (((length(btrim(event_type)) >= 1) AND (length(btrim(event_type)) <= 120))),
    CONSTRAINT domain_events_lane_matches_aggregate CHECK ((((aggregate_type = 'access_workflow'::text) AND (lane = 'access'::text)) OR ((aggregate_type = 'contact_workflow'::text) AND (lane = 'contact'::text))))
);


--
-- Name: idempotency_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_records (
    tenant_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    operation text NOT NULL,
    idempotency_key text NOT NULL,
    request_digest bytea NOT NULL,
    status_code integer NOT NULL,
    response_body jsonb NOT NULL,
    resource_id uuid,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT idempotency_records_expiry_valid CHECK ((expires_at > created_at)),
    CONSTRAINT idempotency_records_key_present CHECK (((length(btrim(idempotency_key)) >= 1) AND (length(btrim(idempotency_key)) <= 200))),
    CONSTRAINT idempotency_records_operation_present CHECK (((length(btrim(operation)) >= 1) AND (length(btrim(operation)) <= 120))),
    CONSTRAINT idempotency_records_status_code_valid CHECK (((status_code >= 100) AND (status_code <= 599)))
);


--
-- Name: mind_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mind_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid NOT NULL,
    lane text DEFAULT 'contact'::text NOT NULL,
    stable_alias text NOT NULL,
    mind_id text NOT NULL,
    consent_event_id uuid NOT NULL,
    latest_fingerprint bytea,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    CONSTRAINT mind_conversations_alias_present CHECK (((length(btrim(stable_alias)) >= 1) AND (length(btrim(stable_alias)) <= 160))),
    CONSTRAINT mind_conversations_closure_consistent CHECK (((status = 'active'::text) = (closed_at IS NULL))),
    CONSTRAINT mind_conversations_lane_contact_only CHECK ((lane = 'contact'::text)),
    CONSTRAINT mind_conversations_mind_id_present CHECK (((length(btrim(mind_id)) >= 1) AND (length(btrim(mind_id)) <= 200))),
    CONSTRAINT mind_conversations_status_valid CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text, 'failed'::text])))
);


--
-- Name: mind_exchanges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mind_exchanges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    operation_id uuid NOT NULL,
    purpose text NOT NULL,
    input_digest bytea NOT NULL,
    message_id text,
    reply_id text,
    before_fingerprint bytea,
    after_fingerprint bytea,
    decision text,
    reason_code text,
    schema_version text NOT NULL,
    cognition_before bytea,
    cognition_after bytea,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    failure_code text,
    CONSTRAINT mind_exchanges_completion_order CHECK (((completed_at IS NULL) OR (completed_at >= started_at))),
    CONSTRAINT mind_exchanges_decision_valid CHECK (((decision IS NULL) OR (decision = ANY (ARRAY['open'::text, 'revise'::text, 'abstain'::text])))),
    CONSTRAINT mind_exchanges_purpose_valid CHECK ((purpose = ANY (ARRAY['open'::text, 'revision'::text, 'history_verification'::text]))),
    CONSTRAINT mind_exchanges_terminal_consistent CHECK (((completed_at IS NULL) OR (((reply_id IS NOT NULL) AND (decision IS NOT NULL)) OR (failure_code IS NOT NULL))))
);


--
-- Name: outbox_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    source_event_id uuid NOT NULL,
    source_lane text NOT NULL,
    job_type text NOT NULL,
    dedupe_key text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 8 NOT NULL,
    locked_by text,
    locked_until timestamp with time zone,
    last_error_code text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outbox_jobs_access_lane_only CHECK (((job_type <> 'apply_room_access'::text) OR (source_lane = 'access'::text))),
    CONSTRAINT outbox_jobs_attempts_valid CHECK (((attempt_count >= 0) AND (max_attempts > 0) AND (attempt_count <= max_attempts))),
    CONSTRAINT outbox_jobs_completion_consistent CHECK (((status = 'completed'::text) = (completed_at IS NOT NULL))),
    CONSTRAINT outbox_jobs_dedupe_present CHECK (((length(btrim(dedupe_key)) >= 1) AND (length(btrim(dedupe_key)) <= 240))),
    CONSTRAINT outbox_jobs_lock_pair CHECK (((locked_by IS NULL) = (locked_until IS NULL))),
    CONSTRAINT outbox_jobs_source_lane_valid CHECK ((source_lane = ANY (ARRAY['access'::text, 'contact'::text, 'system'::text]))),
    CONSTRAINT outbox_jobs_status_valid CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))),
    CONSTRAINT outbox_jobs_type_present CHECK (((length(btrim(job_type)) >= 1) AND (length(btrim(job_type)) <= 120)))
);


--
-- Name: participant_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participant_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    clerk_user_id text NOT NULL,
    role text NOT NULL,
    allowed_actions text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT participant_grants_actions_present CHECK ((cardinality(allowed_actions) > 0)),
    CONSTRAINT participant_grants_expiry_valid CHECK ((expires_at > created_at)),
    CONSTRAINT participant_grants_revocation_order CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at))),
    CONSTRAINT participant_grants_role_valid CHECK ((role = ANY (ARRAY['returning_member'::text, 'affected_member'::text])))
);


--
-- Name: principals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.principals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    clerk_user_id text,
    kind text NOT NULL,
    display_label text NOT NULL,
    email_ciphertext bytea,
    email_lookup_hmac bytea,
    email_key_version integer,
    status text DEFAULT 'invited'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT principals_deleted_state_consistent CHECK (((status = 'deleted'::text) = (deleted_at IS NOT NULL))),
    CONSTRAINT principals_email_envelope_complete CHECK ((((email_ciphertext IS NULL) AND (email_lookup_hmac IS NULL) AND (email_key_version IS NULL)) OR ((email_ciphertext IS NOT NULL) AND (email_lookup_hmac IS NOT NULL) AND (email_key_version > 0)))),
    CONSTRAINT principals_kind_valid CHECK ((kind = ANY (ARRAY['operator'::text, 'returning_member'::text, 'affected_member'::text]))),
    CONSTRAINT principals_label_present CHECK (((length(btrim(display_label)) >= 1) AND (length(btrim(display_label)) <= 120))),
    CONSTRAINT principals_status_valid CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'revoked'::text, 'deleted'::text])))
);


--
-- Name: project_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid NOT NULL,
    display_name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_rooms_name_present CHECK (((length(btrim(display_name)) >= 1) AND (length(btrim(display_name)) <= 160))),
    CONSTRAINT project_rooms_status_valid CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);


--
-- Name: provider_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    provider_event_id text NOT NULL,
    event_type text NOT NULL,
    payload_digest bytea NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    failure_code text,
    CONSTRAINT provider_webhook_events_processing_order CHECK (((processed_at IS NULL) OR (processed_at >= received_at))),
    CONSTRAINT provider_webhook_events_provider_valid CHECK ((provider = 'resend'::text)),
    CONSTRAINT provider_webhook_events_type_present CHECK (((length(btrim(event_type)) >= 1) AND (length(btrim(event_type)) <= 120)))
);


--
-- Name: receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid NOT NULL,
    version integer NOT NULL,
    schema_version text NOT NULL,
    projection jsonb NOT NULL,
    canonical_digest bytea NOT NULL,
    sealed_at timestamp with time zone DEFAULT now() NOT NULL,
    supersedes_receipt_id uuid,
    CONSTRAINT receipts_digest_present CHECK ((octet_length(canonical_digest) > 0)),
    CONSTRAINT receipts_schema_version_present CHECK (((length(btrim(schema_version)) >= 1) AND (length(btrim(schema_version)) <= 40))),
    CONSTRAINT receipts_version_valid CHECK ((version > 0))
);


--
-- Name: reentry_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reentry_terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid NOT NULL,
    version integer NOT NULL,
    terms_ciphertext bytea NOT NULL,
    terms_digest bytea NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    superseded_at timestamp with time zone,
    CONSTRAINT reentry_terms_ciphertext_present CHECK ((octet_length(terms_ciphertext) > 0)),
    CONSTRAINT reentry_terms_digest_present CHECK ((octet_length(terms_digest) > 0)),
    CONSTRAINT reentry_terms_superseded_order CHECK (((superseded_at IS NULL) OR (superseded_at >= created_at))),
    CONSTRAINT reentry_terms_version_valid CHECK ((version > 0))
);


--
-- Name: retention_tombstones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retention_tombstones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid NOT NULL,
    deletion_reason text NOT NULL,
    prior_digest bytea NOT NULL,
    purged_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT retention_tombstones_digest_present CHECK ((octet_length(prior_digest) > 0)),
    CONSTRAINT retention_tombstones_reason_valid CHECK ((deletion_reason = ANY (ARRAY['retention_expired'::text, 'consent_withdrawn'::text, 'case_closed'::text, 'operator_purge'::text]))),
    CONSTRAINT retention_tombstones_resource_type_present CHECK (((length(btrim(resource_type)) >= 1) AND (length(btrim(resource_type)) <= 100))),
    CONSTRAINT retention_tombstones_time_order CHECK ((purged_at >= created_at))
);


--
-- Name: room_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room_memberships (
    tenant_id uuid NOT NULL,
    room_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    role text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT room_memberships_role_valid CHECK ((role = ANY (ARRAY['listener'::text, 'speaker'::text]))),
    CONSTRAINT room_memberships_version_valid CHECK ((version > 0))
);


--
-- Name: tenant_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_memberships (
    tenant_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    role text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_memberships_role_valid CHECK ((role = ANY (ARRAY['owner'::text, 'operator'::text]))),
    CONSTRAINT tenant_memberships_status_valid CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'revoked'::text])))
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    display_name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenants_display_name_present CHECK (((length(btrim(display_name)) >= 1) AND (length(btrim(display_name)) <= 120))),
    CONSTRAINT tenants_slug_format CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text)),
    CONSTRAINT tenants_slug_lowercase CHECK ((slug = lower(slug))),
    CONSTRAINT tenants_status_valid CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'deleted'::text])))
);


--
-- Name: turn_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turn_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    response_kind text NOT NULL,
    content_ciphertext bytea,
    content_digest bytea,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    purged_at timestamp with time zone,
    CONSTRAINT turn_responses_content_consistent CHECK ((((response_kind = 'message'::text) AND (content_ciphertext IS NOT NULL) AND (content_digest IS NOT NULL)) OR ((response_kind = ANY (ARRAY['close'::text, 'report'::text])) AND (content_ciphertext IS NULL) AND (content_digest IS NULL)))),
    CONSTRAINT turn_responses_kind_valid CHECK ((response_kind = ANY (ARRAY['message'::text, 'close'::text, 'report'::text]))),
    CONSTRAINT turn_responses_purge_order CHECK (((purged_at IS NULL) OR (purged_at >= submitted_at)))
);


--
-- Name: access_authorizations access_authorizations_evidence_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_authorizations
    ADD CONSTRAINT access_authorizations_evidence_unique UNIQUE (tenant_id, case_id, id, principal_id, authorized_role);


--
-- Name: access_authorizations access_authorizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_authorizations
    ADD CONSTRAINT access_authorizations_pkey PRIMARY KEY (id);


--
-- Name: access_authorizations access_authorizations_tenant_case_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_authorizations
    ADD CONSTRAINT access_authorizations_tenant_case_id_unique UNIQUE (tenant_id, case_id, id);


--
-- Name: access_events access_events_operation_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_events
    ADD CONSTRAINT access_events_operation_unique UNIQUE (operation_id);


--
-- Name: access_events access_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_events
    ADD CONSTRAINT access_events_pkey PRIMARY KEY (id);


--
-- Name: access_events access_events_tenant_case_evidence_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_events
    ADD CONSTRAINT access_events_tenant_case_evidence_unique UNIQUE (tenant_id, case_id, id, authorization_id);


--
-- Name: access_workflows access_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_workflows
    ADD CONSTRAINT access_workflows_pkey PRIMARY KEY (case_id);


--
-- Name: access_workflows access_workflows_tenant_case_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_workflows
    ADD CONSTRAINT access_workflows_tenant_case_unique UNIQUE (tenant_id, case_id);


--
-- Name: capability_challenges capability_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_challenges
    ADD CONSTRAINT capability_challenges_pkey PRIMARY KEY (id);


--
-- Name: capability_challenges capability_challenges_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_challenges
    ADD CONSTRAINT capability_challenges_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: capability_challenges capability_challenges_token_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_challenges
    ADD CONSTRAINT capability_challenges_token_hash_unique UNIQUE (token_hash);


--
-- Name: cases cases_fixture_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_fixture_key_unique UNIQUE (tenant_id, fixture_key);


--
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (id);


--
-- Name: cases cases_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: cases cases_tenant_returning_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_tenant_returning_unique UNIQUE (tenant_id, id, returning_principal_id);


--
-- Name: consent_events consent_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_events
    ADD CONSTRAINT consent_events_pkey PRIMARY KEY (id);


--
-- Name: consent_events consent_events_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_events
    ADD CONSTRAINT consent_events_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: contact_boundaries contact_boundaries_case_version_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_boundaries
    ADD CONSTRAINT contact_boundaries_case_version_unique UNIQUE (case_id, version);


--
-- Name: contact_boundaries contact_boundaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_boundaries
    ADD CONSTRAINT contact_boundaries_pkey PRIMARY KEY (id);


--
-- Name: contact_boundaries contact_boundaries_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_boundaries
    ADD CONSTRAINT contact_boundaries_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: contact_invitations contact_invitations_logical_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_invitations
    ADD CONSTRAINT contact_invitations_logical_id_unique UNIQUE (tenant_id, logical_invitation_id);


--
-- Name: contact_invitations contact_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_invitations
    ADD CONSTRAINT contact_invitations_pkey PRIMARY KEY (id);


--
-- Name: contact_invitations contact_invitations_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_invitations
    ADD CONSTRAINT contact_invitations_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: contact_messages contact_messages_attempt_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_attempt_unique UNIQUE (case_id, sender_principal_id, attempt_number);


--
-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);


--
-- Name: contact_messages contact_messages_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: contact_observations contact_observations_message_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_observations
    ADD CONSTRAINT contact_observations_message_unique UNIQUE (message_id);


--
-- Name: contact_observations contact_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_observations
    ADD CONSTRAINT contact_observations_pkey PRIMARY KEY (id);


--
-- Name: contact_observations contact_observations_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_observations
    ADD CONSTRAINT contact_observations_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: contact_workflows contact_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_workflows
    ADD CONSTRAINT contact_workflows_pkey PRIMARY KEY (case_id);


--
-- Name: contact_workflows contact_workflows_tenant_case_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_workflows
    ADD CONSTRAINT contact_workflows_tenant_case_unique UNIQUE (tenant_id, case_id);


--
-- Name: delivery_messages delivery_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_messages
    ADD CONSTRAINT delivery_messages_pkey PRIMARY KEY (id);


--
-- Name: delivery_messages delivery_messages_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_messages
    ADD CONSTRAINT delivery_messages_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: domain_events domain_events_aggregate_sequence_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_events
    ADD CONSTRAINT domain_events_aggregate_sequence_unique UNIQUE (aggregate_type, aggregate_id, aggregate_version);


--
-- Name: domain_events domain_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_events
    ADD CONSTRAINT domain_events_pkey PRIMARY KEY (id);


--
-- Name: domain_events domain_events_tenant_id_lane_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_events
    ADD CONSTRAINT domain_events_tenant_id_lane_unique UNIQUE (tenant_id, id, lane);


--
-- Name: idempotency_records idempotency_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_records
    ADD CONSTRAINT idempotency_records_pkey PRIMARY KEY (actor_id, operation, idempotency_key);


--
-- Name: mind_conversations mind_conversations_alias_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_conversations
    ADD CONSTRAINT mind_conversations_alias_unique UNIQUE (stable_alias);


--
-- Name: mind_conversations mind_conversations_case_lane_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_conversations
    ADD CONSTRAINT mind_conversations_case_lane_unique UNIQUE (case_id, lane);


--
-- Name: mind_conversations mind_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_conversations
    ADD CONSTRAINT mind_conversations_pkey PRIMARY KEY (id);


--
-- Name: mind_conversations mind_conversations_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_conversations
    ADD CONSTRAINT mind_conversations_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: mind_exchanges mind_exchanges_operation_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_exchanges
    ADD CONSTRAINT mind_exchanges_operation_unique UNIQUE (operation_id);


--
-- Name: mind_exchanges mind_exchanges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_exchanges
    ADD CONSTRAINT mind_exchanges_pkey PRIMARY KEY (id);


--
-- Name: mind_exchanges mind_exchanges_reply_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_exchanges
    ADD CONSTRAINT mind_exchanges_reply_unique UNIQUE (reply_id);


--
-- Name: mind_exchanges mind_exchanges_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_exchanges
    ADD CONSTRAINT mind_exchanges_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: outbox_jobs outbox_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_jobs
    ADD CONSTRAINT outbox_jobs_pkey PRIMARY KEY (id);


--
-- Name: outbox_jobs outbox_jobs_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_jobs
    ADD CONSTRAINT outbox_jobs_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: outbox_jobs outbox_jobs_tenant_job_dedupe_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_jobs
    ADD CONSTRAINT outbox_jobs_tenant_job_dedupe_unique UNIQUE (tenant_id, job_type, dedupe_key);


--
-- Name: participant_grants participant_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_grants
    ADD CONSTRAINT participant_grants_pkey PRIMARY KEY (id);


--
-- Name: participant_grants participant_grants_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_grants
    ADD CONSTRAINT participant_grants_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: principals principals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.principals
    ADD CONSTRAINT principals_pkey PRIMARY KEY (id);


--
-- Name: principals principals_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.principals
    ADD CONSTRAINT principals_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: project_rooms project_rooms_case_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_rooms
    ADD CONSTRAINT project_rooms_case_unique UNIQUE (case_id);


--
-- Name: project_rooms project_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_rooms
    ADD CONSTRAINT project_rooms_pkey PRIMARY KEY (id);


--
-- Name: project_rooms project_rooms_tenant_case_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_rooms
    ADD CONSTRAINT project_rooms_tenant_case_id_unique UNIQUE (tenant_id, case_id, id);


--
-- Name: project_rooms project_rooms_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_rooms
    ADD CONSTRAINT project_rooms_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: provider_webhook_events provider_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_webhook_events
    ADD CONSTRAINT provider_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: provider_webhook_events provider_webhook_events_provider_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_webhook_events
    ADD CONSTRAINT provider_webhook_events_provider_id_unique UNIQUE (provider, provider_event_id);


--
-- Name: provider_webhook_events provider_webhook_events_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_webhook_events
    ADD CONSTRAINT provider_webhook_events_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: receipts receipts_case_version_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_case_version_unique UNIQUE (case_id, version);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: reentry_terms reentry_terms_case_version_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reentry_terms
    ADD CONSTRAINT reentry_terms_case_version_unique UNIQUE (case_id, version);


--
-- Name: reentry_terms reentry_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reentry_terms
    ADD CONSTRAINT reentry_terms_pkey PRIMARY KEY (id);


--
-- Name: reentry_terms reentry_terms_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reentry_terms
    ADD CONSTRAINT reentry_terms_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: retention_tombstones retention_tombstones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_tombstones
    ADD CONSTRAINT retention_tombstones_pkey PRIMARY KEY (id);


--
-- Name: retention_tombstones retention_tombstones_resource_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_tombstones
    ADD CONSTRAINT retention_tombstones_resource_unique UNIQUE (tenant_id, resource_type, resource_id);


--
-- Name: room_memberships room_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_memberships
    ADD CONSTRAINT room_memberships_pkey PRIMARY KEY (room_id, principal_id);


--
-- Name: room_memberships room_memberships_tenant_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_memberships
    ADD CONSTRAINT room_memberships_tenant_key_unique UNIQUE (tenant_id, room_id, principal_id);


--
-- Name: tenant_memberships tenant_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_pkey PRIMARY KEY (tenant_id, principal_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_unique UNIQUE (slug);


--
-- Name: turn_responses turn_responses_actor_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turn_responses
    ADD CONSTRAINT turn_responses_actor_unique UNIQUE (case_id, principal_id);


--
-- Name: turn_responses turn_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turn_responses
    ADD CONSTRAINT turn_responses_pkey PRIMARY KEY (id);


--
-- Name: turn_responses turn_responses_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turn_responses
    ADD CONSTRAINT turn_responses_tenant_id_unique UNIQUE (tenant_id, id);


--
-- Name: capability_challenges_one_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX capability_challenges_one_active_unique ON public.capability_challenges USING btree (case_id, principal_id, purpose, boundary_version) WHERE ((exchanged_at IS NULL) AND (revoked_at IS NULL));


--
-- Name: delivery_messages_provider_message_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX delivery_messages_provider_message_unique ON public.delivery_messages USING btree (provider, provider_message_id) WHERE (provider_message_id IS NOT NULL);


--
-- Name: outbox_jobs_pending_available_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbox_jobs_pending_available_idx ON public.outbox_jobs USING btree (available_at, id) WHERE (status = 'pending'::text);


--
-- Name: outbox_jobs_processing_lock_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbox_jobs_processing_lock_idx ON public.outbox_jobs USING btree (locked_until, id) WHERE ((status = 'processing'::text) AND (locked_until IS NOT NULL));


--
-- Name: participant_grants_authorization_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX participant_grants_authorization_idx ON public.participant_grants USING btree (tenant_id, case_id, principal_id, expires_at) WHERE (revoked_at IS NULL);


--
-- Name: principals_active_email_kind_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX principals_active_email_kind_unique ON public.principals USING btree (tenant_id, email_lookup_hmac, kind) WHERE ((email_lookup_hmac IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: principals_clerk_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX principals_clerk_user_unique ON public.principals USING btree (tenant_id, clerk_user_id) WHERE ((clerk_user_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: principals_tenant_kind_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX principals_tenant_kind_status_idx ON public.principals USING btree (tenant_id, kind, status);


--
-- Name: access_authorizations access_authorizations_authorizer_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_authorizations
    ADD CONSTRAINT access_authorizations_authorizer_fk FOREIGN KEY (tenant_id, authorized_by) REFERENCES public.principals(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: access_authorizations access_authorizations_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_authorizations
    ADD CONSTRAINT access_authorizations_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: access_authorizations access_authorizations_principal_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_authorizations
    ADD CONSTRAINT access_authorizations_principal_fk FOREIGN KEY (tenant_id, principal_id) REFERENCES public.principals(tenant_id, id) ON DELETE CASCADE;


--
-- Name: access_authorizations access_authorizations_returning_member_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_authorizations
    ADD CONSTRAINT access_authorizations_returning_member_fk FOREIGN KEY (tenant_id, case_id, principal_id) REFERENCES public.cases(tenant_id, id, returning_principal_id) ON DELETE CASCADE;


--
-- Name: access_authorizations access_authorizations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_authorizations
    ADD CONSTRAINT access_authorizations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: access_events access_events_authorization_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_events
    ADD CONSTRAINT access_events_authorization_fk FOREIGN KEY (tenant_id, case_id, authorization_id, principal_id, after_role) REFERENCES public.access_authorizations(tenant_id, case_id, id, principal_id, authorized_role) ON DELETE RESTRICT;


--
-- Name: access_events access_events_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_events
    ADD CONSTRAINT access_events_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: access_events access_events_principal_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_events
    ADD CONSTRAINT access_events_principal_fk FOREIGN KEY (tenant_id, principal_id) REFERENCES public.principals(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: access_events access_events_room_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_events
    ADD CONSTRAINT access_events_room_fk FOREIGN KEY (tenant_id, case_id, room_id) REFERENCES public.project_rooms(tenant_id, case_id, id) ON DELETE RESTRICT;


--
-- Name: access_events access_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_events
    ADD CONSTRAINT access_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: access_workflows access_workflows_authorization_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_workflows
    ADD CONSTRAINT access_workflows_authorization_fk FOREIGN KEY (tenant_id, case_id, authorization_id) REFERENCES public.access_authorizations(tenant_id, case_id, id) ON DELETE RESTRICT;


--
-- Name: access_workflows access_workflows_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_workflows
    ADD CONSTRAINT access_workflows_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: access_workflows access_workflows_event_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_workflows
    ADD CONSTRAINT access_workflows_event_fk FOREIGN KEY (tenant_id, case_id, access_event_id, authorization_id) REFERENCES public.access_events(tenant_id, case_id, id, authorization_id) ON DELETE RESTRICT;


--
-- Name: access_workflows access_workflows_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_workflows
    ADD CONSTRAINT access_workflows_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: capability_challenges capability_challenges_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_challenges
    ADD CONSTRAINT capability_challenges_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: capability_challenges capability_challenges_principal_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_challenges
    ADD CONSTRAINT capability_challenges_principal_fk FOREIGN KEY (tenant_id, principal_id) REFERENCES public.principals(tenant_id, id) ON DELETE CASCADE;


--
-- Name: capability_challenges capability_challenges_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_challenges
    ADD CONSTRAINT capability_challenges_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: cases cases_affected_principal_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_affected_principal_fk FOREIGN KEY (tenant_id, affected_principal_id) REFERENCES public.principals(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: cases cases_created_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES public.principals(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: cases cases_returning_principal_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_returning_principal_fk FOREIGN KEY (tenant_id, returning_principal_id) REFERENCES public.principals(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: cases cases_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;


--
-- Name: consent_events consent_events_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_events
    ADD CONSTRAINT consent_events_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: consent_events consent_events_principal_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_events
    ADD CONSTRAINT consent_events_principal_fk FOREIGN KEY (tenant_id, principal_id) REFERENCES public.principals(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: consent_events consent_events_supersedes_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_events
    ADD CONSTRAINT consent_events_supersedes_fk FOREIGN KEY (tenant_id, supersedes_event_id) REFERENCES public.consent_events(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: consent_events consent_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_events
    ADD CONSTRAINT consent_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contact_boundaries contact_boundaries_approved_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_boundaries
    ADD CONSTRAINT contact_boundaries_approved_by_fk FOREIGN KEY (tenant_id, approved_by) REFERENCES public.principals(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: contact_boundaries contact_boundaries_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_boundaries
    ADD CONSTRAINT contact_boundaries_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: contact_boundaries contact_boundaries_consent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_boundaries
    ADD CONSTRAINT contact_boundaries_consent_fk FOREIGN KEY (tenant_id, consent_event_id) REFERENCES public.consent_events(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: contact_boundaries contact_boundaries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_boundaries
    ADD CONSTRAINT contact_boundaries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contact_invitations contact_invitations_capability_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_invitations
    ADD CONSTRAINT contact_invitations_capability_fk FOREIGN KEY (tenant_id, capability_challenge_id) REFERENCES public.capability_challenges(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: contact_invitations contact_invitations_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_invitations
    ADD CONSTRAINT contact_invitations_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: contact_invitations contact_invitations_recipient_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_invitations
    ADD CONSTRAINT contact_invitations_recipient_fk FOREIGN KEY (tenant_id, recipient_principal_id) REFERENCES public.principals(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: contact_invitations contact_invitations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_invitations
    ADD CONSTRAINT contact_invitations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contact_messages contact_messages_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: contact_messages contact_messages_consent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_consent_fk FOREIGN KEY (tenant_id, consent_event_id) REFERENCES public.consent_events(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: contact_messages contact_messages_sender_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_sender_fk FOREIGN KEY (tenant_id, sender_principal_id) REFERENCES public.principals(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: contact_messages contact_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contact_observations contact_observations_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_observations
    ADD CONSTRAINT contact_observations_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: contact_observations contact_observations_exchange_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_observations
    ADD CONSTRAINT contact_observations_exchange_fk FOREIGN KEY (tenant_id, mind_exchange_id) REFERENCES public.mind_exchanges(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: contact_observations contact_observations_message_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_observations
    ADD CONSTRAINT contact_observations_message_fk FOREIGN KEY (tenant_id, message_id) REFERENCES public.contact_messages(tenant_id, id) ON DELETE CASCADE;


--
-- Name: contact_observations contact_observations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_observations
    ADD CONSTRAINT contact_observations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contact_workflows contact_workflows_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_workflows
    ADD CONSTRAINT contact_workflows_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: contact_workflows contact_workflows_observation_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_workflows
    ADD CONSTRAINT contact_workflows_observation_fk FOREIGN KEY (tenant_id, latest_observation_id) REFERENCES public.contact_observations(tenant_id, id) ON DELETE SET NULL (latest_observation_id);


--
-- Name: contact_workflows contact_workflows_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_workflows
    ADD CONSTRAINT contact_workflows_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: delivery_messages delivery_messages_invitation_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_messages
    ADD CONSTRAINT delivery_messages_invitation_fk FOREIGN KEY (tenant_id, invitation_id) REFERENCES public.contact_invitations(tenant_id, id) ON DELETE CASCADE;


--
-- Name: delivery_messages delivery_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_messages
    ADD CONSTRAINT delivery_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: domain_events domain_events_actor_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_events
    ADD CONSTRAINT domain_events_actor_fk FOREIGN KEY (tenant_id, actor_id) REFERENCES public.principals(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: domain_events domain_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_events
    ADD CONSTRAINT domain_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: idempotency_records idempotency_records_actor_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_records
    ADD CONSTRAINT idempotency_records_actor_fk FOREIGN KEY (tenant_id, actor_id) REFERENCES public.principals(tenant_id, id) ON DELETE CASCADE;


--
-- Name: idempotency_records idempotency_records_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_records
    ADD CONSTRAINT idempotency_records_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: mind_conversations mind_conversations_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_conversations
    ADD CONSTRAINT mind_conversations_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: mind_conversations mind_conversations_consent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_conversations
    ADD CONSTRAINT mind_conversations_consent_fk FOREIGN KEY (tenant_id, consent_event_id) REFERENCES public.consent_events(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: mind_conversations mind_conversations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_conversations
    ADD CONSTRAINT mind_conversations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: mind_exchanges mind_exchanges_conversation_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_exchanges
    ADD CONSTRAINT mind_exchanges_conversation_fk FOREIGN KEY (tenant_id, conversation_id) REFERENCES public.mind_conversations(tenant_id, id) ON DELETE CASCADE;


--
-- Name: mind_exchanges mind_exchanges_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_exchanges
    ADD CONSTRAINT mind_exchanges_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: outbox_jobs outbox_jobs_event_provenance_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_jobs
    ADD CONSTRAINT outbox_jobs_event_provenance_fk FOREIGN KEY (tenant_id, source_event_id, source_lane) REFERENCES public.domain_events(tenant_id, id, lane) ON DELETE CASCADE;


--
-- Name: outbox_jobs outbox_jobs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_jobs
    ADD CONSTRAINT outbox_jobs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: participant_grants participant_grants_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_grants
    ADD CONSTRAINT participant_grants_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: participant_grants participant_grants_principal_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_grants
    ADD CONSTRAINT participant_grants_principal_fk FOREIGN KEY (tenant_id, principal_id) REFERENCES public.principals(tenant_id, id) ON DELETE CASCADE;


--
-- Name: participant_grants participant_grants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_grants
    ADD CONSTRAINT participant_grants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: principals principals_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.principals
    ADD CONSTRAINT principals_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;


--
-- Name: project_rooms project_rooms_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_rooms
    ADD CONSTRAINT project_rooms_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: project_rooms project_rooms_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_rooms
    ADD CONSTRAINT project_rooms_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: provider_webhook_events provider_webhook_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_webhook_events
    ADD CONSTRAINT provider_webhook_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: receipts receipts_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: receipts receipts_supersedes_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_supersedes_fk FOREIGN KEY (tenant_id, supersedes_receipt_id) REFERENCES public.receipts(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: receipts receipts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: reentry_terms reentry_terms_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reentry_terms
    ADD CONSTRAINT reentry_terms_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: reentry_terms reentry_terms_created_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reentry_terms
    ADD CONSTRAINT reentry_terms_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES public.principals(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: reentry_terms reentry_terms_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reentry_terms
    ADD CONSTRAINT reentry_terms_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: retention_tombstones retention_tombstones_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_tombstones
    ADD CONSTRAINT retention_tombstones_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: room_memberships room_memberships_principal_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_memberships
    ADD CONSTRAINT room_memberships_principal_fk FOREIGN KEY (tenant_id, principal_id) REFERENCES public.principals(tenant_id, id) ON DELETE CASCADE;


--
-- Name: room_memberships room_memberships_room_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_memberships
    ADD CONSTRAINT room_memberships_room_fk FOREIGN KEY (tenant_id, room_id) REFERENCES public.project_rooms(tenant_id, id) ON DELETE CASCADE;


--
-- Name: room_memberships room_memberships_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_memberships
    ADD CONSTRAINT room_memberships_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_memberships tenant_memberships_principal_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_principal_fk FOREIGN KEY (tenant_id, principal_id) REFERENCES public.principals(tenant_id, id) ON DELETE CASCADE;


--
-- Name: tenant_memberships tenant_memberships_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: turn_responses turn_responses_case_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turn_responses
    ADD CONSTRAINT turn_responses_case_fk FOREIGN KEY (tenant_id, case_id) REFERENCES public.cases(tenant_id, id) ON DELETE CASCADE;


--
-- Name: turn_responses turn_responses_principal_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turn_responses
    ADD CONSTRAINT turn_responses_principal_fk FOREIGN KEY (tenant_id, principal_id) REFERENCES public.principals(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: turn_responses turn_responses_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turn_responses
    ADD CONSTRAINT turn_responses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict iw2W10ZtnosdghloXjegxHUJlCx4lR9Sg19fqhCPA6CBp5lWKOoR6pqX2bJ7hT5

