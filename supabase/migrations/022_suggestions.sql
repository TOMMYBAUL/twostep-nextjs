create table public.suggestions (
    id uuid primary key default gen_random_uuid(),
    merchant_id uuid not null references merchants(id) on delete cascade,
    consumer_id uuid references auth.users(id) on delete set null,
    text text not null,
    original_text text,
    status text not null default 'visible' check (status in ('visible', 'archived')),
    created_at timestamptz not null default now()
);

alter table public.suggestions enable row level security;

create policy "Merchants read own suggestions"
    on suggestions for select
    using (merchant_id in (select id from merchants where user_id = auth.uid()));

create policy "Authenticated users can insert suggestions"
    on suggestions for insert
    with check (auth.uid() is not null);

create policy "Merchants can update own suggestions"
    on suggestions for update
    using (merchant_id in (select id from merchants where user_id = auth.uid()))
    with check (merchant_id in (select id from merchants where user_id = auth.uid()));
