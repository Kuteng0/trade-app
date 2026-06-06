alter table public.exchange_reservations
  add column if not exists user_id text;

update public.exchange_reservations
set user_id = created_by
where user_id is null and created_by is not null;

create unique index if not exists exchange_reservations_item_user_uidx
  on public.exchange_reservations (item_id, user_id)
  where item_id is not null and user_id is not null;

create table if not exists public.tracking_conditions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  keyword text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists tracking_conditions_user_keyword_uidx
  on public.tracking_conditions (user_id, lower(keyword));
