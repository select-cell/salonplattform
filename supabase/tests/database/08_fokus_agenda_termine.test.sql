-- pgTAP-Tests für Phase F: Fokus, Agenda, Termine, Versand (Rechte, Handrechnung, Zeitumstellung, Mehrfachversand).
-- Ausführen: `supabase test db`
begin;
select plan(241);

create function pg_temp.anmelden(p_uid text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end
$$;

-- ---------------------------------------------------------------------------
-- Testdaten: Salon P (älter) mit 6 Verhalten, Anna, Berta, Cora (ohne Abgabe), Chef Dietrich, Chef Ohne (ohne E-Mail),
-- Chef Weg (inaktiv), Ludwig Leiter (Verantwortlicher, nimmt teil), Admin; Salon Q mit Xaver und Chef Zwei.
-- ---------------------------------------------------------------------------
insert into public.salons (id, name, start_monat, erstellt_am, schwelle_ausgewogen, schwelle_niveau_niedrig, schwelle_niveau_hoch) values
  ('cccccccc-0000-0000-0000-00000000000c', 'Agendasalon P', '2026-08-01', '2020-01-01', 0.3, 2.5, 3.5),
  ('dddddddd-0000-0000-0000-00000000000d', 'Agendasalon Q', '2026-08-01', '2020-02-01', 0.3, 2.5, 3.5);

insert into public.personen (id, salon_id, name, email, rolle, nimmt_an_teamumfrage, aktiv) values
  ('11111111-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-00000000000c', 'Anna Berger',          'anna@test.example',   'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-00000000000c', 'Berta Hollmann-Kranz', 'berta@test.example',  'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-00000000000c', 'Cora Sommer',          'cora@test.example',   'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000e', 'cccccccc-0000-0000-0000-00000000000c', 'Chef Dietrich',        'Chef@Test.Example',   'verantwortlicher', false, true),
  ('11111111-0000-0000-0000-00000000000f', 'cccccccc-0000-0000-0000-00000000000c', 'Ludwig Leiter',        'ludwig@test.example', 'verantwortlicher', true,  true),
  ('11111111-0000-0000-0000-000000000013', 'cccccccc-0000-0000-0000-00000000000c', 'Chef Ohne',            '',                    'verantwortlicher', false, true),
  ('11111111-0000-0000-0000-000000000014', 'cccccccc-0000-0000-0000-00000000000c', 'Chef Weg',             'weg@test.example',    'verantwortlicher', false, false),
  ('11111111-0000-0000-0000-000000000010', null,                                   'Admin Quelle',         'admin@test.example',  'admin',            false, true),
  ('11111111-0000-0000-0000-000000000011', 'dddddddd-0000-0000-0000-00000000000d', 'Xaver Fremd',          'xaver@test.example',  'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-000000000012', 'dddddddd-0000-0000-0000-00000000000d', 'Chef Zwei',            'chef2@test.example',  'verantwortlicher', false, true);
insert into auth.users (id, email) values
  ('22222222-0000-0000-0000-00000000000a', 'anna@test.example'),
  ('22222222-0000-0000-0000-00000000000e', 'chef@test.example'),
  ('22222222-0000-0000-0000-00000000000f', 'ludwig@test.example'),
  ('22222222-0000-0000-0000-000000000010', 'admin@test.example'),
  ('22222222-0000-0000-0000-000000000011', 'xaver@test.example'),
  ('22222222-0000-0000-0000-000000000012', 'chef2@test.example');

insert into public.verhalten (id, salon_id, nr, titel) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-00000000000c', 1, 'Titel 1'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-00000000000c', 2, 'Titel 2'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-00000000000c', 3, 'Titel 3'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-00000000000c', 4, 'Titel 4'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-00000000000c', 5, 'Titel 5'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-00000000000c', 6, 'Titel 6'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-00000000000d', 1, 'Fremdes Verhalten');

insert into public.umfrage_abgaben (id, salon, monat, feedbackgeber, rohdaten, salon_id, feedbackgeber_id) values
  ('99999999-0000-0000-0000-00000000000a', 'Agendasalon P', '2026-09-01', 'Anna Berger',          '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000a'),
  ('99999999-0000-0000-0000-00000000000b', 'Agendasalon P', '2026-09-01', 'Berta Hollmann-Kranz', '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000b'),
  ('99999999-0000-0000-0000-00000000000d', 'Agendasalon P', '2026-09-01', 'Ludwig Leiter',        '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000f'),
  ('99999999-0000-0000-0000-00000000000c', 'Agendasalon P', '2026-08-01', 'Anna Berger',          '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000a'),
  ('99999999-0000-0000-0000-00000000000e', 'Agendasalon P', '2026-08-01', 'Berta Hollmann-Kranz', '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000b');

create function pg_temp.bewerte(p_abgabe uuid, p_monat date, p_von uuid, p_von_name text, p_zu uuid, p_zu_name text, p_noten int[])
returns void language plpgsql as $$
declare i int;
begin
  for i in 1..array_length(p_noten, 1) loop
    insert into public.umfrage_bewertungen
      (abgabe_id, salon, monat, bewertende_person, verhalten_nr, grundpfeiler, saeule, verhalten, art, bewertete_person, note, kommentar,
       bewertende_person_id, bewertete_person_id)
    values (p_abgabe, 'Agendasalon P', p_monat, p_von_name, i, 'Grundpfeiler 1', 'Säule ' || i, 'Titel ' || i,
            case when p_von = p_zu then 'selbstbild' else 'fremdbild' end, p_zu_name, p_noten[i],
            case when p_noten[i] >= 4 then 'Kommentar zu ' || i end, p_von, p_zu);
  end loop;
end
$$;

-- September: Selbstbild Anna [4,4,3,2,3,3], Berta und Ludwig je 3; Fremdbild wie in der Handrechnung unten
select pg_temp.bewerte('99999999-0000-0000-0000-00000000000a', '2026-09-01', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', array[4,4,3,2,3,3]);
select pg_temp.bewerte('99999999-0000-0000-0000-00000000000a', '2026-09-01', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', array[5,4,2,2,2,3]);
select pg_temp.bewerte('99999999-0000-0000-0000-00000000000a', '2026-09-01', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', array[4,4,2,3,2,3]);
select pg_temp.bewerte('99999999-0000-0000-0000-00000000000b', '2026-09-01', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', array[3,3,3,3,3,3]);
select pg_temp.bewerte('99999999-0000-0000-0000-00000000000b', '2026-09-01', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', array[3,2,3,2,3,3]);
select pg_temp.bewerte('99999999-0000-0000-0000-00000000000b', '2026-09-01', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', array[3,3,2,2,3,3]);
select pg_temp.bewerte('99999999-0000-0000-0000-00000000000d', '2026-09-01', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', array[3,3,3,3,3,3]);
select pg_temp.bewerte('99999999-0000-0000-0000-00000000000d', '2026-09-01', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', array[4,3,3,2,3,3]);
select pg_temp.bewerte('99999999-0000-0000-0000-00000000000d', '2026-09-01', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', array[4,3,2,2,3,3]);
-- August (Vormonat): Selbstbild Anna und Berta je 3, Fremdbild nur Berta → Anna 2
select pg_temp.bewerte('99999999-0000-0000-0000-00000000000c', '2026-08-01', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', array[3,3,3,3,3,3]);
select pg_temp.bewerte('99999999-0000-0000-0000-00000000000e', '2026-08-01', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', array[3,3,3,3,3,3]);
select pg_temp.bewerte('99999999-0000-0000-0000-00000000000e', '2026-08-01', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', array[2,2,2,2,2,2]);
-- Kommentare zu Verhalten 2 (Fokus) nennen Namen: sie müssen in der Agenda anonymisiert werden
update public.umfrage_bewertungen set kommentar = 'Berta Hollmann-Kranz hilft immer'
 where abgabe_id = '99999999-0000-0000-0000-00000000000a' and verhalten_nr = 2 and bewertete_person_id = '11111111-0000-0000-0000-00000000000b';
update public.umfrage_bewertungen set kommentar = 'Ludwig Leiter erklärt gut'
 where abgabe_id = '99999999-0000-0000-0000-00000000000a' and verhalten_nr = 2 and bewertete_person_id = '11111111-0000-0000-0000-00000000000f';

-- Handrechnung Team September (je Verhalten 1 bis 6)
--   Selbstbild: 3,33  3,33  3,00  2,67  3,00  3,00
--   Fremdbild:  3,83  3,17  2,33  2,17  2,67  3,00
--   Differenz:  −0,50 +0,17 +0,67 +0,50 +0,33  0
-- Personen: Anna sb 3,17 fb 2,83 (34/12); Berta sb 3,00 fb 2,92 (35/12); Ludwig sb 3,00 fb 2,83 (34/12) → Team sb 3,06 fb 2,86 (Differenz +0,20)
-- Vormonat: sb 3,00 fb 2,00 → Veränderung des Fremdbilds +0,86

-- ---------------------------------------------------------------------------
-- Rechte: Mitarbeiter, anon
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000a');
set local role authenticated;
select throws_ok($$ select public.fokus_liste() $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: keine Fokus-Liste');
select throws_ok($$ select public.fokus_umschalten('aaaaaaaa-0000-0000-0000-000000000002', true) $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Fokus setzen');
select throws_ok($$ select public.agenda_erzeugen('2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: keine Agenda erzeugen');
select throws_ok($$ select public.agenda_lesen('2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: keine Agenda lesen');
select throws_ok($$ select public.agenda_bearbeiten('2026-09-01', '{}') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: keine Agenda bearbeiten');
select throws_ok($$ select public.agenda_freigeben('2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: keine Agenda freigeben');
select throws_ok($$ select public.termine_liste() $$, '42501', 'Nur für Admins.', 'Mitarbeiter: keine Terminliste');
select throws_ok($$ select public.termin_speichern(null, '2026-10-26T10:00') $$, '42501', 'Nur für Admins.', 'Mitarbeiter: kein Termin speichern');
select throws_ok($$ select public.termine_serie('2026-10-26T10:00', 'woechentlich', 3) $$, '42501', 'Nur für Admins.', 'Mitarbeiter: keine Serie');
select throws_ok($$ select public.termin_entfernen('99999999-9999-9999-9999-999999999999') $$, '42501', 'Nur für Admins.', 'Mitarbeiter: kein Termin entfernen');
select throws_ok($$ select * from public.fokus_verhalten $$, '42501', null, 'Tabelle fokus_verhalten gesperrt');
select throws_ok($$ select * from public.meeting_termine $$, '42501', null, 'Tabelle meeting_termine gesperrt');
select throws_ok($$ select * from public.mail_log $$, '42501', null, 'Tabelle mail_log gesperrt');
select throws_ok($$ select public.versand_faellig() $$, '42501', null, 'Mitarbeiter: Versandfunktion gesperrt (faellig)');
select throws_ok($$ select public.versand_beanspruchen('99999999-9999-9999-9999-999999999999', 'vorab') $$, '42501', null, 'Mitarbeiter: Versandfunktion gesperrt (beanspruchen)');
select throws_ok($$ select public.agenda_fuer_versand('99999999-9999-9999-9999-999999999999') $$, '42501', null, 'Mitarbeiter: Versandfunktion gesperrt (Inhalt)');
select throws_ok($$ select public.versand_abschliessen('99999999-9999-9999-9999-999999999999', 'vorab', true) $$, '42501', null, 'Mitarbeiter: Versandfunktion gesperrt (abschließen)');
reset role;

set local role anon;
select throws_ok($$ select public.fokus_liste() $$, '42501', null, 'anon: keine Fokus-Liste');
select throws_ok($$ select public.agenda_erzeugen('2026-09-01') $$, '42501', null, 'anon: keine Agenda');
select throws_ok($$ select public.termine_liste() $$, '42501', null, 'anon: keine Termine');
select throws_ok($$ select public.versand_faellig() $$, '42501', null, 'anon: Versand gesperrt');
reset role;

-- ---------------------------------------------------------------------------
-- Fokus-Verhalten
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
create temp table fl0 as select public.fokus_liste() as j;
grant all on fl0 to public;
select is((select jsonb_array_length(j->'verhalten') from fl0), 6, 'Fokus-Liste: 6 Verhalten des eigenen Salons (nicht das fremde)');
select ok((select bool_and(x->'fokus' = 'null'::jsonb) from fl0, jsonb_array_elements(j->'verhalten') x), 'Fokus-Liste: noch nichts im Fokus');
select is((select j->>'heute' from fl0), ((now() at time zone 'Europe/Berlin')::date)::text, 'Fokus-Liste: „heute“ in Ortszeit');
select throws_ok($$ select public.fokus_umschalten('bbbbbbbb-0000-0000-0000-000000000001', true, 'x') $$, '42501', 'Verhalten nicht gefunden.', 'Verhalten eines anderen Salons: 42501');
select throws_ok($$ select public.fokus_umschalten('99999999-9999-9999-9999-999999999999', true, 'x') $$, '42501', 'Verhalten nicht gefunden.', 'Unbekanntes Verhalten sieht genauso aus');
select throws_ok($$ select public.fokus_umschalten('aaaaaaaa-0000-0000-0000-000000000002', true, 'x', current_date, current_date - 1) $$, '22023', 'Das Ende liegt vor dem Beginn.', 'Ende vor Beginn: 22023');
select throws_ok($$ select public.fokus_umschalten('aaaaaaaa-0000-0000-0000-000000000002', true, repeat('x', 501)) $$, '22023', 'Die Begründung darf höchstens 500 Zeichen lang sein.', 'Zu lange Begründung: 22023');
select throws_ok($$ select public.fokus_umschalten('aaaaaaaa-0000-0000-0000-000000000002', null) $$, '22023', null, 'Ohne an/aus: 22023');

create temp table fl1 as select public.fokus_umschalten('aaaaaaaa-0000-0000-0000-000000000002', true, '  Gäste herzlich begrüßen  ') as j;
grant all on fl1 to public;
select is((select x->'fokus'->>'begruendung' from fl1, jsonb_array_elements(j->'verhalten') x where (x->>'nr')::int = 2), 'Gäste herzlich begrüßen', 'Fokus an: Begründung (getrimmt)');
select is((select x->'fokus'->>'gueltig_ab' from fl1, jsonb_array_elements(j->'verhalten') x where (x->>'nr')::int = 2), ((now() at time zone 'Europe/Berlin')::date)::text, 'Fokus an: gültig ab heute');
select ok((select x->'fokus'->'gueltig_bis' = 'null'::jsonb from fl1, jsonb_array_elements(j->'verhalten') x where (x->>'nr')::int = 2), 'Fokus an: bis auf Weiteres');
select is((select count(*) from jsonb_array_elements((select j->'verhalten' from fl1)) x where x->'fokus' <> 'null'::jsonb), 1::bigint, 'Genau ein Verhalten im Fokus');
select is((select jsonb_array_length(public.fokus_umschalten('aaaaaaaa-0000-0000-0000-000000000002', true, 'Neue Begründung')->'verhalten')), 6, 'Erneut „an“ aktualisiert den Eintrag');
reset role;
select is((select count(*) from public.fokus_verhalten), 1::bigint, 'Erneut „an“ legt keinen zweiten Eintrag an');
select is((select begruendung from public.fokus_verhalten), 'Neue Begründung', 'Begründung wurde aktualisiert');

select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
do $$ begin perform public.fokus_umschalten('aaaaaaaa-0000-0000-0000-000000000002', false); end $$;
reset role;
select is((select gueltig_bis from public.fokus_verhalten), ((now() at time zone 'Europe/Berlin')::date - 1), '„Aus dem Fokus nehmen“ beendet den Eintrag gestern');
select is((select gueltig_ab from public.fokus_verhalten), ((now() at time zone 'Europe/Berlin')::date - 1), 'Ein Eintrag von heute beginnt dann ebenfalls gestern (nie Ende vor Beginn)');
set local role authenticated;
select ok((select x->'fokus' = 'null'::jsonb from jsonb_array_elements(public.fokus_liste()->'verhalten') x where (x->>'nr')::int = 2), 'Danach nicht mehr im Fokus');
select is((public.fokus_liste()->'verlauf'->0->>'nr')::int, 2, 'Die Geschichte bleibt im Verlauf');
do $$ begin perform public.fokus_umschalten('aaaaaaaa-0000-0000-0000-000000000002', true, 'Wieder an'); end $$;
reset role;
select is((select count(*) from public.fokus_verhalten), 2::bigint, '„Wieder an“ legt einen neuen Eintrag an, die Geschichte bleibt');
select throws_ok($$ insert into public.fokus_verhalten (salon_id, verhalten_id, gueltig_ab, gueltig_bis)
                    values ('cccccccc-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000003', '2026-10-10', '2026-10-09') $$, '23514', null, 'Ende vor Beginn: auch die Tabelle lehnt es ab');

-- befristet bis heute: gilt einschließlich dieses Tages; bis gestern: nicht mehr aktiv
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
do $$ begin perform public.fokus_umschalten('aaaaaaaa-0000-0000-0000-000000000004', true, 'Nur bis heute', null, (now() at time zone 'Europe/Berlin')::date); end $$;
select ok((select x->'fokus' <> 'null'::jsonb from jsonb_array_elements(public.fokus_liste()->'verhalten') x where (x->>'nr')::int = 4), 'Befristet bis heute: heute noch im Fokus');
reset role;
update public.fokus_verhalten set gueltig_ab = gueltig_ab - 5, gueltig_bis = gueltig_bis - 1 where verhalten_id = 'aaaaaaaa-0000-0000-0000-000000000004';
set local role authenticated;
select ok((select x->'fokus' = 'null'::jsonb from jsonb_array_elements(public.fokus_liste()->'verhalten') x where (x->>'nr')::int = 4), 'Befristet bis gestern: nicht mehr im Fokus');
reset role;

-- ---------------------------------------------------------------------------
-- Agenda erzeugen (Fokus: Verhalten 2)
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
select throws_ok($$ select public.agenda_erzeugen('2026-07-01') $$, '22023', 'Für diesen Monat gibt es keine Auswertung.', 'Monat ohne Daten: 22023');
select throws_ok($$ select public.agenda_erzeugen(null) $$, '22023', 'Der Monat fehlt.', 'Ohne Monat: 22023');
select ok((public.agenda_lesen('2026-09-01')) is null, 'Vor dem Erzeugen: keine Agenda');
create temp table ag as select public.agenda_erzeugen('2026-09-15') as j;
grant all on ag to public;
select is((select j->>'status' from ag), 'entwurf', 'Agenda: Entwurf');
select is((select j->>'monat' from ag), '2026-09', 'Agenda: Monat');
select is((select j->'agenda'->>'vorlage' from ag), 'agenda-vorlage-v1', 'Agenda: feste Vorlage');
select is((select jsonb_array_length(j->'agenda'->'bloecke') from ag), 5, 'Agenda: fünf Blöcke');
select is((select string_agg(b->>'id', ',' order by o) from ag, jsonb_array_elements(j->'agenda'->'bloecke') with ordinality as t(b, o)), 'einstieg,kennzahlen,fokus,entwicklung,vereinbarungen', 'Agenda: feste Reihenfolge');
select is((select string_agg(b->>'minuten', ',' order by o) from ag, jsonb_array_elements(j->'agenda'->'bloecke') with ordinality as t(b, o)), '2,3,7,4,2', 'Agenda: Minuten 2, 3, 7, 4, 2');
select is((select (j->'agenda'->>'minuten_gesamt')::int from ag), 18, 'Agenda: Summe 18 Minuten');
select is((select j->'agenda'->'bloecke'->0->'punkte'->1->>'text' from ag), '3 von 4 Personen haben abgegeben.', 'Einstieg: 3 von 4 haben abgegeben');
select is((select j->'agenda'->'bloecke'->1->'punkte'->0->>'text' from ag), 'Selbstbild 3,1, Fremdbild 2,9.', 'Kennzahlen: Selbstbild 3,1 und Fremdbild 2,9 (Mittel der Personenwerte)');
select is((select j->'agenda'->'bloecke'->1->'punkte'->1->>'text' from ag), 'Differenz +0,2: ausgewogen.', 'Kennzahlen: Differenz +0,2, ausgewogen');
select is((select j->'agenda'->'bloecke'->1->'punkte'->2->>'text' from ag), 'Stufe des Fremdbilds: mittel.', 'Kennzahlen: Stufe mittel');
select is((select j->'agenda'->'bloecke'->1->'punkte'->3->>'text' from ag), 'Vormonat: Fremdbild 2,0, Selbstbild 3,0. Veränderung beim Fremdbild: +0,9.', 'Kennzahlen: Vormonat und Veränderung');
select is((select j->'agenda'->'bloecke'->2->'punkte'->0->>'text' from ag), 'Fokus: Verhalten 2 „Titel 2“. Fremdbild 3,2, Selbstbild 3,3. Warum im Fokus: Wieder an', 'Fokus: zuerst das Fokus-Verhalten mit Begründung');
select is((select count(*) from ag, jsonb_array_elements(j->'agenda'->'bloecke'->2->'punkte') p where (p->>'beispiel')::boolean), 2::bigint, 'Fokus: zwei Kommentar-Beispiele');
select is((select count(*) from ag, jsonb_array_elements(j->'agenda'->'bloecke'->2->'punkte') p where not coalesce((p->>'beispiel')::boolean, false)), 3::bigint, 'Fokus: drei Punkte ohne Beispiele (höchstens drei)');
select is((select string_agg(p->>'nr', ',') from ag, jsonb_array_elements(j->'agenda'->'bloecke'->2->'punkte') p where not coalesce((p->>'beispiel')::boolean, false)), '2,3,1', 'Priorität: Fokus (2), größte Differenz (3), nächste Differenz (1)');
select is((select string_agg(p->>'grund', ',') from ag, jsonb_array_elements(j->'agenda'->'bloecke'->2->'punkte') p where not coalesce((p->>'beispiel')::boolean, false)), 'fokus,differenz,differenz', 'Gründe: fokus, differenz, differenz');
select is((select p->>'text' from ag, jsonb_array_elements(j->'agenda'->'bloecke'->2->'punkte') p where p->>'grund' = 'differenz' and (p->>'nr')::int = 3), 'Große Differenz: Verhalten 3 „Titel 3“. Selbstbild 3,0, Fremdbild 2,3 (Differenz +0,7).', 'Differenz Verhalten 3: +0,7');
select is((select p->>'text' from ag, jsonb_array_elements(j->'agenda'->'bloecke'->2->'punkte') p where p->>'grund' = 'differenz' and (p->>'nr')::int = 1), 'Große Differenz: Verhalten 1 „Titel 1“. Selbstbild 3,3, Fremdbild 3,8 (Differenz −0,5).', 'Differenz Verhalten 1: −0,5');
select ok((select bool_and(p->>'text' ~ '^Beispiel aus den Kommentaren: „(Kollege [A-Z]) (hilft immer|erklärt gut)“$') from ag, jsonb_array_elements(j->'agenda'->'bloecke'->2->'punkte') p where (p->>'beispiel')::boolean), 'Beispiele sind anonymisiert (Kollege X statt Name)');
select is((select count(*) from unnest(array['anna', 'berger', 'berta', 'hollmann', 'kranz', 'ludwig', 'leiter', 'cora', 'sommer', 'dietrich', 'quelle']) n where position(n in lower((select j::text from ag))) > 0), 0::bigint, 'Agenda: kein Name im ganzen Dokument');
select is((select string_agg(p->>'nr', ',' order by o) from ag, jsonb_array_elements(j->'agenda'->'bloecke'->3->'punkte') with ordinality as t(p, o)), '4,5,6', 'Entwicklungsfelder: die drei niedrigsten ohne Wiederholung (4, 5, 6)');
select is((select j->'agenda'->'bloecke'->3->'punkte'->0->>'text' from ag), 'Verhalten 4 „Titel 4“. Fremdbild 2,2, Selbstbild 2,7.', 'Entwicklungsfelder: Verhalten 4');
select is((select jsonb_array_length(j->'agenda'->'bloecke'->4->'punkte') from ag), 3, 'Vereinbarungen: drei Leitfragen');
select is((select (j->'agenda'->>'unvollstaendig')::boolean from ag), true, 'Hinweis „Stand unvollständig“');
select is((select j->'agenda'->'hinweise'->>0 from ag), 'Der Monat ist noch nicht abgeschlossen.', 'Hinweis: Monat nicht abgeschlossen');
select is((select j->'agenda'->'hinweise'->>1 from ag), 'Es haben erst 3 von 4 Personen abgegeben.', 'Hinweis: Abgaben fehlen');
select is((select j->'agenda'->'hinweise'->>2 from ag), 'Für 3 von 3 Personen fehlt noch die Einzelanalyse.', 'Hinweis: Einzelanalysen fehlen');
select ok((select j->>'text' like 'Stand unvollständig: Der Monat ist noch nicht abgeschlossen.%' from ag), 'Text beginnt mit dem Hinweis');
select ok((select j->>'text' like E'%## Fokus-Verhalten (7 Min.)\n- Fokus: Verhalten 2%' from ag), 'Text: Blocküberschrift mit Minuten');
select is(position('Beispiel aus den Kommentaren' in (select j->>'text' from ag)), 0, 'Text (Mail, PDF) enthält keine Kommentar-Beispiele');
select is((select j->'agenda'->'bloecke'->2->'punkte'->0->>'beispiel' from ag), null, 'Fokus-Punkt ist kein Beispiel');

-- erneutes Erzeugen verändert nichts; „neu“ erzeugt neu
create function pg_temp.gruende(j jsonb) returns text language sql immutable as $$
  select string_agg((p->>'grund') || ':' || (p->>'nr'), ',' order by o)
  from jsonb_array_elements(j->'agenda'->'bloecke'->2->'punkte') with ordinality as t(p, o)
  where not coalesce((p->>'beispiel')::boolean, false)
$$;
grant execute on function pg_temp.gruende(jsonb) to public;
select is(pg_temp.gruende((select j from ag)), 'fokus:2,differenz:3,differenz:1', 'Ausgangslage: Fokus 2, dann Differenzen 3 und 1');
do $$ begin perform public.fokus_umschalten('aaaaaaaa-0000-0000-0000-000000000001', true, 'Zweiter Fokus'); end $$;
select is(pg_temp.gruende(public.agenda_erzeugen('2026-09-01', false)), 'fokus:2,differenz:3,differenz:1', 'Ohne „neu“ bleibt die gespeicherte Agenda, auch wenn der Fokus sich geändert hat');
select is(pg_temp.gruende(public.agenda_erzeugen('2026-09-01', true)), 'fokus:1,fokus:2,differenz:3', 'Mit „neu“ wird sie aus den aktuellen Daten gebaut (zwei Fokus-Verhalten, dann die größte Differenz)');
do $$ begin perform public.fokus_umschalten('aaaaaaaa-0000-0000-0000-000000000001', false); end $$;
select is(pg_temp.gruende(public.agenda_erzeugen('2026-09-01', true)), 'fokus:2,differenz:3,differenz:1', 'Fokus beendet, neu gebaut: wieder die Ausgangslage');
reset role;
select is((select count(*) from public.analysen where typ = 'team_agenda'), 1::bigint, 'Es gibt je Salon und Monat genau eine Agenda');

select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Agenda bearbeiten und freigeben
-- ---------------------------------------------------------------------------
create temp table agb as select public.agenda_lesen('2026-09-01') as j;
grant all on agb to public;
create function pg_temp.mit_minuten(p_agenda jsonb, p_id text, p_min numeric) returns jsonb
language sql immutable as $$
  select jsonb_set(p_agenda, '{bloecke}', (
    select jsonb_agg(case when b->>'id' = p_id then jsonb_set(b, '{minuten}', to_jsonb(p_min)) else b end order by o)
    from jsonb_array_elements(p_agenda->'bloecke') with ordinality as t(b, o)))
$$;
grant execute on function pg_temp.mit_minuten(jsonb, text, numeric) to public;

select throws_ok($$ select public.agenda_bearbeiten('2026-09-01', pg_temp.mit_minuten((select j->'agenda' from agb), 'fokus', 9)) $$, '22023', 'Der Block „Fokus-Verhalten“ darf 6 bis 8 Minuten dauern.', 'Zeitbudget: Fokus höchstens 8 Minuten');
select throws_ok($$ select public.agenda_bearbeiten('2026-09-01', pg_temp.mit_minuten((select j->'agenda' from agb), 'fokus', 5)) $$, '22023', 'Der Block „Fokus-Verhalten“ darf 6 bis 8 Minuten dauern.', 'Zeitbudget: Fokus mindestens 6 Minuten');
select throws_ok($$ select public.agenda_bearbeiten('2026-09-01', pg_temp.mit_minuten((select j->'agenda' from agb), 'einstieg', 3)) $$, '22023', 'Der Block „Einstieg und Beteiligung“ dauert genau 2 Minuten.', 'Zeitbudget: Einstieg genau 2 Minuten');
select throws_ok($$ select public.agenda_bearbeiten('2026-09-01', pg_temp.mit_minuten((select j->'agenda' from agb), 'entwicklung', 5)) $$, '22023', 'Der Block „Entwicklungsfelder und Differenzen“ darf 3 bis 4 Minuten dauern.', 'Zeitbudget: Entwicklungsfelder höchstens 4 Minuten');
select throws_ok($$ select public.agenda_bearbeiten('2026-09-01', pg_temp.mit_minuten((select j->'agenda' from agb), 'vereinbarungen', 4)) $$, '22023', 'Der Block „Vereinbarungen“ darf 2 bis 3 Minuten dauern.', 'Zeitbudget: Vereinbarungen höchstens 3 Minuten');
select throws_ok($$ select public.agenda_bearbeiten('2026-09-01', pg_temp.mit_minuten((select j->'agenda' from agb), 'fokus', 7.5)) $$, '22023', 'Die Minuten von „Fokus-Verhalten“ müssen eine ganze Zahl sein.', 'Minuten müssen ganze Zahlen sein');
select throws_ok($$ select public.agenda_bearbeiten('2026-09-01', jsonb_set((select j->'agenda' from agb), '{bloecke}', ((select j->'agenda'->'bloecke' from agb) - 4))) $$, '22023', 'Die Agenda braucht fünf Blöcke in fester Reihenfolge.', 'Nur vier Blöcke: 22023');
select throws_ok($$ select public.agenda_bearbeiten('2026-09-01', jsonb_set((select j->'agenda' from agb), '{bloecke}', jsonb_build_array((select j->'agenda'->'bloecke'->1 from agb), (select j->'agenda'->'bloecke'->0 from agb), (select j->'agenda'->'bloecke'->2 from agb), (select j->'agenda'->'bloecke'->3 from agb), (select j->'agenda'->'bloecke'->4 from agb)))) $$, '22023', 'Die Agenda braucht fünf Blöcke in fester Reihenfolge.', 'Vertauschte Reihenfolge: 22023');
select throws_ok($$ select public.agenda_bearbeiten('2026-09-01', jsonb_set((select j->'agenda' from agb), '{bloecke,0,punkte}', '[{"text": "  "}]')) $$, '22023', 'Jeder Punkt braucht einen Text (höchstens 600 Zeichen).', 'Leerer Punkt: 22023');
select throws_ok($$ select public.agenda_bearbeiten('2026-09-01', jsonb_set((select j->'agenda' from agb), '{bloecke,0,punkte}', jsonb_build_array(jsonb_build_object('text', repeat('x', 601))))) $$, '22023', 'Jeder Punkt braucht einen Text (höchstens 600 Zeichen).', 'Zu langer Punkt: 22023');
select throws_ok($$ select public.agenda_bearbeiten('2026-07-01', (select j->'agenda' from agb)) $$, '22023', 'Es gibt noch keine Agenda.', 'Bearbeiten ohne Agenda: 22023');
select is((public.agenda_bearbeiten('2026-09-01', (select j->'agenda' from agb))->>'bearbeitet'), 'false', 'Unveränderter Stand ändert nichts');

create temp table agb2 as select public.agenda_bearbeiten('2026-09-01',
  jsonb_set(pg_temp.mit_minuten((select j->'agenda' from agb), 'fokus', 8), '{bloecke,4,punkte}', jsonb_build_array(jsonb_build_object('text', 'Wir einigen uns auf einen Schritt.')))) as j;
grant all on agb2 to public;
select is((select j->>'status' from agb2), 'entwurf', 'Bearbeitet: Entwurf');
select is((select j->>'bearbeitet' from agb2), 'true', 'Bearbeitet: gekennzeichnet');
select is((select j->>'bearbeitet_von' from agb2), 'Chef Dietrich', 'Bearbeitet: von wem');
select is((select (j->'agenda'->>'minuten_gesamt')::int from agb2), 19, 'Bearbeitet: Summe 19 Minuten');
select is((select jsonb_array_length(j->'agenda'->'bloecke'->4->'punkte') from agb2), 1, 'Bearbeitet: Punkte ersetzt');
select is((select j->'agenda'->'bloecke'->2->>'titel' from agb2), 'Fokus-Verhalten', 'Bearbeitet: Überschrift bleibt fest');
select ok((select j->>'text' like E'%## Fokus-Verhalten (8 Min.)%- Wir einigen uns auf einen Schritt.%' from agb2), 'Bearbeitet: Text wird neu gebildet');
select is((select j->'agenda'->'hinweise'->>0 from agb2), 'Der Monat ist noch nicht abgeschlossen.', 'Bearbeitet: Hinweise bleiben, wie sie beim Erzeugen waren');
select is((select count(*) from agb2, jsonb_array_elements(j->'agenda'->'bloecke'->2->'punkte') p where (p->>'beispiel')::boolean), 2::bigint, 'Bearbeitet: Beispiele im Fokus-Block bleiben auf der Plattform');

create temp table pm0 as select public.pdf_monatsbericht('2026-09-01') as j;
grant all on pm0 to public;
select ok((select j->'agenda' = 'null'::jsonb from pm0), 'PDF: ein Entwurf kommt nicht in den Monatsbericht');
select is((public.agenda_freigeben('2026-09-01')->>'status'), 'freigegeben', 'Freigeben');
select is((public.agenda_lesen('2026-09-01')->>'freigegeben_von'), 'Chef Dietrich', 'Freigabe: von wem');
create temp table pm1 as select public.pdf_monatsbericht('2026-09-01') as j;
grant all on pm1 to public;
select is((select jsonb_array_length(j->'agenda'->'bloecke') from pm1), 5, 'PDF: freigegebene Agenda mit fünf Blöcken');
select is((select j->'agenda'->>'freigegeben_von' from pm1), 'Chef Dietrich', 'PDF: Freigabe-Angabe');
select is(position('Beispiel aus den Kommentaren' in (select (j->'agenda')::text from pm1)), 0, 'PDF: nie Kommentar-Beispiele');
select is(position('hilft immer' in (select j::text from pm1)), 0, 'PDF: kein Kommentartext');
select is((select j->'agenda'->'bloecke'->2->>'minuten' from pm1), '8', 'PDF: die bearbeiteten Minuten');
select is((public.agenda_bearbeiten('2026-09-01', pg_temp.mit_minuten((select j->'agenda' from agb2), 'fokus', 7))->>'status'), 'entwurf', 'Jede Bearbeitung macht wieder zum Entwurf');
create temp table pm2 as select public.pdf_monatsbericht('2026-09-01') as j;
grant all on pm2 to public;
select ok((select j->'agenda' = 'null'::jsonb from pm2), 'PDF: nach dem Bearbeiten wieder ohne Agenda');
select is((public.agenda_freigeben('2026-09-01', false)->>'status'), 'entwurf', 'Freigabe zurücknehmen');
select throws_ok($$ select public.agenda_freigeben('2026-07-01') $$, '22023', 'Es gibt noch keine Agenda.', 'Freigeben ohne Agenda: 22023');
reset role;

-- Salon-Grenze der Agenda
select pg_temp.anmelden('22222222-0000-0000-0000-000000000012');
set local role authenticated;
select throws_ok($$ select public.agenda_erzeugen('2026-09-01') $$, '22023', 'Für diesen Monat gibt es keine Auswertung.', 'Anderer Salon: keine Daten, keine Agenda');
select ok((public.agenda_lesen('2026-09-01')) is null, 'Anderer Salon: sieht die Agenda von Salon P nicht');
select is((select count(*) from jsonb_array_elements(public.fokus_liste()->'verhalten')), 1::bigint, 'Anderer Salon: sieht nur das eigene Verhalten');
reset role;

-- ---------------------------------------------------------------------------
-- Termine (Admin)
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
select throws_ok($$ select public.termine_liste() $$, '42501', 'Nur für Admins.', 'Verantwortlicher: keine Terminliste (auch nicht der Chef)');
select throws_ok($$ select public.termin_speichern(null, '2026-10-26T10:00') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: kein Termin');
select throws_ok($$ select public.termine_serie('2026-10-26T10:00', 'woechentlich', 3) $$, '42501', 'Nur für Admins.', 'Verantwortlicher: keine Serie');
select throws_ok($$ select public.termin_entfernen('99999999-9999-9999-9999-999999999999') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: kein Entfernen');
reset role;

select pg_temp.anmelden('22222222-0000-0000-0000-000000000010');
set local role authenticated;
select is(jsonb_array_length(public.termine_liste()->'termine'), 0, 'Admin: noch keine Termine');
select throws_ok($$ select public.termin_speichern(null, '26.10.2026 10:00') $$, '22023', 'Datum und Uhrzeit sind ungültig. Bitte so eingeben: 2026-10-26T10:00.', 'Ungültiges Format: 22023');
select throws_ok($$ select public.termin_speichern(null, '2026-13-45T10:00') $$, '22023', 'Datum und Uhrzeit sind ungültig. Bitte so eingeben: 2026-10-26T10:00.', 'Unmögliches Datum: 22023');
select throws_ok($$ select public.termin_speichern(null, '2026-10-26T10:00', '  ') $$, '22023', 'Der Titel braucht 1 bis 100 Zeichen.', 'Leerer Titel: 22023');
select throws_ok($$ select public.termin_speichern(null, '2026-10-26T10:00', 'Meeting', '2026-09-15') $$, '22023', 'Der Bezugsmonat muss ein Monatsanfang sein.', 'Bezugsmonat nicht am Monatsanfang: 22023');
select throws_ok($$ select public.termin_speichern(null, '2026-10-26T10:00', 'Meeting', null, '{0}') $$, '22023', 'Vorlauf in Tagen: jeder Wert muss größer als 0 und höchstens 30 sein.', 'Vorlauf 0: 22023');
select throws_ok($$ select public.termin_speichern(null, '2026-10-26T10:00', 'Meeting', null, '{2}', '{200}') $$, '22023', 'Erinnerung in Stunden: jeder Wert muss größer als 0 und höchstens 168 sein.', 'Erinnerung über 168 Stunden: 22023');
select throws_ok($$ select public.termin_speichern(null, '2026-10-26T10:00', 'Meeting', null, '{1,2,3,4,5,6}') $$, '22023', 'Vorlauf in Tagen: bitte ein bis fünf Werte angeben.', 'Mehr als fünf Werte: 22023');

create temp table t1 as select public.termin_speichern(null, '2026-10-26T10:00', 'Teammeeting Oktober') as j;
grant all on t1 to public;
select is((select j->>'startet_lokal' from t1), '2026-10-26T10:00', 'Termin: Ortszeit kommt unverändert zurück');
select is((select j->>'startet_am' from t1), '2026-10-26T09:00:00+00:00', 'Termin: 10:00 Ortszeit im Winter = 09:00 UTC');
select is((select j->>'bezugsmonat' from t1), '2026-09', 'Termin: Bezugsmonat ist der Monat vor dem Termin');
select ok((select j->>'bezugsmonat_fest' is null from t1), 'Termin: Bezugsmonat nicht fest');
select is((select j->'vorlauf_tage' from t1), '[2]'::jsonb, 'Termin: Vorlauf Standard 2 Tage');
select is((select j->'erinnerung_stunden' from t1), '[1]'::jsonb, 'Termin: Erinnerung Standard 1 Stunde');
select is((select j->>'admin_in_kopie' from t1), 'false', 'Termin: Admin standardmäßig nicht in Kopie');
select is((select j->'mails'->0->>'status' from t1), 'verpasst', 'Termin in der Vergangenheit: „verpasst“ (nichts gesendet)');
select is((select j->'mails'->0->>'faellig_ab' from t1), '2026-10-24T08:00:00+00:00', 'Fällig ab: Samstag 10:00 Ortszeit (Sommerzeit) = 08:00 UTC, nicht 48 Stunden vorher');
select is((select j->'mails'->1->>'faellig_ab' from t1), '2026-10-26T08:00:00+00:00', 'Erinnerung: 1 Stunde vorher');
select is((public.termin_speichern(null, '2026-03-30T10:00', 'Frühling'))->>'startet_am', '2026-03-30T08:00:00+00:00', 'Termin im Sommer: 10:00 Ortszeit = 08:00 UTC');
select is((public.termin_speichern(null, '2026-03-30T10:00', 'Frühling', '2026-02-01', '{2}', '{1}'))->>'bezugsmonat_fest', '2026-02', 'Fester Bezugsmonat');
select is((public.termin_speichern(null, '2026-03-30T10:00', 'Frühling', '2026-02-01', '{2}', '{1}'))->>'bezugsmonat', '2026-02', 'Fester Bezugsmonat gilt');
select is((select (public.termin_speichern(null, '2026-03-30T10:00', 'Mehrere', null, '{3,1,2,2}', '{0.5,2}', true))->'vorlauf_tage'), '[1, 2, 3]'::jsonb, 'Mehrere Vorlauf-Werte: sortiert, ohne Doppelte');
select is((public.termin_speichern(null, '2026-03-30T10:00', 'Mehrere', null, '{3}', '{0.5,2}', true))->'erinnerung_stunden', '[0.5, 2]'::jsonb, 'Erinnerung: Dezimalwerte (0,5 Stunden)');
select is((public.termin_speichern((select (j->>'id')::uuid from t1), '2026-10-26T11:30', 'Teammeeting Oktober', null, '{2}', '{1}', true))->>'startet_lokal', '2026-10-26T11:30', 'Termin ändern');
select is((select j->>'admin_in_kopie' from (select public.termin_speichern((select (j->>'id')::uuid from t1), '2026-10-26T11:30', 'Teammeeting Oktober', null, '{2}', '{1}', true) as j) x), 'true', 'Termin ändern: Admin in Kopie');
select throws_ok($$ select public.termin_speichern('99999999-9999-9999-9999-999999999999', '2026-10-26T10:00') $$, '42501', 'Termin nicht gefunden.', 'Unbekannter Termin: 42501');
do $$ begin perform public.termin_speichern((select (j->>'id')::uuid from t1), '2026-10-26T10:00', 'Teammeeting Oktober', null, '{2}', '{1}', false); end $$;

-- Serien: Uhrzeit bleibt über die Zeitumstellung gleich
create temp table s1 as select public.termine_serie('2026-10-19T10:00', 'woechentlich', 3, 'Serie Woche') as j;
grant all on s1 to public;
select is((select count(*) from s1, jsonb_array_elements(j->'termine') t where t->>'titel' = 'Serie Woche'), 3::bigint, 'Serie: drei Termine');
select is((select string_agg(t->>'startet_lokal', ' ' order by t->>'startet_am') from s1, jsonb_array_elements(j->'termine') t where t->>'titel' = 'Serie Woche'), '2026-10-19T10:00 2026-10-26T10:00 2026-11-02T10:00', 'Serie wöchentlich: immer 10:00 Ortszeit');
select is((select string_agg(to_char((t->>'startet_am')::timestamptz at time zone 'UTC', 'MM-DD HH24:MI'), ' ' order by t->>'startet_am') from s1, jsonb_array_elements(j->'termine') t where t->>'titel' = 'Serie Woche'), '10-19 08:00 10-26 09:00 11-02 09:00', 'Serie über die Zeitumstellung: 08:00 UTC, dann 09:00 UTC');
select is((select count(distinct t->>'serie_id') from s1, jsonb_array_elements(j->'termine') t where t->>'titel' = 'Serie Woche'), 1::bigint, 'Serie: gemeinsame Serien-Kennung');
select is((select string_agg(t->>'startet_lokal', ' ' order by t->>'startet_am') from jsonb_array_elements(public.termine_serie('2026-12-07T09:30', 'zweiwoechentlich', 3, 'Serie 14')->'termine') t where t->>'titel' = 'Serie 14'), '2026-12-07T09:30 2026-12-21T09:30 2027-01-04T09:30', 'Serie zweiwöchentlich');
select is((select string_agg(t->>'startet_lokal', ' ' order by t->>'startet_am') from jsonb_array_elements(public.termine_serie('2027-01-31T09:00', 'monatlich', 4, 'Serie Monat')->'termine') t where t->>'titel' = 'Serie Monat'), '2027-01-31T09:00 2027-02-28T09:00 2027-03-31T09:00 2027-04-30T09:00', 'Serie monatlich: jeder Termin vom ersten gerechnet (31. Januar, 28. Februar, 31. März)');
select throws_ok($$ select public.termine_serie('2026-10-26T10:00', 'woechentlich', 61) $$, '22023', 'Eine Serie hat 2 bis 60 Termine.', 'Serie über 60: 22023');
select throws_ok($$ select public.termine_serie('2026-10-26T10:00', 'woechentlich', 1) $$, '22023', 'Eine Serie hat 2 bis 60 Termine.', 'Serie mit einem Termin: 22023');
select throws_ok($$ select public.termine_serie('2026-10-26T10:00', 'taeglich', 5) $$, '22023', 'Der Rhythmus muss „woechentlich“, „zweiwoechentlich“ oder „monatlich“ sein.', 'Unbekannter Rhythmus: 22023');
select is((select count(*) from jsonb_array_elements(public.termine_serie('2027-06-01T10:00', 'woechentlich', 60, 'Lange Serie')->'termine') t where t->>'titel' = 'Lange Serie'), 60::bigint, 'Serie bis 60 Termine');

-- Entfernen: nicht löschen, nur kennzeichnen
select is((select count(*) from jsonb_array_elements(public.termin_entfernen((select (j->>'id')::uuid from t1))->'termine') t where (t->>'entfernt')::boolean), 1::bigint, 'Termin entfernen: als „entfernt“ gekennzeichnet');
reset role;
select is((select count(*) from public.meeting_termine where id = (select (j->>'id')::uuid from t1)), 1::bigint, 'Der Termin ist nicht gelöscht');
set local role authenticated;
select throws_ok($$ select public.termin_speichern((select (j->>'id')::uuid from t1), '2026-10-26T10:00') $$, '42501', 'Termin nicht gefunden.', 'Entfernter Termin lässt sich nicht mehr ändern');
select is((select t->'mails'->0->>'status' from jsonb_array_elements(public.termine_liste()->'termine') t where (t->>'id')::uuid = (select (j->>'id')::uuid from t1)), 'entfernt', 'Entfernter Termin: Mail-Zustand „entfernt“');
reset role;

-- Salon-Grenze und Admin-Salon
select is((select count(distinct salon_id) from public.meeting_termine), 1::bigint, 'Alle Termine gehören zum ersten Salon (Admin wertet den ersten Salon der Instanz aus)');
select is((select salon_id from public.meeting_termine limit 1), 'cccccccc-0000-0000-0000-00000000000c'::uuid, 'Der erste Salon ist Salon P');

-- ---------------------------------------------------------------------------
-- Versand: Fälligkeit über die Zeitumstellung (nur service_role)
-- ---------------------------------------------------------------------------
-- Eigene, saubere Termine für die Versand-Tests
reset role;
delete from public.meeting_termine;
insert into public.meeting_termine (id, salon_id, startet_am, titel, vorlauf_tage, erinnerung_stunden) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-00000000000c', '2026-10-26 10:00'::timestamp at time zone 'Europe/Berlin', 'Herbst',  '{2}', '{1}'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-00000000000c', '2027-03-29 10:00'::timestamp at time zone 'Europe/Berlin', 'Frühling', '{2}', '{1}');
create function pg_temp.faellig(p_zeit text) returns text language sql as $$
  select coalesce(string_agg(x->>'titel' || ':' || (x->>'art'), ',' order by x->>'titel', x->>'art'), '') from jsonb_array_elements(public.versand_faellig(p_zeit::timestamptz)) x
$$;
grant execute on function pg_temp.faellig(text) to public;

set local role service_role;
-- Herbst: Termin Mo 26.10.2026 10:00 (CET, 09:00 UTC). Minus 2 Tage in Ortszeit = Sa 24.10. 10:00 CEST = 08:00 UTC
select is(pg_temp.faellig('2026-10-24 07:59:00+00'), '', 'Herbst: 07:59 UTC ist nichts fällig');
select is(pg_temp.faellig('2026-10-24 08:00:00+00'), 'Herbst:vorab', 'Herbst: ab 08:00 UTC ist „vorab“ fällig (nicht erst um 09:00)');
select is(pg_temp.faellig('2026-10-25 12:00:00+00'), 'Herbst:vorab', 'Herbst: weiterhin „vorab“, noch keine Erinnerung');
select is(pg_temp.faellig('2026-10-26 07:59:00+00'), 'Herbst:vorab', 'Herbst: 07:59 UTC am Termintag, Erinnerung noch nicht (Termin 09:00 UTC, 1 Stunde vorher = 08:00)');
select is(pg_temp.faellig('2026-10-26 08:00:00+00'), 'Herbst:erinnerung,Herbst:vorab', 'Herbst: 08:00 UTC: „vorab“ (nachgeholt) und Erinnerung');
select is(pg_temp.faellig('2026-10-26 08:59:59+00'), 'Herbst:erinnerung,Herbst:vorab', 'Herbst: eine Sekunde vor Beginn noch fällig');
select is(pg_temp.faellig('2026-10-26 09:00:00+00'), '', 'Herbst: nach Terminbeginn nichts mehr');
select is(pg_temp.faellig('2026-10-27 09:00:00+00'), '', 'Herbst: Tage später nichts mehr (kein Nachholen nach dem Termin)');
-- Frühling: Termin Mo 29.03.2027 10:00 (CEST, 08:00 UTC). Zeitumstellung am 28.03.2027 (Sonntag). Minus 2 Tage in Ortszeit = Sa 27.03. 10:00 CET = 09:00 UTC
select is(pg_temp.faellig('2027-03-27 08:59:00+00'), '', 'Frühling: 08:59 UTC ist nichts fällig');
select is(pg_temp.faellig('2027-03-27 09:00:00+00'), 'Frühling:vorab', 'Frühling: ab 09:00 UTC fällig (48 Stunden wären 08:00 UTC)');
select is(pg_temp.faellig('2027-03-29 06:59:00+00'), 'Frühling:vorab', 'Frühling: Erinnerung 1 Stunde vor 08:00 UTC, also noch nicht');
select is(pg_temp.faellig('2027-03-29 07:00:00+00'), 'Frühling:erinnerung,Frühling:vorab', 'Frühling: Erinnerung ab 07:00 UTC');
select is(pg_temp.faellig('2027-03-29 08:00:00+00'), '', 'Frühling: nach Beginn nichts mehr');
reset role;

-- mehrere Werte: der größte löst aus
update public.meeting_termine set vorlauf_tage = '{1,3}', erinnerung_stunden = '{0.5,2}' where id = 'eeeeeeee-0000-0000-0000-000000000001';
set local role service_role;
select is(pg_temp.faellig('2026-10-23 07:59:00+00'), '', 'Mehrere Werte: 3 Tage vorher ist der größte, davor nichts');
select is(pg_temp.faellig('2026-10-23 08:00:00+00'), 'Herbst:vorab', 'Mehrere Werte: ab 3 Tagen vorher (Do 23.10. 10:00 Ortszeit = 08:00 UTC)');
select is(pg_temp.faellig('2026-10-26 06:59:00+00'), 'Herbst:vorab', 'Mehrere Werte: Erinnerung noch nicht, 2 Stunden vorher = 07:00 UTC');
select is(pg_temp.faellig('2026-10-26 07:00:00+00'), 'Herbst:erinnerung,Herbst:vorab', 'Mehrere Werte: Erinnerung 2 Stunden vorher (der größte Wert)');
reset role;
update public.meeting_termine set vorlauf_tage = '{2}', erinnerung_stunden = '{1}' where id = 'eeeeeeee-0000-0000-0000-000000000001';

-- pausiert und entfernt
update public.meeting_termine set mails_pausiert = true where id = 'eeeeeeee-0000-0000-0000-000000000001';
set local role service_role;
select is(pg_temp.faellig('2026-10-25 12:00:00+00'), '', 'Pausiert: nichts fällig');
select ok(public.versand_beanspruchen('eeeeeeee-0000-0000-0000-000000000001', 'vorab', '2026-10-25 12:00:00+00') is null, 'Pausiert: nichts beanspruchbar');
reset role;
update public.meeting_termine set mails_pausiert = false, entfernt = true where id = 'eeeeeeee-0000-0000-0000-000000000001';
set local role service_role;
select is(pg_temp.faellig('2026-10-25 12:00:00+00'), '', 'Entfernt: nichts fällig');
reset role;
update public.meeting_termine set entfernt = false where id = 'eeeeeeee-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Beanspruchen, Wiederholungen, hängende Läufe
-- ---------------------------------------------------------------------------
set local role service_role;
select ok(public.versand_beanspruchen('eeeeeeee-0000-0000-0000-000000000001', 'vorab', '2026-10-24 07:59:00+00') is null, 'Nicht fällig: nicht beanspruchbar');
reset role;
select is((select count(*) from public.mail_log), 0::bigint, 'Nicht fällig: kein Protokolleintrag');
set local role service_role;
select is(public.versand_beanspruchen('eeeeeeee-0000-0000-0000-000000000001', 'vorab', '2026-10-24 08:00:00+00'), 1, 'Erster Lauf beansprucht (Versuch 1)');
select ok(public.versand_beanspruchen('eeeeeeee-0000-0000-0000-000000000001', 'vorab', '2026-10-24 08:00:05+00') is null, 'Zweiter Lauf bekommt null (UNIQUE entscheidet)');
select is(pg_temp.faellig('2026-10-24 08:05:00+00'), '', 'In Arbeit (jünger als 10 Minuten): nicht erneut fällig');
select ok(public.versand_beanspruchen('eeeeeeee-0000-0000-0000-000000000001', 'vorab', '2026-10-24 08:09:59+00') is null, 'Nach 9:59 Minuten: Lauf nicht übernehmbar');
select is(pg_temp.faellig('2026-10-24 08:10:01+00'), 'Herbst:vorab', 'Nach über 10 Minuten „in Arbeit“: wieder fällig (hängender Lauf)');
select is(public.versand_beanspruchen('eeeeeeee-0000-0000-0000-000000000001', 'vorab', '2026-10-24 08:10:01+00'), 2, 'Hängender Lauf wird übernommen (Versuch 2)');
do $$ begin perform public.versand_abschliessen('eeeeeeee-0000-0000-0000-000000000001', 'vorab', false, 'Resend: 500'); end $$;
select is(pg_temp.faellig('2026-10-24 08:20:00+00'), 'Herbst:vorab', 'Nach Fehler (Versuch 2 von 3): wieder fällig');
select is(public.versand_beanspruchen('eeeeeeee-0000-0000-0000-000000000001', 'vorab', '2026-10-24 08:20:00+00'), 3, 'Dritter Versuch');
do $$ begin perform public.versand_abschliessen('eeeeeeee-0000-0000-0000-000000000001', 'vorab', false, repeat('x', 800)); end $$;
select is(pg_temp.faellig('2026-10-24 08:30:00+00'), '', 'Nach drei Fehlversuchen: nie mehr fällig');
select ok(public.versand_beanspruchen('eeeeeeee-0000-0000-0000-000000000001', 'vorab', '2026-10-24 08:30:00+00') is null, 'Höchstens 3 Versuche: kein vierter');
reset role;
select is((select versuche from public.mail_log where art = 'vorab'), 3, 'Protokoll: 3 Versuche');
select is((select char_length(letzter_fehler) from public.mail_log where art = 'vorab'), 500, 'Protokoll: Fehlertext auf 500 Zeichen gekürzt');
select is((select status from public.mail_log where art = 'vorab'), 'fehler', 'Protokoll: Status „fehler“');

-- hängender Lauf nach drei Versuchen bleibt endgültig
update public.mail_log set status = 'in_arbeit', gestartet_am = '2026-10-24 08:30:00+00' where art = 'vorab';
set local role service_role;
select ok(public.versand_beanspruchen('eeeeeeee-0000-0000-0000-000000000001', 'vorab', '2026-10-24 09:00:00+00') is null, 'Hängender Lauf nach 3 Versuchen: nicht noch einmal');
select is(pg_temp.faellig('2026-10-24 09:00:00+00'), '', 'Hängender Lauf nach 3 Versuchen: nicht mehr fällig');

-- Erinnerung ist unabhängig; Erfolg wird nie wiederholt
select is(public.versand_beanspruchen('eeeeeeee-0000-0000-0000-000000000001', 'erinnerung', '2026-10-26 08:00:00+00'), 1, 'Erinnerung: eigener Zähler');
do $$ begin perform public.versand_abschliessen('eeeeeeee-0000-0000-0000-000000000001', 'erinnerung', true); end $$;
select ok(public.versand_beanspruchen('eeeeeeee-0000-0000-0000-000000000001', 'erinnerung', '2026-10-26 08:30:00+00') is null, 'Gesendet: kein Doppelversand');
select is(pg_temp.faellig('2026-10-26 08:30:00+00'), '', 'Gesendet: nicht mehr fällig (die „vorab“-Mail ist endgültig fehlgeschlagen)');
select throws_ok($$ select public.versand_beanspruchen('eeeeeeee-0000-0000-0000-000000000001', 'sonstiges') $$, '22023', 'Unbekannte Art der Mail.', 'Unbekannte Art: 22023');
do $$ begin perform public.versand_abschliessen('eeeeeeee-0000-0000-0000-000000000001', 'erinnerung', false, 'zu spät'); end $$;
reset role;
select is((select status from public.mail_log where art = 'erinnerung'), 'gesendet', 'Ein gesendeter Eintrag lässt sich nicht mehr zurücksetzen');
select is((select gesendet_am is not null from public.mail_log where art = 'erinnerung'), true, 'Protokoll: Sendezeit');
select throws_ok($$ insert into public.mail_log (termin_id, art, status) values ('eeeeeeee-0000-0000-0000-000000000001', 'vorab', 'in_arbeit') $$, '23505', null, 'UNIQUE (termin_id, art): kein zweiter Eintrag');
select throws_ok($$ insert into public.mail_log (termin_id, art, status, versuche) values ('eeeeeeee-0000-0000-0000-000000000002', 'vorab', 'fehler', 4) $$, '23514', null, 'Höchstens 3 Versuche (Constraint)');

-- ---------------------------------------------------------------------------
-- Terminliste: Mail-Zustände und Warnung
-- ---------------------------------------------------------------------------
update public.meeting_termine set startet_am = now() + interval '10 days' where id = 'eeeeeeee-0000-0000-0000-000000000001';
update public.meeting_termine set startet_am = now() + interval '30 days' where id = 'eeeeeeee-0000-0000-0000-000000000002';
select pg_temp.anmelden('22222222-0000-0000-0000-000000000010');
set local role authenticated;
create temp table tl as select public.termine_liste() as j;
grant all on tl to public;
select is((select (j->>'fehlgeschlagen')::int from tl), 1, 'Terminliste: eine endgültig fehlgeschlagene Mail (Warnung) – gezählt nur bei Terminen der letzten 60 Tage');
reset role;
delete from public.mail_log;
insert into public.mail_log (termin_id, art, status, versuche, letzter_fehler, gestartet_am) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'vorab', 'fehler', 2, 'Resend: 500', now() - interval '1 hour'),
  ('eeeeeeee-0000-0000-0000-000000000001', 'erinnerung', 'fehler', 3, 'Resend: Absender nicht bestätigt', now() - interval '1 hour');
select pg_temp.anmelden('22222222-0000-0000-0000-000000000010');
set local role authenticated;
create temp table tl2 as select public.termine_liste() as j;
grant all on tl2 to public;
select is((select t->'mails'->0->>'status' from tl2, jsonb_array_elements(j->'termine') t where t->>'id' = 'eeeeeeee-0000-0000-0000-000000000001'), 'fehler', 'Zustand „Fehler, Versuch 2 von 3“');
select is((select t->'mails'->0->>'versuche' from tl2, jsonb_array_elements(j->'termine') t where t->>'id' = 'eeeeeeee-0000-0000-0000-000000000001'), '2', 'Zustand: Versuch 2');
select is((select t->'mails'->0->>'fehler' from tl2, jsonb_array_elements(j->'termine') t where t->>'id' = 'eeeeeeee-0000-0000-0000-000000000001'), 'Resend: 500', 'Zustand: Grund');
select is((select t->'mails'->1->>'status' from tl2, jsonb_array_elements(j->'termine') t where t->>'id' = 'eeeeeeee-0000-0000-0000-000000000001'), 'fehlgeschlagen', 'Zustand „nach 3 Versuchen fehlgeschlagen“');
select is((select t->'mails'->1->>'fehler' from tl2, jsonb_array_elements(j->'termine') t where t->>'id' = 'eeeeeeee-0000-0000-0000-000000000001'), 'Resend: Absender nicht bestätigt', 'Zustand: Grund bei endgültigem Fehler');
select is((select (j->>'fehlgeschlagen')::int from tl2), 1, 'Warnung zählt den endgültigen Fehler');
select is((select t->'mails'->0->>'status' from tl2, jsonb_array_elements(j->'termine') t where t->>'id' = 'eeeeeeee-0000-0000-0000-000000000002'), 'geplant', 'Zustand „geplant“ (Termin in der Zukunft, nichts gesendet)');
reset role;
update public.meeting_termine set mails_pausiert = true where id = 'eeeeeeee-0000-0000-0000-000000000002';
update public.mail_log set status = 'gesendet', gesendet_am = now() where art = 'vorab';
update public.mail_log set status = 'in_arbeit', versuche = 3, gestartet_am = now() - interval '20 minutes' where art = 'erinnerung';
select pg_temp.anmelden('22222222-0000-0000-0000-000000000010');
set local role authenticated;
create temp table tl3 as select public.termine_liste() as j;
grant all on tl3 to public;
select is((select t->'mails'->0->>'status' from tl3, jsonb_array_elements(j->'termine') t where t->>'id' = 'eeeeeeee-0000-0000-0000-000000000001'), 'gesendet', 'Zustand „gesendet“');
select is((select t->'mails'->1->>'status' from tl3, jsonb_array_elements(j->'termine') t where t->>'id' = 'eeeeeeee-0000-0000-0000-000000000001'), 'fehlgeschlagen', 'Hängender Lauf nach 3 Versuchen: „fehlgeschlagen“');
select is((select t->'mails'->1->>'fehler' from tl3, jsonb_array_elements(j->'termine') t where t->>'id' = 'eeeeeeee-0000-0000-0000-000000000001'), 'Der Versand hat sich aufgehängt.', 'Hängender Lauf: Grund');
select is((select t->'mails'->0->>'status' from tl3, jsonb_array_elements(j->'termine') t where t->>'id' = 'eeeeeeee-0000-0000-0000-000000000002'), 'pausiert', 'Zustand „pausiert“');
reset role;

-- ---------------------------------------------------------------------------
-- Inhalt der Mail: Empfänger, keine Namen, keine Kommentare
-- ---------------------------------------------------------------------------
update public.meeting_termine set startet_am = '2026-10-26 10:00'::timestamp at time zone 'Europe/Berlin', mails_pausiert = false where id = 'eeeeeeee-0000-0000-0000-000000000001';
delete from public.analysen where typ = 'team_agenda';
set local role service_role;
create temp table mi as select public.agenda_fuer_versand('eeeeeeee-0000-0000-0000-000000000001', '2026-10-24 08:00:00+00') as j;
grant all on mi to public;
select is((select j->>'salon' from mi), 'Agendasalon P', 'Mail: Salon');
select is((select j->>'monat' from mi), '2026-09', 'Mail: Bezugsmonat ist der Monat vor dem Termin');
select is((select j->>'status' from mi), 'entwurf', 'Mail: ohne gespeicherte Agenda wird die Vorlage erzeugt (Stand: Entwurf)');
select is((select jsonb_array_length(j->'agenda'->'bloecke') from mi), 5, 'Mail: fünf Blöcke');
select is((select j->'empfaenger' from mi), '["chef@test.example", "ludwig@test.example"]'::jsonb, 'Empfänger: Verantwortliche mit E-Mail (klein geschrieben), ohne den inaktiven und ohne den ohne E-Mail, ohne Admin');
select is((select count(*) from unnest(array['anna@', 'berta@', 'cora@', 'xaver@', 'chef2@', 'admin@']) n where (select j->>'empfaenger' from mi) like '%' || n || '%'), 0::bigint, 'Empfänger: nie Mitarbeiter, nie ein anderer Salon');
select is((select count(*) from unnest(array['anna', 'berger', 'berta', 'hollmann', 'kranz', 'cora', 'sommer', 'ludwig', 'leiter', 'dietrich', 'quelle']) n
           where position(n in lower((select (j->'agenda')::text from mi))) > 0), 0::bigint, 'Mail: kein Name im Inhalt');
select is(position('Kommentar' in (select (j->'agenda')::text from mi)), 0, 'Mail: kein Kommentar im Inhalt');
select is(position('Beispiel' in (select (j->'agenda')::text from mi)), 0, 'Mail: keine Kommentar-Beispiele');
select ok((select j->'hinweis' = 'null'::jsonb from mi), 'Mail: kein Hinweis, wenn es eine Agenda gibt');
select is((select j->'termin'->>'startet_lokal' from mi), '2026-10-26T10:00', 'Mail: Termin in Ortszeit');
reset role;
update public.meeting_termine set admin_in_kopie = true where id = 'eeeeeeee-0000-0000-0000-000000000001';
set local role service_role;
select is((select public.agenda_fuer_versand('eeeeeeee-0000-0000-0000-000000000001', '2026-10-24 08:00:00+00')->'empfaenger'), '["admin@test.example", "chef@test.example", "ludwig@test.example"]'::jsonb, 'Empfänger mit Admin in Kopie');
reset role;
-- gespeicherte, freigegebene Agenda
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
do $$ begin perform public.agenda_erzeugen('2026-09-01'); end $$;
do $$ begin perform public.agenda_freigeben('2026-09-01'); end $$;
reset role;
set local role service_role;
select is((select public.agenda_fuer_versand('eeeeeeee-0000-0000-0000-000000000001', '2026-10-24 08:00:00+00')->>'status'), 'freigegeben', 'Mail: gespeicherte, freigegebene Agenda (Stand: freigegeben)');
select is(position('Beispiel aus den Kommentaren' in (public.agenda_fuer_versand('eeeeeeee-0000-0000-0000-000000000001', '2026-10-24 08:00:00+00')::text)), 0, 'Mail: auch aus der gespeicherten Agenda sind die Kommentar-Beispiele entfernt');
select is(position('hilft immer' in (public.agenda_fuer_versand('eeeeeeee-0000-0000-0000-000000000001', '2026-10-24 08:00:00+00')::text)), 0, 'Mail: kein Kommentartext');
select throws_ok($$ select public.agenda_fuer_versand('99999999-9999-9999-9999-999999999999') $$, '22023', 'Termin nicht gefunden.', 'Unbekannter Termin: 22023');
reset role;
-- Monat ohne Daten: ein Hinweis statt einer leeren Agenda
update public.meeting_termine set bezugsmonat = '2026-06-01' where id = 'eeeeeeee-0000-0000-0000-000000000001';
set local role service_role;
select ok((select public.agenda_fuer_versand('eeeeeeee-0000-0000-0000-000000000001', '2026-10-24 08:00:00+00')->'agenda') = 'null'::jsonb, 'Ohne Daten: keine Agenda');
select is((select public.agenda_fuer_versand('eeeeeeee-0000-0000-0000-000000000001', '2026-10-24 08:00:00+00')->>'hinweis'), 'Für diesen Monat liegen noch keine Auswertungen vor, deshalb gibt es noch keine Agenda.', 'Ohne Daten: ein Hinweis statt einer leeren Agenda');
reset role;
update public.meeting_termine set bezugsmonat = null where id = 'eeeeeeee-0000-0000-0000-000000000001';

select * from finish();
rollback;
