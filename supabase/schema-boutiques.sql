-- Boutique — cloud central pour TOUTES les boutiques clientes (licences multi-appareils).
-- Chaque ligne appartient à une boutique (« shop »). Un appareil ne voit et n'écrit QUE les données de sa boutique,
-- et seulement tant qu'il n'est pas retiré et que la licence est valide.
-- Les comptes cloud des appareils sont créés par la fonction « licence » (jamais à la main).

-- ---------- Licences et appareils (accessibles seulement au serveur) ----------
create table if not exists public.licences (
  shop       text primary key,
  client     text not null default '',
  seats      int  not null default 1,     -- nombre d'appareils
  users      int  not null default 0,     -- nombre de comptes (0 = illimité)
  expires    date,                        -- null = à vie
  key        text not null,               -- dernière clé de licence reçue (renvoyée aux autres appareils)
  issued     text not null default '',
  revoked    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  shop         text not null references public.licences(shop) on delete cascade,
  code         text not null,             -- code appareil affiché sur l'écran d'activation
  name         text not null default '',
  user_id      uuid not null unique,      -- compte cloud de cet appareil
  activated_at timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  revoked      boolean not null default false,
  primary key (shop, code)
);

-- ---------- Boutique et droit d'accès de l'appareil connecté ----------
create or replace function public.current_shop() returns text
language sql stable as $$ select auth.jwt() -> 'app_metadata' ->> 'shop' $$;

create or replace function public.device_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.devices d join public.licences l on l.shop = d.shop
    where d.user_id = auth.uid() and d.shop = public.current_shop()
      and not d.revoked and not l.revoked
      and (l.expires is null or l.expires >= current_date - 1)
  )
$$;

-- ---------- Données synchronisées ----------
create sequence if not exists public.records_rev_seq;

create table if not exists public.records (
  shop       text        not null default (auth.jwt() -> 'app_metadata' ->> 'shop'),
  tbl        text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null,
  device     text,
  rev        bigint      not null default nextval('public.records_rev_seq'),
  primary key (shop, tbl, id)
);
create index if not exists records_shop_rev_idx on public.records (shop, rev);

create or replace function public.records_keep_latest()
returns trigger language plpgsql as $$
begin
  if new.updated_at < old.updated_at then
    return null; -- la version déjà dans le cloud est plus récente : on la garde
  end if;
  new.rev := nextval('public.records_rev_seq');
  return new;
end $$;

drop trigger if exists records_keep_latest on public.records;
create trigger records_keep_latest before update on public.records
  for each row execute function public.records_keep_latest();

create table if not exists public.backups (
  id         uuid        primary key default gen_random_uuid(),
  shop       text        not null default (auth.jwt() -> 'app_metadata' ->> 'shop'),
  created_at timestamptz not null default now(),
  label      text,
  device     text,
  data       jsonb       not null
);
create index if not exists backups_shop_idx on public.backups (shop, created_at desc);

-- ---------- Sécurité ----------
alter table public.licences enable row level security;  -- aucune règle : serveur uniquement
alter table public.devices  enable row level security;  -- aucune règle : serveur uniquement
alter table public.records  enable row level security;
alter table public.backups  enable row level security;

drop policy if exists "records_shop" on public.records;
create policy "records_shop" on public.records for all to authenticated
  using (shop = (select public.current_shop()) and (select public.device_ok()))
  with check (shop = (select public.current_shop()) and (select public.device_ok()));

drop policy if exists "backups_shop" on public.backups;
create policy "backups_shop" on public.backups for all to authenticated
  using (shop = (select public.current_shop()) and (select public.device_ok()))
  with check (shop = (select public.current_shop()) and (select public.device_ok()));

revoke all on public.licences, public.devices from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.records to authenticated;
grant select, insert, update, delete on public.backups to authenticated;
grant usage, select on sequence public.records_rev_seq to authenticated;
grant execute on function public.current_shop(), public.device_ok() to authenticated;
