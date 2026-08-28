create table project_rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_id uuid not null,
  display_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint project_rooms_name_present check (length(btrim(display_name)) between 1 and 160),
  constraint project_rooms_status_valid check (status in ('active', 'archived')),
  constraint project_rooms_case_unique unique (case_id),
  constraint project_rooms_tenant_id_unique unique (tenant_id, id),
  constraint project_rooms_tenant_case_id_unique unique (tenant_id, case_id, id),
  constraint project_rooms_case_fk foreign key (tenant_id, case_id)
    references cases(tenant_id, id) on delete cascade
);

create table room_memberships (
  tenant_id uuid not null references tenants(id) on delete cascade,
  room_id uuid not null,
  principal_id uuid not null,
  role text not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (room_id, principal_id),
  constraint room_memberships_role_valid check (role in ('listener', 'speaker')),
  constraint room_memberships_version_valid check (version > 0),
  constraint room_memberships_tenant_key_unique unique (tenant_id, room_id, principal_id),
  constraint room_memberships_room_fk foreign key (tenant_id, room_id)
    references project_rooms(tenant_id, id) on delete cascade,
  constraint room_memberships_principal_fk foreign key (tenant_id, principal_id)
    references principals(tenant_id, id) on delete cascade
);

alter table access_events
  add constraint access_events_room_fk
  foreign key (tenant_id, case_id, room_id)
  references project_rooms(tenant_id, case_id, id) on delete restrict;
