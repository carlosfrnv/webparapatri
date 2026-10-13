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

-- Origem do documento: os apontamentos dela ou a Biblioteca de referência (IAEA / EFRS).
alter table documents add column if not exists source_type text not null default 'apontamentos'
  check (source_type in ('apontamentos','referencia'));
alter table documents add column if not exists reference_org text check (reference_org in ('IAEA','EFRS'));

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
alter table chunks add column if not exists source_type text not null default 'apontamentos'
  check (source_type in ('apontamentos','referencia'));
create index if not exists chunks_user_source_idx on chunks (user_id, source_type);

-- Materiais de estudo gerados pela IA (cache para não gastar API)
create table if not exists study_materials (
  document_id uuid primary key references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text,
  key_concepts jsonb,
  glossary jsonb,
  flashcards jsonb,
  quiz jsonb,
  sources jsonb,
  lang text default 'es' check (lang in ('es','pt')),
  generated_at timestamptz default now()
);
-- Para bases de dados criadas antes de haver idiomas:
alter table study_materials add column if not exists lang text default 'pt' check (lang in ('es','pt'));
-- Fontes externas usadas no resumo (só nome e endereço, nunca o texto das páginas).
alter table study_materials add column if not exists sources jsonb;

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

-- Pesquisa dos fragmentos mais relevantes.
-- p_terms: palavras-chave separadas por espaços. Procura qualquer delas ("ou") e devolve:
--   rank       = ts_rank: quanto o fragmento fala desses termos
--   coverage   = fração dos termos da pergunta que aparecem no fragmento (0 a 1)
--   proximity  = ts_rank_cd dos termos encontrados: alto se aparecem juntos ("unidades Hounsfield"),
--                quase 0 se estão soltos em frases diferentes. Nulo se só aparece 1 termo.
-- O backend decide se a relevância é suficiente (ver backend/src/search.ts).
drop function if exists search_chunks(uuid, text, int);
drop function if exists search_chunks(uuid, text, int, uuid);
drop function if exists search_chunks(uuid, text, int, uuid, text);
create or replace function search_chunks(
  p_user uuid,
  p_terms text,
  p_limit int default 8,
  p_document uuid default null,
  p_source_type text default 'apontamentos'
)
returns table (id bigint, document_id uuid, content text, page int, rank real, coverage real, proximity real)
language sql stable as $$
  with q as (
    select array(select distinct unnest(tsvector_to_array(to_tsvector('portuguese', p_terms)))) as lex
  ), tsq as (
    select lex, to_tsquery('simple', array_to_string(lex, ' | ')) as query from q
    where array_length(lex, 1) > 0
  ), hits as (
    select c.id, c.document_id, c.content, c.page, c.fts, tsq.lex,
           ts_rank(c.fts, tsq.query) as rank,
           array(select l from unnest(tsq.lex) l where l = any(tsvector_to_array(c.fts))) as matched
    from chunks c, tsq
    where c.user_id = p_user
      and c.source_type = p_source_type
      and (p_document is null or c.document_id = p_document)
      and c.fts @@ tsq.query
    order by rank desc
    limit p_limit
  )
  select id, document_id, content, page, rank,
         (coalesce(array_length(matched, 1), 0)::real / array_length(lex, 1)) as coverage,
         case when coalesce(array_length(matched, 1), 0) >= 2
              then ts_rank_cd(fts, to_tsquery('simple', array_to_string(matched, ' & ')))
         end as proximity
  from hits
  order by rank desc;
$$;

-- Palavras mais frequentes de um documento (para procurar material de referência relacionado).
create or replace function document_keywords(p_document uuid, p_limit int default 8)
returns table (word text, nentry int)
language sql stable as $$
  select word, nentry from ts_stat(format('select fts from chunks where document_id = %L', p_document))
  where length(word) > 3
  order by nentry desc
  limit p_limit;
$$;

-- Só o backend (service_role) pode chamar estas funções.
revoke execute on function search_chunks(uuid, text, int, uuid, text) from public, anon, authenticated;
revoke execute on function document_keywords(uuid, int) from public, anon, authenticated;

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
