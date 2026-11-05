-- pgTAP-Tests für Phase C: PDF-Export (Daten, Rechte, Protokoll).
-- Ausführen: `supabase test db`
begin;
select plan(39);

create function pg_temp.anmelden(p_uid text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end
$$;

-- ---------------------------------------------------------------------------
-- Testdaten: Salon P mit Anna, Berta, Cora (ohne Abgabe), Chef, Ludwig (Verantwortlicher, nimmt teil), Admin;
-- Salon Q mit Xaver und Chef Zwei. Abgaben für September 2026 (Anna, Berta).
-- ---------------------------------------------------------------------------
insert into public.salons (id, name, start_monat, erstellt_am) values
  ('cccccccc-0000-0000-0000-00000000000c', 'Berichtssalon P', '2026-08-01', '2020-01-01'),
  ('dddddddd-0000-0000-0000-00000000000d', 'Berichtssalon Q', '2026-08-01', '2020-02-01');

insert into public.personen (id, salon_id, name, email, rolle, nimmt_an_teamumfrage, aktiv) values
  ('11111111-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-00000000000c', 'Anna Test',     'anna@test.example',   'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-00000000000c', 'Berta Test',    'berta@test.example',  'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-00000000000c', 'Cora Test',     'cora@test.example',   'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000e', 'cccccccc-0000-0000-0000-00000000000c', 'Chef Test',     'chef@test.example',   'verantwortlicher', false, true),
  ('11111111-0000-0000-0000-00000000000f', 'cccccccc-0000-0000-0000-00000000000c', 'Ludwig Leiter', 'ludwig@test.example', 'verantwortlicher', true,  true),
  ('11111111-0000-0000-0000-000000000010', null,                                   'Admin Test',    'admin@test.example',  'admin',            false, true),
  ('11111111-0000-0000-0000-000000000011', 'dddddddd-0000-0000-0000-00000000000d', 'Xaver Test',    'xaver@test.example',  'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-000000000012', 'dddddddd-0000-0000-0000-00000000000d', 'Chef Zwei',     'chef2@test.example',  'verantwortlicher', false, true);
insert into auth.users (id, email) values
  ('22222222-0000-0000-0000-00000000000a', 'anna@test.example'),
  ('22222222-0000-0000-0000-00000000000e', 'chef@test.example'),
  ('22222222-0000-0000-0000-00000000000f', 'ludwig@test.example'),
  ('22222222-0000-0000-0000-000000000010', 'admin@test.example'),
  ('22222222-0000-0000-0000-000000000011', 'xaver@test.example'),
  ('22222222-0000-0000-0000-000000000012', 'chef2@test.example');

insert into public.umfrage_abgaben
  (id, salon, monat, feedbackgeber, rohdaten, salon_id, feedbackgeber_id, entwicklung_person, entwicklung_begruendung) values
  ('99999999-0000-0000-0000-00000000000a', 'Berichtssalon P', '2026-09-01', 'Anna Test',  '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000a', 'Berta Test', 'Hat sich stark verbessert'),
  ('99999999-0000-0000-0000-00000000000b', 'Berichtssalon P', '2026-09-01', 'Berta Test', '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000b', 'Anna Test',  'Immer pünktlich und freundlich'),
  ('99999999-0000-0000-0000-00000000000c', 'Berichtssalon P', '2026-08-01', 'Anna Test',  '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000a', null, null);

create function pg_temp.bew(p_abgabe uuid, p_monat date, p_von uuid, p_von_name text, p_zu uuid, p_zu_name text, p_nr int, p_note int, p_text text)
returns void language sql as $$
  insert into public.umfrage_bewertungen
    (abgabe_id, salon, monat, bewertende_person, verhalten_nr, grundpfeiler, saeule, verhalten, art, bewertete_person, note, kommentar,
     bewertende_person_id, bewertete_person_id)
  values (p_abgabe, 'Berichtssalon P', p_monat, p_von_name, p_nr, 'Grundpfeiler 1', 'Säule ' || p_nr, 'Verhalten ' || p_nr,
          case when p_von = p_zu then 'selbstbild' else 'fremdbild' end, p_zu_name, p_note, p_text, p_von, p_zu)
$$;

-- September: Anna und Berta bewerten sich selbst und die andere, je zwei Verhalten
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '2026-09-01', '11111111-0000-0000-0000-00000000000a', 'Anna Test',  '11111111-0000-0000-0000-00000000000a', 'Anna Test',  1, 4, 'Ich gebe mir hier viel Mühe');
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '2026-09-01', '11111111-0000-0000-0000-00000000000a', 'Anna Test',  '11111111-0000-0000-0000-00000000000a', 'Anna Test',  2, 3, null);
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '2026-09-01', '11111111-0000-0000-0000-00000000000a', 'Anna Test',  '11111111-0000-0000-0000-00000000000b', 'Berta Test', 1, 5, 'Berta ist eine echte Stütze');
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '2026-09-01', '11111111-0000-0000-0000-00000000000a', 'Anna Test',  '11111111-0000-0000-0000-00000000000b', 'Berta Test', 2, 2, null);
select pg_temp.bew('99999999-0000-0000-0000-00000000000b', '2026-09-01', '11111111-0000-0000-0000-00000000000b', 'Berta Test', '11111111-0000-0000-0000-00000000000b', 'Berta Test', 1, 3, null);
select pg_temp.bew('99999999-0000-0000-0000-00000000000b', '2026-09-01', '11111111-0000-0000-0000-00000000000b', 'Berta Test', '11111111-0000-0000-0000-00000000000b', 'Berta Test', 2, 3, null);
select pg_temp.bew('99999999-0000-0000-0000-00000000000b', '2026-09-01', '11111111-0000-0000-0000-00000000000b', 'Berta Test', '11111111-0000-0000-0000-00000000000a', 'Anna Test',  1, 4, 'Anna kümmert sich sehr um Gäste');
select pg_temp.bew('99999999-0000-0000-0000-00000000000b', '2026-09-01', '11111111-0000-0000-0000-00000000000b', 'Berta Test', '11111111-0000-0000-0000-00000000000a', 'Anna Test',  2, 3, null);
-- August (Vormonat): nur Anna bewertet sich selbst
select pg_temp.bew('99999999-0000-0000-0000-00000000000c', '2026-08-01', '11111111-0000-0000-0000-00000000000a', 'Anna Test',  '11111111-0000-0000-0000-00000000000a', 'Anna Test',  1, 2, null);

-- ---------------------------------------------------------------------------
-- Monatsbericht (Verantwortlicher Chef)
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
create temp table mb as select public.pdf_monatsbericht('2026-09-01') as j;
grant all on mb to public;

select is((select j->>'salon' from mb), 'Berichtssalon P', 'Monatsbericht: Salonname');
select is((select j->>'monat' from mb), '2026-09', 'Monatsbericht: Monat');
select is((select (j->'beteiligung'->>'erwartet')::int from mb), 4, 'Monatsbericht: erwartet (Anna, Berta, Cora, Ludwig)');
select is((select (j->'beteiligung'->>'abgegeben')::int from mb), 2, 'Monatsbericht: abgegeben');
select is((select jsonb_array_length(j->'verhalten') from mb), 2, 'Monatsbericht: Ergebnis je Verhalten');
-- Selbstbild je Person: Anna 3,5, Berta 3,0 -> 3,25; Fremdbild: Anna 3,5 (4 und 3 von Berta), Berta 3,5 (5 und 2 von Anna) -> 3,5
select is((select (j->'kennzahlen'->>'sb')::numeric from mb), 3.25, 'Monatsbericht: Team-Selbstbild = Mittel der Personen');
select is((select (j->'kennzahlen'->>'fb')::numeric from mb), 3.5, 'Monatsbericht: Team-Fremdbild = Mittel der Personen');
select is((select (j->'kennzahlen'->>'differenz')::numeric from mb), -0.25, 'Monatsbericht: Differenz');
select ok((select j->'schwellen' ? 'hoch' or j->'schwellen' ? 'niedrig' from mb), 'Monatsbericht: Schwellen für die Stufe');
select ok((select j->'kommentare'->'team' ? 'quote' from mb), 'Monatsbericht: Kommentar-Kennzahlen');
select ok((select j ? 'zeit' from mb), 'Monatsbericht: Ausfüllzeit');
select is((select jsonb_array_length(j->'kommentare'->'personen') from mb), 2, 'Monatsbericht: Kommentar-Kennzahlen je Person');
select is(position('Berta ist eine echte' in (select j::text from mb)), 0, 'Monatsbericht: keine Kommentartexte');
select is((select count(*) from jsonb_array_elements((select j->'verhalten' from mb)) x where x ? 'person_id'), 0::bigint, 'Monatsbericht: keine Einzelpersonen in den Verhalten');
reset role;
select is((select count(*) from public.pdf_export_log where art = 'monatsbericht' and von_name = 'Chef Test'), 1::bigint, 'Protokoll: Eintrag für den Monatsbericht');

set local role authenticated;
select throws_ok($$ select public.pdf_monatsbericht('2026-07-01') $$, '22023', 'Für diesen Monat gibt es keine Auswertung.', 'Monat ohne Abgaben: 22023');
reset role;
select is((select count(*) from public.pdf_export_log), 1::bigint, 'Abgelehnter Abruf schreibt kein Protokoll');

-- ---------------------------------------------------------------------------
-- Personenbericht
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
create temp table pb as select public.pdf_personenbericht('11111111-0000-0000-0000-00000000000a', '2026-09-01') as j;
grant all on pb to public;
select is((select j->'person'->>'name' from pb), 'Anna Test', 'Personenbericht: Person');
select ok((select jsonb_array_length(j->'verhalten') >= 3 from pb), 'Personenbericht: Verhalten aller Monate (Vormonat, Verlauf)');
select is((select jsonb_array_length(j->'kommentare') from pb), 1, 'Personenbericht: ein Kommentar der Kollegen im September');
select is((select count(*) from jsonb_array_elements((select j->'kommentare' from pb)) x where x ? 'von'), 0::bigint, 'Personenbericht: Kommentare ohne Absender');
select is(position('Berta' in (select j::text from pb)), 0, 'Personenbericht: nirgends der Name des Absenders');
select is((select jsonb_array_length(j->'selbst_kommentare') from pb), 1, 'Personenbericht: eigener Kommentar');
select is((select jsonb_array_length(j->'entwicklung') from pb), 1, 'Personenbericht: Entwicklung des Monats (einmal genannt)');
select is((select j->'entwicklung'->0->>'begruendung' from pb), 'Immer pünktlich und freundlich', 'Personenbericht: Begründung ohne Absender');
select ok(not ((select j->'entwicklung'->0 from pb) ? 'von'), 'Personenbericht: Entwicklung ohne Absender');
select throws_ok($$ select public.pdf_personenbericht('11111111-0000-0000-0000-00000000000a', '2026-07-01') $$, '22023', null, 'Person ohne Daten im Monat: 22023');
select throws_ok($$ select public.pdf_personenbericht('11111111-0000-0000-0000-000000000011', '2026-09-01') $$, '42501', 'Person nicht gefunden.', 'Person eines anderen Salons: 42501');
select throws_ok($$ select public.pdf_personenbericht('99999999-9999-9999-9999-999999999999', '2026-09-01') $$, '42501', 'Person nicht gefunden.', 'Unbekannte Person sieht genauso aus');
reset role;
select is((select ziel_name from public.pdf_export_log where art = 'personenbericht'), 'Anna Test', 'Protokoll: Eintrag mit Ziel-Person');

-- ---------------------------------------------------------------------------
-- Datenschutz-Schalter, Rechte, Protokoll
-- ---------------------------------------------------------------------------
update public.salons set eigene_analyse_nur_admin = true where id = 'cccccccc-0000-0000-0000-00000000000c';
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000f');
set local role authenticated;
select throws_ok($$ select public.pdf_personenbericht('11111111-0000-0000-0000-00000000000f', '2026-09-01') $$, '42501', 'Person nicht gefunden.', 'Schalter an: Verantwortlicher bekommt den eigenen Bericht nicht');

select pg_temp.anmelden('22222222-0000-0000-0000-00000000000a');
select throws_ok($$ select public.pdf_monatsbericht('2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Monatsbericht');
select throws_ok($$ select public.pdf_personenbericht('11111111-0000-0000-0000-00000000000a', '2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Personenbericht');
select throws_ok($$ select public.pdf_export_protokoll() $$, '42501', 'Nur für Admins.', 'Mitarbeiter: kein Protokoll');
select throws_ok($$ select * from public.pdf_export_log $$, '42501', null, 'Protokoll-Tabelle ist gesperrt');

select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
select throws_ok($$ select public.pdf_export_protokoll() $$, '42501', 'Nur für Admins.', 'Verantwortlicher: kein Protokoll');

select pg_temp.anmelden('22222222-0000-0000-0000-000000000010');
select is((select jsonb_array_length(public.pdf_export_protokoll())), 2, 'Admin: sieht das Protokoll (2 Abrufe)');
select is((select public.pdf_export_protokoll()->0->>'von'), 'Chef Test', 'Admin: Protokoll nennt, wer abgerufen hat');
reset role;
set local role anon;
select throws_ok($$ select public.pdf_monatsbericht('2026-09-01') $$, '42501', null, 'anon: gesperrt');
reset role;

select * from finish();
rollback;
