-- =====================================================================
-- Schéma complet de la base Vérification des Cartes (Supabase / Postgres)
-- À exécuter dans le SQL Editor d'un nouveau projet Supabase.
-- (La gestion des comptes nécessite aussi l'Edge Function `manage-users`,
--  voir supabase/functions/manage-users/index.ts)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---- Tables ----------------------------------------------------------

create table if not exists public.students (
    id          uuid primary key default gen_random_uuid(),
    nom         text not null default '',
    prenom      text not null default '',
    classe      text not null default '',
    numero      text,                       -- numéro de carte (encodé dans le QR)
    eligible    boolean not null default false,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists students_numero_idx on public.students (numero);
create index if not exists students_nom_prenom_idx on public.students (lower(nom), lower(prenom));

create table if not exists public.passages (
    id          uuid primary key default gen_random_uuid(),
    student_id  uuid references public.students(id) on delete set null,
    nom text, prenom text, classe text,
    eligible    boolean,
    statut      text,            -- 'Accepté' | 'Refusé'
    source      text,            -- 'qr' | 'ocr' | 'manual'
    borne       text,            -- identifiant de la borne
    scanned_at  timestamptz not null default now()
);
create index if not exists passages_scanned_at_idx on public.passages (scanned_at desc);
create index if not exists passages_student_idx on public.passages (student_id);

create table if not exists public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    email       text,
    role        text not null default 'agent' check (role in ('admin', 'agent')),
    permissions jsonb not null default
        '{"scan":true,"view_stats":true,"export":true,"manage_students":false,"clear_history":false,"manage_accounts":false}'::jsonb,
    created_at  timestamptz not null default now()
);

create table if not exists public.audit_log (
    id          uuid primary key default gen_random_uuid(),
    actor_email text,
    action      text not null,
    details     jsonb,
    created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

-- ---- Fonctions / triggers -------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at before update on public.students
    for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
    select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.has_perm(perm text)
returns boolean language sql stable security definer set search_path = public, auth as $$
    select coalesce((select (permissions ->> perm)::boolean from public.profiles where id = auth.uid()), false);
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.has_perm(text) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_perm(text) to authenticated;

-- Création automatique du profil à l'inscription d'un utilisateur.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
    insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
    return new;
end; $$;
revoke all on function public.handle_new_user() from public;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---- RLS (sécurité par permission) ----------------------------------

alter table public.students enable row level security;
alter table public.passages enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

-- students : lecture pour tout agent connecté ; écriture = manage_students
create policy "students_select_auth"  on public.students for select to authenticated using (true);
create policy "students_insert_perm"  on public.students for insert to authenticated with check (public.has_perm('manage_students'));
create policy "students_update_perm"  on public.students for update to authenticated using (public.has_perm('manage_students')) with check (public.has_perm('manage_students'));
create policy "students_delete_perm"  on public.students for delete to authenticated using (public.has_perm('manage_students'));

-- passages : insertion = scan, lecture = view_stats, suppression = clear_history
create policy "passages_select_perm"  on public.passages for select to authenticated using (public.has_perm('view_stats'));
create policy "passages_insert_perm"  on public.passages for insert to authenticated with check (public.has_perm('scan'));
create policy "passages_delete_perm"  on public.passages for delete to authenticated using (public.has_perm('clear_history'));

-- profiles : chacun voit le sien ; un gestionnaire de comptes voit tout
create policy "profiles_select_own"    on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_select_manage" on public.profiles for select to authenticated using (public.has_perm('manage_accounts'));

-- audit : lecture = manage_accounts ; insertion = toute action sensible
create policy "audit_select_perm" on public.audit_log for select to authenticated using (public.has_perm('manage_accounts'));
create policy "audit_insert_perm" on public.audit_log for insert to authenticated with check (
    public.has_perm('manage_students') or public.has_perm('clear_history') or public.has_perm('manage_accounts')
);

-- ---- Temps réel ------------------------------------------------------
alter publication supabase_realtime add table public.passages;

-- =====================================================================
-- Après exécution : crée un compte (Authentication → Users), puis passe-le
-- admin :   update public.profiles set role='admin',
--           permissions='{"scan":true,"view_stats":true,"export":true,"manage_students":true,"clear_history":true,"manage_accounts":true}'
--           where email='<ton-email>';
-- =====================================================================
