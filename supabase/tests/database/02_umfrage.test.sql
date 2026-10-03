-- pgTAP-Tests für Phase 2: Monatsumfrage in der Plattform.
-- Ausführen: `supabase test db`
begin;
select plan(65);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------
create function pg_temp.anmelden(p_uid text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end
$$;

-- Monatsschlüssel 'YYYY-MM' des laufenden Berliner Monats plus Versatz
create function pg_temp.mkey(p_versatz int) returns text
language sql as $$
  select to_char(date_trunc('month', now() at time zone 'Europe/Berlin') + make_interval(months => p_versatz), 'YYYY-MM')
$$;

-- Vollständige, gültige Abgabe (Verhalten 1 und 2 × Anna, Berta, Cora)
create function pg_temp.payload(
  p_monat    text,
  p_note     int    default 3,
  p_personen uuid[] default array[
    '11111111-0000-0000-0000-00000000000a',
    '11111111-0000-0000-0000-00000000000b',
    '11111111-0000-0000-0000-00000000000c']::uuid[],
  p_nrs      int[]  default array[1, 2]
) returns jsonb
language sql as $$
  select jsonb_build_object(
    'monat', p_monat,
    'gestartet_am', (now() - interval '10 minutes')::text,
    'zeitpunkt', now()::text,
    'version', 'test',
    'feedbackgeber_id', '11111111-0000-0000-0000-00000000000b',   -- darf ignoriert werden
    'bewertungen', (
      select jsonb_agg(jsonb_build_object(
        'verhalten_nr', n, 'bewertete_person_id', pid, 'note', p_note,
        'kommentar', case when p_note >= 4 then 'Begründung' else '' end))
      from unnest(p_nrs) n cross join unnest(p_personen) pid),
    'rituale', jsonb_build_array(
      jsonb_build_object('ritual_nr', 1, 'frage_nr', 1, 'antwort', 4),
      jsonb_build_object('ritual_nr', 1, 'frage_nr', 2, 'antwort', 'Vorbereitung'),
      jsonb_build_object('ritual_nr', 1, 'frage_nr', 3, 'antwort', '')),
    'entwicklung', jsonb_build_object(
      'person_id', '11111111-0000-0000-0000-00000000000b', 'begruendung', 'Hat sich stark entwickelt')
  )
$$;

-- ---------------------------------------------------------------------------
-- Testdaten (als postgres)
-- ---------------------------------------------------------------------------
insert into public.salons (id, name, start_monat) values
  ('cccccccc-0000-0000-0000-00000000000c', 'Testsalon U',
   (date_trunc('month', now() at time zone 'Europe/Berlin') - interval '2 months')::date),
  ('dddddddd-0000-0000-0000-00000000000d', 'Testsalon V',
   (date_trunc('month', now() at time zone 'Europe/Berlin') - interval '2 months')::date);

-- Altdaten aus der HTML-Umfrage: nur Namen, noch keine IDs. Anna hat im ersten Monat schon abgegeben.
insert into public.umfrage_abgaben (id, salon, monat, feedbackgeber, rohdaten) values
  ('99999999-0000-0000-0000-000000000001', 'Testsalon U',
   (date_trunc('month', now() at time zone 'Europe/Berlin') - interval '2 months')::date,
   'Anna Test', '{}');
insert into public.umfrage_bewertungen
  (abgabe_id, salon, monat, bewertende_person, verhalten_nr, verhalten, art, bewertete_person, note) values
  ('99999999-0000-0000-0000-000000000001', 'Testsalon U',
   (date_trunc('month', now() at time zone 'Europe/Berlin') - interval '2 months')::date,
   'Anna Test', 1, 'Altes Verhalten', 'selbstbild', 'Anna Test', 2),
  ('99999999-0000-0000-0000-000000000001', 'Testsalon U',
   (date_trunc('month', now() at time zone 'Europe/Berlin') - interval '2 months')::date,
   'Anna Test', 1, 'Altes Verhalten', 'fremdbild', 'Berta Test', 3);

-- Inhalte von Salon U: zwei aktive Verhalten, ein inaktives, ein Ritual
insert into public.verhalten (id, salon_id, nr, grundpfeiler, saeule, titel, aktiv) values
  ('20000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-00000000000c', 1, 'GP 1', 'Säule 1', 'Verhalten Eins', true),
  ('20000000-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-00000000000c', 2, 'GP 1', 'Säule 2', 'Verhalten Zwei', true),
  ('20000000-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-00000000000c', 3, 'GP 2', 'Säule 1', 'Verhalten Drei (inaktiv)', false);
insert into public.verhalten_kriterien (verhalten_id, stufe, bezeichnung, prozent, leitsatz, punkte) values
  ('20000000-0000-0000-0000-000000000001', 1, '1 – Bewusstsein', '0–25%', 'Leitsatz 1', array['a', 'b']),
  ('20000000-0000-0000-0000-000000000001', 2, '2 – Ansatz', '25–50%', 'Leitsatz 2', array['c']);
insert into public.rituale (id, salon_id, nr, titel) values
  ('30000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-00000000000c', 1, 'Testritual');
insert into public.ritual_fragen (ritual_id, nr, typ, frage, optionen, pflicht) values
  ('30000000-0000-0000-0000-000000000001', 1, 'skala',   'Wie war es?', null, true),
  ('30000000-0000-0000-0000-000000000001', 2, 'auswahl', 'Welche Phase?', array['Vorbereitung', 'Abschluss'], false),
  ('30000000-0000-0000-0000-000000000001', 3, 'text',    'Anmerkungen', null, false);

-- Personen. Anna, Berta, Cora nehmen teil; Dora ist gesperrt; Chef nimmt nicht teil; Xaver gehört zu Salon V.
insert into public.personen (id, salon_id, name, email, rolle, nimmt_an_teamumfrage, aktiv) values
  ('11111111-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-00000000000c', 'Anna Test',  'anna@test.example',  'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-00000000000c', 'Berta Test', 'berta@test.example', 'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-00000000000c', 'Cora Test',  'cora@test.example',  'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000d', 'cccccccc-0000-0000-0000-00000000000c', 'Dora Test',  'dora@test.example',  'mitarbeiter',      true,  false),
  ('11111111-0000-0000-0000-00000000000e', 'cccccccc-0000-0000-0000-00000000000c', 'Chef Test',  'chef@test.example',  'verantwortlicher', false, true),
  ('11111111-0000-0000-0000-00000000000f', 'dddddddd-0000-0000-0000-00000000000d', 'Xaver Test', 'xaver@test.example', 'mitarbeiter',      true,  true);
insert into auth.users (id, email) values
  ('22222222-0000-0000-0000-00000000000a', 'anna@test.example'),
  ('22222222-0000-0000-0000-00000000000b', 'berta@test.example'),
  ('22222222-0000-0000-0000-00000000000c', 'cora@test.example'),
  ('22222222-0000-0000-0000-00000000000e', 'chef@test.example'),
  ('22222222-0000-0000-0000-00000000000f', 'xaver@test.example');

-- ---------------------------------------------------------------------------
-- Altdaten bekommen ihre IDs, sobald die Personen existieren (Plan §5.2)
-- ---------------------------------------------------------------------------
select is((select feedbackgeber_id from public.umfrage_abgaben where id = '99999999-0000-0000-0000-000000000001'),
          '11111111-0000-0000-0000-00000000000a'::uuid, 'Altdaten: Abgabe wird der Person zugeordnet');
select is((select salon_id from public.umfrage_abgaben where id = '99999999-0000-0000-0000-000000000001'),
          'cccccccc-0000-0000-0000-00000000000c'::uuid, 'Altdaten: Abgabe bekommt die salon_id');
select is((select count(*) from public.umfrage_bewertungen
            where bewertende_person_id = '11111111-0000-0000-0000-00000000000a'),
          2::bigint, 'Altdaten: bewertende_person_id gesetzt');
select is((select bewertete_person_id from public.umfrage_bewertungen where art = 'fremdbild' and bewertete_person = 'Berta Test'),
          '11111111-0000-0000-0000-00000000000b'::uuid, 'Altdaten: bewertete_person_id gesetzt');

-- ---------------------------------------------------------------------------
-- Seed der echten Inhalte
-- ---------------------------------------------------------------------------
select is((select count(*) from public.verhalten v join public.salons s on s.id = v.salon_id where s.name = 'Dawiid'),
          20::bigint, 'Seed: 20 Verhalten für Dawiid');
select is((select count(*) from public.rituale r join public.salons s on s.id = r.salon_id where s.name = 'Dawiid'),
          2::bigint, 'Seed: 2 Rituale für Dawiid');
select is((select count(*) from public.ritual_fragen f
             join public.rituale r on r.id = f.ritual_id
             join public.salons s on s.id = r.salon_id where s.name = 'Dawiid'),
          9::bigint, 'Seed: 9 Ritual-Fragen für Dawiid');

-- ---------------------------------------------------------------------------
-- Anna: Monate und Inhalte
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000a');
set local role authenticated;

select is((select count(*) from public.meine_monate()), 3::bigint, 'meine_monate: Startmonat bis laufender Monat');
select is((select count(*) from public.meine_offenen_monate()), 2::bigint,
          'meine_offenen_monate: Altabgabe zählt als erledigt');
select is((select abgegeben from public.meine_monate() where monat_key = pg_temp.mkey(-2)), true,
          'Der Monat der Altabgabe ist erledigt');
select is((select frist from public.meine_monate() where monat_key = pg_temp.mkey(0)),
          (date_trunc('month', now() at time zone 'Europe/Berlin') + interval '1 month' - interval '1 day')::date,
          'Frist ist der letzte Tag des Monats');
select ok((select tage_bis_frist from public.meine_monate() where monat_key = pg_temp.mkey(0)) >= 0,
          'laufender Monat: Frist noch nicht überschritten');
select ok((select tage_bis_frist from public.meine_monate() where monat_key = pg_temp.mkey(-1)) < 0,
          'Vormonat: Frist überschritten');

select is(jsonb_array_length(public.umfrage_inhalt()->'verhalten'), 2, 'Inhalt: nur aktive Verhalten');
select is(jsonb_array_length(public.umfrage_inhalt()->'kolleginnen'), 2,
          'Inhalt: Kolleginnen ohne mich, ohne Gesperrte, ohne anderen Salon');
select is(jsonb_array_length(public.umfrage_inhalt()->'verhalten'->0->'kriterien'), 2, 'Inhalt: Bewertungsstufen');
select is(jsonb_array_length(public.umfrage_inhalt()->'rituale'->0->'fragen'), 3, 'Inhalt: Ritual-Fragen');
select is(public.umfrage_inhalt()->'person'->>'name', 'Anna Test', 'Inhalt: eigene Person aus dem Login');

-- ---------------------------------------------------------------------------
-- Ablehnungen (nichts darf gespeichert werden)
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.umfrage_einreichen_v2(pg_temp.payload(pg_temp.mkey(1))) $$,
  '22023', 'Für diesen Monat kann keine Umfrage abgegeben werden.', 'Zukunft wird abgelehnt');
select throws_ok($$ select public.umfrage_einreichen_v2(pg_temp.payload(pg_temp.mkey(-3))) $$,
  '22023', 'Für diesen Monat kann keine Umfrage abgegeben werden.', 'Monat vor dem Start wird abgelehnt');
select throws_ok($$ select public.umfrage_einreichen_v2(pg_temp.payload(pg_temp.mkey(-2))) $$,
  '23505', 'Du hast die Umfrage für diesen Monat bereits abgegeben.', 'Monat mit Altabgabe ist erledigt');
select throws_ok($$ select public.umfrage_einreichen_v2('{"monat":"quatsch"}') $$,
  '22023', 'Der Monat der Umfrage fehlt oder ist ungültig.', 'Ungültiger Monat');
select throws_ok($$ select public.umfrage_einreichen_v2('[]') $$,
  '22023', 'Die Umfrage ist leer oder ungültig.', 'Payload kein Objekt');
select throws_ok($$ select public.umfrage_einreichen_v2(
    pg_temp.payload(pg_temp.mkey(-1), 3, array['11111111-0000-0000-0000-00000000000a','11111111-0000-0000-0000-00000000000b']::uuid[])) $$,
  '22023', 'Die Umfrage ist nicht vollständig. Es fehlen Bewertungen.', 'Unvollständig: eine Person fehlt');
select throws_ok($$ select public.umfrage_einreichen_v2(
    pg_temp.payload(pg_temp.mkey(-1), p_nrs => array[1]::int[])) $$,
  '22023', 'Die Umfrage ist nicht vollständig. Es fehlen Bewertungen.', 'Unvollständig: ein Verhalten fehlt');
select throws_ok($$ select public.umfrage_einreichen_v2(
    pg_temp.payload(pg_temp.mkey(-1), 3, array['11111111-0000-0000-0000-00000000000a','11111111-0000-0000-0000-00000000000b','11111111-0000-0000-0000-00000000000f']::uuid[])) $$,
  '22023', 'Die Umfrage enthält unbekannte Verhalten oder Personen.', 'Person aus fremdem Salon');
select throws_ok($$ select public.umfrage_einreichen_v2(
    pg_temp.payload(pg_temp.mkey(-1), 3, array['11111111-0000-0000-0000-00000000000a','11111111-0000-0000-0000-00000000000b','11111111-0000-0000-0000-00000000000d']::uuid[])) $$,
  '22023', 'Die Umfrage enthält unbekannte Verhalten oder Personen.', 'Gesperrte Person kann nicht bewertet werden');
select throws_ok($$ select public.umfrage_einreichen_v2(
    pg_temp.payload(pg_temp.mkey(-1), p_nrs => array[1, 2, 3]::int[])) $$,
  '22023', 'Die Umfrage enthält unbekannte Verhalten oder Personen.', 'Inaktives Verhalten');
select throws_ok($$ select public.umfrage_einreichen_v2(
    jsonb_set(pg_temp.payload(pg_temp.mkey(-1)), '{bewertungen,0,note}', '4') #- '{bewertungen,0,kommentar}') $$,
  '22023', 'Ab Note 4 ist ein Kommentar Pflicht.', 'Note 4 ohne Kommentar');
select throws_ok($$ select public.umfrage_einreichen_v2(
    jsonb_set(pg_temp.payload(pg_temp.mkey(-1)), '{bewertungen,0,note}', '6')) $$,
  '22023', 'Jede Note muss zwischen 1 und 5 liegen.', 'Note 6');
select throws_ok($$ select public.umfrage_einreichen_v2(
    jsonb_set(pg_temp.payload(pg_temp.mkey(-1)), '{bewertungen,1}',
              (pg_temp.payload(pg_temp.mkey(-1))->'bewertungen'->0))) $$,
  '22023', 'Die Umfrage enthält doppelte Bewertungen.', 'Doppelte Bewertung');
select throws_ok($$ select public.umfrage_einreichen_v2(
    jsonb_set(pg_temp.payload(pg_temp.mkey(-1)), '{entwicklung,person_id}', '"11111111-0000-0000-0000-00000000000a"')) $$,
  '22023', 'Für die Entwicklung des Monats kannst du eine andere Person aus dem Team wählen.', 'Entwicklung: nicht mich selbst');
select throws_ok($$ select public.umfrage_einreichen_v2(
    jsonb_set(pg_temp.payload(pg_temp.mkey(-1)), '{entwicklung,person_id}', '"11111111-0000-0000-0000-00000000000f"')) $$,
  '22023', 'Für die Entwicklung des Monats kannst du eine andere Person aus dem Team wählen.', 'Entwicklung: nicht aus fremdem Salon');
select throws_ok($$ select public.umfrage_einreichen_v2(
    jsonb_set(pg_temp.payload(pg_temp.mkey(-1)), '{rituale}', '[]')) $$,
  '22023', 'Bitte beantworte alle Pflichtfragen bei den Ritualen.', 'Pflichtfrage der Rituale fehlt');
select throws_ok($$ select public.umfrage_einreichen_v2(
    jsonb_set(pg_temp.payload(pg_temp.mkey(-1)), '{rituale,0,antwort}', '7')) $$,
  '22023', 'Eine Ritual-Antwort passt nicht zur Frage.', 'Skala außerhalb 1–5');
select throws_ok($$ select public.umfrage_einreichen_v2(
    jsonb_set(pg_temp.payload(pg_temp.mkey(-1)), '{rituale,1,antwort}', '"Gibt es nicht"')) $$,
  '22023', 'Eine Ritual-Antwort passt nicht zur Frage.', 'Auswahl ohne passende Option');
select throws_ok($$ select public.umfrage_einreichen_v2(
    jsonb_set(pg_temp.payload(pg_temp.mkey(-1)), '{rituale,2,frage_nr}', '99')) $$,
  '22023', 'Die Ritual-Antworten enthalten unbekannte Fragen.', 'Unbekannte Ritual-Frage');

-- nichts davon hat etwas gespeichert
reset role;
select is((select count(*) from public.umfrage_abgaben where salon_id = 'cccccccc-0000-0000-0000-00000000000c'),
          1::bigint, 'Abgelehnte Abgaben hinterlassen nichts (nur die Altabgabe)');

-- ---------------------------------------------------------------------------
-- Annas gültige Abgabe für den Vormonat
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000a');
set local role authenticated;
select lives_ok($$ select public.umfrage_einreichen_v2(pg_temp.payload(pg_temp.mkey(-1), 4)) $$,
  'Gültige Abgabe wird angenommen');
reset role;

select is((select count(*) from public.umfrage_bewertungen b
             join public.umfrage_abgaben a on a.id = b.abgabe_id
            where a.feedbackgeber_id = '11111111-0000-0000-0000-00000000000a' and a.monat = (pg_temp.mkey(-1) || '-01')::date),
          6::bigint, '6 Bewertungen gespeichert (2 Verhalten × 3 Personen)');
select is((select count(*) from public.umfrage_bewertungen b
             join public.umfrage_abgaben a on a.id = b.abgabe_id
            where a.monat = (pg_temp.mkey(-1) || '-01')::date and b.art = 'selbstbild'),
          2::bigint, 'Selbstbild wird automatisch erkannt');
select is((select feedbackgeber_id from public.umfrage_abgaben where monat = (pg_temp.mkey(-1) || '-01')::date),
          '11111111-0000-0000-0000-00000000000a'::uuid, 'Feedbackgeber kommt aus dem Login, nicht aus dem Payload');
select is((select feedbackgeber from public.umfrage_abgaben where monat = (pg_temp.mkey(-1) || '-01')::date),
          'Anna Test', 'Name als Momentaufnahme');
select is((select min(verhalten) from public.umfrage_bewertungen b
             join public.umfrage_abgaben a on a.id = b.abgabe_id
            where a.monat = (pg_temp.mkey(-1) || '-01')::date and b.verhalten_nr = 1),
          'Verhalten Eins', 'Verhaltenstext aus der Datenbank als Momentaufnahme');
select is((select count(*) from public.umfrage_bewertungen b
             join public.umfrage_abgaben a on a.id = b.abgabe_id
            where a.monat = (pg_temp.mkey(-1) || '-01')::date
              and (b.bewertende_person_id is null or b.bewertete_person_id is null)),
          0::bigint, 'Alle Bewertungen haben Personen-IDs');
select is((select entwicklung_person from public.umfrage_abgaben where monat = (pg_temp.mkey(-1) || '-01')::date),
          'Berta Test', 'Entwicklung des Monats');
select is((select ausfuelldauer_sek from public.umfrage_abgaben where monat = (pg_temp.mkey(-1) || '-01')::date),
          600, 'Ausfülldauer aus Start und Absenden');
select is((select count(*) from public.umfrage_rituale r join public.umfrage_abgaben a on a.id = r.abgabe_id
            where a.monat = (pg_temp.mkey(-1) || '-01')::date),
          2::bigint, 'Ritual-Antworten gespeichert, leere freiwillige entfallen');
select is((select min(ritual) from public.umfrage_rituale r join public.umfrage_abgaben a on a.id = r.abgabe_id
            where a.monat = (pg_temp.mkey(-1) || '-01')::date),
          'Testritual', 'Ritualtitel als Momentaufnahme');

select pg_temp.anmelden('22222222-0000-0000-0000-00000000000a');
set local role authenticated;
select is((select count(*) from public.meine_offenen_monate()), 1::bigint, 'Danach ist nur noch der laufende Monat offen');
select throws_ok($$ select public.umfrage_einreichen_v2(pg_temp.payload(pg_temp.mkey(-1), 4)) $$,
  '23505', 'Du hast die Umfrage für diesen Monat bereits abgegeben.', 'Zweite Abgabe für denselben Monat wird abgelehnt');

-- ---------------------------------------------------------------------------
-- Berta: unplausible Dauer wird nicht gespeichert
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000b');
set local role authenticated;
select lives_ok($$ select public.umfrage_einreichen_v2(
    jsonb_set(pg_temp.payload(pg_temp.mkey(0)), '{gestartet_am}', to_jsonb((now() - interval '20 seconds')::text))
    #- '{entwicklung,person_id}') $$,
  'Abgabe ohne Entwicklung und mit unplausibler Dauer wird angenommen');
reset role;
select is((select ausfuelldauer_sek from public.umfrage_abgaben
            where feedbackgeber_id = '11111111-0000-0000-0000-00000000000b'), null,
          'Unter einer Minute: keine Ausfülldauer');
select is((select entwicklung_person from public.umfrage_abgaben
            where feedbackgeber_id = '11111111-0000-0000-0000-00000000000b'), null,
          'Entwicklung des Monats ist optional');

-- ---------------------------------------------------------------------------
-- Verantwortlicher: nimmt nicht teil
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
select is_empty($$ select * from public.meine_monate() $$, 'Verantwortlicher: keine Umfrage-Monate');
select throws_ok($$ select public.umfrage_einreichen_v2(pg_temp.payload(pg_temp.mkey(0))) $$,
  '42501', 'Du nimmst nicht an der Teamumfrage teil.', 'Verantwortlicher kann nicht abgeben');
select is(jsonb_array_length(public.umfrage_inhalt()->'kolleginnen'), 0, 'Verantwortlicher bekommt keine Bewertungsliste');
select is(jsonb_array_length(public.umfrage_inhalt()->'verhalten'), 2, 'Verantwortlicher sieht die Inhalte');

-- Eine Teilnehmerin eines anderen Salons sieht die Kolleginnen von Salon U nicht
reset role;
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000f');
set local role authenticated;
select is(jsonb_array_length(public.umfrage_inhalt()->'kolleginnen'), 0, 'Anderer Salon: keine Kolleginnen von Salon U');
select is(jsonb_array_length(public.umfrage_inhalt()->'verhalten'), 0, 'Anderer Salon: keine Inhalte von Salon U');

-- ---------------------------------------------------------------------------
-- Nicht eingeloggt, und die alte Umfrage bleibt bis zum Umstieg erreichbar
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.anmelden('');
set local role anon;
select throws_ok($$ select public.umfrage_einreichen_v2('{}') $$, '42501', null, 'anon: umfrage_einreichen_v2 gesperrt');
select throws_ok($$ select public.umfrage_inhalt() $$, '42501', null, 'anon: umfrage_inhalt gesperrt');
select throws_ok($$ select * from public.meine_monate() $$, '42501', null, 'anon: meine_monate gesperrt');
reset role;
select ok(has_function_privilege('anon', 'public.umfrage_einreichen(jsonb)', 'execute'),
  'Alte HTML-Umfrage: anon darf bis zum Umstieg weiter einreichen');
select ok(not has_table_privilege('authenticated', 'public.umfrage_abgaben', 'select'),
  'Rohdaten-Tabellen bleiben für eingeloggte Nutzer gesperrt');

select * from finish();
rollback;
