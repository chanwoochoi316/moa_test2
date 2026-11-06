-- MOAPLAN 2026-11-06 v0.1. Run once on a NEW Supabase project in SQL Editor.
-- Important: this is NOT compatible with the older MOA project's SQL; use a new project.
-- No real payments. Financial amounts are integers in 만원.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  nickname text not null default '', income integer not null default 0 check(income>=0),
  income_type text not null default 'employee' check(income_type in ('employee','self_employed')),
  fixed_expense integer not null default 0 check(fixed_expense>=0),
  living_expense integer not null default 0 check(living_expense>=0),
  debt_payment integer not null default 0 check(debt_payment>=0),
  analytics_consent boolean not null default false,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('deposit','domestic','overseas','etf','coin','other')),
  amount integer not null default 0 check(amount>=0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(), unique(user_id,kind)
);
create table if not exists public.risk_profiles (
  id uuid primary key default gen_random_uuid(),user_id uuid not null unique references auth.users(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,score integer not null check(score between 25 and 100),
  type text not null, interests jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),user_id uuid not null unique references auth.users(id) on delete cascade,
  type text not null,name text not null default '',target_amount integer not null check(target_amount>0),
  deadline date not null,status text not null default 'active',created_at timestamptz not null default now()
);
create table if not exists public.blueprints (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 1,status text not null check(status in ('draft','active','archived')),
  inputs jsonb not null default '{}'::jsonb,rules_version text not null,
  allocation jsonb not null default '{}'::jsonb,execution_order jsonb not null default '[]'::jsonb,
  ai_explanation jsonb,ai_status text not null default 'pending',
  source text not null default 'engine' check(source in ('engine','adjust','recompute')),
  created_at timestamptz not null default now(),unique(user_id,version)
);
create unique index if not exists one_active_blueprint_per_user on public.blueprints(user_id) where status='active';
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  blueprint_id uuid not null references public.blueprints(id) on delete cascade,
  price integer not null default 1000,status text not null check(status in ('clicked','completed','cancelled')),
  cancel_reason text,is_mock boolean not null default true,created_at timestamptz not null default now()
);
create unique index if not exists one_completed_purchase_per_user on public.purchases(user_id) where status='completed';
create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null check(delta<>0),reason text not null,ref_id text not null,
  created_at timestamptz not null default now(),unique(user_id,reason,ref_id)
);
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  blueprint_id uuid not null references public.blueprints(id) on delete cascade,
  month text not null check(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  emergency integer not null default 0 check(emergency>=0),
  goal integer not null default 0 check(goal>=0),safe integer not null default 0 check(safe>=0),
  risky_overseas integer not null default 0 check(risky_overseas>=0),
  risky_domestic integer not null default 0 check(risky_domestic>=0),
  individual integer not null default 0 check(individual>=0),coin integer not null default 0 check(coin>=0),
  big_expense integer not null default 0 check(big_expense>=0),note text not null default '',
  created_at timestamptz not null default now(),unique(user_id,month)
);
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  blueprint_id uuid not null references public.blueprints(id) on delete cascade,
  request jsonb not null,before jsonb not null,after jsonb not null,
  allowed boolean not null,reason text not null default '',applied_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('user','assistant')),content text not null,
  points_used integer not null default 0,tool_called boolean not null default false,
  flagged boolean not null default false,created_at timestamptz not null default now()
);
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete set null,
  anon_id text, name text not null,props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  blueprint_id uuid references public.blueprints(id) on delete cascade,
  question text not null check(question in ('understanding','trust','value')),
  score integer not null check(score between 1 and 5),created_at timestamptz not null default now(),
  unique(user_id,blueprint_id,question)
);
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,created_at timestamptz not null default now()
);

-- Strict RLS: client-side writes are denied. Mutations pass through authorized server routes.
-- SELECT is permitted only for own rows, except drafts/ledger/events as noted.
do $$ declare t text; begin
  foreach t in array array['profiles','assets','risk_profiles','goals','blueprints','purchases','points_ledger','checkins','proposals','ai_messages','events','survey_responses','feedback']
  loop execute format('alter table public.%I enable row level security',t); end loop;
end $$;
do $$ declare t text; begin
  foreach t in array array['profiles','assets','risk_profiles','goals','purchases','points_ledger','checkins','proposals','ai_messages','survey_responses','feedback']
  loop execute format('drop policy if exists own_read on public.%I',t);
       execute format('create policy own_read on public.%I for select to authenticated using (user_id = (select auth.uid()))',t);
  end loop;
end $$;
drop policy if exists active_read on public.blueprints;
create policy active_read on public.blueprints for select to authenticated
 using(user_id=(select auth.uid()) and status in ('active','archived'));
-- No policies for events: even logged-in users cannot browse tracking events.

-- Buying is an atomic *mock* operation. Only once per account, to avoid unlimited free AI credits.
create or replace function public.complete_mock_purchase(p_user uuid,p_blueprint uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  select status into v_status from public.blueprints where id=p_blueprint and user_id=p_user for update;
  if v_status is distinct from 'draft' then raise exception '구매 가능한 초안이 없습니다.'; end if;
  if exists(select 1 from public.purchases where user_id=p_user and status='completed') then
    raise exception '이 프로토타입은 계정당 모의 구매 1회만 허용합니다.';
  end if;
  update public.blueprints set status='archived' where user_id=p_user and status='active';
  insert into public.purchases(user_id,blueprint_id,price,status,is_mock)
    values(p_user,p_blueprint,1000,'completed',true);
  insert into public.points_ledger(user_id,delta,reason,ref_id)
    values(p_user,20,'purchase',p_blueprint::text);
  update public.blueprints set status='active' where id=p_blueprint;
end $$;

-- All point changes are serialized per account and checked against the ledger.
create or replace function public.change_points(p_user uuid,p_delta integer,p_reason text,p_ref text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer; begin
  if p_delta=0 or p_delta < -3 or p_delta > 3 then raise exception '허용되지 않은 포인트 변동'; end if;
  if p_reason not in ('checkin','question','apply','refund') then raise exception '허용되지 않은 포인트 사유'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  select coalesce(sum(delta),0) into v_balance from public.points_ledger where user_id=p_user;
  if v_balance+p_delta < 0 then raise exception '포인트가 부족합니다.'; end if;
  insert into public.points_ledger(user_id,delta,reason,ref_id)
  values(p_user,p_delta,p_reason,p_ref)
  on conflict(user_id,reason,ref_id) do nothing;
  select coalesce(sum(delta),0) into v_balance from public.points_ledger where user_id=p_user;
  return v_balance;
end $$;

-- Checkin and +2 points are one transaction; editing an existing month yields no extra points.
create or replace function public.save_checkin(p_user uuid,p_blueprint uuid,p_month text,p_data jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_inserted boolean; begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  if not exists(select 1 from public.blueprints where user_id=p_user and id=p_blueprint and status='active')
    then raise exception '설계도가 없습니다.'; end if;
  insert into public.checkins(user_id,blueprint_id,month,emergency,goal,safe,risky_overseas,risky_domestic,individual,coin,big_expense,note)
  values(p_user,p_blueprint,p_month,(p_data->>'emergency')::int,(p_data->>'goal')::int,
   (p_data->>'safe')::int,(p_data->>'risky_overseas')::int,(p_data->>'risky_domestic')::int,
   (p_data->>'individual')::int,(p_data->>'coin')::int,(p_data->>'big_expense')::int,coalesce(p_data->>'note',''))
  on conflict(user_id,month) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted then
    insert into public.points_ledger(user_id,delta,reason,ref_id) values(p_user,2,'checkin',p_month)
    on conflict do nothing;
  else
    update public.checkins set blueprint_id=p_blueprint,emergency=(p_data->>'emergency')::int,
      goal=(p_data->>'goal')::int,safe=(p_data->>'safe')::int,
      risky_overseas=(p_data->>'risky_overseas')::int,risky_domestic=(p_data->>'risky_domestic')::int,
      individual=(p_data->>'individual')::int,coin=(p_data->>'coin')::int,
      big_expense=(p_data->>'big_expense')::int,note=coalesce(p_data->>'note','')
    where user_id=p_user and month=p_month;
  end if;
  return v_inserted;
end $$;

-- Proposal application consumes 3 points + archives current + inserts next version atomically.
create or replace function public.apply_proposal(p_user uuid,p_id uuid,p_expected jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_prop public.proposals%rowtype;v_blue public.blueprints%rowtype;v_next uuid;v_balance integer;begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  select * into v_prop from public.proposals where id=p_id and user_id=p_user for update;
  if not found or not v_prop.allowed or v_prop.applied_at is not null then raise exception '적용할 수 없는 제안입니다.';end if;
  select * into v_blue from public.blueprints where id=v_prop.blueprint_id and user_id=p_user for update;
  if not found or v_blue.status<>'active' or v_prop.before<>v_blue.allocation or v_prop.after<>p_expected then
    raise exception '설계도가 변경되었습니다. 다시 제안해 주세요.';end if;
  select coalesce(sum(delta),0) into v_balance from public.points_ledger where user_id=p_user;
  if v_balance<3 then raise exception '포인트가 부족합니다.';end if;
  insert into public.points_ledger(user_id,delta,reason,ref_id) values(p_user,-3,'apply',p_id::text);
  update public.blueprints set status='archived' where id=v_blue.id;
  insert into public.blueprints(user_id,version,status,inputs,rules_version,allocation,execution_order,source)
    values(p_user,v_blue.version+1,'active',v_blue.inputs,v_blue.rules_version,v_prop.after,v_blue.execution_order,'adjust') returning id into v_next;
  update public.proposals set applied_at=now() where id=p_id;
  return v_next;
end $$;

-- Expose privileged functions to server role only. sb_secret_* invokes as service_role.
revoke all on function public.complete_mock_purchase(uuid,uuid) from public,anon,authenticated;
revoke all on function public.change_points(uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.save_checkin(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.apply_proposal(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.complete_mock_purchase(uuid,uuid) to service_role;
grant execute on function public.change_points(uuid,integer,text,text) to service_role;
grant execute on function public.save_checkin(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.apply_proposal(uuid,uuid,jsonb) to service_role;

-- Check: Table Editor should contain 13 tables. Check SQL Editor Functions for the four RPCs.
