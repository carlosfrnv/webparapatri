-- Estudo IMR — esquema da base de dados.
-- Cola tudo isto no Supabase → SQL Editor → New query → Run.
-- Pode ser executado mais de uma vez sem estragar nada.

create extension if not exists pgcrypto;

-- Unidades curriculares (disciplinas)
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  year int check (year between 1 and 4),
  area text check (area in ('base','radiologia','medicina_nuclear','radioterapia','transversal')),
  created_at timestamptz default now()
);
create index if not exists subjects_user_idx on subjects (user_id);

-- Ficheiros carregados
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  suggested_subject_id uuid references subjects(id) on delete set null,
  title text not null,
  storage_path text not null,
  mime_type text,
  status text not null default 'processing' check (status in ('processing','ready','error')),
  error_message text,
  created_at timestamptz default now()
);
create index if not exists documents_user_idx on documents (user_id, created_at desc);

-- Fragmentos de texto com pesquisa de texto completo em português
create table if not exists chunks (
  id bigserial primary key,
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position int not null,
  page int,
  content text not null,
  fts tsvector generated always as (to_tsvector('portuguese', content)) stored
);
create index if not exists chunks_fts_idx on chunks using gin (fts);
create index if not exists chunks_doc_idx on chunks (document_id, position);

-- Materiais de estudo gerados pela IA (cache para não gastar API)
create table if not exists study_materials (
  document_id uuid primary key references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text,
  key_concepts jsonb,
  glossary jsonb,
  flashcards jsonb,
  quiz jsonb,
  generated_at timestamptz default now()
);

-- Repetição espaçada (SM-2)
create table if not exists flashcard_reviews (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  card_index int not null,
  ease real default 2.5,
  interval_days int default 0,
  due_at timestamptz default now(),
  last_quality int,
  review_count int default 0,
  reviewed_at timestamptz,
  unique (document_id, card_index)
);
create index if not exists flashcard_reviews_user_idx on flashcard_reviews (user_id, due_at);

-- Resultados dos testes (para o painel de progresso)
create table if not exists quiz_attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  score int not null,
  total int not null,
  created_at timestamptz default now()
);

-- Conversas do chat
create table if not exists chat_messages (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  role text check (role in ('user','assistant')),
  content text not null,
  sources jsonb,
  created_at timestamptz default now()
);
create index if not exists chat_messages_conv_idx on chat_messages (user_id, conversation_id, created_at);

-- Preferências (ex.: se as disciplinas iniciais já foram criadas)
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seeded boolean default false
);

-- Pesquisa dos fragmentos mais relevantes (opcionalmente dentro de um documento)
drop function if exists search_chunks(uuid, text, int);
create or replace function search_chunks(p_user uuid, p_query text, p_limit int default 8, p_document uuid default null)
returns table (id bigint, document_id uuid, content text, page int, rank real)
language sql stable as $$
  select c.id, c.document_id, c.content, c.page,
         ts_rank(c.fts, websearch_to_tsquery('portuguese', p_query)) as rank
  from chunks c
  where c.user_id = p_user
    and (p_document is null or c.document_id = p_document)
    and c.fts @@ websearch_to_tsquery('portuguese', p_query)
  order by rank desc
  limit p_limit;
$$;

-- Só o backend (service_role) pode chamar a função.
revoke execute on function search_chunks(uuid, text, int, uuid) from public, anon, authenticated;

-- Segurança: RLS em todas as tabelas. O backend usa service_role, mas filtra sempre pelo user_id.
alter table subjects enable row level security;
alter table documents enable row level security;
alter table chunks enable row level security;
alter table study_materials enable row level security;
alter table flashcard_reviews enable row level security;
alter table quiz_attempts enable row level security;
alter table chat_messages enable row level security;
alter table user_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['subjects','documents','chunks','study_materials','flashcard_reviews','quiz_attempts','chat_messages','user_settings']
  loop
    execute format('drop policy if exists "own_rows" on %I', t);
    execute format('create policy "own_rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Bucket privado para os ficheiros originais
insert into storage.buckets (id, name, public)
values ('temario', 'temario', false)
on conflict (id) do update set public = false;
