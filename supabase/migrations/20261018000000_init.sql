-- Accounting firm RAG chatbot: schema.
-- All tables are locked down with RLS and no policies, so only the service role
-- (used by the Edge Functions and the ingest script) can read or write them.

create extension if not exists vector with schema extensions;

create table if not exists public.documents (
  id          text primary key,
  title       text not null,
  status      text not null,
  source_file text not null
);

create table if not exists public.chunks (
  id        bigint generated always as identity primary key,
  doc_id    text not null references public.documents (id) on delete cascade,
  ord       int not null,
  heading   text not null,
  content   text not null,
  embedding extensions.vector(384) not null
);
-- About 100 chunks: an exact scan is instant, so no vector index is needed yet.

create table if not exists public.chat_logs (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  visitor_hash  text not null,
  question      text not null,
  answer        text not null,
  confidence    text not null,
  needs_human   boolean not null,
  abstained     boolean not null,
  cited_chunks  bigint[] not null default '{}',
  best_score    double precision,
  tokens_in     int not null default 0,
  tokens_out    int not null default 0,
  cost_usd      numeric(10, 6) not null default 0
);

create table if not exists public.rate_limits (
  key   text not null,
  day   date not null,
  count int not null default 0,
  primary key (key, day)
);

alter table public.documents  enable row level security;
alter table public.chunks     enable row level security;
alter table public.chat_logs  enable row level security;
alter table public.rate_limits enable row level security;

-- Top matches by cosine similarity (1 = identical direction).
create or replace function public.match_chunks (
  query_embedding extensions.vector(384),
  match_count int
)
returns table (
  id bigint,
  doc_id text,
  doc_title text,
  doc_status text,
  heading text,
  content text,
  similarity double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select c.id, c.doc_id, d.title, d.status, c.heading, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  join public.documents d on d.id = c.doc_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Atomic daily counter. Returns the new count for this key today.
create or replace function public.bump_rate (p_key text)
returns int
language sql
set search_path = public
as $$
  insert into public.rate_limits (key, day, count)
  values (p_key, (now() at time zone 'utc')::date, 1)
  on conflict (key, day) do update set count = public.rate_limits.count + 1
  returning count;
$$;

revoke all on function public.match_chunks (extensions.vector, int) from public, anon, authenticated;
revoke all on function public.bump_rate (text) from public, anon, authenticated;
grant execute on function public.match_chunks (extensions.vector, int) to service_role;
grant execute on function public.bump_rate (text) to service_role;
