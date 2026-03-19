-- Enable PostGIS for geo queries
create extension if not exists postgis;

-- ══════════════════════════════════════
-- MERCHANTS
-- ══════════════════════════════════════
create table merchants (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    name text not null,
    address text not null,
    city text not null,
    location geography(point, 4326) not null,
    pos_type text check (pos_type in ('square', 'sumup', 'zettle', 'clover', 'lightspeed')),
    pos_last_sync timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique(user_id)
);

create index idx_merchants_location on merchants using gist (location);
create index idx_merchants_city on merchants (city);

-- POS credentials — separate table with strict RLS (owner-only)
create table merchant_pos_credentials (
    merchant_id uuid primary key references merchants(id) on delete cascade,
    access_token text not null,
    refresh_token text,
    expires_at timestamptz,
    extra jsonb default '{}'::jsonb,
    updated_at timestamptz default now()
);

alter table merchant_pos_credentials enable row level security;

create policy "pos_creds_owner_only" on merchant_pos_credentials
    using (merchant_id in (select id from merchants where user_id = auth.uid()))
    with check (merchant_id in (select id from merchants where user_id = auth.uid()));

-- ══════════════════════════════════════
-- PRODUCTS
-- ══════════════════════════════════════
create table products (
    id uuid primary key default gen_random_uuid(),
    merchant_id uuid references merchants(id) on delete cascade not null,
    ean text,
    name text not null,
    description text,
    category text,
    price decimal(10,2),
    photo_url text,
    pos_item_id text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index idx_products_merchant on products (merchant_id);
create index idx_products_ean on products (ean) where ean is not null;
create index idx_products_name_search on products using gin (to_tsvector('french', name));

-- ══════════════════════════════════════
-- STOCK
-- ══════════════════════════════════════
create table stock (
    product_id uuid primary key references products(id) on delete cascade,
    quantity integer not null default 0,
    updated_at timestamptz default now()
);

-- ══════════════════════════════════════
-- PROMOTIONS
-- ══════════════════════════════════════
create table promotions (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references products(id) on delete cascade not null,
    sale_price decimal(10,2) not null,
    starts_at timestamptz not null default now(),
    ends_at timestamptz,
    created_at timestamptz default now()
);

create index idx_promotions_active on promotions (product_id, starts_at, ends_at);

-- ══════════════════════════════════════
-- CONSUMER PROFILES
-- ══════════════════════════════════════
create table consumer_profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    default_lat double precision,
    default_lng double precision,
    default_radius_km integer default 5,
    created_at timestamptz default now(),
    unique(user_id)
);

-- ══════════════════════════════════════
-- RPC: Atomic stock delta update (prevents race conditions)
-- ══════════════════════════════════════
create or replace function update_stock_delta(p_product_id uuid, p_delta integer)
returns integer language plpgsql as $$
declare new_qty integer;
begin
    update stock set quantity = greatest(0, quantity + p_delta), updated_at = now()
    where product_id = p_product_id
    returning quantity into new_qty;
    return coalesce(new_qty, 0);
end;
$$;

-- ══════════════════════════════════════
-- RPC: Geo search function
-- ══════════════════════════════════════
create or replace function search_products_nearby(
    search_query text,
    user_lat double precision,
    user_lng double precision,
    radius_km integer default 5,
    result_limit integer default 50
)
returns table (
    product_id uuid,
    product_name text,
    product_price decimal,
    product_photo text,
    product_ean text,
    stock_quantity integer,
    merchant_id uuid,
    merchant_name text,
    merchant_address text,
    merchant_city text,
    distance_km double precision,
    sale_price decimal,
    sale_ends_at timestamptz
) language sql stable as $$
    select
        p.id as product_id,
        p.name as product_name,
        p.price as product_price,
        p.photo_url as product_photo,
        p.ean as product_ean,
        s.quantity as stock_quantity,
        m.id as merchant_id,
        m.name as merchant_name,
        m.address as merchant_address,
        m.city as merchant_city,
        round((st_distance(
            m.location,
            st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography
        ) / 1000)::numeric, 1) as distance_km,
        pr.sale_price,
        pr.ends_at as sale_ends_at
    from products p
    join stock s on s.product_id = p.id
    join merchants m on m.id = p.merchant_id
    left join promotions pr on pr.product_id = p.id
        and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
    where s.quantity > 0
        and st_dwithin(
            m.location,
            st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography,
            radius_km * 1000
        )
        and (
            search_query = ''
            or to_tsvector('french', p.name) @@ plainto_tsquery('french', search_query)
            or p.ean = search_query
        )
    order by distance_km asc
    limit result_limit;
$$;

-- ══════════════════════════════════════
-- RLS Policies
-- ══════════════════════════════════════

-- Merchants: owner can CRUD, everyone can read
alter table merchants enable row level security;

create policy "merchants_select_all" on merchants for select using (true);
create policy "merchants_insert_own" on merchants for insert with check (auth.uid() = user_id);
create policy "merchants_update_own" on merchants for update using (auth.uid() = user_id);
create policy "merchants_delete_own" on merchants for delete using (auth.uid() = user_id);

-- Products: merchant owner can CRUD, everyone can read
alter table products enable row level security;

create policy "products_select_all" on products for select using (true);
create policy "products_insert_own" on products for insert
    with check (merchant_id in (select id from merchants where user_id = auth.uid()));
create policy "products_update_own" on products for update
    using (merchant_id in (select id from merchants where user_id = auth.uid()));
create policy "products_delete_own" on products for delete
    using (merchant_id in (select id from merchants where user_id = auth.uid()));

-- Stock: same as products
alter table stock enable row level security;

create policy "stock_select_all" on stock for select using (true);
create policy "stock_insert_own" on stock for insert
    with check (product_id in (
        select p.id from products p
        join merchants m on m.id = p.merchant_id
        where m.user_id = auth.uid()
    ));
create policy "stock_update_own" on stock for update
    using (product_id in (
        select p.id from products p
        join merchants m on m.id = p.merchant_id
        where m.user_id = auth.uid()
    ));

-- Promotions: merchant owner can CRUD, everyone can read
alter table promotions enable row level security;

create policy "promotions_select_all" on promotions for select using (true);
create policy "promotions_insert_own" on promotions for insert
    with check (product_id in (
        select p.id from products p
        join merchants m on m.id = p.merchant_id
        where m.user_id = auth.uid()
    ));
create policy "promotions_delete_own" on promotions for delete
    using (product_id in (
        select p.id from products p
        join merchants m on m.id = p.merchant_id
        where m.user_id = auth.uid()
    ));

-- Consumer profiles: owner only
alter table consumer_profiles enable row level security;

create policy "consumer_profiles_own" on consumer_profiles
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- ══════════════════════════════════════
-- Updated_at trigger
-- ══════════════════════════════════════
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger merchants_updated_at before update on merchants
    for each row execute function update_updated_at();
create trigger products_updated_at before update on products
    for each row execute function update_updated_at();
create trigger stock_updated_at before update on stock
    for each row execute function update_updated_at();
