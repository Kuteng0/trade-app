create table if not exists public.exchange_reservations (
  id uuid primary key default gen_random_uuid(),
  chat_room_id text,
  item_id uuid,
  created_by text not null,
  participant_ids text[] not null default '{}',
  scheduled_at timestamptz,
  location text,
  memo text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.match_notifications (
  fingerprint text primary key,
  user_ids text[] not null default '{}',
  match_type text not null,
  created_at timestamptz not null default now()
);
