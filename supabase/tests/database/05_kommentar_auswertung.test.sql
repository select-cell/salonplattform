-- pgTAP-Tests für Phase D: Kommentar-Auswertung.
-- Ausführen: `supabase test db`
begin;
select plan(40);

create function pg_temp.anmelden(p_uid text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end
$$;

-- ---------------------------------------------------------------------------
-- Testdaten: Salon K mit Anna (gemischt), Berta (nur Pflicht), Cora (keine Abgabe),
-- Ludwig (Verantwortlicher, nimmt teil), Chef (Verantwortlicher), Admin; Salon L mit Xaver und Chef Zwei
-- ---------------------------------------------------------------------------
-- Der Admin ohne Salon wertet den ersten Salon der Instanz aus: K ist bewusst der ältere
insert into public.salons (id, name, start_monat, erstellt_am) values
  ('cccccccc-0000-0000-0000-00000000000c', 'Kommentarsalon K', '2026-08-01', '2020-01-01'),
  ('dddddddd-0000-0000-0000-00000000000d', 'Kommentarsalon L', '2026-08-01', '2020-02-01');

insert into public.personen (id, salon_id, name, email, rolle, nimmt_an_teamumfrage, aktiv, aktiv_ab) values
  ('11111111-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-00000000000c', 'Anna Test',   'anna@test.example',   'mitarbeiter',      true,  true, null),
  ('11111111-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-00000000000c', 'Berta Test',  'berta@test.example',  'mitarbeiter',      true,  true, null),
  ('11111111-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-00000000000c', 'Cora Test',   'cora@test.example',   'mitarbeiter',      true,  true, null),
  ('11111111-0000-0000-0000-00000000000d', 'cccccccc-0000-0000-0000-00000000000c', 'Nora Spät',   'nora@test.example',   'mitarbeiter',      true,  true, '2026-10-01'),
  ('11111111-0000-0000-0000-00000000000e', 'cccccccc-0000-0000-0000-00000000000c', 'Chef Test',   'chef@test.example',   'verantwortlicher', false, true, null),
  ('11111111-0000-0000-0000-00000000000f', 'cccccccc-0000-0000-0000-00000000000c', 'Ludwig Leiter','ludwig@test.example', 'verantwortlicher', true,  true, null),
  ('11111111-0000-0000-0000-000000000010', null,                                   'Admin Test',  'admin@test.example',  'admin',            false, true, null),
  ('11111111-0000-0000-0000-000000000011', 'dddddddd-0000-0000-0000-00000000000d', 'Xaver Test',  'xaver@test.example',  'mitarbeiter',      true,  true, null),
  ('11111111-0000-0000-0000-000000000012', 'dddddddd-0000-0000-0000-00000000000d', 'Chef Zwei',   'chef2@test.example',  'verantwortlicher', false, true, null);
insert into auth.users (id, email) values
  ('22222222-0000-0000-0000-00000000000a', 'anna@test.example'),
  ('22222222-0000-0000-0000-00000000000b', 'berta@test.example'),
  ('22222222-0000-0000-0000-00000000000e', 'chef@test.example'),
  ('22222222-0000-0000-0000-00000000000f', 'ludwig@test.example'),
  ('22222222-0000-0000-0000-000000000010', 'admin@test.example'),
  ('22222222-0000-0000-0000-000000000012', 'chef2@test.example');

-- Abgaben für September 2026 (Anna, Berta, Ludwig)
insert into public.umfrage_abgaben (id, salon, monat, feedbackgeber, rohdaten, salon_id, feedbackgeber_id) values
  ('99999999-0000-0000-0000-00000000000a', 'Kommentarsalon K', '2026-09-01', 'Anna Test',     '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000a'),
  ('99999999-0000-0000-0000-00000000000b', 'Kommentarsalon K', '2026-09-01', 'Berta Test',    '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000b'),
  ('99999999-0000-0000-0000-00000000000f', 'Kommentarsalon K', '2026-09-01', 'Ludwig Leiter', '{}', 'cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000f');

-- Bewertungen: abgabe, bewertete Person, Verhalten, Note, Kommentar
create function pg_temp.bew(p_abgabe uuid, p_von uuid, p_von_name text, p_zu uuid, p_zu_name text, p_nr int, p_note int, p_text text)
returns void language sql as $$
  insert into public.umfrage_bewertungen
    (abgabe_id, salon, monat, bewertende_person, verhalten_nr, verhalten, art, bewertete_person, note, kommentar,
     bewertende_person_id, bewertete_person_id)
  values (p_abgabe, 'Kommentarsalon K', '2026-09-01', p_von_name, p_nr, 'Verhalten ' || p_nr,
          case when p_von = p_zu then 'selbstbild' else 'fremdbild' end, p_zu_name, p_note, p_text, p_von, p_zu)
$$;

-- Anna: 6 Bewertungen. 4 Kommentare, davon einer mit 1 Wort und einer Wiederholung (Groß-/Kleinschreibung und Leerzeichen egal)
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'Anna Test', '11111111-0000-0000-0000-00000000000a', 'Anna Test',  1, 3, 'Ich bin zufrieden mit meiner Arbeit');
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'Anna Test', '11111111-0000-0000-0000-00000000000a', 'Anna Test',  2, 2, null);
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'Anna Test', '11111111-0000-0000-0000-00000000000b', 'Berta Test', 1, 4, 'Sehr zuverlässig und freundlich im Umgang');
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'Anna Test', '11111111-0000-0000-0000-00000000000b', 'Berta Test', 2, 5, 'Top');
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'Anna Test', '11111111-0000-0000-0000-00000000000c', 'Cora Test',  1, 3, '   ');
select pg_temp.bew('99999999-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'Anna Test', '11111111-0000-0000-0000-00000000000c', 'Cora Test',  2, 4, 'sehr  zuverlässig und FREUNDLICH im umgang');

-- Berta: 6 Bewertungen, nur die Pflicht-Kommentare (2), zu Verhalten 2 nichts
select pg_temp.bew('99999999-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-00000000000b', 'Berta Test', '11111111-0000-0000-0000-00000000000a', 'Anna Test',  1, 4, 'Vorbildlich im Umgang mit Gästen heute');
select pg_temp.bew('99999999-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-00000000000b', 'Berta Test', '11111111-0000-0000-0000-00000000000a', 'Anna Test',  2, 3, null);
select pg_temp.bew('99999999-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-00000000000b', 'Berta Test', '11111111-0000-0000-0000-00000000000b', 'Berta Test', 1, 5, 'Sehr engagiert und immer hilfsbereit gewesen');
select pg_temp.bew('99999999-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-00000000000b', 'Berta Test', '11111111-0000-0000-0000-00000000000b', 'Berta Test', 2, 2, null);
select pg_temp.bew('99999999-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-00000000000b', 'Berta Test', '11111111-0000-0000-0000-00000000000c', 'Cora Test',  1, 3, null);
select pg_temp.bew('99999999-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-00000000000b', 'Berta Test', '11111111-0000-0000-0000-00000000000c', 'Cora Test',  2, 1, '');

-- Ludwig (Verantwortlicher, nimmt teil): 2 Bewertungen mit je 6 Wörtern
select pg_temp.bew('99999999-0000-0000-0000-00000000000f', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', '11111111-0000-0000-0000-00000000000a', 'Anna Test',  1, 4, 'Das hat sie diesmal sehr gut gemacht');
select pg_temp.bew('99999999-0000-0000-0000-00000000000f', '11111111-0000-0000-0000-00000000000f', 'Ludwig Leiter', '11111111-0000-0000-0000-00000000000a', 'Anna Test',  2, 3, 'Hier gibt es noch etwas Luft nach oben');

-- ---------------------------------------------------------------------------
-- Kennzahlen je Person (als Chef Test)
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
create temp table ausw as select public.kommentar_auswertung('2026-09-01') as j;
grant all on ausw to public;

create function pg_temp.p(p_name text, p_feld text) returns text
language sql as $$
  select (x->>p_feld) from ausw, jsonb_array_elements(j->'personen') x where x->>'name' = p_name
$$;

select is((select j->>'monat' from ausw), '2026-09', 'Monat');
select is(pg_temp.p('Anna Test', 'bewertungen'), '6', 'Anna: 6 Bewertungen');
select is(pg_temp.p('Anna Test', 'kommentare'), '4', 'Anna: 4 Kommentare (Leerzeichen zählen nicht als Kommentar)');
select is(pg_temp.p('Anna Test', 'quote'), '66.7', 'Anna: Quote 4/6 = 66,7 %');
select is(pg_temp.p('Anna Test', 'pflicht'), '3', 'Anna: 3 Bewertungen ab 4');
select is(pg_temp.p('Anna Test', 'pflicht_erfuellt'), '3', 'Anna: Pflicht erfüllt');
select is(pg_temp.p('Anna Test', 'freiwillig_bewertungen'), '3', 'Anna: 3 Bewertungen von 1 bis 3');
select is(pg_temp.p('Anna Test', 'freiwillig_kommentare'), '1', 'Anna: 1 freiwilliger Kommentar');
select is(pg_temp.p('Anna Test', 'freiwillige_quote'), '33.3', 'Anna: freiwillige Quote 1/3');
select is(pg_temp.p('Anna Test', 'woerter_schnitt'), '4.8', 'Anna: Ø 4,8 Wörter (6 + 6 + 1 + 6 = 19, vier Kommentare)');
select is(pg_temp.p('Anna Test', 'kurz'), '1', 'Anna: ein kurzer Kommentar („Top“)');
select is(pg_temp.p('Anna Test', 'doppelt'), '1', 'Anna: eine Wiederholung (Groß-/Kleinschreibung und Leerzeichen egal)');
select is(pg_temp.p('Anna Test', 'verhalten_ohne_kommentar'), '0', 'Anna: zu jedem Verhalten etwas geschrieben');

select is(pg_temp.p('Berta Test', 'kommentare'), '2', 'Berta: 2 Kommentare');
select is(pg_temp.p('Berta Test', 'pflicht'), '2', 'Berta: 2 Pflicht-Bewertungen');
select is(pg_temp.p('Berta Test', 'pflicht_erfuellt'), '2', 'Berta: Pflicht erfüllt');
select is(pg_temp.p('Berta Test', 'freiwillige_quote'), '0.0', 'Berta: schreibt nie freiwillig');
select is(pg_temp.p('Berta Test', 'woerter_schnitt'), '6.0', 'Berta: Ø 6 Wörter');
select is(pg_temp.p('Berta Test', 'doppelt'), '0', 'Berta: keine Wiederholung');
select is(pg_temp.p('Berta Test', 'verhalten_ohne_kommentar'), '1', 'Berta: zu Verhalten 2 nie etwas geschrieben');

-- ---------------------------------------------------------------------------
-- Team gewichtet, Erwartete
-- ---------------------------------------------------------------------------
select is((select j->'team'->>'bewertungen' from ausw), '14', 'Team: 14 Bewertungen (6 + 6 + 2)');
select is((select j->'team'->>'kommentare' from ausw), '8', 'Team: 8 Kommentare (4 + 2 + 2)');
select is((select j->'team'->>'quote' from ausw), '57.1', 'Team: Quote gewichtet 8/14 = 57,1 % (nicht Mittel der Quoten)');
select is((select j->'team'->>'woerter_schnitt' from ausw), '5.8', 'Team: Ø Wörter gewichtet (19 + 12 + 15 = 46 ÷ 8 = 5,75)');
select is((select j->'team'->>'doppelt' from ausw), '1', 'Team: Wiederholungen');
select is((select j->'team'->>'erwartet' from ausw), '4', 'Erwartet: Anna, Berta, Cora, Ludwig (Nora startet erst im Oktober)');
select is((select j->'team'->>'abgegeben' from ausw), '3', 'Abgegeben: 3');
select is((select j->'team'->>'nicht_abgegeben' from ausw), '1', 'Nicht abgegeben: 1');
select is((select j->'nicht_abgegeben'->0->>'name' from ausw), 'Cora Test', 'Nicht abgegeben: Cora');
select is((select jsonb_array_length(j->'personen') from ausw), 3, 'Personenliste: drei Abgaben');

-- keine Texte
select is(position('zuverlässig' in (select j::text from ausw)) + position('Vorbildlich' in (select j::text from ausw)), 0,
          'Kein Kommentartext in der Antwort');

-- ---------------------------------------------------------------------------
-- Zugriff und Datenschutz-Schalter
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000f');
set local role authenticated;
select is((select jsonb_array_length(public.kommentar_auswertung('2026-09-01')->'personen')), 3,
          'Schalter aus: Ludwig sieht auch sich selbst');
reset role;
update public.salons set eigene_analyse_nur_admin = true where id = 'cccccccc-0000-0000-0000-00000000000c';
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000f');
set local role authenticated;
select is((select jsonb_array_length(public.kommentar_auswertung('2026-09-01')->'personen')), 2,
          'Schalter an: Ludwig sieht seine eigenen Werte nicht');
select is((select public.kommentar_auswertung('2026-09-01')->'team'->>'bewertungen'), '14', 'Schalter an: Team-Summen bleiben vollständig');
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
select is((select jsonb_array_length(public.kommentar_auswertung('2026-09-01')->'personen')), 3, 'Schalter an: ein anderer Verantwortlicher sieht Ludwig weiterhin');
select pg_temp.anmelden('22222222-0000-0000-0000-000000000010');
select is((select jsonb_array_length(public.kommentar_auswertung('2026-09-01')->'personen')), 3, 'Schalter an: der Admin sieht alles');

-- Mitarbeiter, anderer Salon, anon, gesperrte Ansicht
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000a');
select throws_ok($$ select public.kommentar_auswertung() $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: keine Kommentar-Auswertung');
select throws_ok($$ select * from public.v_kommentar_metriken $$, '42501', null, 'Die Ansicht ist für Anmeldungen gesperrt');
select pg_temp.anmelden('22222222-0000-0000-0000-000000000012');
select is((select jsonb_array_length(public.kommentar_auswertung('2026-09-01')->'personen')), 0, 'Salon-Grenze: anderer Salon sieht nichts');
reset role;
set local role anon;
select throws_ok($$ select public.kommentar_auswertung() $$, '42501', null, 'anon: gesperrt');
reset role;

select * from finish();
rollback;
