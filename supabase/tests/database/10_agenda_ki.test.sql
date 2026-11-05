-- pgTAP-Tests für Version 1.3: Agenda mit KI (Eingabe nur mit Teamwerten, Prüfung von Aufbau, Zeitbudget und Zahlen, Speichern, Bearbeiten).
-- Ausführen: `supabase test db`
begin;
select plan(75);

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
-- Hilfsdaten: eine gültige Agenda der KI (Summe 18 Minuten, alle Zahlen stehen in den Daten)
-- ---------------------------------------------------------------------------
create temp table ki_gut as select $j$[
  {"id": "einstieg",       "minuten": 2, "punkte": ["Danke an alle. 3 von 4 haben abgegeben."]},
  {"id": "kennzahlen",     "minuten": 3, "punkte": ["Das Team-Fremdbild liegt bei 3,8, das Selbstbild bei 3,3."]},
  {"id": "fokus",          "minuten": 7, "punkte": ["Fokus: Verhalten 1. Das Fremdbild liegt bei 4,0.", "Größte Differenz bei Verhalten 1."]},
  {"id": "entwicklung",    "minuten": 4, "punkte": ["Verhalten 2 liegt beim Fremdbild bei 3,3."]},
  {"id": "vereinbarungen", "minuten": 2, "punkte": ["Was nehmen wir uns bis zum nächsten Treffen vor?"]}
]$j$::jsonb as j;
grant all on ki_gut to public;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000a');
set local role authenticated;
select throws_ok($$ select public.agenda_ki_eingabe('2026-09-01') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: keine KI-Eingabe');
select throws_ok($$ select public.agenda_ki_pruefen('2026-09-01', '[]') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: keine Prüfung');
select throws_ok($$ select public.agenda_ki_speichern('2026-09-01', '[]', 'agenda-ki-v1') $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: kein Speichern');
select throws_ok($$ select private.agenda_ki_eingabe_bauen('cccccccc-0000-0000-0000-00000000000c', '2026-09-01') $$, '42501', null, 'Interne Hilfe ist nicht aufrufbar');
reset role;
set local role anon;
select throws_ok($$ select public.agenda_ki_eingabe('2026-09-01') $$, '42501', null, 'anon: keine KI-Eingabe');
reset role;

select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
select throws_ok($$ select public.agenda_ki_eingabe('2026-09-01') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: keine KI-Eingabe');
select throws_ok($$ select public.agenda_ki_pruefen('2026-09-01', '[]') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: keine Prüfung');
select throws_ok($$ select public.agenda_ki_speichern('2026-09-01', '[]', 'agenda-ki-v1') $$, '42501', 'Nur für Admins.', 'Verantwortlicher: kein Speichern');
reset role;

-- ---------------------------------------------------------------------------
-- Eingabe für die KI (Admin)
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-000000000010');
set local role authenticated;
select throws_ok($$ select public.agenda_ki_eingabe('2026-07-01') $$, '22023', 'Für diesen Monat gibt es keine Auswertung.', 'Monat ohne Daten: 22023');
select throws_ok($$ select public.agenda_ki_eingabe(null) $$, '22023', 'Der Monat fehlt.', 'Ohne Monat: 22023');
create temp table ke as select public.agenda_ki_eingabe('2026-09-15') as j;
grant all on ke to public;
select is((select j->'eingabe'->>'monat' from ke), '2026-09', 'Eingabe: Monat');
select is((select j->'eingabe'->'team'->>'bewertet' from ke), 'das Team', 'Eingabe: die Teamwerte der Gesamtauswertung');
select is((select (j->'eingabe'->'team'->'kennzahlen'->>'fremdbild')::numeric from ke), 3.8, 'Eingabe: Team-Fremdbild 3,8');
select is((select jsonb_array_length(j->'eingabe'->'zeitbudget'->'bloecke') from ke), 5, 'Eingabe: fünf Blöcke im Zeitbudget');
select is((select jsonb_agg(x->>'id' order by o)::text from ke, jsonb_array_elements(j->'eingabe'->'zeitbudget'->'bloecke') with ordinality as t(x, o)), '["einstieg", "kennzahlen", "fokus", "entwicklung", "vereinbarungen"]', 'Eingabe: Blöcke in fester Reihenfolge');
select is((select (j->'eingabe'->'zeitbudget'->>'gesamt_min')::int from ke), 15, 'Eingabe: Zeitbudget ab 15');
select is((select (j->'eingabe'->'zeitbudget'->>'gesamt_max')::int from ke), 20, 'Eingabe: bis 20 Minuten');
select is((select jsonb_array_length(j->'eingabe'->'fokus_aktuell') from ke), 1, 'Eingabe: ein Fokus-Verhalten gilt heute');
select is((select (j->'eingabe'->'fokus_aktuell'->0->>'nr')::int from ke), 1, 'Eingabe: es ist Verhalten 1');
select is((select count(*) from unnest(array['anna', 'berger', 'berta', 'hollmann', 'kranz', 'cora', 'sommer', 'ludwig', 'leiter', 'dietrich', 'chef', 'quelle', 'admin', 'test.example', 'stütze', 'lächeln', 'freundlich']) n
           where position(n in lower((select j::text from ke))) > 0), 0::bigint, 'Eingabe: kein Name, keine E-Mail-Adresse, kein Kommentartext, keine Begründung des Fokus');
select is((select j->>'hash' from ke), (select md5((j->'eingabe')::text) from ke), 'Eingabe: der Hash gehört zur Eingabe');

-- ---------------------------------------------------------------------------
-- Prüfen: Aufbau, Zeitbudget, Zahlen
-- ---------------------------------------------------------------------------
create temp table kp1 as select public.agenda_ki_pruefen('2026-09-01', (select j from ki_gut)) as j;
grant all on kp1 to public;
select is((select (j->>'geprueft')::boolean from kp1), true, 'Prüfen: eine gültige Agenda besteht');
select ok((select j->'struktur_fehler' = 'null'::jsonb from kp1), 'Prüfen: kein Fehler im Aufbau');
select is((public.agenda_ki_pruefen('2026-09-01', jsonb_set((select j from ki_gut), '{0,minuten}', '3'))->>'struktur_fehler'), 'Der Block „Einstieg und Beteiligung“ dauert genau 2 Minuten.', 'Prüfen: falsche Minuten werden benannt');
select is((public.agenda_ki_pruefen('2026-09-01', jsonb_set((select j from ki_gut), '{2,minuten}', '9'))->>'struktur_fehler'), 'Der Block „Fokus-Verhalten“ darf 6 bis 8 Minuten dauern.', 'Prüfen: Block über seiner Grenze');
select is((public.agenda_ki_pruefen('2026-09-01', (select jsonb_agg(x order by o) from jsonb_array_elements((select j from ki_gut)) with ordinality as t(x, o) where o <> 5))->>'struktur_fehler'), 'Die Agenda braucht fünf Blöcke in fester Reihenfolge.', 'Prüfen: nur vier Blöcke');
select is((public.agenda_ki_pruefen('2026-09-01', jsonb_set(jsonb_set((select j from ki_gut), '{0,id}', '"fokus"'), '{2,id}', '"einstieg"'))->>'struktur_fehler'), 'Die Agenda braucht fünf Blöcke in fester Reihenfolge.', 'Prüfen: falsche Reihenfolge');
select is((public.agenda_ki_pruefen('2026-09-01', jsonb_set((select j from ki_gut), '{1,punkte}', '[1, 2]'))->>'struktur_fehler'), 'Jeder Punkt muss ein Text sein.', 'Prüfen: Punkte müssen Text sein');
select is((public.agenda_ki_pruefen('2026-09-01', jsonb_set((select j from ki_gut), '{1,punkte}', '["  "]'))->>'struktur_fehler'), 'Jeder Punkt braucht einen Text (höchstens 600 Zeichen).', 'Prüfen: leerer Punkt');
select is((public.agenda_ki_pruefen('2026-09-01', jsonb_set((select j from ki_gut), '{1,punkte}', to_jsonb(array[repeat('x', 601)])))->>'struktur_fehler'), 'Jeder Punkt braucht einen Text (höchstens 600 Zeichen).', 'Prüfen: Punkt über 600 Zeichen');
select is((public.agenda_ki_pruefen('2026-09-01', '{"bloecke": []}')->>'struktur_fehler'), 'Die Agenda braucht fünf Blöcke in fester Reihenfolge.', 'Prüfen: kein Array');
select is((public.agenda_ki_pruefen('2026-09-01', jsonb_set((select j from ki_gut), '{0,minuten}', '"zwei"'))->>'struktur_fehler'), 'Jeder Block braucht eine id, Minuten (Zahl) und eine Liste von Punkten.', 'Prüfen: Minuten keine Zahl');
select is((public.agenda_ki_pruefen('2026-09-01', jsonb_set((select j from ki_gut), '{0,minuten}', '2.5'))->>'struktur_fehler'), 'Die Minuten von „Einstieg und Beteiligung“ müssen eine ganze Zahl sein.', 'Prüfen: Minuten keine ganze Zahl');
create temp table kp2 as select public.agenda_ki_pruefen('2026-09-01', jsonb_set((select j from ki_gut), '{1,punkte}', '["Das Fremdbild liegt bei 4,71 und 12 Personen waren da."]')) as j;
grant all on kp2 to public;
select is((select (j->>'geprueft')::boolean from kp2), false, 'Prüfen: erfundene Zahlen fallen durch');
select is((select j->>'hinweis' from kp2), 'Faktencheck nicht bestanden: 4,71 und 12 stehen nicht in den Daten', 'Prüfen: Hinweis nennt beide Zahlen');
select ok((select j->'struktur_fehler' = 'null'::jsonb from kp2), 'Prüfen: der Aufbau ist trotzdem in Ordnung');
select is((public.agenda_ki_pruefen('2026-09-01', jsonb_set((select j from ki_gut), '{2,punkte}', '["Dafür sind 6 bis 8 Minuten vorgesehen, wir nehmen 7.", "1. Erstens", "2) Zweitens"]'))->>'geprueft')::boolean, true, 'Prüfen: Zahlen des Zeitbudgets sind erlaubt, Listennummern zählen nicht');

-- ---------------------------------------------------------------------------
-- Speichern
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.agenda_ki_speichern('2026-09-01', (select j from ki_gut), ' ') $$, '22023', 'Die Prompt-Version fehlt.', 'Speichern ohne Prompt-Version: 22023');
select throws_ok($$ select public.agenda_ki_speichern('2026-09-01', '[]', 'agenda-ki-v1') $$, '22023', 'Die Agenda braucht fünf Blöcke in fester Reihenfolge.', 'Speichern mit falschem Aufbau: 22023');
select throws_ok($$ select public.agenda_ki_speichern('2026-09-01', jsonb_set((select j from ki_gut), '{0,minuten}', '5'), 'agenda-ki-v1') $$, '22023', 'Der Block „Einstieg und Beteiligung“ dauert genau 2 Minuten.', 'Speichern mit falscher Dauer: 22023');
select ok(public.agenda_lesen('2026-09-01') is null, 'Nach den Fehlversuchen ist nichts gespeichert');

create temp table ks1 as select public.agenda_ki_speichern('2026-09-01', (select j from ki_gut), 'agenda-ki-v1', 'webhook', null, 2) as j;
grant all on ks1 to public;
select is((select j->>'status' from ks1), 'entwurf', 'Speichern: Entwurf');
select is((select j->>'anbieter' from ks1), 'webhook', 'Speichern: Anbieter');
select is((select j->>'prompt_version' from ks1), 'agenda-ki-v1', 'Speichern: Prompt-Version');
select is((select (j->>'versuche')::int from ks1), 2, 'Speichern: Versuche');
select is((select (j->>'geprueft')::boolean from ks1), true, 'Speichern: Faktencheck bestanden (die Datenbank rechnet selbst)');
select is((select j->>'eingabe_hash' from ks1), (select j->>'hash' from ke), 'Speichern: Hash der Eingabe');
select is((select j->'agenda'->>'vorlage' from ks1), 'agenda-ki-v1', 'Agenda: Kennung der KI-Fassung');
select is((select jsonb_array_length(j->'agenda'->'bloecke') from ks1), 5, 'Agenda: fünf Blöcke');
select is((select (j->'agenda'->>'minuten_gesamt')::int from ks1), 18, 'Agenda: 18 Minuten');
select is((select j->'agenda'->'bloecke'->0->>'titel' from ks1), 'Einstieg und Beteiligung', 'Agenda: die Überschrift setzt die Datenbank');
select is((select j->'agenda'->'bloecke'->2->'punkte'->0->>'text' from ks1), 'Fokus: Verhalten 1. Das Fremdbild liegt bei 4,0.', 'Agenda: der Text der KI');
select is((select (j->'agenda'->>'unvollstaendig')::boolean from ks1), true, 'Agenda: „Stand unvollständig“ setzt die Datenbank (Monat nicht abgeschlossen)');
select ok((select j->'agenda'->'hinweise' @> '["Der Monat ist noch nicht abgeschlossen."]'::jsonb from ks1), 'Agenda: Hinweis zum Stand');
select is((select left(j->>'text', 18) from ks1), 'Stand unvollständi', 'Text: beginnt mit dem Hinweis zum Stand');
create temp table ks2 as select public.agenda_ki_speichern('2026-09-01', jsonb_set((select j from ki_gut), '{3,punkte}', '["Das Fremdbild liegt bei 4,71."]'), 'agenda-ki-v1', 'webhook', null, 3) as j;
grant all on ks2 to public;
select is((select (j->>'geprueft')::boolean from ks2), false, 'Erneut speichern mit erfundener Zahl: geprueft = false (nicht vorgebbar)');
select is((select j->>'pruef_hinweis' from ks2), 'Faktencheck nicht bestanden: 4,71 steht nicht in den Daten', 'Erneut speichern: Hinweis');
reset role;
select is((select count(*) from public.analysen where typ = 'team_agenda'), 1::bigint, 'Es gibt je Salon und Monat genau eine Agenda');

-- ---------------------------------------------------------------------------
-- Lesen, Bearbeiten, Freigeben als Verantwortlicher (Agenda bleibt bei der Leitung)
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
create temp table al as select public.agenda_lesen('2026-09-01') as j;
grant all on al to public;
select is((select j->>'anbieter' from al), 'webhook', 'Verantwortlicher liest die Agenda der KI');
select is((select (j->>'geprueft')::boolean from al), false, 'Lesen: geprueft = false');
create temp table ab1 as select public.agenda_bearbeiten('2026-09-01', jsonb_set((select j->'agenda' from al), '{bloecke,3,punkte,0,text}', '"Das Fremdbild liegt bei 3,3."')) as j;
grant all on ab1 to public;
select is((select (j->>'geprueft')::boolean from ab1), true, 'Bearbeiten: der Faktencheck läuft erneut und besteht');
select is((select j->>'pruef_hinweis' from ab1), null, 'Bearbeiten: kein Hinweis mehr');
select is((select (j->>'bearbeitet')::boolean from ab1), true, 'Bearbeiten: bearbeitet');
select is((select j->>'anbieter' from ab1), 'webhook', 'Bearbeiten: der Anbieter bleibt');
select is((public.agenda_bearbeiten('2026-09-01', jsonb_set((select j->'agenda' from ab1), '{bloecke,3,punkte,0,text}', '"Das Fremdbild liegt bei 4,71."'))->>'geprueft')::boolean, false, 'Bearbeiten mit erfundener Zahl: geprueft = false');
select is((public.agenda_bearbeiten('2026-09-01', jsonb_set((select j->'agenda' from ab1), '{bloecke,3,punkte,0,text}', '"Das Fremdbild liegt bei 3,3."'))->>'pruef_hinweis'), null, 'Bearbeiten: wieder korrigiert');
select is((public.agenda_freigeben('2026-09-01')->>'status'), 'freigegeben', 'Verantwortlicher gibt die Agenda frei');

-- ---------------------------------------------------------------------------
-- Die Vorlage ersetzt die KI-Agenda vollständig
-- ---------------------------------------------------------------------------
create temp table av as select public.agenda_erzeugen('2026-09-01', true) as j;
grant all on av to public;
select is((select j->>'anbieter' from av), 'vorlage', 'Vorlage: Anbieter zurückgesetzt');
select is((select j->'agenda'->>'vorlage' from av), 'agenda-vorlage-v1', 'Vorlage: Kennung');
select is((select (j->>'geprueft')::boolean from av), true, 'Vorlage: geprüft');
select ok((select j->'eingabe_hash' = 'null'::jsonb and j->'versuche' = 'null'::jsonb and j->'modell' = 'null'::jsonb from av), 'Vorlage: Eingabe-Hash, Versuche und Modell leer');
select is((select j->>'status' from av), 'entwurf', 'Vorlage: wieder ein Entwurf');
reset role;

-- ---------------------------------------------------------------------------
-- Schalter aus: auch Verantwortliche dürfen die KI-Agenda erzeugen; anderer Salon
-- ---------------------------------------------------------------------------
update public.salons set ki_nur_admin = false where id = 'cccccccc-0000-0000-0000-00000000000c';
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
select is((public.agenda_ki_speichern('2026-09-01', (select j from ki_gut), 'agenda-ki-v1', 'claude', 'm', 1)->>'anbieter'), 'claude', 'Schalter aus: Verantwortlicher darf die KI-Agenda speichern');
reset role;
update public.salons set ki_nur_admin = true where id = 'cccccccc-0000-0000-0000-00000000000c';
select pg_temp.anmelden('22222222-0000-0000-0000-000000000012');
set local role authenticated;
select throws_ok($$ select public.agenda_ki_eingabe('2026-09-01') $$, '42501', 'Nur für Admins.', 'Anderer Salon: Verantwortlicher ausgeschlossen');
reset role;
update public.salons set ki_nur_admin = false where id = 'dddddddd-0000-0000-0000-00000000000d';
select pg_temp.anmelden('22222222-0000-0000-0000-000000000012');
set local role authenticated;
select throws_ok($$ select public.agenda_ki_eingabe('2026-09-01') $$, '22023', 'Für diesen Monat gibt es keine Auswertung.', 'Anderer Salon (Schalter aus): sieht die Daten von Salon P nicht');
reset role;

select * from finish();
rollback;
