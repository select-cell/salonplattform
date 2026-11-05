-- pgTAP-Tests für Version 1.3: KI nur für den Admin (salons.ki_nur_admin) und Gesamtauswertung des Teams.
-- Ausführen: `supabase test db`
begin;
select plan(118);

create function pg_temp.anmelden(p_uid text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end
$$;

-- ---------------------------------------------------------------------------
-- Testdaten wie in Test 07: Salon P (Anna, Berta, Cora ohne Abgabe, Chef Dietrich, Ludwig Leiter, Admin Quelle),
-- Salon Q (Xaver, Chef Zwei). Der Schalter ki_nur_admin bleibt auf dem Standard (an).
-- ---------------------------------------------------------------------------
insert into public.salons (id, name, start_monat, erstellt_am, schwelle_ausgewogen, schwelle_niveau_niedrig, schwelle_niveau_hoch) values
  ('cccccccc-0000-0000-0000-00000000000c', 'Analysesalon P', '2026-08-01', '2020-01-01', 0.3, 2.5, 3.5),
  ('dddddddd-0000-0000-0000-00000000000d', 'Analysesalon Q', '2026-08-01', '2020-02-01', 0.3, 2.5, 3.5);

insert into public.personen (id, salon_id, name, email, rolle, nimmt_an_teamumfrage, aktiv) values
  ('11111111-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-00000000000c', 'Anna Berger',           'anna@test.example',   'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-00000000000c', 'Berta Hollmann-Kranz',  'berta@test.example',  'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-00000000000c', 'Cora Sommer',           'cora@test.example',   'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000e', 'cccccccc-0000-0000-0000-00000000000c', 'Chef Dietrich',         'chef@test.example',   'verantwortlicher', false, true),
  ('11111111-0000-0000-0000-00000000000f', 'cccccccc-0000-0000-0000-00000000000c', 'Ludwig Leiter',         'ludwig@test.example', 'verantwortlicher', true,  true),
  ('11111111-0000-0000-0000-000000000010', null,                                   'Admin Quelle',          'admin@test.example',  'admin',            false, true),
  ('11111111-0000-0000-0000-000000000011', 'dddddddd-0000-0000-0000-00000000000d', 'Xaver Fremd',           'xaver@test.example',  'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-000000000012', 'dddddddd-0000-0000-0000-00000000000d', 'Chef Zwei',             'chef2@test.example',  'verantwortlicher', false, true);
insert into auth.users (id, email) values
  ('22222222-0000-0000-0000-00000000000a', 'anna@test.example'),
  ('22222222-0000-0000-0000-00000000000e', 'chef@test.example'),
  ('22222222-0000-0000-0000-00000000000f', 'ludwig@test.example'),
  ('22222222-0000-0000-0000-000000000010', 'admin@test.example'),
  ('22222222-0000-0000-0000-000000000011', 'xaver@test.example'),
  ('22222222-0000-0000-0000-000000000012', 'chef2@test.example');

insert into public.umfrage_abgaben
  (id, salon, monat, feedbackgeber, rohdaten, salon_id, feedbackgeber_id, entwicklung_person, entwicklung_begruendung) values
  ('99999999-0000-0000-0000-00000000000a', 'Analysesalon P', '2026-09-01', 'Anna Berger',          '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000a', 'Berta Hollmann-Kranz', 'Berta Hollmann-Kranz ist eine Stütze'),
  ('99999999-0000-0000-0000-00000000000b', 'Analysesalon P', '2026-09-01', 'Berta Hollmann-Kranz', '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000b', 'Anna Berger',          'Anna Berger kann Teams führen, meint Berta Hollmann-Kranz'),
  ('99999999-0000-0000-0000-00000000000d', 'Analysesalon P', '2026-09-01', 'Ludwig Leiter',        '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000f', null, null),
  ('99999999-0000-0000-0000-00000000000c', 'Analysesalon P', '2026-08-01', 'Anna Berger',          '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000a', null, null),
  ('99999999-0000-0000-0000-00000000000e', 'Analysesalon P', '2026-08-01', 'Berta Hollmann-Kranz', '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000b', null, null);

create function pg_temp.bew(p_abgabe uuid, p_monat date, p_von uuid, p_von_name text, p_zu uuid, p_zu_name text, p_nr int, p_note int, p_text text)
returns void language sql as $$
  insert into public.umfrage_bewertungen
    (abgabe_id, salon, monat, bewertende_person, verhalten_nr, grundpfeiler, saeule, verhalten, art, bewertete_person, note, kommentar,
     bewertende_person_id, bewertete_person_id)
  values (p_abgabe, 'Analysesalon P', p_monat, p_von_name, p_nr, 'Grundpfeiler 1', 'Säule ' || p_nr, 'Verhalten ' || p_nr,
          case when p_von = p_zu then 'selbstbild' else 'fremdbild' end, p_zu_name, p_note, p_text, p_von, p_zu)
$$;

-- September (Zahlen wie in Test 07)
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '2026-09-01', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', 1, 4, 'Ich, Anna, gebe mir viel Mühe');
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '2026-09-01', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', 2, 4, 'Das zweite Verhalten gelingt mir gut');
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '2026-09-01', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', 1, 5, 'Berta ist eine echte Stütze');
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '2026-09-01', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', 2, 4, 'Berta bleibt ruhig');
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '2026-09-01', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', 1, 4, 'Ludwig ist ein guter Chef');
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '2026-09-01', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', 2, 4, 'Ludwig hilft immer');
select pg_temp.bew('99999999-0000-0000-0000-00000000000b', '2026-09-01', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', 1, 3, null);
select pg_temp.bew('99999999-0000-0000-0000-00000000000b', '2026-09-01', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', 2, 3, null);
select pg_temp.bew('99999999-0000-0000-0000-00000000000b', '2026-09-01', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', 1, 3, 'Anna Berger ist freundlich, sagt Berta Hollmann-Kranz; Cora Sommer sieht das auch. Mail: berta@test.example');
select pg_temp.bew('99999999-0000-0000-0000-00000000000b', '2026-09-01', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', 2, 2, 'Seit 47 Minuten zu spät, Annas Kunden warten');
select pg_temp.bew('99999999-0000-0000-0000-00000000000d', '2026-09-01', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', 1, 3, null);
select pg_temp.bew('99999999-0000-0000-0000-00000000000d', '2026-09-01', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', 1, 4, 'ANNA arbeitet sorgfältig, hollmann-kranz weniger');
select pg_temp.bew('99999999-0000-0000-0000-00000000000d', '2026-09-01', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', 2, 3, null);
-- August (Vormonat): Anna Selbstbild 3 und 3, Fremdbild von Berta 2 und 2
select pg_temp.bew('99999999-0000-0000-0000-00000000000c', '2026-08-01', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', 1, 3, null);
select pg_temp.bew('99999999-0000-0000-0000-00000000000c', '2026-08-01', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', 2, 3, null);
select pg_temp.bew('99999999-0000-0000-0000-00000000000e', '2026-08-01', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', 1, 2, null);
select pg_temp.bew('99999999-0000-0000-0000-00000000000e', '2026-08-01', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', '11111111-0000-0000-0000-00000000000a', 'Anna Berger', 2, 2, null);

-- Fokus: Verhalten 1 gilt im September, Verhalten 2 galt nur bis Ende August
insert into public.verhalten (id, salon_id, nr, titel) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-00000000000c', 1, 'Gäste herzlich begrüßen'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-00000000000c', 2, 'Zeiten einhalten');
insert into public.fokus_verhalten (salon_id, verhalten_id, begruendung, gueltig_ab, gueltig_bis) values
  ('cccccccc-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'Anna Berger soll mehr lächeln', '2026-09-10', null),
  ('cccccccc-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000002', 'früher', '2026-06-01', '2026-08-31');

-- ---------------------------------------------------------------------------
-- Der Standard
-- ---------------------------------------------------------------------------
select is((select bool_and(ki_nur_admin) from public.salons), true, 'Standard: ki_nur_admin ist an');

-- ---------------------------------------------------------------------------
-- Mitarbeiter und Anmeldungen ohne Rolle: wie bisher „Nur für Verantwortliche und Admins.“
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000a');
set local role authenticated;
select throws_ok($$ select public.gesamt_eingabe('2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: keine Gesamt-Eingabe');
select throws_ok($$ select public.gesamt_pruefen('2026-09-01', 'x') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Gesamt-Faktencheck');
select throws_ok($$ select public.gesamt_speichern('2026-09-01', 'x', null, 'v1') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Gesamt-Speichern');
select throws_ok($$ select public.gesamt_lesen('2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Gesamt-Lesen');
select throws_ok($$ select public.gesamt_bearbeiten('2026-09-01', 'x') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Gesamt-Bearbeiten');
select throws_ok($$ select public.gesamt_freigeben('2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Gesamt-Freigeben');
select throws_ok($$ select private.gesamt_eingabe_bauen('cccccccc-0000-0000-0000-00000000000c', '2026-09-01') $$, '42501', null, 'Interne Hilfe ist nicht aufrufbar');
reset role;
set local role anon;
select throws_ok($$ select public.gesamt_eingabe('2026-09-01') $$, '42501', null, 'anon: keine Gesamt-Eingabe');
select throws_ok($$ select public.gesamt_speichern('2026-09-01', 'x', null, 'v1') $$, '42501', null, 'anon: kein Gesamt-Speichern');
reset role;
select is(has_function_privilege('anon', 'public.gesamt_eingabe(date)', 'execute'), false, 'anon darf gesamt_eingabe nicht ausführen');
select is(has_function_privilege('authenticated', 'public.gesamt_eingabe(date)', 'execute'), true, 'Angemeldete dürfen gesamt_eingabe aufrufen (die Rolle prüft die Funktion)');

-- ---------------------------------------------------------------------------
-- Verantwortlicher (Standard): kein KI-Zugriff, aber Monatsabschluss und PDF bleiben
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
select throws_ok($$ select public.analyse_eingabe('11111111-0000-0000-0000-00000000000a', '2026-09-01') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: keine Einzel-Eingabe');
select throws_ok($$ select public.analyse_pruefen('11111111-0000-0000-0000-00000000000a', '2026-09-01', 'x') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: kein Einzel-Faktencheck');
select throws_ok($$ select public.analyse_speichern('11111111-0000-0000-0000-00000000000a', '2026-09-01', 'x', null, 'v1') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: kein Einzel-Speichern');
select throws_ok($$ select public.analyse_lesen('11111111-0000-0000-0000-00000000000a', '2026-09-01') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: kein Einzel-Lesen');
select throws_ok($$ select public.analyse_bearbeiten('11111111-0000-0000-0000-00000000000a', '2026-09-01', 'x') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: kein Einzel-Bearbeiten');
select throws_ok($$ select public.analyse_freigeben('11111111-0000-0000-0000-00000000000a', '2026-09-01') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: kein Einzel-Freigeben');
select throws_ok($$ select public.gesamt_eingabe('2026-09-01') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: keine Gesamt-Eingabe');
select throws_ok($$ select public.gesamt_pruefen('2026-09-01', 'x') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: kein Gesamt-Faktencheck');
select throws_ok($$ select public.gesamt_speichern('2026-09-01', 'x', null, 'v1') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: kein Gesamt-Speichern');
select throws_ok($$ select public.gesamt_lesen('2026-09-01') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: kein Gesamt-Lesen');
select throws_ok($$ select public.gesamt_bearbeiten('2026-09-01', 'x') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: kein Gesamt-Bearbeiten');
select throws_ok($$ select public.gesamt_freigeben('2026-09-01') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: kein Gesamt-Freigeben');

create temp table v_ab as select public.monat_abschliessen('2026-09-01') as j;
grant all on v_ab to public;
select is((select (j->>'abgaben')::int from v_ab), 3, 'Verantwortlicher: darf den Monat abschließen');
create temp table v_ue as select public.abschluss_uebersicht('2026-09-01') as j;
grant all on v_ue to public;
select is((select (j->>'ki')::boolean from v_ue), false, 'Verantwortlicher: Übersicht meldet ki = false');
select ok((select j->'gesamt' = 'null'::jsonb from v_ue), 'Verantwortlicher: Übersicht ohne Gesamtauswertung');
select is((select jsonb_array_length(j->'personen') from v_ue), 3, 'Verantwortlicher: die Personenliste bleibt');
reset role;

-- ---------------------------------------------------------------------------
-- Admin: vor dem Abschluss
-- ---------------------------------------------------------------------------
delete from public.monatsabschluesse;
select pg_temp.anmelden('22222222-0000-0000-0000-000000000010');
set local role authenticated;
select throws_ok($$ select public.gesamt_eingabe('2026-09-01') $$, '22023', 'Der Monat ist noch nicht abgeschlossen.', 'Admin: Eingabe vor dem Abschluss 22023');
select throws_ok($$ select public.gesamt_speichern('2026-09-01', 'x', null, 'v1') $$, '22023', 'Der Monat ist noch nicht abgeschlossen.', 'Admin: Speichern vor dem Abschluss 22023');
select throws_ok($$ select public.gesamt_eingabe('2026-07-01') $$, '22023', 'Für diesen Monat gibt es keine Auswertung.', 'Admin: Monat ohne Daten 22023');
select throws_ok($$ select public.gesamt_eingabe(null) $$, '22023', 'Der Monat fehlt.', 'Admin: ohne Monat 22023');
select ok(public.gesamt_lesen('2026-09-01') is null, 'Admin: noch keine Gesamtauswertung (Lesen braucht keinen Abschluss)');
create temp table ue0 as select public.abschluss_uebersicht('2026-09-01') as j;
grant all on ue0 to public;
select is((select (j->>'ki')::boolean from ue0), true, 'Admin: Übersicht meldet ki = true');
select ok((select j->'gesamt' = 'null'::jsonb from ue0), 'Admin: noch keine Gesamtauswertung in der Übersicht');
create temp table ab as select public.monat_abschliessen('2026-09-01') as j;
grant all on ab to public;
select is((select j->>'von' from ab), 'Admin Quelle', 'Admin: schließt den Monat ab');

-- ---------------------------------------------------------------------------
-- Eingabe der Gesamtauswertung
-- ---------------------------------------------------------------------------
create temp table ge as select public.gesamt_eingabe('2026-09-15') as j;
grant all on ge to public;
select is((select j->'eingabe'->>'bewertet' from ge), 'das Team', 'Gesamt-Eingabe: das Team');
select is((select j->'eingabe'->>'monat' from ge), '2026-09', 'Gesamt-Eingabe: Monat');
select is((select (j->'eingabe'->'beteiligung'->>'abgegeben')::int from ge), 3, 'Gesamt-Eingabe: Beteiligung 3');
select is((select (j->'eingabe'->'beteiligung'->>'erwartet')::int from ge), 4, 'Gesamt-Eingabe: von 4');
select is((select (j->'eingabe'->>'personen_mit_bewertung')::int from ge), 3, 'Gesamt-Eingabe: drei bewertete Personen');
select is((select (j->'eingabe'->'kennzahlen'->>'selbstbild')::numeric from ge), 3.3, 'Gesamt-Eingabe: Team-Selbstbild 3,3');
select is((select (j->'eingabe'->'kennzahlen'->>'fremdbild')::numeric from ge), 3.8, 'Gesamt-Eingabe: Team-Fremdbild 3,8');
select is((select (j->'eingabe'->'kennzahlen'->>'differenz')::numeric from ge), -0.5, 'Gesamt-Eingabe: Differenz −0,5');
select is((select j->'eingabe'->'kennzahlen'->>'einordnung' from ge), 'Selbstunterschätzung', 'Gesamt-Eingabe: Einordnung nach den Schwellen');
select is((select j->'eingabe'->'kennzahlen'->>'stufe_fremdbild' from ge), 'hoch', 'Gesamt-Eingabe: Stufe des Fremdbilds');
select is((select j->'eingabe'->'vormonat'->>'monat' from ge), '2026-08', 'Gesamt-Eingabe: Vormonat');
select is((select (j->'eingabe'->'vormonat'->>'fremdbild')::numeric from ge), 2.0, 'Gesamt-Eingabe: Fremdbild im Vormonat 2,0');
select is((select (j->'eingabe'->'vormonat'->>'veraenderung_fremdbild')::numeric from ge), 1.8, 'Gesamt-Eingabe: Veränderung des Fremdbilds +1,8');
select is((select (j->'eingabe'->'vormonat'->>'veraenderung_selbstbild')::numeric from ge), 0.3, 'Gesamt-Eingabe: Veränderung des Selbstbilds +0,3');
select is((select jsonb_array_length(j->'eingabe'->'verhalten') from ge), 2, 'Gesamt-Eingabe: zwei Verhalten');
select is((select j->'eingabe'->'verhalten'->0->>'titel' from ge), 'Gäste herzlich begrüßen', 'Gesamt-Eingabe: Titel aus der Verhaltensliste');
select is((select (j->'eingabe'->'verhalten'->0->>'fremdbild')::numeric from ge), 4.0, 'Gesamt-Eingabe: Verhalten 1, Fremdbild 4,0');
select is((select (j->'eingabe'->'verhalten'->0->>'selbstbild')::numeric from ge), 3.3, 'Gesamt-Eingabe: Verhalten 1, Selbstbild 3,3');
select is((select (j->'eingabe'->'verhalten'->0->>'differenz')::numeric from ge), -0.7, 'Gesamt-Eingabe: Verhalten 1, Differenz −0,7');
select is((select (j->'eingabe'->'verhalten'->0->>'veraenderung_fremdbild')::numeric from ge), 2.0, 'Gesamt-Eingabe: Verhalten 1, Veränderung +2,0');
select is((select j->'eingabe'->'verhalten'->1->>'titel' from ge), 'Zeiten einhalten', 'Gesamt-Eingabe: Verhalten 2, Titel aus der Verhaltensliste');
select is((select (j->'eingabe'->'staerken'->0->>'nr')::int from ge), 1, 'Gesamt-Eingabe: stärkstes Verhalten Nr. 1');
select is((select (j->'eingabe'->'entwicklungsfelder'->0->>'nr')::int from ge), 2, 'Gesamt-Eingabe: größtes Entwicklungsfeld Nr. 2');
select is((select jsonb_array_length(j->'eingabe'->'groesste_differenzen') from ge), 1, 'Gesamt-Eingabe: nur Differenzen über der Schwelle (Verhalten 2 liegt mit 0,25 darunter)');
select is((select (j->'eingabe'->'groesste_differenzen'->0->>'nr')::int from ge), 1, 'Gesamt-Eingabe: größte Differenz bei Verhalten 1');
select is((select jsonb_array_length(j->'eingabe'->'groesste_veraenderungen') from ge), 2, 'Gesamt-Eingabe: zwei Veränderungen zum Vormonat');
select is((select (j->'eingabe'->'groesste_veraenderungen'->0->>'nr')::int from ge), 1, 'Gesamt-Eingabe: größte Veränderung bei Verhalten 1');
select is((select jsonb_array_length(j->'eingabe'->'fokus_verhalten') from ge), 1, 'Gesamt-Eingabe: ein Fokus-Verhalten gilt im September');
select is((select (j->'eingabe'->'fokus_verhalten'->0->>'nr')::int from ge), 1, 'Gesamt-Eingabe: es ist Verhalten 1');
select is((select (j->'eingabe'->'kommentare'->>'fremdbild_bewertungen')::int from ge), 8, 'Gesamt-Eingabe: acht Fremdbild-Bewertungen');
select is((select (j->'eingabe'->'kommentare'->>'davon_mit_kommentar')::int from ge), 7, 'Gesamt-Eingabe: sieben davon mit Kommentar (nur die Zahl)');
select is((select count(*) from unnest(array['anna', 'berger', 'berta', 'hollmann', 'kranz', 'cora', 'sommer', 'ludwig', 'leiter', 'dietrich', 'chef', 'quelle', 'admin', 'test.example', 'stütze', 'minuten', 'lächeln', 'freundlich']) n
           where position(n in lower((select j::text from ge))) > 0), 0::bigint, 'Gesamt-Eingabe: kein Name, keine E-Mail-Adresse, kein Kommentartext, keine Fokus-Begründung');
select ok((select (j->'eingabe')::text !~ '"(von|id|person_id|email|bewertende_person|feedbackgeber|kommentar|begruendung)"' from ge), 'Gesamt-Eingabe: keine Felder für Absender, Kennungen oder Texte');
select is((select j->>'hash' from ge), (select md5((j->'eingabe')::text) from ge), 'Gesamt-Eingabe: der Hash gehört zur Eingabe');

-- ---------------------------------------------------------------------------
-- Faktencheck
-- ---------------------------------------------------------------------------
select is((public.gesamt_pruefen('2026-09-01', E'## Zusammenfassung\nDas Fremdbild liegt bei 3,8, das Selbstbild bei 3,3.')->>'geprueft')::boolean, true, 'Faktencheck: Zahlen aus den Daten bestehen');
select is((public.gesamt_pruefen('2026-09-01', 'Das Fremdbild liegt bei 3,80.')->>'geprueft')::boolean, true, 'Faktencheck: 3,80 = 3,8');
select is((public.gesamt_pruefen('2026-09-01', 'Das Fremdbild liegt bei 4,71.')->>'hinweis'), 'Faktencheck nicht bestanden: 4,71 steht nicht in den Daten', 'Faktencheck: erfundene Zahl wird genannt');
select is((public.gesamt_pruefen('2026-09-01', E'1. Erster Punkt\n2) Zweiter Punkt\nNoten von 1 bis 5')->>'geprueft')::boolean, true, 'Faktencheck: Listennummern und 1 bis 5 zählen nicht');
select is((public.gesamt_pruefen('2026-09-01', 'ok', '{"x": ["Wert 9,9"]}'::jsonb)->'abweichungen')::text, '["9,9"]', 'Faktencheck: auch die strukturierte Ausgabe wird geprüft');

-- ---------------------------------------------------------------------------
-- Speichern, Lesen, Bearbeiten, Freigeben
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.gesamt_speichern('2026-09-01', '  ', null, 'gesamt-v1') $$, '22023', 'Der Text der Auswertung fehlt.', 'Speichern ohne Text: 22023');
select throws_ok($$ select public.gesamt_speichern('2026-09-01', 'Text', null, ' ') $$, '22023', 'Die Prompt-Version fehlt.', 'Speichern ohne Prompt-Version: 22023');
select throws_ok($$ select public.gesamt_bearbeiten('2026-09-01', 'x') $$, '22023', 'Es gibt noch keine Auswertung.', 'Bearbeiten ohne Auswertung: 22023');
select throws_ok($$ select public.gesamt_freigeben('2026-09-01') $$, '22023', 'Es gibt noch keine Auswertung.', 'Freigeben ohne Auswertung: 22023');

create temp table gs1 as select public.gesamt_speichern('2026-09-01', E'## Zusammenfassung\nFremdbild 3,8.', '{"zusammenfassung": "Fremdbild 3,8."}'::jsonb, 'gesamt-v1', 'webhook', 'claude-x', 1) as j;
grant all on gs1 to public;
select is((select j->>'status' from gs1), 'entwurf', 'Speichern: Entwurf');
select is((select (j->>'geprueft')::boolean from gs1), true, 'Speichern: Faktencheck bestanden (die Datenbank rechnet selbst)');
select ok((select j->'person_id' = 'null'::jsonb from gs1), 'Speichern: ohne Person');
select is((select (j->>'veraltet')::boolean from gs1), false, 'Speichern: nicht veraltet');
select is((select j->>'prompt_version' from gs1), 'gesamt-v1', 'Speichern: Prompt-Version');
create temp table gs2 as select public.gesamt_speichern('2026-09-01', 'Das Fremdbild liegt bei 4,71.', null, 'gesamt-v1') as j;
grant all on gs2 to public;
select is((select (j->>'geprueft')::boolean from gs2), false, 'Erneut speichern: erfundene Zahl → geprueft = false (nicht vorgebbar)');
select is((select j->>'pruef_hinweis' from gs2), 'Faktencheck nicht bestanden: 4,71 steht nicht in den Daten', 'Erneut speichern: Hinweis');
reset role;
select is((select count(*) from public.analysen where typ = 'team_gesamt'), 1::bigint, 'Je Salon und Monat genau eine Gesamtauswertung');
select is((select count(*) from public.analysen where typ = 'person'), 0::bigint, 'Es gibt keine Einzelanalyse');
select throws_ok($$ insert into public.analysen (salon_id, monat, typ, text) values ('cccccccc-0000-0000-0000-00000000000c', '2026-09-01', 'unbekannt', 'x') $$, '23514', null, 'Nur bekannte Typen');

select pg_temp.anmelden('22222222-0000-0000-0000-000000000010');
set local role authenticated;
create temp table gl as select public.gesamt_lesen('2026-09-01') as j;
grant all on gl to public;
select is((select j->>'text' from gl), 'Das Fremdbild liegt bei 4,71.', 'Lesen: der gespeicherte Text');
select is((select (j->>'geprueft')::boolean from gl), false, 'Lesen: geprueft = false');

create temp table gb1 as select public.gesamt_bearbeiten('2026-09-01', 'Das Fremdbild liegt bei 3,8.') as j;
grant all on gb1 to public;
select is((select (j->>'bearbeitet')::boolean from gb1), true, 'Bearbeiten: bearbeitet');
select is((select (j->>'geprueft')::boolean from gb1), true, 'Bearbeiten: Faktencheck läuft neu und besteht');
select is((select j->>'bearbeitet_von' from gb1), 'Admin Quelle', 'Bearbeiten: von wem');

create temp table gf1 as select public.gesamt_freigeben('2026-09-01') as j;
grant all on gf1 to public;
select is((select j->>'status' from gf1), 'freigegeben', 'Freigeben: freigegeben');
select is((select j->>'freigegeben_von' from gf1), 'Admin Quelle', 'Freigeben: von wem');
select is((public.gesamt_bearbeiten('2026-09-01', 'Das Fremdbild liegt bei 3,8.')->>'status'), 'freigegeben', 'Unveränderter Text: die Freigabe bleibt');
select is((public.gesamt_bearbeiten('2026-09-01', 'Das Fremdbild liegt bei 3,8 und das Selbstbild bei 3,3.')->>'status'), 'entwurf', 'Bearbeiten macht die Auswertung wieder zum Entwurf');
select is((public.gesamt_freigeben('2026-09-01')->>'status'), 'freigegeben', 'Erneut freigeben');
select is((public.gesamt_freigeben('2026-09-01', false)->>'status'), 'entwurf', 'Freigabe zurücknehmen');

-- Übersicht mit Gesamtauswertung
create temp table ue1 as select public.abschluss_uebersicht('2026-09-01') as j;
grant all on ue1 to public;
select is((select j->'gesamt'->>'status' from ue1), 'entwurf', 'Übersicht: Status der Gesamtauswertung');
select is((select (j->'gesamt'->>'veraltet')::boolean from ue1), false, 'Übersicht: nicht veraltet');

-- Daten ändern → „Daten geändert“
reset role;
select pg_temp.bew('99999999-0000-0000-0000-00000000000d', '2026-09-01', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', '11111111-0000-0000-0000-00000000000b', 'Berta Hollmann-Kranz', 2, 1, null);
select pg_temp.anmelden('22222222-0000-0000-0000-000000000010');
set local role authenticated;
select is((public.gesamt_lesen('2026-09-01')->>'veraltet')::boolean, true, 'Neue Daten: die Gesamtauswertung zeigt „Daten geändert“');
select is(((public.abschluss_uebersicht('2026-09-01'))->'gesamt'->>'veraltet')::boolean, true, 'Neue Daten: auch in der Übersicht');
select isnt((public.gesamt_eingabe('2026-09-01')->>'hash'), (select j->>'hash' from ge), 'Neue Daten: neuer Hash');
reset role;

-- ---------------------------------------------------------------------------
-- Admin nutzt weiterhin die Einzelanalyse; Verantwortliche lesen im PDF nur Freigegebenes
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-000000000010');
set local role authenticated;
select is((public.analyse_speichern('11111111-0000-0000-0000-00000000000a', '2026-09-01', 'Das Fremdbild liegt bei 3,0.', null, 'analyse-v1')->>'status'), 'entwurf', 'Admin: Einzelanalyse speichern');
select is((public.analyse_freigeben('11111111-0000-0000-0000-00000000000a', '2026-09-01')->>'status'), 'freigegeben', 'Admin: Einzelanalyse freigeben');
reset role;
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
select is((public.pdf_personenbericht('11111111-0000-0000-0000-00000000000a', '2026-09-01')->'analyse'->>'text'), 'Das Fremdbild liegt bei 3,0.', 'Verantwortlicher: das PDF enthält die freigegebene Analyse');
select is((select j->'personen'->0->'analyse' from (select public.abschluss_uebersicht('2026-09-01') as j) x), 'null'::jsonb, 'Verantwortlicher: die Übersicht zeigt keine Analyse-Zustände');
reset role;

-- ---------------------------------------------------------------------------
-- Schalter aus: auch Verantwortliche dürfen (nur im eigenen Salon)
-- ---------------------------------------------------------------------------
update public.salons set ki_nur_admin = false where id = 'cccccccc-0000-0000-0000-00000000000c';
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
select is((public.gesamt_lesen('2026-09-01')->>'status'), 'entwurf', 'Schalter aus: Verantwortlicher liest die Gesamtauswertung');
select is((public.analyse_lesen('11111111-0000-0000-0000-00000000000a', '2026-09-01')->>'status'), 'freigegeben', 'Schalter aus: Verantwortlicher liest die Einzelanalyse');
select is(((public.abschluss_uebersicht('2026-09-01'))->>'ki')::boolean, true, 'Schalter aus: Übersicht meldet ki = true');
select is((select j->'personen'->0->'analyse'->>'status' from (select public.abschluss_uebersicht('2026-09-01') as j) x), 'freigegeben', 'Schalter aus: Übersicht zeigt die Analyse-Zustände');
reset role;
-- Mitarbeiter bleiben ausgeschlossen
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000a');
set local role authenticated;
select throws_ok($$ select public.gesamt_lesen('2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Schalter aus: Mitarbeiter bleiben ausgeschlossen');
reset role;
update public.salons set ki_nur_admin = true where id = 'cccccccc-0000-0000-0000-00000000000c';
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
select throws_ok($$ select public.gesamt_lesen('2026-09-01') $$, '42501', 'Nur für Admins.', 'Schalter wieder an: Verantwortlicher ausgeschlossen');
reset role;

-- ---------------------------------------------------------------------------
-- Anderer Salon: weder Daten noch Rechte von Salon P
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-000000000012');
set local role authenticated;
select throws_ok($$ select public.gesamt_lesen('2026-09-01') $$, '42501', 'Nur für Admins.', 'Anderer Salon (Standard): Verantwortlicher ausgeschlossen');
reset role;
update public.salons set ki_nur_admin = false where id = 'dddddddd-0000-0000-0000-00000000000d';
select pg_temp.anmelden('22222222-0000-0000-0000-000000000012');
set local role authenticated;
select throws_ok($$ select public.gesamt_lesen('2026-09-01') $$, '22023', 'Für diesen Monat gibt es keine Auswertung.', 'Anderer Salon (Schalter aus): sieht die Daten von Salon P nicht');
select throws_ok($$ select public.gesamt_eingabe('2026-09-01') $$, '22023', 'Für diesen Monat gibt es keine Auswertung.', 'Anderer Salon: keine Eingabe aus Salon P');
reset role;

select * from finish();
rollback;
