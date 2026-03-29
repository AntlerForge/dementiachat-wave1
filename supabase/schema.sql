-- Wave 1 schema for Care Chat.
-- Trust Levels 1-3 only. Levels 4-5 stay deferred.

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('dad', 'caregiver')),
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  member_role text not null check (member_role in ('dad', 'caregiver_admin', 'caregiver')),
  created_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  client_msg_id uuid unique,
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid references profiles(id),
  sender_role text not null check (sender_role in ('dad', 'caregiver', 'system')),
  content text,
  image_url text,
  image_size text check (image_size in ('small', 'medium', 'large')),
  hidden_for_dad boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_created
  on messages(conversation_id, created_at desc);

create table if not exists message_revisions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  edited_by uuid not null references profiles(id),
  previous_content text,
  next_content text,
  hidden_for_dad boolean not null default false,
  reason text default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_message_revisions_message
  on message_revisions(message_id, created_at desc);

create table if not exists dad_ui_profiles (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references conversations(id) on delete cascade,
  font_scale integer not null default 22 check (font_scale between 12 and 34),
  ui_font_scale integer not null default 16 check (ui_font_scale between 12 and 24),
  theme text not null default 'high-contrast' check (theme in ('high-contrast', 'warm', 'dark')),
  bubble_width integer not null default 80 check (bubble_width between 60 and 95),
  image_default_size text not null default 'medium' check (image_default_size in ('small', 'medium', 'large')),
  alerts_enabled boolean not null default true,
  role_lock_enabled boolean not null default false,
  draft_font_scale integer check (draft_font_scale between 12 and 34),
  draft_ui_font_scale integer check (draft_ui_font_scale between 12 and 24),
  draft_theme text check (draft_theme in ('high-contrast', 'warm', 'dark')),
  draft_bubble_width integer check (draft_bubble_width between 60 and 95),
  draft_image_default_size text check (draft_image_default_size in ('small', 'medium', 'large')),
  draft_alerts_enabled boolean,
  draft_role_lock_enabled boolean,
  draft_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Migration safety for existing deployments: allow smaller dad font values.
alter table dad_ui_profiles
  drop constraint if exists dad_ui_profiles_font_scale_check;
alter table dad_ui_profiles
  add constraint dad_ui_profiles_font_scale_check check (font_scale between 12 and 34);
alter table dad_ui_profiles
  drop constraint if exists dad_ui_profiles_draft_font_scale_check;
alter table dad_ui_profiles
  add constraint dad_ui_profiles_draft_font_scale_check check (
    draft_font_scale is null or draft_font_scale between 12 and 34
  );
alter table dad_ui_profiles
  add column if not exists ui_font_scale integer not null default 16;
alter table dad_ui_profiles
  add column if not exists draft_ui_font_scale integer;
alter table dad_ui_profiles
  add column if not exists alerts_enabled boolean not null default true;
alter table dad_ui_profiles
  add column if not exists draft_alerts_enabled boolean;
alter table dad_ui_profiles
  drop constraint if exists dad_ui_profiles_ui_font_scale_check;
alter table dad_ui_profiles
  add constraint dad_ui_profiles_ui_font_scale_check check (ui_font_scale between 12 and 24);
alter table dad_ui_profiles
  drop constraint if exists dad_ui_profiles_draft_ui_font_scale_check;
alter table dad_ui_profiles
  add constraint dad_ui_profiles_draft_ui_font_scale_check check (
    draft_ui_font_scale is null or draft_ui_font_scale between 12 and 24
  );

create table if not exists trust_rules (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references conversations(id) on delete cascade,
  trust_level integer not null default 1 check (trust_level between 1 and 3),
  delayed_auto_seconds integer not null default 180 check (delayed_auto_seconds between 30 and 900),
  level3_checklist_confirmed boolean not null default false,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists delayed_outbox (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  source_message_id uuid references messages(id) on delete cascade,
  idempotency_key text not null unique,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'sent', 'cancelled', 'failed')),
  claimed_at timestamptz,
  sent_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_delayed_outbox_pending_schedule
  on delayed_outbox(status, scheduled_for);

create table if not exists activity_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  actor_id uuid references profiles(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  platform text not null default 'web',
  user_agent text not null default '',
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_push_subscriptions_conversation
  on push_subscriptions(conversation_id, is_active);

create table if not exists notification_jobs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  recipient_user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  next_retry_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id, recipient_user_id)
);

create index if not exists idx_notification_jobs_pending
  on notification_jobs(status, next_retry_at, created_at);

-- Auto profile bootstrap from auth metadata.
create or replace function ensure_profile(
  p_role text default 'caregiver',
  p_display_name text default ''
)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile profiles;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_role := case when p_role in ('dad', 'caregiver') then p_role else 'caregiver' end;

  insert into profiles (id, role, display_name)
  values (auth.uid(), v_role, coalesce(p_display_name, ''))
  on conflict (id) do update
    set role = case
          when profiles.role in ('dad', 'caregiver') then profiles.role
          else excluded.role
        end,
        display_name = case
          when excluded.display_name = '' then profiles.display_name
          else excluded.display_name
        end
  returning * into v_profile;

  return v_profile;
end;
$$;

-- Create or join a conversation for the current user.
create or replace function create_or_join_conversation(
  p_conversation_id uuid default null,
  p_member_role text default 'caregiver_admin'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_role := case
    when p_member_role in ('dad', 'caregiver', 'caregiver_admin') then p_member_role
    else 'caregiver_admin'
  end;

  if p_conversation_id is null then
    insert into conversations (created_by)
    values (auth.uid())
    returning id into v_conversation_id;
  else
    v_conversation_id := p_conversation_id;
    if not exists (select 1 from conversations c where c.id = v_conversation_id) then
      insert into conversations (id, created_by)
      values (v_conversation_id, auth.uid());
    end if;
  end if;

  insert into conversation_members (conversation_id, user_id, member_role)
  values (v_conversation_id, auth.uid(), v_role)
  on conflict (conversation_id, user_id) do update
    set member_role = excluded.member_role;

  return v_conversation_id;
end;
$$;

create or replace function list_my_conversations()
returns table (
  conversation_id uuid,
  member_role text
)
language sql
security definer
set search_path = public
as $$
  select cm.conversation_id, cm.member_role
  from conversation_members cm
  where cm.user_id = auth.uid()
  order by cm.created_at asc;
$$;

-- Revision-safe edit/hide operation.
create or replace function caregiver_edit_message(
  p_message_id uuid,
  p_next_content text,
  p_hide_for_dad boolean default false,
  p_reason text default ''
)
returns messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg messages;
begin
  select * into v_msg
  from messages m
  where m.id = p_message_id
  for update;

  if not found then
    raise exception 'Message not found';
  end if;

  if not is_caregiver_admin(v_msg.conversation_id) then
    raise exception 'Not authorized';
  end if;

  insert into message_revisions (message_id, edited_by, previous_content, next_content, hidden_for_dad, reason)
  values (
    v_msg.id,
    auth.uid(),
    v_msg.content,
    p_next_content,
    p_hide_for_dad,
    coalesce(p_reason, '')
  );

  update messages
  set content = p_next_content,
      hidden_for_dad = p_hide_for_dad
  where id = v_msg.id
  returning * into v_msg;

  return v_msg;
end;
$$;

create or replace function caregiver_delete_message(
  p_message_id uuid,
  p_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg messages;
begin
  select * into v_msg
  from messages m
  where m.id = p_message_id
  for update;

  if not found then
    raise exception 'Message not found';
  end if;

  if not is_caregiver_admin(v_msg.conversation_id) then
    raise exception 'Not authorized';
  end if;

  insert into activity_events (conversation_id, actor_id, event_type, payload)
  values (
    v_msg.conversation_id,
    auth.uid(),
    'message_deleted',
    jsonb_build_object(
      'message_id', v_msg.id,
      'sender_role', v_msg.sender_role,
      'reason', coalesce(p_reason, ''),
      'had_image', (v_msg.image_url is not null)
    )
  );

  delete from messages
  where id = v_msg.id;

  return v_msg.id;
end;
$$;

create or replace function caregiver_purge_inline_images(
  p_conversation_id uuid,
  p_placeholder_text text default '[Image removed to stabilize chat]'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if not is_caregiver_admin(p_conversation_id) then
    raise exception 'Not authorized';
  end if;

  update messages
  set
    image_url = null,
    content = case
      when coalesce(content, '') = '' then left(coalesce(p_placeholder_text, '[Image removed]'), 500)
      else content
    end,
    updated_at = now()
  where conversation_id = p_conversation_id
    and image_url like 'data:%';

  get diagnostics v_count = row_count;

  insert into activity_events (conversation_id, actor_id, event_type, payload)
  values (
    p_conversation_id,
    auth.uid(),
    'inline_images_purged',
    jsonb_build_object('count', v_count)
  );

  return v_count;
end;
$$;

create or replace function save_dad_ui_draft(
  p_conversation_id uuid,
  p_font_scale integer,
  p_theme text,
  p_bubble_width integer,
  p_image_default_size text,
  p_alerts_enabled boolean default true,
  p_role_lock_enabled boolean default false
)
returns dad_ui_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile dad_ui_profiles;
begin
  if not is_caregiver_admin(p_conversation_id) then
    raise exception 'Not authorized';
  end if;

  insert into dad_ui_profiles (
    conversation_id,
    draft_font_scale,
    draft_theme,
    draft_bubble_width,
    draft_image_default_size,
    draft_alerts_enabled,
    draft_role_lock_enabled,
    draft_updated_at
  )
  values (
    p_conversation_id,
    p_font_scale,
    p_theme,
    p_bubble_width,
    p_image_default_size,
    p_alerts_enabled,
    p_role_lock_enabled,
    now()
  )
  on conflict (conversation_id) do update
  set draft_font_scale = excluded.draft_font_scale,
      draft_theme = excluded.draft_theme,
      draft_bubble_width = excluded.draft_bubble_width,
      draft_image_default_size = excluded.draft_image_default_size,
      draft_alerts_enabled = excluded.draft_alerts_enabled,
      draft_role_lock_enabled = excluded.draft_role_lock_enabled,
      draft_updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function apply_dad_ui_draft(p_conversation_id uuid)
returns dad_ui_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile dad_ui_profiles;
begin
  if not is_caregiver_admin(p_conversation_id) then
    raise exception 'Not authorized';
  end if;

  update dad_ui_profiles
  set font_scale = coalesce(draft_font_scale, font_scale),
      theme = coalesce(draft_theme, theme),
      bubble_width = coalesce(draft_bubble_width, bubble_width),
      image_default_size = coalesce(draft_image_default_size, image_default_size),
      alerts_enabled = coalesce(draft_alerts_enabled, alerts_enabled),
      role_lock_enabled = coalesce(draft_role_lock_enabled, role_lock_enabled),
      draft_font_scale = null,
      draft_theme = null,
      draft_bubble_width = null,
      draft_image_default_size = null,
      draft_alerts_enabled = null,
      draft_role_lock_enabled = null,
      draft_updated_at = null,
      updated_at = now()
  where conversation_id = p_conversation_id
  returning * into v_profile;

  if not found then
    raise exception 'Dad UI profile not found';
  end if;

  insert into activity_events (conversation_id, actor_id, event_type, payload)
  values (p_conversation_id, auth.uid(), 'dad_ui_applied', '{}'::jsonb);

  return v_profile;
end;
$$;

create or replace function save_dad_ui_font_scale(
  p_conversation_id uuid,
  p_ui_font_scale integer
)
returns dad_ui_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile dad_ui_profiles;
begin
  if not is_caregiver_admin(p_conversation_id) then
    raise exception 'Not authorized';
  end if;

  insert into dad_ui_profiles (conversation_id, ui_font_scale)
  values (p_conversation_id, p_ui_font_scale)
  on conflict (conversation_id) do update
  set ui_font_scale = excluded.ui_font_scale,
      updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function save_push_subscription(
  p_conversation_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default '',
  p_platform text default 'web'
)
returns push_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row push_subscriptions;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1
    from conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  insert into push_subscriptions (
    user_id,
    conversation_id,
    endpoint,
    p256dh,
    auth,
    platform,
    user_agent,
    is_active,
    last_seen_at,
    updated_at
  )
  values (
    auth.uid(),
    p_conversation_id,
    p_endpoint,
    p_p256dh,
    p_auth,
    coalesce(nullif(p_platform, ''), 'web'),
    coalesce(p_user_agent, ''),
    true,
    now(),
    now()
  )
  on conflict (user_id, endpoint) do update
  set conversation_id = excluded.conversation_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      platform = excluded.platform,
      user_agent = excluded.user_agent,
      is_active = true,
      last_seen_at = now(),
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function save_trust_rules(
  p_conversation_id uuid,
  p_trust_level integer,
  p_delayed_auto_seconds integer,
  p_checklist_confirmed boolean
)
returns trust_rules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rules trust_rules;
begin
  if not is_caregiver_admin(p_conversation_id) then
    raise exception 'Not authorized';
  end if;

  if p_trust_level < 1 or p_trust_level > 3 then
    raise exception 'Trust level out of Wave 1 range';
  end if;

  insert into trust_rules (conversation_id, trust_level, delayed_auto_seconds, level3_checklist_confirmed, updated_by)
  values (p_conversation_id, p_trust_level, p_delayed_auto_seconds, p_checklist_confirmed, auth.uid())
  on conflict (conversation_id) do update
  set trust_level = excluded.trust_level,
      delayed_auto_seconds = excluded.delayed_auto_seconds,
      level3_checklist_confirmed = excluded.level3_checklist_confirmed,
      updated_by = auth.uid(),
      updated_at = now()
  returning * into v_rules;

  return v_rules;
end;
$$;

create or replace function queue_delayed_auto(
  p_conversation_id uuid,
  p_source_message_id uuid,
  p_delay_seconds integer,
  p_idempotency_key text
)
returns delayed_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row delayed_outbox;
begin
  if not is_conversation_member(p_conversation_id) then
    raise exception 'Not authorized';
  end if;

  insert into delayed_outbox (
    conversation_id,
    source_message_id,
    idempotency_key,
    scheduled_for,
    status
  )
  values (
    p_conversation_id,
    p_source_message_id,
    p_idempotency_key,
    now() + make_interval(secs => p_delay_seconds),
    'pending'
  )
  on conflict (idempotency_key) do update
    set conversation_id = excluded.conversation_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function worker_claim_due_outbox(p_limit integer default 20)
returns setof delayed_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select d.id
    from delayed_outbox d
    where d.status = 'pending'
      and d.scheduled_for <= now()
    order by d.scheduled_for asc
    limit greatest(1, p_limit)
    for update skip locked
  )
  update delayed_outbox d
  set status = 'claimed',
      claimed_at = now()
  from candidate c
  where d.id = c.id
  returning d.*;
end;
$$;

create or replace function worker_mark_outbox_sent(
  p_outbox_id uuid,
  p_system_message_content text
)
returns delayed_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row delayed_outbox;
begin
  update delayed_outbox
  set status = 'sent',
      sent_at = now()
  where id = p_outbox_id
    and status = 'claimed'
  returning * into v_row;

  if not found then
    raise exception 'Outbox row not claimed';
  end if;

  insert into messages (
    conversation_id,
    sender_role,
    content
  )
  values (
    v_row.conversation_id,
    'system',
    p_system_message_content
  );

  insert into activity_events (conversation_id, event_type, payload)
  values (
    v_row.conversation_id,
    'delayed_auto_sent',
    jsonb_build_object('outbox_id', v_row.id)
  );

  return v_row;
end;
$$;

create or replace function worker_mark_outbox_failed(
  p_outbox_id uuid,
  p_reason text
)
returns delayed_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row delayed_outbox;
begin
  update delayed_outbox
  set status = 'failed',
      failure_reason = left(coalesce(p_reason, ''), 500)
  where id = p_outbox_id
    and status in ('claimed', 'pending')
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function worker_cancel_outbox(p_outbox_id uuid, p_reason text default 'cancelled_by_caregiver_activity')
returns delayed_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row delayed_outbox;
begin
  update delayed_outbox
  set status = 'cancelled',
      failure_reason = left(coalesce(p_reason, ''), 500)
  where id = p_outbox_id
    and status in ('pending', 'claimed')
  returning * into v_row;
  return v_row;
end;
$$;

-- Helpful trigger for message updated_at.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_messages_updated_at on messages;
create trigger trg_messages_updated_at
before update on messages
for each row execute function set_updated_at();

create or replace function queue_message_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_roles text[];
begin
  if new.sender_role = 'dad' then
    v_target_roles := array['caregiver', 'caregiver_admin'];
  elsif new.sender_role = 'caregiver' then
    v_target_roles := array['dad'];
  else
    return new;
  end if;

  insert into notification_jobs (conversation_id, message_id, recipient_user_id, status, next_retry_at)
  select
    new.conversation_id,
    new.id,
    cm.user_id,
    'pending',
    now()
  from conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.member_role = any(v_target_roles)
  on conflict (message_id, recipient_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_messages_notify_caregiver on messages;
drop trigger if exists trg_messages_notify_push on messages;
create trigger trg_messages_notify_push
after insert on messages
for each row execute function queue_message_notifications();

-- RLS scaffolding.
alter table profiles enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
alter table message_revisions enable row level security;
alter table dad_ui_profiles enable row level security;
alter table trust_rules enable row level security;
alter table delayed_outbox enable row level security;
alter table activity_events enable row level security;
alter table push_subscriptions enable row level security;
alter table notification_jobs enable row level security;

create or replace function is_conversation_member(_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from conversation_members cm
    where cm.conversation_id = _conversation_id
      and cm.user_id = auth.uid()
  );
$$;

create or replace function is_caregiver_admin(_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from conversation_members cm
    where cm.conversation_id = _conversation_id
      and cm.user_id = auth.uid()
      and cm.member_role = 'caregiver_admin'
  );
$$;

-- Core policies: members can read their conversation data.
drop policy if exists p_messages_select on messages;
create policy p_messages_select
on messages
for select
using (is_conversation_member(conversation_id));

drop policy if exists p_messages_insert on messages;
create policy p_messages_insert
on messages
for insert
with check (is_conversation_member(conversation_id));

drop policy if exists p_messages_update_caregiver on messages;
create policy p_messages_update_caregiver
on messages
for update
using (is_caregiver_admin(conversation_id))
with check (is_caregiver_admin(conversation_id));

drop policy if exists p_message_revisions_rw on message_revisions;
create policy p_message_revisions_rw
on message_revisions
for all
using (
  exists (
    select 1
    from messages m
    where m.id = message_revisions.message_id
      and is_caregiver_admin(m.conversation_id)
  )
)
with check (
  exists (
    select 1
    from messages m
    where m.id = message_revisions.message_id
      and is_caregiver_admin(m.conversation_id)
  )
);

drop policy if exists p_ui_profiles_select on dad_ui_profiles;
create policy p_ui_profiles_select
on dad_ui_profiles
for select
using (is_conversation_member(conversation_id));

drop policy if exists p_ui_profiles_update on dad_ui_profiles;
create policy p_ui_profiles_update
on dad_ui_profiles
for all
using (is_caregiver_admin(conversation_id))
with check (is_caregiver_admin(conversation_id));

drop policy if exists p_trust_rules_select on trust_rules;
create policy p_trust_rules_select
on trust_rules
for select
using (is_conversation_member(conversation_id));

drop policy if exists p_trust_rules_update on trust_rules;
create policy p_trust_rules_update
on trust_rules
for all
using (is_caregiver_admin(conversation_id))
with check (is_caregiver_admin(conversation_id));

drop policy if exists p_delayed_outbox_read on delayed_outbox;
create policy p_delayed_outbox_read
on delayed_outbox
for select
using (is_conversation_member(conversation_id));

drop policy if exists p_delayed_outbox_write on delayed_outbox;
create policy p_delayed_outbox_write
on delayed_outbox
for all
using (is_caregiver_admin(conversation_id))
with check (is_caregiver_admin(conversation_id));

drop policy if exists p_profiles_select_self on profiles;
create policy p_profiles_select_self
on profiles
for select
using (id = auth.uid());

drop policy if exists p_profiles_insert_self on profiles;
create policy p_profiles_insert_self
on profiles
for insert
with check (id = auth.uid());

drop policy if exists p_profiles_update_self on profiles;
create policy p_profiles_update_self
on profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists p_conversations_select on conversations;
create policy p_conversations_select
on conversations
for select
using (is_conversation_member(id));

drop policy if exists p_conversations_insert_self on conversations;
create policy p_conversations_insert_self
on conversations
for insert
with check (created_by = auth.uid());

drop policy if exists p_conversation_members_select on conversation_members;
create policy p_conversation_members_select
on conversation_members
for select
using (user_id = auth.uid());

drop policy if exists p_conversation_members_insert_self on conversation_members;
create policy p_conversation_members_insert_self
on conversation_members
for insert
with check (
  user_id = auth.uid()
  or is_caregiver_admin(conversation_id)
);

drop policy if exists p_activity_events_select on activity_events;
create policy p_activity_events_select
on activity_events
for select
using (is_conversation_member(conversation_id));

drop policy if exists p_activity_events_insert on activity_events;
create policy p_activity_events_insert
on activity_events
for insert
with check (is_conversation_member(conversation_id));

drop policy if exists p_push_subscriptions_select_self on push_subscriptions;
create policy p_push_subscriptions_select_self
on push_subscriptions
for select
using (user_id = auth.uid());

drop policy if exists p_push_subscriptions_insert_self on push_subscriptions;
create policy p_push_subscriptions_insert_self
on push_subscriptions
for insert
with check (user_id = auth.uid() and is_conversation_member(conversation_id));

drop policy if exists p_push_subscriptions_update_self on push_subscriptions;
create policy p_push_subscriptions_update_self
on push_subscriptions
for update
using (user_id = auth.uid())
with check (user_id = auth.uid() and is_conversation_member(conversation_id));

drop policy if exists p_push_subscriptions_delete_self on push_subscriptions;
create policy p_push_subscriptions_delete_self
on push_subscriptions
for delete
using (user_id = auth.uid());

-- Optional reliability upgrade: store chat images in Supabase Storage instead of inline data URLs.
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

drop policy if exists p_chat_images_public_read on storage.objects;
create policy p_chat_images_public_read
on storage.objects
for select
using (bucket_id = 'chat-images');

drop policy if exists p_chat_images_auth_insert on storage.objects;
create policy p_chat_images_auth_insert
on storage.objects
for insert
to authenticated
with check (bucket_id = 'chat-images');

drop policy if exists p_chat_images_owner_update on storage.objects;
create policy p_chat_images_owner_update
on storage.objects
for update
to authenticated
using (bucket_id = 'chat-images' and owner = auth.uid())
with check (bucket_id = 'chat-images' and owner = auth.uid());

drop policy if exists p_chat_images_owner_delete on storage.objects;
create policy p_chat_images_owner_delete
on storage.objects
for delete
to authenticated
using (bucket_id = 'chat-images' and owner = auth.uid());
