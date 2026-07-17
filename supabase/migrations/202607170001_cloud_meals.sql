-- Cloud meal records for Mia's Eating Life.
-- Run this once in the Supabase SQL Editor or deploy it with the Supabase CLI.

create extension if not exists pgcrypto;

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  meal_type text not null check (meal_type in ('早餐', '午餐', '晚餐', '加餐')),
  description text not null default '',
  estimated_kcal integer not null default 0 check (estimated_kcal between 0 and 10000),
  cost numeric(10, 2) not null default 0 check (cost between 0 and 100000),
  eaten_at timestamptz not null,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

alter table public.meals enable row level security;

drop policy if exists "Users can read their own meals" on public.meals;
create policy "Users can read their own meals"
on public.meals for select
to authenticated
using (
  auth.uid() = user_id
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

drop policy if exists "Users can add their own meals" on public.meals;
create policy "Users can add their own meals"
on public.meals for insert
to authenticated
with check (
  auth.uid() = user_id
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

drop policy if exists "Users can update their own meals" on public.meals;
create policy "Users can update their own meals"
on public.meals for update
to authenticated
using (
  auth.uid() = user_id
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
)
with check (
  auth.uid() = user_id
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

drop policy if exists "Users can delete their own meals" on public.meals;
create policy "Users can delete their own meals"
on public.meals for delete
to authenticated
using (
  auth.uid() = user_id
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-photos',
  'meal-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can view their own meal photos" on storage.objects;
create policy "Users can view their own meal photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'meal-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

drop policy if exists "Users can upload their own meal photos" on storage.objects;
create policy "Users can upload their own meal photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'meal-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

drop policy if exists "Users can update their own meal photos" on storage.objects;
create policy "Users can update their own meal photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'meal-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
)
with check (
  bucket_id = 'meal-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

drop policy if exists "Users can delete their own meal photos" on storage.objects;
create policy "Users can delete their own meal photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'meal-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);
