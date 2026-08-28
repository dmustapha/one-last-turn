-- File: db/migrations/0011_mind_send_attempt_constraints.sql
alter table demo_mind_send_attempts
  add column execution_class text,
  add constraint demo_mind_send_attempts_sdk_version_fixed
    check (sdk_version = '0.1.4'),
  add constraint demo_mind_send_attempts_response_boundary_bound
    check (phase <> 'response' or before_boundary_digest is null or
      before_boundary_digest = expected_boundary_digest),
  add constraint demo_mind_send_attempts_acknowledgement_bound
    check (provider_message_id_digest is null or outbound_message_id_digest is null or
      provider_message_id_digest = outbound_message_id_digest),
  add constraint demo_mind_send_attempts_execution_live
    check (execution_class is null or execution_class = 'live_sdk'),
  add constraint demo_mind_send_attempts_recorded_execution_live
    check (state <> 'exchange_recorded' or execution_class = 'live_sdk'),
  add constraint demo_mind_send_attempts_gate_time_ordered
    check (send_acknowledged_at is null or
      (send_gate_opened_at is not null and send_acknowledged_at >= send_gate_opened_at)),
  add constraint demo_mind_send_attempts_exchange_time_ordered
    check (exchange_recorded_at is null or
      (send_gate_opened_at is not null and exchange_recorded_at >= send_gate_opened_at)),
  add constraint demo_mind_send_attempts_safe_code_minimized
    check (safe_code is null or safe_code ~ '^[A-Z0-9_]{1,80}$');
