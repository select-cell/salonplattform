-- pgTAP-Tests für Phase 3 (Auswertungen) und Phase 4 (Abgabe-Status, Reminder).
-- Ausführen: `supabase test db`
begin;
select plan(53);

create function pg_temp.anmelden(p_uid text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end
$$;

-- Erster Tag des Berliner Monats plus Versatz
create function pg_temp.monat(p_versatz int) returns date
language sql as $$
  select (date_trunc('month', now() at time zone 'Europe/Berlin') + make_interval(months => p_versatz))::date
$$;

-- ---------------------------------------------------------------------------
-- Testdaten: Salon W mit Anna, Berta, Cora (Teilnehmerinnen), Chef; Xaver in Salon V
-- Start vor zwei Monaten. Alle drei haben für den Vormonat abgegeben.
-- ---------------------------------------------------------------------------
insert into public.salons (id, name, start_monat) values
  ('eeeeeeee-0000-0000-0000-00000000000e', 'Testsalon W', pg_temp.monat(-2)),
  ('dddddddd-0000-0000-0000-00000000000d', 'Testsalon V', pg_temp.monat(-2));

insert into public.personen (id, salon_id, name, email, rolle, nimmt_an_teamumfrage, aktiv) values
  ('11111111-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-00000000000e', 'Anna Test',  'anna@test.example',  'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000e', 'Berta Test', 'berta@test.example', 'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000c', 'eeeeeeee-0000-0000-0000-00000000000e', 'Cora Test',  'cora@test.example',  'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000d', 'eeeeeeee-0000-0000-0000-00000000000e', 'Dora Test',  'dora@test.example',  'mitarbeiter',      true,  false),
  ('11111111-0000-0000-0000-00000000000e', 'eeeeeeee-0000-0000-0000-00000000000e', 'Chef Test',  'chef@test.example',  'verantwortlicher', false, true),
  ('11111111-0000-0000-0000-00000000000f', 'dddddddd-0000-0000-0000-00000000000d', 'Xaver Test', 'xaver@test.example', 'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-000000000010', null,                                   'Admin Test', 'admin@test.example', 'admin',            false, true);
insert into auth.users (id, email) values
  ('22222222-0000-0000-0000-00000000000a', 'anna@test.example'),
  ('22222222-0000-0000-0000-00000000000b', 'berta@test.example'),
  ('22222222-0000-0000-0000-00000000000c', 'cora@test.example'),
  ('22222222-0000-0000-0000-00000000000e', 'chef@test.example'),
  ('22222222-0000-0000-0000-00000000000f', 'xaver@test.example'),
  ('22222222-0000-0000-0000-000000000010', 'admin@test.example');

-- Abgaben des Vormonats
insert into public.umfrage_abgaben
  (id, salon, monat, feedbackgeber, rohdaten, salon_id, feedbackgeber_id,
   entwicklung_person, entwicklung_begruendung, ausfuelldauer_sek) values
  ('99999999-0000-0000-0000-00000000000a', 'Testsalon W', pg_temp.monat(-1), 'Anna Test',  '{}',
   'eeeeeeee-0000-0000-0000-00000000000e', '11111111-0000-0000-0000-00000000000a', 'Berta Test', 'Begründung von Anna', 600),
  ('99999999-0000-0000-0000-00000000000b', 'Testsalon W', pg_temp.monat(-1), 'Berta Test', '{}',
   'eeeeeeee-0000-0000-0000-00000000000e', '11111111-0000-0000-0000-00000000000b', 'Anna Test',  'Begründung von Berta', 900),
  ('99999999-0000-0000-0000-00000000000c', 'Testsalon W', pg_temp.monat(-1), 'Cora Test',  '{}',
   'eeeeeeee-0000-0000-0000-00000000000e', '11111111-0000-0000-0000-00000000000c', 'Berta Test', 'Begründung von Cora', 1200);

-- Noten: jede Kombination aus Bewertender, Bewerteter und Verhalten (1, 2) bekommt eine feste, abwechslungsreiche Note
with subm (idx, pid, name, abg) as (values
  (0, '11111111-0000-0000-0000-00000000000a'::uuid, 'Anna Test',  '99999999-0000-0000-0000-00000000000a'::uuid),
  (1, '11111111-0000-0000-0000-00000000000b'::uuid, 'Berta Test', '99999999-0000-0000-0000-00000000000b'::uuid),
  (2, '11111111-0000-0000-0000-00000000000c'::uuid, 'Cora Test',  '99999999-0000-0000-0000-00000000000c'::uuid))
insert into public.umfrage_bewertungen
  (abgabe_id, salon, monat, bewertende_person, verhalten_nr, grundpfeiler, saeule, verhalten,
   art, bewertete_person, note, kommentar, bewertende_person_id, bewertete_person_id)
select von.abg, 'Testsalon W', pg_temp.monat(-1), von.name, v.nr, 'Grundpfeiler 1', 'Säule ' || v.nr,
       'Verhalten ' || v.nr,
       case when von.pid = zu.pid then 'selbstbild' else 'fremdbild' end,
       zu.name, ((von.idx * 2 + zu.idx + v.nr) % 5) + 1,
       'Kommentar zu ' || zu.name || ' ' || v.nr, von.pid, zu.pid
from subm von cross join subm zu cross join (values (1), (2)) v (nr);

-- Rituale: Skala und Auswahl
insert into public.umfrage_rituale (abgabe_id, ritual, frage_nr, frage, typ, antwort_zahl, antwort_text) values
  ('99999999-0000-0000-0000-00000000000a', 'Testritual', 1, 'Wie war es?', 'skala', 3, null),
  ('99999999-0000-0000-0000-00000000000b', 'Testritual', 1, 'Wie war es?', 'skala', 4, null),
  ('99999999-0000-0000-0000-00000000000c', 'Testritual', 1, 'Wie war es?', 'skala', 5, null),
  ('99999999-0000-0000-0000-00000000000a', 'Testritual', 3, 'Welche Phase?', 'auswahl', null, 'Vorbereitung'),
  ('99999999-0000-0000-0000-00000000000b', 'Testritual', 3, 'Welche Phase?', 'auswahl', null, 'Vorbereitung'),
  ('99999999-0000-0000-0000-00000000000c', 'Testritual', 3, 'Welche Phase?', 'auswahl', null, 'Abschluss');

-- ---------------------------------------------------------------------------
-- Mitarbeiterin Anna: eigene Ergebnisse ohne Absender
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000a');
set local role authenticated;

create temp table e_anna as select public.meine_ergebnisse() as j;
grant all on e_anna to public;

select is(jsonb_array_length((select j from e_anna)->'verhalten'), 2, 'meine_ergebnisse: ein Monat × 2 Verhalten');
select is((select j from e_anna)->'person'->>'name', 'Anna Test', 'meine_ergebnisse: eigene Person');
select is((select j from e_anna)->'monate', to_jsonb(array[to_char(pg_temp.monat(-1), 'YYYY-MM')]), 'meine_ergebnisse: Monate mit Daten');
select is(jsonb_array_length((select j from e_anna)->'kommentare'), 4, 'Kommentare: 2 Kolleginnen × 2 Verhalten');
select is(position('Berta' in ((select j from e_anna)->'kommentare')::text) + position('Cora' in ((select j from e_anna)->'kommentare')::text),
          0, 'Kommentare enthalten keine Absender');
select ok(not exists (select 1 from jsonb_array_elements((select j from e_anna)->'kommentare') k where k ? 'von'),
          'Kommentare haben kein Feld "von"');
select is(jsonb_typeof((select j from e_anna)->'einzelwerte'), 'null', 'Einzelwerte mit Absender gibt es für Mitarbeiterinnen nicht');
select is(jsonb_array_length((select j from e_anna)->'entwicklung'), 1, 'Entwicklung: Anna wurde einmal genannt');
select ok(not ((select j from e_anna)->'entwicklung'->0 ? 'von'), 'Entwicklung: ohne Absender');
select ok(not ((select j from e_anna)->'entwicklung'->0 ? 'begruendung'), 'Entwicklung: ohne Begründung');
select is(jsonb_array_length((select j from e_anna)->'rituale'), 1, 'Eigene Ritual-Antwort (Skala)');
select is((select j from e_anna)->'dauer'->0->>'minuten', '10.0', 'Eigene Ausfülldauer in Minuten');

-- Teamsicht: nur Schnitte
create temp table e_team as select public.team_ergebnisse() as j;
grant all on e_team to public;
select is(jsonb_array_length((select j from e_team)->'verhalten'), 2, 'team_ergebnisse: Schnitte je Verhalten');
select ok(not exists (select 1 from jsonb_array_elements((select j from e_team)->'verhalten') v where v ? 'person_id' or v ? 'von'),
          'team_ergebnisse: keine Einzelpersonen in den Verhalten');
select is((select j from e_team)->'entwicklung'->0->>'person', 'Berta Test', 'team_ergebnisse: Entwicklung nennt nur Person und Anzahl');
select is((select j from e_team)->'entwicklung'->0->>'nennungen', '2', 'team_ergebnisse: Berta wurde zweimal genannt');
select is((select j from e_team)->'rituale_skalen'->0->>'schnitt', '4.00', 'team_ergebnisse: Ritual-Schnitt');
select is((select j from e_team)->'dauer'->0->>'minuten', '15.0', 'team_ergebnisse: Ø Ausfülldauer des Teams');

-- Alles andere ist gesperrt
select throws_ok($$ select public.person_ergebnisse('11111111-0000-0000-0000-00000000000b') $$, '42501', null, 'Mitarbeiterin: kein person_ergebnisse');
select throws_ok($$ select public.team_dashboard() $$, '42501', null, 'Mitarbeiterin: kein team_dashboard');
select throws_ok($$ select * from public.abgabe_status() $$, '42501', null, 'Mitarbeiterin: kein abgabe_status');
select throws_ok($$ select * from public.ueberfaellige_abgaben() $$, '42501', null, 'Mitarbeiterin: keine Reminder-Liste');

-- ---------------------------------------------------------------------------
-- Verantwortlicher
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;

select throws_ok($$ select public.meine_ergebnisse() $$, '42501', 'Du nimmst nicht an der Teamumfrage teil.', 'Verantwortlicher: nimmt nicht teil');

create temp table e_pers as select public.person_ergebnisse('11111111-0000-0000-0000-00000000000a') as j;
grant all on e_pers to public;
select is(jsonb_array_length((select j from e_pers)->'einzelwerte'), 4, 'person_ergebnisse: 4 Einzelwerte mit Absender');
select ok((select bool_and(e ? 'von') from jsonb_array_elements((select j from e_pers)->'einzelwerte') e), 'Einzelwerte nennen die Absender');
select is((select j from e_pers)->'entwicklung'->0->>'von', 'Berta Test', 'person_ergebnisse: Entwicklung mit Absender');
select is((select j from e_pers)->'entwicklung'->0->>'begruendung', 'Begründung von Berta', 'person_ergebnisse: Entwicklung mit Begründung');
select throws_ok($$ select public.person_ergebnisse('11111111-0000-0000-0000-00000000000f') $$, '42501', 'Person nicht gefunden.', 'Person eines anderen Salons');

-- Zahlen stimmen mit den bestehenden Views überein (Plan, Phase 3)
reset role;
select is(
  (select (j->'verhalten'->0->>'fb')::numeric from e_pers),
  (select fremdbild_schnitt from public.v_selbst_vs_fremdbild where person = 'Anna Test' and verhalten_nr = 1 and monat = pg_temp.monat(-1)),
  'Fremdbild stimmt mit v_selbst_vs_fremdbild überein');
select is(
  (select (j->'verhalten'->0->>'sb')::numeric from e_pers),
  (select selbstbild::numeric from public.v_selbst_vs_fremdbild where person = 'Anna Test' and verhalten_nr = 1 and monat = pg_temp.monat(-1)),
  'Selbstbild stimmt mit v_selbst_vs_fremdbild überein');
select is(
  (select round(avg((v->>'fb')::numeric), 2) from e_pers, jsonb_array_elements(j->'verhalten') v),
  (select round(avg(fremdbild_schnitt), 2) from public.v_person_saeule where person = 'Anna Test' and monat = pg_temp.monat(-1)),
  'Gesamt-Fremdbild stimmt mit v_person_saeule überein');

select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;

create temp table e_dash as select public.team_dashboard(pg_temp.monat(-1)) as j;
grant all on e_dash to public;
select is(jsonb_array_length((select j from e_dash)->'personen'), 3, 'team_dashboard: 3 Personen');
select is((select j from e_dash)->>'monat', to_char(pg_temp.monat(-1), 'YYYY-MM'), 'team_dashboard: Monat');
select is(jsonb_array_length((select j from e_dash)->'matrix'), 6, 'team_dashboard: Matrix 2 Verhalten × 3 Personen');
select is(jsonb_array_length((select j from e_dash)->'verhalten'), 2, 'team_dashboard: Team-Schnitte je Verhalten');
select is((select j from e_dash)->'personen'->0->>'rang', '1', 'team_dashboard: bester Fremdbild-Wert hat Rang 1');
select ok((select (j->'personen'->0->>'fb')::numeric = (select max((p->>'fb')::numeric) from jsonb_array_elements(j->'personen') p) from e_dash),
          'team_dashboard: Rang 1 hat den höchsten Fremdbild-Wert');
select ok((select bool_and(round((p->>'sb')::numeric - (p->>'fb')::numeric, 2) = (p->>'differenz')::numeric)
             from jsonb_array_elements((select j from e_dash)->'personen') p),
          'team_dashboard: Differenz = Selbstbild − Fremdbild');
select is(jsonb_array_length((select public.team_dashboard()->'personen')), 3, 'team_dashboard ohne Monat: neuester Monat mit Daten');
select is(jsonb_array_length((select j from e_dash)->'entwicklung'), 2, 'team_dashboard: Entwicklung mit Nennungen');

-- ---------------------------------------------------------------------------
-- Phase 4: Abgabe-Status und Reminder
-- ---------------------------------------------------------------------------
select is((select count(*) from public.abgabe_status(pg_temp.monat(-1)) where abgegeben), 3::bigint,
          'abgabe_status Vormonat: alle drei abgegeben');
select is((select count(*) from public.abgabe_status(pg_temp.monat(0)) where not abgegeben), 3::bigint,
          'abgabe_status laufender Monat: noch niemand, gesperrte Dora zählt nicht');
select is((select frist from public.abgabe_status(pg_temp.monat(-1)) limit 1),
          (pg_temp.monat(0) - 1), 'abgabe_status: Frist = letzter Tag des Monats');

-- Monat M-2 (Start) wurde von niemandem abgegeben. Frist + 3 Tage: noch kein Reminder, Frist + 4: ab jetzt.
select is((select count(*) from public.ueberfaellige_abgaben(pg_temp.monat(-1) - 1 + 3)), 0::bigint,
          'Reminder: 3 Tage nach Fristende noch nicht');
select is((select count(*) from public.ueberfaellige_abgaben(pg_temp.monat(-1) - 1 + 4)), 3::bigint,
          'Reminder: ab dem 4. Tag nach Fristende (Frist 31.10. → 4.11.)');
select is((select min(tage_ueberfaellig) from public.ueberfaellige_abgaben(pg_temp.monat(-1) - 1 + 4)), 4,
          'Reminder: Tage überfällig ab Fristende');

-- ---------------------------------------------------------------------------
-- Anderer Salon, Admin, nicht eingeloggt
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000f');
set local role authenticated;
select is(jsonb_array_length(public.team_ergebnisse()->'verhalten'), 0, 'Anderer Salon sieht keine Daten von Salon W');
select is(jsonb_array_length(public.meine_ergebnisse()->'verhalten'), 0, 'Anderer Salon: eigene Ergebnisse leer');

reset role;
select pg_temp.anmelden('22222222-0000-0000-0000-000000000010');
set local role authenticated;
select lives_ok($$ select public.team_dashboard() $$, 'Admin ohne Salon kann das Dashboard laden');

reset role;
select pg_temp.anmelden('');
set local role anon;
select throws_ok($$ select public.meine_ergebnisse() $$, '42501', null, 'anon: meine_ergebnisse gesperrt');
select throws_ok($$ select public.team_ergebnisse() $$, '42501', null, 'anon: team_ergebnisse gesperrt');
select throws_ok($$ select public.team_dashboard() $$, '42501', null, 'anon: team_dashboard gesperrt');
select throws_ok($$ select * from public.ueberfaellige_abgaben() $$, '42501', null, 'anon: ueberfaellige_abgaben gesperrt');

select * from finish();
rollback;
