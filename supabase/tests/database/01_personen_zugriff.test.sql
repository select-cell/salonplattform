-- pgTAP-Tests für Phase 1: Verknüpfung Person ↔ Login, Constraints, Zugriffsschutz.
-- Ausführen: `supabase test db`
begin;
select plan(33);

-- Meldet den Test als eingeloggten Nutzer an (setzt die JWT-Claims, die auth.uid() liest).
create function pg_temp.anmelden(p_uid text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end
$$;

-- ---------------------------------------------------------------------------
-- Testdaten (laufen als postgres, alles wird am Ende zurückgerollt)
-- ---------------------------------------------------------------------------
insert into public.salons (id, name, start_monat) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Testsalon A', '2026-10-01'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Testsalon B', '2026-10-01');

-- a) Login zuerst, Person danach (E-Mail bewusst mit Großbuchstaben und Leerzeichen)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'oksana@test.example');
insert into public.personen (id, salon_id, name, email, rolle, nimmt_an_teamumfrage) values
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a',
   'Oksana', '  Oksana@Test.Example ', 'mitarbeiter', true);

-- b) Person zuerst, Login danach
insert into public.personen (id, salon_id, name, email, rolle, nimmt_an_teamumfrage) values
  ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a',
   'Shadi', 'shadi@test.example', 'mitarbeiter', true),
  ('10000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-00000000000a',
   'Chef', 'chef@test.example', 'verantwortlicher', false),
  ('10000000-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-00000000000b',
   'Tuana', 'tuana@test.example', 'mitarbeiter', true),
  ('10000000-0000-0000-0000-000000000005', null,
   'Admin', 'admin@test.example', 'admin', false),
  ('10000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-00000000000a',
   'Gesperrt', 'gesperrt@test.example', 'mitarbeiter', true);
update public.personen set aktiv = false
 where id = '10000000-0000-0000-0000-000000000006';

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000002', 'shadi@test.example'),
  ('00000000-0000-0000-0000-000000000003', 'CHEF@test.example'),
  ('00000000-0000-0000-0000-000000000004', 'tuana@test.example'),
  ('00000000-0000-0000-0000-000000000005', 'admin@test.example'),
  ('00000000-0000-0000-0000-000000000006', 'gesperrt@test.example'),
  -- Login ohne Person
  ('00000000-0000-0000-0000-000000000099', 'fremd@test.example');

-- Inhalte je Salon
insert into public.verhalten (id, salon_id, nr, titel) values
  ('20000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 1, 'Verhalten A'),
  ('20000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 1, 'Verhalten B');
insert into public.verhalten_kriterien (verhalten_id, stufe, bezeichnung) values
  ('20000000-0000-0000-0000-00000000000a', 1, '1 – Bewusstsein'),
  ('20000000-0000-0000-0000-00000000000b', 1, '1 – Bewusstsein');
insert into public.rituale (id, salon_id, nr, titel) values
  ('30000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 1, 'Ritual A'),
  ('30000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 1, 'Ritual B');
insert into public.ritual_fragen (ritual_id, nr, typ, frage) values
  ('30000000-0000-0000-0000-00000000000a', 1, 'skala', 'Frage A'),
  ('30000000-0000-0000-0000-00000000000b', 1, 'skala', 'Frage B');

-- ---------------------------------------------------------------------------
-- Verknüpfung und Normalisierung
-- ---------------------------------------------------------------------------
select is((select auth_user_id from public.personen where name = 'Oksana'),
          '00000000-0000-0000-0000-000000000001'::uuid,
          'Login zuerst, Person danach: wird verknüpft');
select is((select email from public.personen where name = 'Oksana'),
          'oksana@test.example',
          'E-Mail wird bereinigt und klein geschrieben');
select is((select auth_user_id from public.personen where name = 'Shadi'),
          '00000000-0000-0000-0000-000000000002'::uuid,
          'Person zuerst, Login danach: wird verknüpft');
select is((select auth_user_id from public.personen where name = 'Chef'),
          '00000000-0000-0000-0000-000000000003'::uuid,
          'Verknüpfung ignoriert Groß-/Kleinschreibung der Login-E-Mail');

select throws_ok(
  $$ insert into public.personen (salon_id, name, email, rolle)
     values (null, 'Ohne Salon', 'ohne.salon@test.example', 'mitarbeiter') $$,
  '23514', null, 'Nur der Admin darf ohne Salon sein');
select throws_ok(
  $$ insert into public.personen (salon_id, name, email, rolle)
     values ('aaaaaaaa-0000-0000-0000-00000000000a', 'Falsch', 'falsch@test.example', 'chefin') $$,
  '23514', null, 'Unbekannte Rolle wird abgelehnt');
select throws_ok(
  $$ insert into public.personen (salon_id, name, email, rolle)
     values ('aaaaaaaa-0000-0000-0000-00000000000a', 'Doppelt', 'shadi@TEST.example', 'mitarbeiter') $$,
  '23505', null, 'E-Mail ist eindeutig, auch bei anderer Schreibweise');
select throws_ok(
  $$ insert into public.salons (name, start_monat) values ('Falscher Start', '2026-10-15') $$,
  '23514', null, 'start_monat muss der 1. eines Monats sein');
select throws_ok(
  $$ insert into public.ritual_fragen (ritual_id, nr, typ, frage)
     values ('30000000-0000-0000-0000-00000000000a', 2, 'auswahl', 'Ohne Optionen') $$,
  '23514', null, 'Auswahlfrage braucht Optionen');

-- ---------------------------------------------------------------------------
-- Mitarbeiterin (Salon A)
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('00000000-0000-0000-0000-000000000001');
set local role authenticated;

select is((select count(*) from public.personen
            where salon_id in ('aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b')),
          1::bigint, 'Mitarbeiterin sieht in personen nur sich selbst');
select is((select rolle from public.ich()), 'mitarbeiter', 'ich(): Rolle');
select is((select salon_name from public.ich()), 'Testsalon A', 'ich(): Salonname');
select is((select nimmt_an_teamumfrage from public.ich()), true, 'ich(): Teilnahme');
select is((select count(*) from public.salons
            where id in ('aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b')),
          1::bigint, 'Mitarbeiterin sieht nur den eigenen Salon');
select is((select count(*) from public.verhalten), 1::bigint, 'Verhalten: nur der eigene Salon');
select is((select count(*) from public.verhalten_kriterien), 1::bigint, 'Kriterien: nur der eigene Salon');
select is((select count(*) from public.rituale), 1::bigint, 'Rituale: nur der eigene Salon');
select is((select count(*) from public.ritual_fragen), 1::bigint, 'Ritual-Fragen: nur der eigene Salon');
select throws_ok($$ update public.personen set rolle = 'admin' $$,
  '42501', null, 'Mitarbeiterin kann personen nicht ändern');
select throws_ok($$ insert into public.personen (salon_id, name, email, rolle)
                    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'X', 'x@test.example', 'admin') $$,
  '42501', null, 'Mitarbeiterin kann keine Person anlegen');
select throws_ok($$ delete from public.personen $$,
  '42501', null, 'Mitarbeiterin kann keine Person löschen');
select throws_ok($$ update public.verhalten set titel = 'Hacked' $$,
  '42501', null, 'Mitarbeiterin kann Inhalte nicht ändern');

-- ---------------------------------------------------------------------------
-- Verantwortlicher (Salon A)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.anmelden('00000000-0000-0000-0000-000000000003');
set local role authenticated;

select is((select count(*) from public.personen
            where salon_id in ('aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b')),
          4::bigint, 'Verantwortlicher sieht alle Personen seines Salons, aber keine anderen');

-- ---------------------------------------------------------------------------
-- Admin (ohne Salon)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.anmelden('00000000-0000-0000-0000-000000000005');
set local role authenticated;

select is((select count(*) from public.personen
            where salon_id in ('aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b')),
          5::bigint, 'Admin sieht Personen aller Salons');
select is((select count(*) from public.salons
            where id in ('aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b')),
          2::bigint, 'Admin sieht alle Salons');
select is((select count(*) from public.verhalten), 2::bigint, 'Admin sieht Inhalte aller Salons');

-- ---------------------------------------------------------------------------
-- Gesperrte Person (aktiv = false)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.anmelden('00000000-0000-0000-0000-000000000006');
set local role authenticated;

select is((select aktiv from public.ich()), false, 'ich() meldet gesperrte Person mit aktiv = false');
select is((select count(*) from public.verhalten), 0::bigint, 'Gesperrte Person sieht keine Inhalte');
select is((select count(*) from public.salons
            where id in ('aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b')),
          0::bigint, 'Gesperrte Person sieht keinen Salon');

-- ---------------------------------------------------------------------------
-- Login ohne Person
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.anmelden('00000000-0000-0000-0000-000000000099');
set local role authenticated;

select is_empty($$ select * from public.ich() $$, 'Login ohne Person: ich() liefert nichts');
select is((select count(*) from public.personen
            where salon_id in ('aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b')),
          0::bigint, 'Login ohne Person sieht keine Personen');

-- ---------------------------------------------------------------------------
-- Nicht eingeloggt (anon)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.anmelden('');
set local role anon;

select throws_ok($$ select * from public.personen $$, '42501', null, 'anon kann personen nicht lesen');
select throws_ok($$ select * from public.ich() $$,    '42501', null, 'anon kann ich() nicht aufrufen');

select * from finish();
rollback;
