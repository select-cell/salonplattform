-- pgTAP-Tests für Phase E: Monatsabschluss und Einzelanalyse (Eingabe ohne Namen, Faktencheck, Entwurf und Freigabe, Rechte).
-- Ausführen: `supabase test db`
begin;
select plan(151);

create function pg_temp.anmelden(p_uid text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end
$$;

-- ---------------------------------------------------------------------------
-- Testdaten: Salon P mit Anna Berger, Berta Hollmann-Kranz, Cora Sommer (ohne Abgabe), Chef Dietrich,
-- Ludwig Leiter (Verantwortlicher, nimmt teil), Admin; Salon Q mit Xaver Fremd und Chef Zwei.
-- ---------------------------------------------------------------------------
insert into public.salons (id, name, start_monat, erstellt_am, schwelle_ausgewogen, schwelle_niveau_niedrig, schwelle_niveau_hoch) values
  ('cccccccc-0000-0000-0000-00000000000c', 'Analysesalon P', '2026-08-01', '2020-01-01', 0.3, 2.5, 3.5),
  ('dddddddd-0000-0000-0000-00000000000d', 'Analysesalon Q', '2026-08-01', '2020-02-01', 0.3, 2.5, 3.5);

-- Seit Version 1.3 dürfen standardmäßig nur Admins die KI nutzen (salons.ki_nur_admin, Standard an). Dieser Test prüft
-- die Logik der Analysen mit eingeschaltetem Zugriff für Verantwortliche; der Standard steht in 09_ki_admin_gesamt.test.sql.
update public.salons set ki_nur_admin = false;

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

-- Abgaben: September (Anna, Berta, Ludwig) und August (Anna, Berta)
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

-- September. Anna: Selbstbild 4 und 4; Fremdbild von Berta 3 und 2, von Ludwig 4 und 3 → Fremdbild 3,5 und 2,5, Schnitt 3,0.
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

-- ---------------------------------------------------------------------------
-- Rechte: Mitarbeiter und Anmeldungen ohne Rolle
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000a');
set local role authenticated;
select throws_ok($$ select public.monat_abschliessen('2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Abschluss');
select throws_ok($$ select public.abschluss_uebersicht('2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: keine Übersicht');
select throws_ok($$ select public.analyse_eingabe('11111111-0000-0000-0000-00000000000a', '2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: keine Eingabe');
select throws_ok($$ select public.analyse_pruefen('11111111-0000-0000-0000-00000000000a', '2026-09-01', 'x') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Faktencheck');
select throws_ok($$ select public.analyse_speichern('11111111-0000-0000-0000-00000000000a', '2026-09-01', 'x', null, 'v1') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Speichern');
select throws_ok($$ select public.analyse_lesen('11111111-0000-0000-0000-00000000000a', '2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Lesen (auch nicht die eigene Analyse)');
select throws_ok($$ select public.analyse_bearbeiten('11111111-0000-0000-0000-00000000000a', '2026-09-01', 'x') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Bearbeiten');
select throws_ok($$ select public.analyse_freigeben('11111111-0000-0000-0000-00000000000a', '2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Freigeben');
select throws_ok($$ select * from public.analysen $$, '42501', null, 'Tabelle analysen ist gesperrt');
select throws_ok($$ select * from public.monatsabschluesse $$, '42501', null, 'Tabelle monatsabschluesse ist gesperrt');
select throws_ok($$ select private.analyse_faktencheck('{}'::jsonb, 'x') $$, '42501', null, 'Interne Hilfen sind nicht aufrufbar');
reset role;

set local role anon;
select throws_ok($$ select public.monat_abschliessen('2026-09-01') $$, '42501', null, 'anon: kein Abschluss');
select throws_ok($$ select public.analyse_eingabe('11111111-0000-0000-0000-00000000000a', '2026-09-01') $$, '42501', null, 'anon: keine Eingabe');
select throws_ok($$ select public.analyse_speichern('11111111-0000-0000-0000-00000000000a', '2026-09-01', 'x', null, 'v1') $$, '42501', null, 'anon: kein Speichern');
select throws_ok($$ select * from public.analysen $$, '42501', null, 'anon: Tabelle analysen gesperrt');
reset role;

-- ---------------------------------------------------------------------------
-- Vor dem Abschluss
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
create temp table ue0 as select public.abschluss_uebersicht('2026-09-01') as j;
grant all on ue0 to public;
select is((select j->>'monat' from ue0), '2026-09', 'Übersicht: Monat');
select ok((select j->'abschluss' = 'null'::jsonb from ue0), 'Übersicht: noch nicht abgeschlossen');
select is((select (j->'aktuell'->>'abgaben')::int from ue0), 3, 'Übersicht: 3 Abgaben');
select is((select (j->'aktuell'->>'erwartet')::int from ue0), 4, 'Übersicht: 4 erwartet (Anna, Berta, Cora, Ludwig)');
select is((select jsonb_agg(x->>'name' order by x->>'name')::text from ue0, jsonb_array_elements(j->'nicht_abgegeben') x), '["Cora Sommer"]', 'Übersicht: nicht abgegeben = Cora');
select is((select jsonb_agg(x->>'name' order by x->>'name')::text from ue0, jsonb_array_elements(j->'personen') x), '["Anna Berger", "Berta Hollmann-Kranz", "Ludwig Leiter"]', 'Übersicht: Personen mit Bewertungen');
select ok((select bool_and(x->'analyse' = 'null'::jsonb) from ue0, jsonb_array_elements(j->'personen') x), 'Übersicht: noch keine Analysen');
select throws_ok($$ select public.analyse_eingabe('11111111-0000-0000-0000-00000000000a', '2026-09-01') $$, '22023', 'Der Monat ist noch nicht abgeschlossen.', 'Eingabe vor dem Abschluss: 22023');
select throws_ok($$ select public.analyse_speichern('11111111-0000-0000-0000-00000000000a', '2026-09-01', 'x', null, 'v1') $$, '22023', 'Der Monat ist noch nicht abgeschlossen.', 'Speichern vor dem Abschluss: 22023');
select throws_ok($$ select public.monat_abschliessen('2026-07-01') $$, '22023', 'Für diesen Monat gibt es noch keine Abgaben.', 'Monat ohne Abgaben lässt sich nicht abschließen');
select throws_ok($$ select public.monat_abschliessen(null) $$, '22023', 'Der Monat fehlt.', 'Ohne Monat: 22023');

-- ---------------------------------------------------------------------------
-- Abschluss (unvollständig) und erneuter Abschluss
-- ---------------------------------------------------------------------------
create temp table ab1 as select public.monat_abschliessen('2026-09-15') as j;
grant all on ab1 to public;
select is((select j->>'monat' from ab1), '2026-09', 'Abschluss: Monat (der 15. wird zum Monatsersten)');
select is((select (j->>'abgaben')::int from ab1), 3, 'Abschluss: 3 Abgaben');
select is((select (j->>'erwartet')::int from ab1), 4, 'Abschluss: 4 erwartet');
select is((select (j->>'unvollstaendig')::boolean from ab1), true, 'Abschluss: unvollständig (3 von 4)');
select is((select j->>'von' from ab1), 'Chef Dietrich', 'Abschluss: von wem');
select is((select (j->>'bereits_abgeschlossen')::boolean from ab1), false, 'Abschluss: erster Aufruf');
create temp table ab2 as select public.monat_abschliessen('2026-09-01') as j;
grant all on ab2 to public;
select is((select (j->>'bereits_abgeschlossen')::boolean from ab2), true, 'Zweiter Abschluss: bereits abgeschlossen');
reset role;
select is((select count(*) from public.monatsabschluesse), 1::bigint, 'Nur eine Abschluss-Zeile je Monat');
select is((select abgeschlossen_am from public.monatsabschluesse) <= (select aktualisiert_am from public.monatsabschluesse), true, 'Abschlusszeit bleibt, aktualisiert_am zieht nach');

-- ---------------------------------------------------------------------------
-- Eingabe für die KI (Anna)
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
create temp table ein as select public.analyse_eingabe('11111111-0000-0000-0000-00000000000a', '2026-09-01') as j;
grant all on ein to public;
select is((select j->'eingabe'->>'bewertete_person' from ein), 'die bewertete Person', 'Eingabe: die bewertete Person');
select is((select j->'eingabe'->>'monat' from ein), '2026-09', 'Eingabe: Monat');
select is((select (j->'eingabe'->'kennzahlen'->>'selbstbild')::numeric from ein), 4.0, 'Eingabe: Selbstbild 4,0');
select is((select (j->'eingabe'->'kennzahlen'->>'fremdbild')::numeric from ein), 3.0, 'Eingabe: Fremdbild 3,0 (Mittel aus 3,5 und 2,5)');
select is((select (j->'eingabe'->'kennzahlen'->>'differenz')::numeric from ein), 1.0, 'Eingabe: Differenz 1,0');
select is((select j->'eingabe'->'kennzahlen'->>'einordnung' from ein), 'Selbstüberschätzung', 'Eingabe: Einordnung nach den Schwellen');
select is((select j->'eingabe'->'kennzahlen'->>'stufe_fremdbild' from ein), 'mittel', 'Eingabe: Stufe des Fremdbilds');
select is((select j->'eingabe'->'vormonat'->>'monat' from ein), '2026-08', 'Eingabe: Vormonat');
select is((select (j->'eingabe'->'vormonat'->>'fremdbild')::numeric from ein), 2.0, 'Eingabe: Fremdbild im Vormonat 2,0');
select is((select (j->'eingabe'->'vormonat'->>'veraenderung_fremdbild')::numeric from ein), 1.0, 'Eingabe: Veränderung des Fremdbilds +1,0');
select is((select (j->'eingabe'->'vormonat'->>'veraenderung_selbstbild')::numeric from ein), 1.0, 'Eingabe: Veränderung des Selbstbilds +1,0');
select is((select jsonb_array_length(j->'eingabe'->'verhalten') from ein), 2, 'Eingabe: zwei Verhalten');
select is((select (j->'eingabe'->'verhalten'->0->>'fremdbild')::numeric from ein), 3.5, 'Eingabe: Verhalten 1, Fremdbild 3,5');
select is((select j->'eingabe'->'verhalten'->0->>'stufe_fremdbild' from ein), 'hoch', 'Eingabe: Verhalten 1 ist „hoch“ (ab 3,5)');
select is((select (j->'eingabe'->'verhalten'->0->>'veraenderung_fremdbild')::numeric from ein), 1.5, 'Eingabe: Verhalten 1, Veränderung +1,5');
select is((select (j->'eingabe'->'verhalten'->1->>'anzahl_fremdbilder')::int from ein), 2, 'Eingabe: zwei Fremdbilder je Verhalten');
select is((select (j->'eingabe'->'staerken'->0->>'nr')::int from ein), 1, 'Eingabe: stärkstes Verhalten ist Nr. 1');
select is((select (j->'eingabe'->'entwicklungsfelder'->0->>'nr')::int from ein), 2, 'Eingabe: größtes Entwicklungsfeld ist Nr. 2');
select is((select (j->'eingabe'->'beteiligung'->>'abgegeben')::int from ein), 3, 'Eingabe: Beteiligung 3 von 4');
select is((select jsonb_array_length(j->'eingabe'->'kommentare_kollegen') from ein), 3, 'Eingabe: drei Kommentare der Kollegen');
select is((select jsonb_array_length(j->'eingabe'->'eigene_kommentare') from ein), 2, 'Eingabe: zwei eigene Kommentare');
select is((select (j->'eingabe'->'entwicklung'->>'nennungen')::int from ein), 1, 'Eingabe: einmal für „Entwicklung“ genannt');
select is((select count(*) from unnest(array['anna', 'berger', 'berta', 'hollmann', 'kranz', 'cora', 'sommer', 'ludwig', 'leiter', 'dietrich', 'chef', 'quelle', 'admin', 'test.example']) n
           where position(n in lower((select j::text from ein))) > 0), 0::bigint, 'Eingabe: kein einziger Namensteil, keine E-Mail-Adresse (auch nicht klein oder GROSS geschrieben)');
select ok((select (j->'eingabe')::text !~ '"(von|id|person_id|email|bewertende_person|feedbackgeber)"' from ein), 'Eingabe: keine Felder für Absender oder Kennungen');
select ok((select exists (select 1 from jsonb_array_elements(j->'eingabe'->'kommentare_kollegen') x
                          where x->>'kommentar' ~ '^die bewertete Person ist freundlich, sagt Kollege [A-Z]; Kollege [A-Z] sieht das auch\. Mail: E-Mail-Adresse$') from ein),
          'Eingabe: ganze Namen werden ersetzt (die Person selbst, Absender und Dritte)');
select ok((select exists (select 1 from jsonb_array_elements(j->'eingabe'->'kommentare_kollegen') x
                          where x->>'kommentar' ~ '^die bewertete Person arbeitet sorgfältig, Kollege [A-Z] weniger$') from ein),
          'Eingabe: einzelne Namensteile und Großschreibung (ANNA, hollmann-kranz)');
select ok((select exists (select 1 from jsonb_array_elements(j->'eingabe'->'kommentare_kollegen') x
                          where x->>'kommentar' ~ '^Seit 47 Minuten zu spät, die bewertete Person Kunden warten$') from ein),
          'Eingabe: auch „Annas“ (Genitiv) wird ersetzt, Zahlen im Kommentar bleiben');
select is((select j->'eingabe'->'eigene_kommentare'->0->>'kommentar' from ein), 'Ich, die bewertete Person, gebe mir viel Mühe', 'Eingabe: eigener Kommentar ohne Namen');
select ok((select j->'eingabe'->'entwicklung'->'begruendungen'->>0 ~ '^die bewertete Person kann Teams führen, meint Kollege [A-Z]$' from ein), 'Eingabe: Begründung ohne Namen');
create temp table ein2 as select public.analyse_eingabe('11111111-0000-0000-0000-00000000000a', '2026-09-01') as j;
grant all on ein2 to public;
select is((select j->>'hash' from ein2), (select j->>'hash' from ein), 'Eingabe: gleicher Hash bei gleicher Datenlage (Buchstaben bleiben stabil)');
select is((select j->>'hash' from ein), md5((select (j->'eingabe')::text from ein)), 'Eingabe: Hash ist md5 der Eingabe');
select throws_ok($$ select public.analyse_eingabe('11111111-0000-0000-0000-00000000000c', '2026-09-01') $$, '22023', 'Für diese Person gibt es in diesem Monat keine Auswertung.', 'Person ohne Daten im Monat: 22023');
select throws_ok($$ select public.analyse_eingabe('11111111-0000-0000-0000-00000000000a', '2026-08-01') $$, '22023', 'Der Monat ist noch nicht abgeschlossen.', 'Monat mit Daten, aber nicht abgeschlossen: 22023');
select throws_ok($$ select public.analyse_eingabe('11111111-0000-0000-0000-000000000011', '2026-09-01') $$, '42501', 'Person nicht gefunden.', 'Person eines anderen Salons: 42501');
select throws_ok($$ select public.analyse_eingabe('99999999-9999-9999-9999-999999999999', '2026-09-01') $$, '42501', 'Person nicht gefunden.', 'Unbekannte Person sieht genauso aus');

-- ---------------------------------------------------------------------------
-- Faktencheck
-- ---------------------------------------------------------------------------
create function pg_temp.fc(p_text text, p_ausgabe jsonb default null) returns jsonb
language sql as $$ select public.analyse_pruefen('11111111-0000-0000-0000-00000000000a', '2026-09-01', p_text, p_ausgabe) $$;
grant execute on function pg_temp.fc(text, jsonb) to public;

select is((pg_temp.fc('Das Fremdbild liegt bei 3,0, das Selbstbild bei 4,0, die Differenz beträgt 1,0.'))->>'geprueft', 'true', 'Faktencheck: richtige Zahlen bestehen');
select is((pg_temp.fc('Verhalten 1 liegt bei 3,50 und Verhalten 2 bei 2.5.'))->>'geprueft', 'true', 'Faktencheck: 3,5 = 3.5 = 3,50');
select is((pg_temp.fc('Im September 2026 stieg das Fremdbild um −1,0 beziehungsweise +1,5.'))->>'geprueft', 'true', 'Faktencheck: Monat, Jahr und Vorzeichen');
select is((pg_temp.fc('Ein Kommentar nennt 47 Minuten Verspätung.'))->>'geprueft', 'true', 'Faktencheck: Zahlen aus Kommentaren sind erlaubt');
select is((pg_temp.fc(E'Gesprächsfragen:\n1. Was läuft gut?\n2. Was braucht Unterstützung?\n7. Was noch?'))->>'geprueft', 'true', 'Faktencheck: Listennummern zählen nicht');
select is((pg_temp.fc(E'Gesprächsfragen:\n- 1. Was läuft gut?\n  12) Was noch?'))->>'geprueft', 'true', 'Faktencheck: Listenpunkte mit Strich und Klammer zählen nicht');
select is((pg_temp.fc('Bei 5 von 5 möglichen Punkten.'))->>'geprueft', 'true', 'Faktencheck: 1 bis 5 sind immer erlaubt');
select is((pg_temp.fc('Das Fremdbild liegt bei 4,71.'))->>'geprueft', 'false', 'Faktencheck: erfundene Zahl wird erkannt');
select is((pg_temp.fc('Das Fremdbild liegt bei 4,71.'))->>'hinweis', 'Faktencheck nicht bestanden: 4,71 steht nicht in den Daten', 'Faktencheck: Hinweis wie in der Vorgabe');
select is((pg_temp.fc('Zwischen 4,71 und 2,9 und 3,0.'))->>'hinweis', 'Faktencheck nicht bestanden: 2,9 und 4,71 stehen nicht in den Daten', 'Faktencheck: mehrere Abweichungen');
select is((pg_temp.fc('Es sind 9,99, 8,5 und 6,25.'))->>'hinweis', 'Faktencheck nicht bestanden: 6,25, 8,5 und 9,99 stehen nicht in den Daten', 'Faktencheck: drei Abweichungen, aufsteigend');
select is((pg_temp.fc('Im Oktober 2027 war es 3,0.'))->>'geprueft', 'false', 'Faktencheck: falsches Jahr wird erkannt');
select is((pg_temp.fc('Alles in Ordnung', '{"zusammenfassung": "Wert 4,71", "staerken": ["Verhalten 1 mit 3,5"]}'))->>'geprueft', 'false', 'Faktencheck: erfundene Zahl in der strukturierten Ausgabe');
select is((pg_temp.fc('Alles in Ordnung', '{"zusammenfassung": "Wert 3,5", "staerken": ["Verhalten 1 mit 3,5"], "punkte": 4}'))->>'geprueft', 'true', 'Faktencheck: strukturierte Ausgabe mit richtigen Zahlen');
select is((pg_temp.fc('Alles in Ordnung', '{"punkte": 99}'))->>'geprueft', 'false', 'Faktencheck: erfundene Zahl als JSON-Zahl');
select is((pg_temp.fc('Alles in Ordnung', '{"fragen": ["1. Wie läuft es?", "2. Was noch?"]}'))->>'geprueft', 'true', 'Faktencheck: Listennummern in der strukturierten Ausgabe zählen nicht');
select is((pg_temp.fc('Text ohne jede Zahl'))->>'geprueft', 'true', 'Faktencheck: ein Text ohne Zahlen besteht');
select is((pg_temp.fc('Es sind 999.'))->'abweichungen', '["999"]'::jsonb, 'Faktencheck: ganze Zahlen ohne Komma');

-- ---------------------------------------------------------------------------
-- Speichern (Entwurf)
-- ---------------------------------------------------------------------------
create temp table sp1 as select public.analyse_speichern(
  '11111111-0000-0000-0000-00000000000a', '2026-09-01',
  E'## Zusammenfassung\nDas Fremdbild liegt bei 3,0, das Selbstbild bei 4,0.',
  '{"zusammenfassung": "Fremdbild 3,0"}'::jsonb, 'analyse-v1', 'claude', 'modell-x', 1) as j;
grant all on sp1 to public;
select is((select j->>'status' from sp1), 'entwurf', 'Speichern: Entwurf');
select is((select j->>'geprueft' from sp1), 'true', 'Speichern: Faktencheck von der Datenbank ermittelt (bestanden)');
select is((select j->>'eingabe_hash' from sp1), (select j->>'hash' from ein), 'Speichern: Hash der Eingabe wird mitgespeichert');
select is((select j->>'prompt_version' from sp1), 'analyse-v1', 'Speichern: Prompt-Version');
select is((select j->>'anbieter' from sp1), 'claude', 'Speichern: Anbieter');
select is((select j->>'veraltet' from sp1), 'false', 'Speichern: nicht veraltet');
select throws_ok($$ select public.analyse_speichern('11111111-0000-0000-0000-00000000000a', '2026-09-01', '  ', null, 'analyse-v1') $$, '22023', 'Der Text der Analyse fehlt.', 'Leerer Text: 22023');
select throws_ok($$ select public.analyse_speichern('11111111-0000-0000-0000-00000000000a', '2026-09-01', 'Text', null, '') $$, '22023', 'Die Prompt-Version fehlt.', 'Ohne Prompt-Version: 22023');
create temp table sp2 as select public.analyse_speichern(
  '11111111-0000-0000-0000-00000000000a', '2026-09-01', 'Das Fremdbild liegt bei 4,71.', null, 'analyse-v1', 'claude', 'modell-x', 3) as j;
grant all on sp2 to public;
select is((select j->>'geprueft' from sp2), 'false', 'Speichern: erfundene Zahl → geprueft = false (nicht fälschbar, es gibt keinen Parameter dafür)');
select is((select j->>'pruef_hinweis' from sp2), 'Faktencheck nicht bestanden: 4,71 steht nicht in den Daten', 'Speichern: Hinweis steht in der Analyse');
select is((select j->>'versuche' from sp2), '3', 'Speichern: Anzahl der KI-Aufrufe');
reset role;
select is((select count(*) from public.analysen), 1::bigint, 'Erneutes Speichern überschreibt: eine Zeile je Person und Monat');

-- Zweite Person und Salon-Grenze beim Speichern
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
select is((public.analyse_speichern('11111111-0000-0000-0000-00000000000b', '2026-09-01', 'Berta hat 3,0 im Selbstbild.', null, 'analyse-v1'))->>'status', 'entwurf', 'Zweite Person: Entwurf');
select is((public.analyse_lesen('11111111-0000-0000-0000-00000000000a', '2026-09-01'))->>'text', 'Das Fremdbild liegt bei 4,71.', 'Lesen: liefert den gespeicherten Text');
select ok((public.analyse_lesen('11111111-0000-0000-0000-00000000000f', '2026-09-01')) is null, 'Lesen: ohne Analyse null');

-- ---------------------------------------------------------------------------
-- Freigeben und Bearbeiten
-- ---------------------------------------------------------------------------
create temp table pb0 as select public.pdf_personenbericht('11111111-0000-0000-0000-00000000000a', '2026-09-01') as j;
grant all on pb0 to public;
select ok((select j->'analyse' = 'null'::jsonb from pb0), 'PDF: ein Entwurf kommt nicht in den Personenbericht');

select is((public.analyse_freigeben('11111111-0000-0000-0000-00000000000a', '2026-09-01'))->>'status', 'freigegeben', 'Freigabe: auch bei nicht bestandenem Faktencheck möglich');
select is((public.analyse_lesen('11111111-0000-0000-0000-00000000000a', '2026-09-01'))->>'freigegeben_von', 'Chef Dietrich', 'Freigabe: von wem');
select ok((public.analyse_lesen('11111111-0000-0000-0000-00000000000a', '2026-09-01'))->>'freigegeben_am' is not null, 'Freigabe: wann');
create temp table pb1 as select public.pdf_personenbericht('11111111-0000-0000-0000-00000000000a', '2026-09-01') as j;
grant all on pb1 to public;
select is((select j->'analyse'->>'text' from pb1), 'Das Fremdbild liegt bei 4,71.', 'PDF: freigegebene Analyse steht im Personenbericht');
select is((select j->'analyse'->>'freigegeben_von' from pb1), 'Chef Dietrich', 'PDF: Freigabe-Angabe');

select is((public.analyse_bearbeiten('11111111-0000-0000-0000-00000000000a', '2026-09-01', 'Das Fremdbild liegt bei 4,71.'))->>'status', 'freigegeben', 'Bearbeiten ohne Änderung: Freigabe bleibt');
create temp table be1 as select public.analyse_bearbeiten('11111111-0000-0000-0000-00000000000a', '2026-09-01', 'Das Fremdbild liegt bei 3,0 und das Selbstbild bei 4,0.') as j;
grant all on be1 to public;
select is((select j->>'status' from be1), 'entwurf', 'Bearbeiten macht die Analyse wieder zum Entwurf');
select is((select j->>'bearbeitet' from be1), 'true', 'Bearbeiten: als bearbeitet gekennzeichnet');
select is((select j->>'bearbeitet_von' from be1), 'Chef Dietrich', 'Bearbeiten: von wem');
select ok((select j->>'freigegeben_am' is null from be1), 'Bearbeiten: Freigabe ist zurückgesetzt');
select is((select j->>'geprueft' from be1), 'true', 'Bearbeiten: Faktencheck läuft erneut (jetzt bestanden)');
select is((select j->>'pruef_hinweis' from be1), null, 'Bearbeiten: kein Hinweis mehr');
select is((public.analyse_bearbeiten('11111111-0000-0000-0000-00000000000a', '2026-09-01', 'Das Fremdbild liegt bei 3,0, ganz sicher 8,8.'))->>'geprueft', 'false', 'Bearbeiten: von Hand eingetragene falsche Zahl wird erkannt');
select is((public.analyse_lesen('11111111-0000-0000-0000-00000000000a', '2026-09-01'))->>'pruef_hinweis', 'Faktencheck nicht bestanden: 8,8 steht nicht in den Daten', 'Bearbeiten: Hinweis nennt die Zahl');
select throws_ok($$ select public.analyse_bearbeiten('11111111-0000-0000-0000-00000000000a', '2026-09-01', '') $$, '22023', 'Der Text der Analyse fehlt.', 'Bearbeiten mit leerem Text: 22023');
select throws_ok($$ select public.analyse_bearbeiten('11111111-0000-0000-0000-00000000000f', '2026-09-01', 'Text') $$, '22023', 'Es gibt noch keine Analyse.', 'Bearbeiten ohne vorhandene Analyse: 22023');
select throws_ok($$ select public.analyse_freigeben('11111111-0000-0000-0000-00000000000f', '2026-09-01') $$, '22023', 'Es gibt noch keine Analyse.', 'Freigeben ohne vorhandene Analyse: 22023');
create temp table pb2 as select public.pdf_personenbericht('11111111-0000-0000-0000-00000000000a', '2026-09-01') as j;
grant all on pb2 to public;
select ok((select j->'analyse' = 'null'::jsonb from pb2), 'PDF: nach dem Bearbeiten ist die Analyse wieder ein Entwurf und fehlt im Bericht');
select is((public.analyse_freigeben('11111111-0000-0000-0000-00000000000a', '2026-09-01', false))->>'status', 'entwurf', 'Freigabe zurücknehmen');
select is((public.analyse_freigeben('11111111-0000-0000-0000-00000000000a', '2026-09-01'))->>'status', 'freigegeben', 'Erneut freigeben');

-- ---------------------------------------------------------------------------
-- Übersicht mit Analysen, veraltet nach neuer Abgabe
-- ---------------------------------------------------------------------------
create temp table ue1 as select public.abschluss_uebersicht('2026-09-01') as j;
grant all on ue1 to public;
select is((select x->'analyse'->>'status' from ue1, jsonb_array_elements(j->'personen') x where x->>'name' = 'Anna Berger'), 'freigegeben', 'Übersicht: Anna freigegeben');
select is((select x->'analyse'->>'status' from ue1, jsonb_array_elements(j->'personen') x where x->>'name' = 'Berta Hollmann-Kranz'), 'entwurf', 'Übersicht: Berta Entwurf');
select is((select x->'analyse'->>'veraltet' from ue1, jsonb_array_elements(j->'personen') x where x->>'name' = 'Anna Berger'), 'false', 'Übersicht: nicht veraltet');
reset role;

-- Cora gibt nach dem Abschluss noch ab (ohne Bewertungen): Beteiligung ändert sich, die Eingabe damit auch
insert into public.umfrage_abgaben (id, salon, monat, feedbackgeber, rohdaten, salon_id, feedbackgeber_id)
values ('99999999-0000-0000-0000-00000000000f', 'Analysesalon P', '2026-09-01', 'Cora Sommer', '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000c');
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
select is((public.abschluss_uebersicht('2026-09-01'))->'aktuell'->>'abgaben', '4', 'Nach später Abgabe: aktuell 4 Abgaben, im Abschluss stehen noch 3');
select is((public.abschluss_uebersicht('2026-09-01'))->'abschluss'->>'abgaben', '3', 'Der Abschluss behält seinen Stand');
select is((public.analyse_lesen('11111111-0000-0000-0000-00000000000a', '2026-09-01'))->>'veraltet', 'false', 'Eingabe unverändert, solange der Abschluss nicht aktualisiert wird');
select is((public.monat_abschliessen('2026-09-01'))->>'abgaben', '4', 'Erneuter Abschluss aktualisiert die Zahlen');
select is((public.monat_abschliessen('2026-09-01'))->>'unvollstaendig', 'false', 'Jetzt vollständig (4 von 4)');
select is((public.analyse_lesen('11111111-0000-0000-0000-00000000000a', '2026-09-01'))->>'veraltet', 'true', 'Analyse ist veraltet: die Eingabe hat sich geändert');
select is((select x->'analyse'->>'veraltet' from jsonb_array_elements((public.abschluss_uebersicht('2026-09-01'))->'personen') x where x->>'name' = 'Anna Berger'), 'true', 'Übersicht zeigt „veraltet“');
reset role;

-- ---------------------------------------------------------------------------
-- Schalter eigene_analyse_nur_admin, Admin und Salon-Grenze
-- ---------------------------------------------------------------------------
update public.salons set eigene_analyse_nur_admin = true where id = 'cccccccc-0000-0000-0000-00000000000c';
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000f');
set local role authenticated;
select throws_ok($$ select public.analyse_eingabe('11111111-0000-0000-0000-00000000000f', '2026-09-01') $$, '42501', 'Person nicht gefunden.', 'Schalter an: Verantwortlicher bekommt keine Eingabe über sich selbst');
select throws_ok($$ select public.analyse_lesen('11111111-0000-0000-0000-00000000000f', '2026-09-01') $$, '42501', 'Person nicht gefunden.', 'Schalter an: auch kein Lesen');
select is((select count(*) from jsonb_array_elements((public.abschluss_uebersicht('2026-09-01'))->'personen') x where x->>'name' = 'Ludwig Leiter'), 0::bigint, 'Schalter an: die eigene Zeile fehlt in der Übersicht');
select is((select count(*) from jsonb_array_elements((public.abschluss_uebersicht('2026-09-01'))->'personen') x where x->>'name' = 'Anna Berger'), 1::bigint, 'Schalter an: andere Personen bleiben sichtbar');
select is((public.analyse_lesen('11111111-0000-0000-0000-00000000000a', '2026-09-01'))->>'status', 'freigegeben', 'Schalter an: Analysen anderer lesbar');

select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
select is((select count(*) from jsonb_array_elements((public.abschluss_uebersicht('2026-09-01'))->'personen') x where x->>'name' = 'Ludwig Leiter'), 1::bigint, 'Schalter an: ein anderer Verantwortlicher sieht Ludwig');

select pg_temp.anmelden('22222222-0000-0000-0000-000000000010');
select is((select count(*) from jsonb_array_elements((public.abschluss_uebersicht('2026-09-01'))->'personen') x where x->>'name' = 'Ludwig Leiter'), 1::bigint, 'Admin sieht auch bei eingeschaltetem Schalter alle');
select is((public.analyse_eingabe('11111111-0000-0000-0000-00000000000f', '2026-09-01'))->'eingabe'->>'bewertete_person', 'die bewertete Person', 'Admin: Eingabe über Ludwig');
select is((public.analyse_speichern('11111111-0000-0000-0000-00000000000f', '2026-09-01', 'Ludwig hat 4,0.', null, 'analyse-v1'))->>'status', 'entwurf', 'Admin darf speichern');
select is((select freigegeben_von from (select public.analyse_freigeben('11111111-0000-0000-0000-00000000000f', '2026-09-01') as j) x, lateral (select j->>'freigegeben_von' as freigegeben_von) y), 'Admin Quelle', 'Admin: Freigabe trägt den Namen des Admins');

select pg_temp.anmelden('22222222-0000-0000-0000-000000000012');
select throws_ok($$ select public.analyse_eingabe('11111111-0000-0000-0000-00000000000a', '2026-09-01') $$, '42501', 'Person nicht gefunden.', 'Anderer Salon: Eingabe 42501');
select throws_ok($$ select public.analyse_speichern('11111111-0000-0000-0000-00000000000a', '2026-09-01', 'x', null, 'v1') $$, '42501', 'Person nicht gefunden.', 'Anderer Salon: Speichern 42501');
select throws_ok($$ select public.analyse_lesen('11111111-0000-0000-0000-00000000000a', '2026-09-01') $$, '42501', 'Person nicht gefunden.', 'Anderer Salon: Lesen 42501');
select throws_ok($$ select public.analyse_freigeben('11111111-0000-0000-0000-00000000000a', '2026-09-01') $$, '42501', 'Person nicht gefunden.', 'Anderer Salon: Freigeben 42501');
select throws_ok($$ select public.monat_abschliessen('2026-09-01') $$, '22023', 'Für diesen Monat gibt es noch keine Abgaben.', 'Anderer Salon: dessen Monat hat keine Abgaben, der Abschluss von Salon P bleibt unberührt');
select is(jsonb_array_length((public.abschluss_uebersicht())->'monate'), 0, 'Anderer Salon: sieht keine Monate von Salon P');
reset role;
select is((select count(*) from public.monatsabschluesse where salon_id = 'dddddddd-0000-0000-0000-00000000000d'), 0::bigint, 'Salon Q hat keinen Abschluss bekommen');

select * from finish();
rollback;
