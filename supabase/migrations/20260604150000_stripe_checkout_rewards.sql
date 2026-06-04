create table if not exists public.stripe_checkout_rewards (
  session_id text primary key,
  line_id text not null,
  product_type text not null check (product_type in ('premium', 'coin10', 'coin35', 'coin60')),
  coins_delta integer not null check (coins_delta >= 0),
  is_premium boolean not null default false,
  rewarded_at timestamptz not null default now()
);

create or replace function public.award_stripe_checkout_reward(
  p_session_id text,
  p_user_id text,
  p_product_type text,
  p_coins_delta integer,
  p_is_premium boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.stripe_checkout_rewards (
    session_id,
    line_id,
    product_type,
    coins_delta,
    is_premium
  ) values (
    p_session_id,
    p_user_id,
    p_product_type,
    p_coins_delta,
    p_is_premium
  )
  on conflict (session_id) do nothing;

  if not found then
    return false;
  end if;

  update public.users
  set
    coins = coalesce(coins, 0) + p_coins_delta,
    is_premium = case when p_is_premium then true else is_premium end
  where line_id = p_user_id;

  if not found then
    raise exception 'User with line_id % was not found', p_user_id;
  end if;

  return true;
end;
$$;

grant execute on function public.award_stripe_checkout_reward(text, text, text, integer, boolean) to anon, authenticated, service_role;
