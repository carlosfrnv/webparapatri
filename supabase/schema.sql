-- Estudio IMR — esquema de la base de datos.
-- Pega todo esto en Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin romper nada.

create extension if not exists pgcrypto;

-- Asignaturas
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  year int check (year between 1 and 4),
  area text check (area in ('base','radiologia','medicina_nuclear','radioterapia','transversal')),
  created_at timestamptz default now()
);
create index if not exists subjects_user_idx on subjects (user_id);
-- Nombre en español y en portugués de las asignaturas iniciales ({"es": "...", "pt": "..."}).
alter table subjects add column if not exists translations jsonb;
-- Para las asignaturas iniciales creadas antes de que existiera esta columna.
update subjects s set translations = jsonb_build_object('es', t.es, 'pt', t.pt)
from (values
  ('Anatomofisiología', 'Anatomofisiologia'),
  ('Física General', 'Física Geral'),
  ('Bioquímica', 'Bioquímica'),
  ('Biomatemática y Bioestadística', 'Biomatemática e Bioestatística'),
  ('Integración a la Imagen', 'Integração à Imagem'),
  ('Psicología', 'Psicologia'),
  ('Identidad y Voluntariado', 'Identidade e Voluntariado')
) as t(es, pt)
where s.translations is null and s.name in (t.es, t.pt);

-- Archivos subidos
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

-- Origen del documento: sus apuntes o la biblioteca de referencia (IAEA / EFRS).
alter table documents add column if not exists source_type text not null default 'apuntes'
  check (source_type in ('apuntes','referencia'));
alter table documents add column if not exists reference_org text check (reference_org in ('IAEA','EFRS'));
-- Créditos ECTS y nota final (0-20) de cada asignatura, para calcular la media.
alter table subjects add column if not exists ects numeric(4,1);
alter table subjects add column if not exists grade numeric(4,2) check (grade between 0 and 20);
-- Orden que ella elige para sus archivos dentro de cada asignatura (nulo = sin ordenar).
alter table documents add column if not exists position int;

-- Fragmentos de texto con búsqueda de texto completo en portugués
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
alter table chunks add column if not exists source_type text not null default 'apuntes'
  check (source_type in ('apuntes','referencia'));
create index if not exists chunks_user_source_idx on chunks (user_id, source_type);

-- Material de estudio generado por la IA (caché para no gastar API)
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
-- Para bases de datos creadas antes de que hubiera idiomas:
alter table study_materials add column if not exists lang text default 'pt' check (lang in ('es','pt'));
-- Fuentes externas usadas en el resumen (solo nombre y enlace, nunca el texto de las páginas).
alter table study_materials add column if not exists sources jsonb;
-- Traducción del material al otro idioma ({"pt": {...}} o {"es": {...}}), hecha la primera vez que se pide.
alter table study_materials add column if not exists translations jsonb;

-- Repaso espaciado (SM-2)
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

-- Resultados de los tests (para el panel de progreso)
create table if not exists quiz_attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  score int not null,
  total int not null,
  created_at timestamptz default now()
);

-- Preguntas de test falladas, para repasarlas (salen de la lista al acertarlas).
create table if not exists quiz_mistakes (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  question_index int not null,
  wrong_count int not null default 1,
  last_wrong_at timestamptz default now(),
  primary key (user_id, document_id, question_index)
);

-- Sesiones de estudio del Pomodoro (minutos por asignatura).
create table if not exists study_sessions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  minutes int not null check (minutes between 1 and 240),
  created_at timestamptz default now()
);
create index if not exists study_sessions_user_idx on study_sessions (user_id, created_at desc);

-- Buzón: notas que Carlos le escribe y ella ve al entrar (compartidas entre las dos cuentas).
create table if not exists love_notes (
  id bigserial primary key,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) <= 1000),
  created_at timestamptz default now(),
  read_at timestamptz
);

-- Ajustes compartidos del servidor (p. ej., las claves de los avisos y el día del último recordatorio).
create table if not exists couple_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

-- Navegadores con los recordatorios activados (Web Push).
create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  lang text,
  subscription jsonb not null,
  created_at timestamptz default now()
);

-- Extras de cada archivo: figuras guardadas como imagen, test con imágenes y esquema del tema.
create table if not exists document_extras (
  document_id uuid primary key references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  figures jsonb,
  figure_quiz jsonb,
  mindmap jsonb,
  updated_at timestamptz default now()
);
-- Guion del podcast de cada tema ({"es": {...}, "pt": {...}}); la voz la pone el dispositivo.
alter table document_extras add column if not exists podcast jsonb;

-- Subrayados y notas en los resúmenes: el trozo de texto subrayado, su color y una nota opcional.
create table if not exists highlights (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null default 'es',
  quote text not null check (char_length(quote) <= 2000),
  color text not null default 'yellow',
  note text check (char_length(note) <= 2000),
  created_at timestamptz default now()
);
create index if not exists highlights_doc_idx on highlights (user_id, document_id);

-- Conversaciones del chat
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

-- Calendario de exámenes
create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  title text not null,
  exam_date date not null,
  notes text,
  created_at timestamptz default now()
);
create index if not exists exams_user_date_idx on exams (user_id, exam_date);
-- Tipo de fecha: examen o entrega de un trabajo.
alter table exams add column if not exists kind text not null default 'exam' check (kind in ('exam','assignment'));

-- Horario semanal (clases, prácticas, estudio…), personalizado por ella
create table if not exists schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day int not null check (day between 1 and 7),
  start_time time not null,
  end_time time not null,
  title text not null,
  subject_id uuid references subjects(id) on delete set null,
  location text,
  color text not null default 'pink',
  created_at timestamptz default now()
);
create index if not exists schedule_blocks_user_idx on schedule_blocks (user_id, day, start_time);
-- El horario cambia cada semana: un bloque puede ser de un día concreto (date) o repetirse (date vacío).
alter table schedule_blocks add column if not exists date date;
alter table schedule_blocks add column if not exists class_type text;
alter table schedule_blocks add column if not exists teacher text;
create index if not exists schedule_blocks_date_idx on schedule_blocks (user_id, date);

-- Preferencias (p. ej., si ya se crearon las asignaturas iniciales)
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seeded boolean default false
);

-- Búsqueda de los fragmentos más relevantes.
-- p_terms: palabras clave separadas por espacios. Busca cualquiera de ellas ("o") y devuelve:
--   rank       = ts_rank: cuánto habla el fragmento de esos términos
--   coverage   = fracción de los términos de la pregunta que aparecen en el fragmento (0 a 1)
--   proximity  = ts_rank_cd de los términos encontrados: alto si aparecen juntos ("unidades Hounsfield"),
--                casi 0 si están sueltos en frases distintas. Nulo si solo aparece 1 término.
-- El backend decide si la relevancia es suficiente (ver backend/src/search.ts).
drop function if exists search_chunks(uuid, text, int);
drop function if exists search_chunks(uuid, text, int, uuid);
drop function if exists search_chunks(uuid, text, int, uuid, text);
create or replace function search_chunks(
  p_user uuid,
  p_terms text,
  p_limit int default 8,
  p_document uuid default null,
  p_source_type text default 'apuntes'
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

-- Palabras más frecuentes de un documento (para buscar material de referencia relacionado).
create or replace function document_keywords(p_document uuid, p_limit int default 8)
returns table (word text, nentry int)
language sql stable as $$
  select word, nentry from ts_stat(format('select fts from chunks where document_id = %L', p_document))
  where length(word) > 3
  order by nentry desc
  limit p_limit;
$$;

-- Solo el backend (service_role) puede llamar a estas funciones.
revoke execute on function search_chunks(uuid, text, int, uuid, text) from public, anon, authenticated;
revoke execute on function document_keywords(uuid, int) from public, anon, authenticated;

-- Mazos tipo Anki (aparte de las tarjetas de los apuntes): tarjetas propias con la programación de Anki.
create table if not exists decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  new_per_day int not null default 20,
  created_at timestamptz default now()
);
create table if not exists deck_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid not null references decks(id) on delete cascade,
  front text not null,
  back text not null,
  state text not null default 'new' check (state in ('new','learning','review','relearning')),
  step int not null default 0,
  interval_days int not null default 0,
  ease real not null default 2.5,
  lapses int not null default 0,
  reps int not null default 0,
  due_at timestamptz not null default now(),
  last_review_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists deck_cards_deck_idx on deck_cards (deck_id, due_at);
create table if not exists deck_review_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid not null references decks(id) on delete cascade,
  card_id uuid references deck_cards(id) on delete set null,
  rating int not null check (rating between 1 and 4),
  was_new boolean not null default false,
  reviewed_at timestamptz default now()
);
create index if not exists deck_review_log_user_idx on deck_review_log (user_id, reviewed_at);

-- Trabajos: datos, índice y, por apartado, la investigación con sus fuentes y el borrador.
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  title text not null,
  meta jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists assignments_user_idx on assignments (user_id, updated_at desc);

-- Seguridad: RLS en todas las tablas. El backend usa service_role, pero filtra siempre por user_id.
alter table subjects enable row level security;
alter table documents enable row level security;
alter table chunks enable row level security;
alter table study_materials enable row level security;
alter table flashcard_reviews enable row level security;
alter table quiz_attempts enable row level security;
alter table chat_messages enable row level security;
alter table user_settings enable row level security;
alter table exams enable row level security;
alter table schedule_blocks enable row level security;
alter table quiz_mistakes enable row level security;
alter table study_sessions enable row level security;
-- Sin políticas: solo el servidor (service_role) puede leerlas y escribirlas.
alter table love_notes enable row level security;
alter table couple_settings enable row level security;
alter table push_subscriptions enable row level security;
alter table document_extras enable row level security;
alter table highlights enable row level security;
alter table decks enable row level security;
alter table deck_cards enable row level security;
alter table deck_review_log enable row level security;
alter table assignments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['subjects','documents','chunks','study_materials','flashcard_reviews','quiz_attempts','chat_messages','user_settings','exams','schedule_blocks','quiz_mistakes','study_sessions','document_extras','highlights','decks','deck_cards','deck_review_log','assignments']
  loop
    execute format('drop policy if exists "own_rows" on %I', t);
    execute format('create policy "own_rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Bucket privado para los archivos originales
insert into storage.buckets (id, name, public)
values ('temario', 'temario', false)
on conflict (id) do update set public = false;

-- Permisos del backend (service_role). Los proyectos nuevos de Supabase pueden no dar acceso automático
-- a las tablas nuevas; sin esto, el servidor no puede leer ni escribir.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
