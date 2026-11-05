-- ============================================================================
-- Phase F · Fokus, Agenda, Termine, Mailversand (Version 1.2, Erweiterung F)
--
-- Aus den Ergebnissen eines Monats entsteht eine Agenda für das Teammeeting (15 bis 20 Minuten). Verantwortliche
-- bekommen sie vor dem Termin per Mail.
--
--   fokus_verhalten + fokus_liste / fokus_umschalten    Verhalten, die gerade besonders wichtig sind
--   agenda_erzeugen / _lesen / _bearbeiten / _freigeben  Agenda ohne KI aus fester Vorlage „agenda-vorlage-v1“,
--                                                        alle Zahlen aus SQL, Zeitbudget prüft die Datenbank
--   meeting_termine + termine_liste / termin_speichern / termine_serie / termin_entfernen   nur Admin
--   mail_log + versand_faellig / versand_beanspruchen / agenda_fuer_versand / versand_abschliessen
--                                                        nur für service_role (Edge Function agenda-versand)
--
-- Nur Teamebene: keine Rangliste, keine Absender. Kommentar-Beispiele stehen nur auf der Plattform, nie in Mails
-- und nie im PDF. Zeitzone fest: Europe/Berlin (Termine, Fälligkeit, „heute“).
--
-- Wiederholbar (if not exists, create or replace), ohne DROP und DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabellen (für alle Anmeldungen gesperrt)
-- ----------------------------------------------------------------------------
create table if not exists public.fokus_verhalten (
  id            uuid primary key default gen_random_uuid(),
  salon_id      uuid        not null references public.salons (id) on delete cascade,
  verhalten_id  uuid        not null references public.verhalten (id) on delete cascade,
  begruendung   text        check (char_length(begruendung) <= 500),
  gueltig_ab    date        not null,
  gueltig_bis   date,
  angelegt_von  text,
  angelegt_am   timestamptz not null default now(),
  constraint fokus_zeitraum check (gueltig_bis is null or gueltig_bis >= gueltig_ab)
);

comment on table public.fokus_verhalten is 'Fokus-Verhalten (Erweiterung F). gueltig_bis leer = bis auf Weiteres, einschließlich dieses Tages. Die Geschichte bleibt.';
create index if not exists fokus_verhalten_salon on public.fokus_verhalten (salon_id, verhalten_id);

create table if not exists public.meeting_termine (
  id                  uuid primary key default gen_random_uuid(),
  salon_id            uuid        not null references public.salons (id) on delete cascade,
  startet_am          timestamptz not null,
  titel               text        not null default 'Teammeeting' check (char_length(titel) between 1 and 100),
  bezugsmonat         date        check (bezugsmonat is null or extract(day from bezugsmonat) = 1),
  vorlauf_tage        numeric[]   not null default '{2}' check (cardinality(vorlauf_tage) between 1 and 5),
  erinnerung_stunden  numeric[]   not null default '{1}' check (cardinality(erinnerung_stunden) between 1 and 5),
  admin_in_kopie      boolean     not null default false,
  mails_pausiert      boolean     not null default false,
  entfernt            boolean     not null default false,
  serie_id            uuid,
  angelegt_von        text,
  angelegt_am         timestamptz not null default now(),
  aktualisiert_am     timestamptz not null default now()
);

comment on table public.meeting_termine is 'Teammeeting-Termine (Erweiterung F), nur der Admin pflegt sie. Nicht gelöscht, sondern „entfernt“ gekennzeichnet.';
create index if not exists meeting_termine_start on public.meeting_termine (salon_id, startet_am);

create table if not exists public.mail_log (
  id             uuid primary key default gen_random_uuid(),
  termin_id      uuid        not null references public.meeting_termine (id) on delete cascade,
  art            text        not null check (art in ('vorab', 'erinnerung')),
  status         text        not null check (status in ('in_arbeit', 'gesendet', 'fehler')),
  versuche       integer     not null default 1 check (versuche between 1 and 3),
  letzter_fehler text        check (char_length(letzter_fehler) <= 500),
  gestartet_am   timestamptz not null default now(),
  gesendet_am    timestamptz,
  unique (termin_id, art)
);

comment on table public.mail_log is 'Versand-Protokoll (Erweiterung F). UNIQUE (termin_id, art) entscheidet, welcher Lauf sendet. Höchstens 3 Versuche.';

alter table public.fokus_verhalten enable row level security;
alter table public.meeting_termine enable row level security;
alter table public.mail_log        enable row level security;
revoke all on table public.fokus_verhalten, public.meeting_termine, public.mail_log from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Interne Hilfen
-- ----------------------------------------------------------------------------
create or replace function private.heute()
returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'Europe/Berlin')::date $$;

-- 3,5 → „3,5“; null → „–“
create or replace function private.zahl1(p numeric)
returns text
language sql immutable set search_path = ''
as $$ select case when p is null then '–' else replace(to_char(round(p, 1), 'FM990.0'), '.', ',') end $$;

-- mit Vorzeichen: +0,4 / −0,4
create or replace function private.vz1(p numeric)
returns text
language sql immutable set search_path = ''
as $$
  select case when p is null then '–'
              when round(p, 1) > 0 then '+' || private.zahl1(p)
              when round(p, 1) < 0 then '−' || private.zahl1(abs(p))
              else private.zahl1(p) end
$$;

-- Zeitbudget und Aufbau der Agenda prüft die Datenbank
create or replace function private.agenda_validieren(p_agenda jsonb)
returns void
language plpgsql immutable set search_path = ''
as $$
declare
  v_ids   text[] := array['einstieg', 'kennzahlen', 'fokus', 'entwicklung', 'vereinbarungen'];
  v_namen text[] := array['Einstieg und Beteiligung', 'Team-Kennzahlen des Monats', 'Fokus-Verhalten', 'Entwicklungsfelder und Differenzen', 'Vereinbarungen'];
  v_min   integer[] := array[2, 3, 6, 3, 2];
  v_max   integer[] := array[2, 3, 8, 4, 3];
  b       jsonb;
  p       jsonb;
  m       numeric;
  v_summe numeric := 0;
  i       integer;
begin
  if p_agenda is null or jsonb_typeof(p_agenda->'bloecke') is distinct from 'array' or jsonb_array_length(p_agenda->'bloecke') <> 5 then
    raise exception 'Die Agenda braucht fünf Blöcke in fester Reihenfolge.' using errcode = '22023';
  end if;
  for i in 1..5 loop
    b := p_agenda->'bloecke'->(i - 1);
    if b->>'id' is distinct from v_ids[i] then
      raise exception 'Die Agenda braucht fünf Blöcke in fester Reihenfolge.' using errcode = '22023';
    end if;
    if jsonb_typeof(b->'minuten') is distinct from 'number' or (b->>'minuten')::numeric <> trunc((b->>'minuten')::numeric) then
      raise exception 'Die Minuten von „%“ müssen eine ganze Zahl sein.', v_namen[i] using errcode = '22023';
    end if;
    m := (b->>'minuten')::numeric;
    if m < v_min[i] or m > v_max[i] then
      if v_min[i] = v_max[i] then
        raise exception 'Der Block „%“ dauert genau % Minuten.', v_namen[i], v_min[i] using errcode = '22023';
      end if;
      raise exception 'Der Block „%“ darf % bis % Minuten dauern.', v_namen[i], v_min[i], v_max[i] using errcode = '22023';
    end if;
    if jsonb_typeof(b->'punkte') is distinct from 'array' then
      raise exception 'Der Block „%“ braucht eine Liste von Punkten.', v_namen[i] using errcode = '22023';
    end if;
    for p in select x from jsonb_array_elements(b->'punkte') x loop
      if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'text') is distinct from 'string'
         or btrim(p->>'text') = '' or char_length(p->>'text') > 600 then
        raise exception 'Jeder Punkt braucht einen Text (höchstens 600 Zeichen).' using errcode = '22023';
      end if;
    end loop;
    v_summe := v_summe + m;
  end loop;
  if v_summe < 15 or v_summe > 20 then
    raise exception 'Die Agenda soll 15 bis 20 Minuten dauern (jetzt % Minuten).', v_summe using errcode = '22023';
  end if;
end
$$;

-- Ohne Kommentar-Beispiele (für Mails und PDF): Zeilen mit „beispiel“ fallen weg
create or replace function private.agenda_ohne_beispiele(p_agenda jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  select case when p_agenda is null then null else jsonb_set(p_agenda, '{bloecke}', coalesce((
    select jsonb_agg(jsonb_set(b, '{punkte}', coalesce((
             select jsonb_agg(p order by o) from jsonb_array_elements(b->'punkte') with ordinality as t(p, o)
             where not coalesce((p->>'beispiel')::boolean, false)), '[]'::jsonb)) order by bo)
    from jsonb_array_elements(p_agenda->'bloecke') with ordinality as u(b, bo)), '[]'::jsonb)) end
$$;

-- Die Agenda als Text (Markdown-Auswahl), ohne Kommentar-Beispiele
create or replace function private.agenda_text(p_agenda jsonb)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_text text := '';
  b      jsonb;
  p      jsonb;
begin
  if coalesce((p_agenda->>'unvollstaendig')::boolean, false) then
    v_text := 'Stand unvollständig: ' || coalesce((select string_agg(h, ' ') from jsonb_array_elements_text(p_agenda->'hinweise') h), '') || E'\n\n';
  end if;
  for b in select x from jsonb_array_elements(p_agenda->'bloecke') x loop
    v_text := v_text || '## ' || (b->>'titel') || ' (' || (b->>'minuten') || ' Min.)' || E'\n';
    for p in select x from jsonb_array_elements(b->'punkte') x loop
      if not coalesce((p->>'beispiel')::boolean, false) then
        v_text := v_text || '- ' || (p->>'text') || E'\n';
      end if;
    end loop;
    v_text := v_text || E'\n';
  end loop;
  return btrim(v_text, E'\n');
end
$$;

-- Die Agenda aus den Daten (ohne KI). Alle Zahlen kommen aus SQL, alles auf Teamebene.
create or replace function private.agenda_bauen(p_salon uuid, p_monat date, p_heute date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_sw     jsonb := private.schwellen(p_salon);
  v_aus    numeric := (v_sw->>'ausgewogen')::numeric;
  v_nied   numeric := (v_sw->>'niedrig')::numeric;
  v_hoch   numeric := (v_sw->>'hoch')::numeric;
  v_vor    date;
  v_sb     numeric;
  v_fb     numeric;
  v_diff   numeric;
  v_sbv    numeric;
  v_fbv    numeric;
  v_erw    integer;
  v_abg    integer;
  v_rows   jsonb;
  v_nrs    integer[] := '{}';
  v_fokus  jsonb := '[]'::jsonb;
  v_entw   jsonb := '[]'::jsonb;
  v_kenn   jsonb := '[]'::jsonb;
  v_hinw   jsonb := '[]'::jsonb;
  v_fehlt  integer;
  v_pers   integer;
  r        record;
  k        record;
begin
  select max(a.monat) into v_vor from public.umfrage_abgaben a where a.salon_id = p_salon and a.monat < p_monat;

  -- je Verhalten: Team-Schnitte dieses und des Vormonats
  select coalesce(jsonb_agg(jsonb_build_object('nr', x.nr, 'titel', coalesce(vt.titel, x.titel), 'sb', x.sb, 'fb', x.fb, 'fb_vor', y.fb) order by x.nr), '[]'::jsonb)
    into v_rows
  from (
    select b.verhalten_nr::integer as nr, max(b.verhalten) as titel,
           round(avg(b.note) filter (where b.art = 'selbstbild'), 2) as sb,
           round(avg(b.note) filter (where b.art = 'fremdbild'), 2) as fb
    from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
    where a.salon_id = p_salon and b.monat = p_monat group by b.verhalten_nr
  ) x
  left join (
    select b.verhalten_nr::integer as nr, round(avg(b.note) filter (where b.art = 'fremdbild'), 2) as fb
    from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
    where a.salon_id = p_salon and b.monat = v_vor group by b.verhalten_nr
  ) y on y.nr = x.nr
  left join public.verhalten vt on vt.salon_id = p_salon and vt.nr = x.nr;

  -- Team-Kennzahlen: Mittel der Personenwerte (wie im Monatsbericht)
  select round(avg(p.sb), 2), round(avg(p.fb), 2) into v_sb, v_fb
  from (select round(avg(b.note) filter (where b.art = 'selbstbild'), 2) as sb, round(avg(b.note) filter (where b.art = 'fremdbild'), 2) as fb
        from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
        where a.salon_id = p_salon and b.monat = p_monat and b.bewertete_person_id is not null group by b.bewertete_person_id) p;
  v_diff := case when v_sb is not null and v_fb is not null then round(v_sb - v_fb, 2) end;
  if v_vor is not null then
    select round(avg(p.sb), 2), round(avg(p.fb), 2) into v_sbv, v_fbv
    from (select round(avg(b.note) filter (where b.art = 'selbstbild'), 2) as sb, round(avg(b.note) filter (where b.art = 'fremdbild'), 2) as fb
          from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
          where a.salon_id = p_salon and b.monat = v_vor and b.bewertete_person_id is not null group by b.bewertete_person_id) p;
  end if;

  select count(*)::integer into v_abg from public.umfrage_abgaben a where a.salon_id = p_salon and a.monat = p_monat;
  v_erw := private.erwartete_abgaben(p_salon, p_monat);

  -- Block 3: höchstens drei Punkte. 1. Fokus-Verhalten, 2. größte Teamdifferenzen, 3. größte Veränderungen zum Vormonat
  for r in
    select rr.nr, rr.titel, rr.sb, rr.fb, f.begruendung
    from public.fokus_verhalten f
    join public.verhalten v on v.id = f.verhalten_id
    join jsonb_to_recordset(v_rows) as rr(nr integer, titel text, sb numeric, fb numeric, fb_vor numeric) on rr.nr = v.nr
    where f.salon_id = p_salon and f.gueltig_ab <= p_heute and (f.gueltig_bis is null or f.gueltig_bis >= p_heute)
    order by f.gueltig_ab, rr.nr
  loop
    exit when cardinality(v_nrs) >= 3;
    continue when r.nr = any (v_nrs);
    v_nrs := array_append(v_nrs, r.nr);
    v_fokus := v_fokus || jsonb_build_array(jsonb_build_object(
      'grund', 'fokus', 'nr', r.nr,
      'text', 'Fokus: Verhalten ' || r.nr || ' „' || r.titel || '“. Fremdbild ' || private.zahl1(r.fb) || ', Selbstbild ' || private.zahl1(r.sb) || '.'
              || case when coalesce(btrim(r.begruendung), '') <> '' then ' Warum im Fokus: ' || btrim(r.begruendung) else '' end));
    -- bis zu zwei anonymisierte Kommentar-Beispiele: nur auf der Plattform
    for k in
      select b.kommentar
      from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
      where a.salon_id = p_salon and b.monat = p_monat and b.verhalten_nr = r.nr and b.art = 'fremdbild'
        and coalesce(btrim(b.kommentar), '') <> ''
      order by md5(b.id::text) limit 2
    loop
      v_fokus := v_fokus || jsonb_build_array(jsonb_build_object(
        'beispiel', true, 'nr', r.nr,
        'text', 'Beispiel aus den Kommentaren: „' || left(private.analyse_anonymisieren(p_salon, null, p_monat, btrim(k.kommentar)), 240) || '“'));
    end loop;
  end loop;

  for r in
    select rr.nr, rr.titel, rr.sb, rr.fb
    from jsonb_to_recordset(v_rows) as rr(nr integer, titel text, sb numeric, fb numeric, fb_vor numeric)
    where rr.sb is not null and rr.fb is not null and abs(rr.sb - rr.fb) > v_aus
    order by abs(rr.sb - rr.fb) desc, rr.nr
  loop
    exit when cardinality(v_nrs) >= 3;
    continue when r.nr = any (v_nrs);
    v_nrs := array_append(v_nrs, r.nr);
    v_fokus := v_fokus || jsonb_build_array(jsonb_build_object(
      'grund', 'differenz', 'nr', r.nr,
      'text', 'Große Differenz: Verhalten ' || r.nr || ' „' || r.titel || '“. Selbstbild ' || private.zahl1(r.sb) || ', Fremdbild ' || private.zahl1(r.fb)
              || ' (Differenz ' || private.vz1(r.sb - r.fb) || ').'));
  end loop;

  for r in
    select rr.nr, rr.titel, rr.fb, rr.fb_vor
    from jsonb_to_recordset(v_rows) as rr(nr integer, titel text, sb numeric, fb numeric, fb_vor numeric)
    where rr.fb is not null and rr.fb_vor is not null and round(rr.fb - rr.fb_vor, 1) <> 0
    order by abs(rr.fb - rr.fb_vor) desc, rr.nr
  loop
    exit when cardinality(v_nrs) >= 3;
    continue when r.nr = any (v_nrs);
    v_nrs := array_append(v_nrs, r.nr);
    v_fokus := v_fokus || jsonb_build_array(jsonb_build_object(
      'grund', 'veraenderung', 'nr', r.nr,
      'text', 'Veränderung zum Vormonat: Verhalten ' || r.nr || ' „' || r.titel || '“. Fremdbild ' || private.zahl1(r.fb) || ', Vormonat ' || private.zahl1(r.fb_vor)
              || ' (' || private.vz1(r.fb - r.fb_vor) || ').'));
  end loop;

  if cardinality(v_nrs) = 0 then
    v_fokus := jsonb_build_array(jsonb_build_object('text',
      'Es gibt kein Fokus-Verhalten und keine auffälligen Differenzen oder Veränderungen. Legt gemeinsam fest, worauf ihr im nächsten Monat besonders achtet.'));
  end if;

  -- Block 4: die drei niedrigsten Fremdbilder, ohne Wiederholung aus Block 3
  for r in
    select rr.nr, rr.titel, rr.sb, rr.fb
    from jsonb_to_recordset(v_rows) as rr(nr integer, titel text, sb numeric, fb numeric, fb_vor numeric)
    where rr.fb is not null and not (rr.nr = any (v_nrs))
    order by rr.fb, rr.nr limit 3
  loop
    v_entw := v_entw || jsonb_build_array(jsonb_build_object(
      'nr', r.nr,
      'text', 'Verhalten ' || r.nr || ' „' || r.titel || '“. Fremdbild ' || private.zahl1(r.fb)
              || case when r.sb is not null then ', Selbstbild ' || private.zahl1(r.sb) else '' end || '.'));
  end loop;
  if jsonb_array_length(v_entw) = 0 then
    v_entw := jsonb_build_array(jsonb_build_object('text', 'Weitere Entwicklungsfelder gibt es in diesem Monat nicht.'));
  end if;

  -- Block 2: Team-Kennzahlen
  v_kenn := jsonb_build_array(
    jsonb_build_object('text', 'Selbstbild ' || private.zahl1(v_sb) || ', Fremdbild ' || private.zahl1(v_fb) || '.'),
    jsonb_build_object('text', 'Differenz ' || private.vz1(v_diff) || ': ' ||
      case when v_diff is null then 'keine Einordnung möglich'
           when abs(v_diff) <= v_aus then 'ausgewogen'
           when v_diff > 0 then 'das Selbstbild liegt über dem Fremdbild'
           else 'das Fremdbild liegt über dem Selbstbild' end || '.'),
    jsonb_build_object('text', 'Stufe des Fremdbilds: ' ||
      case when v_fb is null then 'keine Daten' when v_fb >= v_hoch then 'hoch' when v_fb < v_nied then 'niedrig' else 'mittel' end || '.'),
    jsonb_build_object('text', case when v_vor is null or v_fbv is null then 'Es gibt keinen Vormonat zum Vergleich.'
      else 'Vormonat: Fremdbild ' || private.zahl1(v_fbv) || ', Selbstbild ' || private.zahl1(v_sbv)
           || '. Veränderung beim Fremdbild: ' || private.vz1(v_fb - v_fbv) || '.' end));

  -- Hinweis „Stand unvollständig“ (Stand zum Zeitpunkt des Erzeugens)
  if not exists (select 1 from public.monatsabschluesse m where m.salon_id = p_salon and m.monat = p_monat) then
    v_hinw := v_hinw || jsonb_build_array('Der Monat ist noch nicht abgeschlossen.');
  end if;
  if v_abg < v_erw then
    v_hinw := v_hinw || jsonb_build_array('Es haben erst ' || v_abg || ' von ' || v_erw || ' Personen abgegeben.');
  end if;
  select count(*)::integer, count(*) filter (where not exists (
           select 1 from public.analysen an
           where an.salon_id = p_salon and an.monat = p_monat and an.typ = 'person' and an.person_id = q.pid))::integer
    into v_pers, v_fehlt
  from (select distinct b.bewertete_person_id as pid
        from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
        where a.salon_id = p_salon and b.monat = p_monat and b.bewertete_person_id is not null) q;
  if v_fehlt > 0 then
    v_hinw := v_hinw || jsonb_build_array('Für ' || v_fehlt || ' von ' || v_pers || ' Personen fehlt noch die Einzelanalyse.');
  end if;

  return jsonb_build_object(
    'vorlage', 'agenda-vorlage-v1',
    'monat', to_char(p_monat, 'YYYY-MM'),
    'minuten_gesamt', 18,
    'unvollstaendig', jsonb_array_length(v_hinw) > 0,
    'hinweise', v_hinw,
    'bloecke', jsonb_build_array(
      jsonb_build_object('id', 'einstieg', 'titel', 'Einstieg und Beteiligung', 'minuten', 2, 'punkte', jsonb_build_array(
        jsonb_build_object('text', 'Danke an alle, die abgegeben haben.'),
        jsonb_build_object('text', v_abg || ' von ' || v_erw || ' Personen haben abgegeben.'))),
      jsonb_build_object('id', 'kennzahlen', 'titel', 'Team-Kennzahlen des Monats', 'minuten', 3, 'punkte', v_kenn),
      jsonb_build_object('id', 'fokus', 'titel', 'Fokus-Verhalten', 'minuten', 7, 'punkte', v_fokus),
      jsonb_build_object('id', 'entwicklung', 'titel', 'Entwicklungsfelder und Differenzen', 'minuten', 4, 'punkte', v_entw),
      jsonb_build_object('id', 'vereinbarungen', 'titel', 'Vereinbarungen', 'minuten', 2, 'punkte', jsonb_build_array(
        jsonb_build_object('text', 'Was nehmen wir uns bis zum nächsten Treffen konkret vor?'),
        jsonb_build_object('text', 'Wer übernimmt welchen Schritt?'),
        jsonb_build_object('text', 'Woran merken wir, dass es besser wird?'))))
  );
end
$$;

create or replace function private.agenda_zeile(p_a public.analysen)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'monat', to_char(p_a.monat, 'YYYY-MM'),
    'status', p_a.status,
    'agenda', p_a.ausgabe,
    'text', p_a.text,
    'bearbeitet', p_a.bearbeitet,
    'erstellt_am', p_a.erstellt_am,
    'aktualisiert_am', p_a.aktualisiert_am,
    'bearbeitet_am', p_a.bearbeitet_am,
    'bearbeitet_von', p_a.bearbeitet_von,
    'freigegeben_am', p_a.freigegeben_am,
    'freigegeben_von', p_a.freigegeben_von)
$$;

-- Ab wann eine Mail fällig ist. „N Tage vorher“ rechnet in Ortszeit (Montag 10:00 minus 2 Tage = Samstag 10:00
-- Ortszeit, auch über die Zeitumstellung), „N Stunden vorher“ in echten Stunden. Der größte Wert löst aus.
create or replace function private.faellig_ab(t public.meeting_termine, p_art text)
returns timestamptz
language sql immutable set search_path = ''
as $$
  select case p_art
    when 'vorab' then ((t.startet_am at time zone 'Europe/Berlin') - interval '1 day' * (select max(x) from unnest(t.vorlauf_tage) x)) at time zone 'Europe/Berlin'
    else t.startet_am - interval '1 hour' * (select max(x) from unnest(t.erinnerung_stunden) x)
  end
$$;

-- Fällig = nicht entfernt, nicht pausiert, ab „fällig ab“ und vor Terminbeginn. Nach Terminbeginn nichts mehr.
create or replace function private.versand_faellig_art(t public.meeting_termine, p_art text, p_jetzt timestamptz)
returns boolean
language sql immutable set search_path = ''
as $$
  select not t.entfernt and not t.mails_pausiert and p_jetzt >= private.faellig_ab(t, p_art) and p_jetzt < t.startet_am
$$;

-- Der Zustand einer Mail für die Terminliste
create or replace function private.mail_zustand(t public.meeting_termine, p_art text, p_jetzt timestamptz)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'art', p_art,
    'faellig_ab', private.faellig_ab(t, p_art),
    'status', case
      when m.id is null then case when t.entfernt then 'entfernt' when t.mails_pausiert then 'pausiert'
                                  when t.startet_am <= p_jetzt then 'verpasst' else 'geplant' end
      when m.status = 'gesendet' then 'gesendet'
      when m.status = 'fehler' and m.versuche >= 3 then 'fehlgeschlagen'
      when m.status = 'fehler' then 'fehler'
      when m.gestartet_am < p_jetzt - interval '10 minutes' then case when m.versuche >= 3 then 'fehlgeschlagen' else 'fehler' end
      else 'in_arbeit' end,
    'versuche', coalesce(m.versuche, 0),
    'fehler', case when m.status = 'in_arbeit' and m.gestartet_am < p_jetzt - interval '10 minutes' then 'Der Versand hat sich aufgehängt.' else m.letzter_fehler end,
    'gesendet_am', m.gesendet_am)
  from (select 1) d left join public.mail_log m on m.termin_id = t.id and m.art = p_art
$$;

create or replace function private.termin_json(t public.meeting_termine, p_jetzt timestamptz)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'startet_am', t.startet_am,
    'startet_lokal', to_char(t.startet_am at time zone 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI'),
    'titel', t.titel,
    'bezugsmonat_fest', to_char(t.bezugsmonat, 'YYYY-MM'),
    'bezugsmonat', to_char(coalesce(t.bezugsmonat, date_trunc('month', (t.startet_am at time zone 'Europe/Berlin') - interval '1 month')::date), 'YYYY-MM'),
    'vorlauf_tage', to_jsonb(t.vorlauf_tage),
    'erinnerung_stunden', to_jsonb(t.erinnerung_stunden),
    'admin_in_kopie', t.admin_in_kopie,
    'mails_pausiert', t.mails_pausiert,
    'entfernt', t.entfernt,
    'serie_id', t.serie_id,
    'mails', jsonb_build_array(private.mail_zustand(t, 'vorab', p_jetzt), private.mail_zustand(t, 'erinnerung', p_jetzt)))
$$;

revoke all on function
  private.heute(), private.zahl1(numeric), private.vz1(numeric), private.agenda_validieren(jsonb),
  private.agenda_ohne_beispiele(jsonb), private.agenda_text(jsonb), private.agenda_bauen(uuid, date, date),
  private.agenda_zeile(public.analysen), private.faellig_ab(public.meeting_termine, text),
  private.versand_faellig_art(public.meeting_termine, text, timestamptz),
  private.mail_zustand(public.meeting_termine, text, timestamptz), private.termin_json(public.meeting_termine, timestamptz)
from public;

-- ----------------------------------------------------------------------------
-- Fokus-Verhalten (Verantwortliche und Admin)
-- ----------------------------------------------------------------------------
create or replace function public.fokus_liste()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.leitung_salon();
  v_heute date := private.heute();
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'heute', v_heute,
    'verhalten', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'nr', v.nr, 'titel', v.titel, 'grundpfeiler', v.grundpfeiler, 'saeule', v.saeule,
               'fokus', case when f.id is not null then jsonb_build_object(
                          'begruendung', f.begruendung, 'gueltig_ab', f.gueltig_ab, 'gueltig_bis', f.gueltig_bis,
                          'geplant', f.gueltig_ab > v_heute) end) order by v.nr)
      from public.verhalten v
      left join lateral (
        select x.* from public.fokus_verhalten x
        where x.verhalten_id = v.id and (x.gueltig_bis is null or x.gueltig_bis >= v_heute)
        order by x.gueltig_ab limit 1) f on true
      where v.salon_id = v_salon and v.aktiv), '[]'::jsonb),
    'verlauf', coalesce((
      select jsonb_agg(jsonb_build_object('nr', v.nr, 'titel', v.titel, 'begruendung', f.begruendung,
                                          'gueltig_ab', f.gueltig_ab, 'gueltig_bis', f.gueltig_bis) order by f.gueltig_bis desc, v.nr)
      from (select * from public.fokus_verhalten x where x.salon_id = v_salon and x.gueltig_bis < v_heute
            order by x.gueltig_bis desc limit 20) f
      join public.verhalten v on v.id = f.verhalten_id), '[]'::jsonb));
end
$$;

-- an = true: Verhalten in den Fokus (ein bereits aktiver Eintrag wird aktualisiert); an = false: „aus dem Fokus
-- nehmen“ beendet den Eintrag gestern, die Geschichte bleibt; „wieder an“ legt einen neuen Eintrag an.
create or replace function public.fokus_umschalten(
  p_verhalten uuid, p_an boolean, p_begruendung text default null, p_ab date default null, p_bis date default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon  uuid := private.leitung_salon();
  v_heute  date := private.heute();
  v_ab     date;
  v_name   text;
  v_aktiv  public.fokus_verhalten;
  v_gruend text := nullif(btrim(coalesce(p_begruendung, '')), '');
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  if p_verhalten is null or not exists (select 1 from public.verhalten v where v.id = p_verhalten and v.salon_id = v_salon) then
    raise exception 'Verhalten nicht gefunden.' using errcode = '42501';
  end if;
  if p_an is null then
    raise exception 'Bitte angeben, ob das Verhalten in den Fokus soll.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_gruend, '')) > 500 then
    raise exception 'Die Begründung darf höchstens 500 Zeichen lang sein.' using errcode = '22023';
  end if;

  select p.name into v_name from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;

  if p_an then
    v_ab := coalesce(p_ab, v_heute);
    if p_bis is not null and p_bis < v_ab then
      raise exception 'Das Ende liegt vor dem Beginn.' using errcode = '22023';
    end if;
    select * into v_aktiv from public.fokus_verhalten f
    where f.salon_id = v_salon and f.verhalten_id = p_verhalten and (f.gueltig_bis is null or f.gueltig_bis >= v_heute)
    order by f.gueltig_ab limit 1;
    if v_aktiv.id is not null then
      if p_bis is not null and p_bis < v_aktiv.gueltig_ab then
        raise exception 'Das Ende liegt vor dem Beginn.' using errcode = '22023';
      end if;
      update public.fokus_verhalten f set begruendung = v_gruend, gueltig_bis = p_bis where f.id = v_aktiv.id;
    else
      insert into public.fokus_verhalten (salon_id, verhalten_id, begruendung, gueltig_ab, gueltig_bis, angelegt_von)
      values (v_salon, p_verhalten, v_gruend, v_ab, p_bis, coalesce(v_name, 'unbekannt'));
    end if;
  else
    -- beendet: gestern. Ein Eintrag, der erst heute beginnt, beginnt dann ebenfalls gestern (nie Ende vor Beginn).
    update public.fokus_verhalten f
       set gueltig_ab = least(f.gueltig_ab, v_heute - 1), gueltig_bis = v_heute - 1
     where f.salon_id = v_salon and f.verhalten_id = p_verhalten and (f.gueltig_bis is null or f.gueltig_bis >= v_heute);
  end if;
  return public.fokus_liste();
end
$$;

-- ----------------------------------------------------------------------------
-- Agenda (Verantwortliche und Admin)
-- ----------------------------------------------------------------------------
create or replace function public.agenda_erzeugen(p_monat date, p_neu boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon  uuid := private.leitung_salon();
  v_monat  date;
  v_alt    public.analysen;
  v_agenda jsonb;
  v_zeile  public.analysen;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  if p_monat is null then
    raise exception 'Der Monat fehlt.' using errcode = '22023';
  end if;
  v_monat := private.monatsanfang(p_monat);
  if not exists (select 1 from public.umfrage_abgaben a where a.salon_id = v_salon and a.monat = v_monat) then
    raise exception 'Für diesen Monat gibt es keine Auswertung.' using errcode = '22023';
  end if;

  select * into v_alt from public.analysen a
  where a.salon_id = v_salon and a.monat = v_monat and a.typ = 'team_agenda';
  if v_alt.id is not null and not coalesce(p_neu, false) then
    return private.agenda_zeile(v_alt);
  end if;

  v_agenda := private.agenda_bauen(v_salon, v_monat, private.heute());
  perform private.agenda_validieren(v_agenda);

  insert into public.analysen (salon_id, monat, typ, person_id, status, text, ausgabe, prompt_version, anbieter, geprueft)
  values (v_salon, v_monat, 'team_agenda', null, 'entwurf', private.agenda_text(v_agenda), v_agenda, 'agenda-vorlage-v1', 'vorlage', true)
  on conflict (salon_id, monat, typ, (coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid))) do update
    set status = 'entwurf', text = excluded.text, ausgabe = excluded.ausgabe, prompt_version = excluded.prompt_version,
        bearbeitet = false, bearbeitet_am = null, bearbeitet_von = null,
        freigegeben_am = null, freigegeben_von = null, aktualisiert_am = now()
  returning * into v_zeile;
  return private.agenda_zeile(v_zeile);
end
$$;

create or replace function public.agenda_lesen(p_monat date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.leitung_salon();
  v_zeile public.analysen;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  if p_monat is null then
    raise exception 'Der Monat fehlt.' using errcode = '22023';
  end if;
  select * into v_zeile from public.analysen a
  where a.salon_id = v_salon and a.monat = private.monatsanfang(p_monat) and a.typ = 'team_agenda';
  if v_zeile.id is null then
    return null;
  end if;
  return private.agenda_zeile(v_zeile);
end
$$;

-- Bearbeiten: Aufbau und Zeitbudget prüft die Datenbank; Überschriften, Reihenfolge und Hinweise bleiben fest.
-- Jede Bearbeitung macht die Agenda wieder zum Entwurf; ein unveränderter Stand ändert nichts.
create or replace function public.agenda_bearbeiten(p_monat date, p_agenda jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon  uuid := private.leitung_salon();
  v_monat  date;
  v_alt    public.analysen;
  v_neu    jsonb;
  v_ich    text;
  v_zeile  public.analysen;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  if p_monat is null then
    raise exception 'Der Monat fehlt.' using errcode = '22023';
  end if;
  v_monat := private.monatsanfang(p_monat);
  select * into v_alt from public.analysen a where a.salon_id = v_salon and a.monat = v_monat and a.typ = 'team_agenda';
  if v_alt.id is null then
    raise exception 'Es gibt noch keine Agenda.' using errcode = '22023';
  end if;

  perform private.agenda_validieren(p_agenda);

  -- nur die erlaubten Felder übernehmen
  v_neu := jsonb_build_object(
    'vorlage', v_alt.ausgabe->'vorlage', 'monat', v_alt.ausgabe->'monat',
    'unvollstaendig', v_alt.ausgabe->'unvollstaendig', 'hinweise', v_alt.ausgabe->'hinweise',
    'minuten_gesamt', (select sum((b->>'minuten')::numeric) from jsonb_array_elements(p_agenda->'bloecke') b),
    'bloecke', (
      select jsonb_agg(jsonb_build_object(
               'id', b->>'id', 'titel', alt.blk->>'titel', 'minuten', (b->>'minuten')::integer,
               'punkte', (select jsonb_agg(
                            jsonb_strip_nulls(jsonb_build_object(
                              'text', btrim(p->>'text'),
                              'beispiel', case when coalesce((p->>'beispiel')::boolean, false) then true end,
                              'grund', p->>'grund', 'nr', p->'nr')) order by o)
                          from jsonb_array_elements(b->'punkte') with ordinality as t(p, o))) order by bo)
      from jsonb_array_elements(p_agenda->'bloecke') with ordinality as u(b, bo)
      join lateral (select a2.blk from jsonb_array_elements(v_alt.ausgabe->'bloecke') a2(blk) where a2.blk->>'id' = u.b->>'id') alt on true));

  if v_neu = v_alt.ausgabe then
    return private.agenda_zeile(v_alt);
  end if;

  select p.name into v_ich from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;
  update public.analysen a
     set ausgabe = v_neu, text = private.agenda_text(v_neu), status = 'entwurf', bearbeitet = true,
         bearbeitet_am = now(), bearbeitet_von = coalesce(v_ich, 'unbekannt'),
         freigegeben_am = null, freigegeben_von = null, aktualisiert_am = now()
   where a.id = v_alt.id
   returning * into v_zeile;
  return private.agenda_zeile(v_zeile);
end
$$;

create or replace function public.agenda_freigeben(p_monat date, p_freigeben boolean default true)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon uuid := private.leitung_salon();
  v_ich   text;
  v_zeile public.analysen;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  if p_monat is null then
    raise exception 'Der Monat fehlt.' using errcode = '22023';
  end if;
  select p.name into v_ich from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;
  update public.analysen a
     set status = case when coalesce(p_freigeben, true) then 'freigegeben' else 'entwurf' end,
         freigegeben_am = case when coalesce(p_freigeben, true) then now() end,
         freigegeben_von = case when coalesce(p_freigeben, true) then coalesce(v_ich, 'unbekannt') end,
         aktualisiert_am = now()
   where a.salon_id = v_salon and a.monat = private.monatsanfang(p_monat) and a.typ = 'team_agenda'
   returning * into v_zeile;
  if v_zeile.id is null then
    raise exception 'Es gibt noch keine Agenda.' using errcode = '22023';
  end if;
  return private.agenda_zeile(v_zeile);
end
$$;

-- ----------------------------------------------------------------------------
-- Termine (nur Admin, auch Verantwortliche bekommen 42501)
-- ----------------------------------------------------------------------------
create or replace function private.admin_salon()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid;
begin
  if private.rolle() is distinct from 'admin' then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  select private.leitung_salon() into v_salon;
  return v_salon;
end
$$;

-- „2026-10-26T10:00“ (Ortszeit, ohne Zeitzone) → timestamptz; die Datenbank rechnet Sommer- und Winterzeit
create or replace function private.ortszeit(p_text text)
returns timestamptz
language plpgsql immutable set search_path = ''
as $$
begin
  if p_text is null or p_text !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then
    raise exception 'Datum und Uhrzeit sind ungültig. Bitte so eingeben: 2026-10-26T10:00.' using errcode = '22023';
  end if;
  begin
    return replace(p_text, 'T', ' ')::timestamp at time zone 'Europe/Berlin';
  exception when others then
    raise exception 'Datum und Uhrzeit sind ungültig. Bitte so eingeben: 2026-10-26T10:00.' using errcode = '22023';
  end;
end
$$;

-- Vorlauf-Listen prüfen: positiv, höchstens p_max, höchstens 5 Werte, ohne Doppelte, aufsteigend
create or replace function private.vorlauf_pruefen(p_werte numeric[], p_max numeric, p_name text)
returns numeric[]
language plpgsql immutable set search_path = ''
as $$
declare
  v_ok numeric[];
begin
  if p_werte is null or cardinality(p_werte) = 0 or cardinality(p_werte) > 5 then
    raise exception '%: bitte ein bis fünf Werte angeben.', p_name using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_werte) x where x is null or x <= 0 or x > p_max) then
    raise exception '%: jeder Wert muss größer als 0 und höchstens % sein.', p_name, trim_scale(p_max) using errcode = '22023';
  end if;
  select array_agg(x order by x) into v_ok from (select distinct x from unnest(p_werte) x) s;
  return v_ok;
end
$$;

revoke all on function private.admin_salon(), private.ortszeit(text), private.vorlauf_pruefen(numeric[], numeric, text) from public;

create or replace function public.termine_liste()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.admin_salon();
  v_jetzt timestamptz := now();
begin
  return jsonb_build_object(
    'jetzt', v_jetzt,
    'termine', coalesce((
      select jsonb_agg(private.termin_json(t, v_jetzt) order by t.startet_am)
      from public.meeting_termine t where t.salon_id = v_salon), '[]'::jsonb),
    'fehlgeschlagen', (
      select count(*) from public.meeting_termine t
      join public.mail_log m on m.termin_id = t.id
      where t.salon_id = v_salon and not t.entfernt and t.startet_am > v_jetzt - interval '60 days'
        and ((m.status = 'fehler' and m.versuche >= 3)
             or (m.status = 'in_arbeit' and m.versuche >= 3 and m.gestartet_am < v_jetzt - interval '10 minutes'))));
end
$$;

create or replace function public.termin_speichern(
  p_id uuid, p_startet_lokal text, p_titel text default 'Teammeeting', p_bezugsmonat date default null,
  p_vorlauf_tage numeric[] default '{2}', p_erinnerung_stunden numeric[] default '{1}',
  p_admin_in_kopie boolean default false, p_mails_pausiert boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon uuid := private.admin_salon();
  v_start timestamptz := private.ortszeit(p_startet_lokal);
  v_titel text := btrim(coalesce(p_titel, ''));
  v_tage  numeric[] := private.vorlauf_pruefen(p_vorlauf_tage, 30, 'Vorlauf in Tagen');
  v_std   numeric[] := private.vorlauf_pruefen(p_erinnerung_stunden, 168, 'Erinnerung in Stunden');
  v_ich   text;
  v_t     public.meeting_termine;
begin
  if v_titel = '' or char_length(v_titel) > 100 then
    raise exception 'Der Titel braucht 1 bis 100 Zeichen.' using errcode = '22023';
  end if;
  if p_bezugsmonat is not null and extract(day from p_bezugsmonat) <> 1 then
    raise exception 'Der Bezugsmonat muss ein Monatsanfang sein.' using errcode = '22023';
  end if;
  select p.name into v_ich from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;

  if p_id is null then
    insert into public.meeting_termine (salon_id, startet_am, titel, bezugsmonat, vorlauf_tage, erinnerung_stunden, admin_in_kopie, mails_pausiert, angelegt_von)
    values (v_salon, v_start, v_titel, p_bezugsmonat, v_tage, v_std, coalesce(p_admin_in_kopie, false), coalesce(p_mails_pausiert, false), coalesce(v_ich, 'unbekannt'))
    returning * into v_t;
  else
    update public.meeting_termine t
       set startet_am = v_start, titel = v_titel, bezugsmonat = p_bezugsmonat, vorlauf_tage = v_tage, erinnerung_stunden = v_std,
           admin_in_kopie = coalesce(p_admin_in_kopie, false), mails_pausiert = coalesce(p_mails_pausiert, false), aktualisiert_am = now()
     where t.id = p_id and t.salon_id = v_salon and not t.entfernt
     returning * into v_t;
    if v_t.id is null then
      raise exception 'Termin nicht gefunden.' using errcode = '42501';
    end if;
  end if;
  return private.termin_json(v_t, now());
end
$$;

create or replace function public.termine_serie(
  p_startet_lokal text, p_rhythmus text, p_anzahl integer, p_titel text default 'Teammeeting',
  p_vorlauf_tage numeric[] default '{2}', p_erinnerung_stunden numeric[] default '{1}', p_admin_in_kopie boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon uuid := private.admin_salon();
  v_start timestamptz := private.ortszeit(p_startet_lokal);
  v_lokal timestamp := replace(p_startet_lokal, 'T', ' ')::timestamp;
  v_titel text := btrim(coalesce(p_titel, ''));
  v_tage  numeric[] := private.vorlauf_pruefen(p_vorlauf_tage, 30, 'Vorlauf in Tagen');
  v_std   numeric[] := private.vorlauf_pruefen(p_erinnerung_stunden, 168, 'Erinnerung in Stunden');
  v_schritt interval;
  v_serie uuid := gen_random_uuid();
  v_ich   text;
  i       integer;
begin
  if v_start is null then
    raise exception 'Datum und Uhrzeit sind ungültig.' using errcode = '22023';
  end if;
  if v_titel = '' or char_length(v_titel) > 100 then
    raise exception 'Der Titel braucht 1 bis 100 Zeichen.' using errcode = '22023';
  end if;
  v_schritt := case p_rhythmus when 'woechentlich' then interval '7 days' when 'zweiwoechentlich' then interval '14 days' when 'monatlich' then interval '1 month' end;
  if v_schritt is null then
    raise exception 'Der Rhythmus muss „woechentlich“, „zweiwoechentlich“ oder „monatlich“ sein.' using errcode = '22023';
  end if;
  if p_anzahl is null or p_anzahl < 2 or p_anzahl > 60 then
    raise exception 'Eine Serie hat 2 bis 60 Termine.' using errcode = '22023';
  end if;
  select p.name into v_ich from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;

  -- Ortszeit bleibt über die Zeitumstellung gleich: in Wanduhrzeit weiterzählen, dann erst in timestamptz wandeln.
  -- Jeder Termin wird vom ersten aus gerechnet (31. Januar + 1 Monat = 28. Februar, aber + 2 Monate = 31. März).
  for i in 0..p_anzahl - 1 loop
    insert into public.meeting_termine (salon_id, startet_am, titel, vorlauf_tage, erinnerung_stunden, admin_in_kopie, serie_id, angelegt_von)
    values (v_salon, (v_lokal + v_schritt * i) at time zone 'Europe/Berlin', v_titel, v_tage, v_std, coalesce(p_admin_in_kopie, false), v_serie, coalesce(v_ich, 'unbekannt'));
  end loop;
  return public.termine_liste();
end
$$;

create or replace function public.termin_entfernen(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon uuid := private.admin_salon();
  v_t     public.meeting_termine;
begin
  update public.meeting_termine t set entfernt = true, aktualisiert_am = now()
   where t.id = p_id and t.salon_id = v_salon
   returning * into v_t;
  if v_t.id is null then
    raise exception 'Termin nicht gefunden.' using errcode = '42501';
  end if;
  return public.termine_liste();
end
$$;

-- ----------------------------------------------------------------------------
-- Versand: nur für service_role (Edge Function agenda-versand). Die Datenbank entscheidet, nicht der Kalender.
-- ----------------------------------------------------------------------------
-- Was jetzt zu senden ist. Eine verpasste Agenda-Mail wird bis Terminbeginn nachgeholt, danach nie mehr.
create or replace function public.versand_faellig(p_jetzt timestamptz default now())
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'termin_id', t.id, 'art', a.art, 'startet_am', t.startet_am, 'titel', t.titel,
           'faellig_ab', private.faellig_ab(t, a.art), 'versuche', coalesce(m.versuche, 0))
         order by t.startet_am, a.art), '[]'::jsonb)
  from public.meeting_termine t
  cross join (values ('vorab'), ('erinnerung')) as a(art)
  left join public.mail_log m on m.termin_id = t.id and m.art = a.art
  where private.versand_faellig_art(t, a.art, p_jetzt)
    and (m.id is null
         or (m.status = 'fehler' and m.versuche < 3)
         or (m.status = 'in_arbeit' and m.versuche < 3 and m.gestartet_am < p_jetzt - interval '10 minutes'))
$$;

-- Beanspruchen: UNIQUE (termin_id, art) entscheidet, welcher Lauf sendet; ein zweiter bekommt null.
-- Höchstens 3 Versuche; ein seit über 10 Minuten „in Arbeit“ hängender Lauf wird übernommen.
create or replace function public.versand_beanspruchen(p_termin uuid, p_art text, p_jetzt timestamptz default now())
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  t         public.meeting_termine;
  v_versuch integer;
begin
  if p_art is null or p_art not in ('vorab', 'erinnerung') then
    raise exception 'Unbekannte Art der Mail.' using errcode = '22023';
  end if;
  select * into t from public.meeting_termine x where x.id = p_termin;
  if t.id is null or not private.versand_faellig_art(t, p_art, p_jetzt) then
    return null;
  end if;

  insert into public.mail_log (termin_id, art, status, versuche, gestartet_am)
  values (p_termin, p_art, 'in_arbeit', 1, p_jetzt)
  on conflict (termin_id, art) do update
    set status = 'in_arbeit', versuche = public.mail_log.versuche + 1, gestartet_am = p_jetzt
    where public.mail_log.versuche < 3
      and (public.mail_log.status = 'fehler'
           or (public.mail_log.status = 'in_arbeit' and public.mail_log.gestartet_am < p_jetzt - interval '10 minutes'))
  returning versuche into v_versuch;
  return v_versuch;
end
$$;

-- Der Inhalt der Mail: die gespeicherte Agenda, sonst die Vorlage. Ohne Kommentar-Beispiele, ohne Namen.
create or replace function public.agenda_fuer_versand(p_termin uuid, p_jetzt timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  t        public.meeting_termine;
  v_monat  date;
  v_a      public.analysen;
  v_agenda jsonb;
  v_status text;
begin
  select * into t from public.meeting_termine x where x.id = p_termin and not x.entfernt;
  if t.id is null then
    raise exception 'Termin nicht gefunden.' using errcode = '22023';
  end if;
  v_monat := coalesce(t.bezugsmonat, date_trunc('month', (t.startet_am at time zone 'Europe/Berlin') - interval '1 month')::date);

  select * into v_a from public.analysen a where a.salon_id = t.salon_id and a.monat = v_monat and a.typ = 'team_agenda';
  if v_a.id is not null then
    v_agenda := v_a.ausgabe;
    v_status := v_a.status;
  elsif exists (select 1 from public.umfrage_abgaben x where x.salon_id = t.salon_id and x.monat = v_monat) then
    v_agenda := private.agenda_bauen(t.salon_id, v_monat, (p_jetzt at time zone 'Europe/Berlin')::date);
    v_status := 'entwurf';
  end if;

  return jsonb_build_object(
    'salon', (select s.name from public.salons s where s.id = t.salon_id),
    'termin', jsonb_build_object('id', t.id, 'titel', t.titel, 'startet_am', t.startet_am,
                                 'startet_lokal', to_char(t.startet_am at time zone 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI')),
    'monat', to_char(v_monat, 'YYYY-MM'),
    'status', v_status,
    'agenda', private.agenda_ohne_beispiele(v_agenda),
    'hinweis', case when v_agenda is null then 'Für diesen Monat liegen noch keine Auswertungen vor, deshalb gibt es noch keine Agenda.' end,
    -- Empfänger: aktive Verantwortliche des Salons mit E-Mail, auf Wunsch zusätzlich der Admin. Mitarbeiter nie.
    'empfaenger', coalesce((
      select jsonb_agg(e order by e)
      from (select distinct lower(btrim(p.email)) as e
            from public.personen p
            where p.aktiv and coalesce(btrim(p.email), '') <> ''
              and ((p.salon_id = t.salon_id and p.rolle = 'verantwortlicher') or (t.admin_in_kopie and p.rolle = 'admin'))) s), '[]'::jsonb));
end
$$;

create or replace function public.versand_abschliessen(p_termin uuid, p_art text, p_ok boolean, p_fehler text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_art is null or p_art not in ('vorab', 'erinnerung') then
    raise exception 'Unbekannte Art der Mail.' using errcode = '22023';
  end if;
  update public.mail_log m
     set status = case when p_ok then 'gesendet' else 'fehler' end,
         gesendet_am = case when p_ok then now() end,
         letzter_fehler = case when p_ok then null else left(coalesce(nullif(btrim(p_fehler), ''), 'Unbekannter Fehler'), 500) end
   where m.termin_id = p_termin and m.art = p_art and m.status = 'in_arbeit';
end
$$;

-- Rechte: Fokus, Agenda und Termine für Anmeldungen (die Funktionen prüfen die Rolle selbst);
-- die Versandfunktionen nur für service_role.
revoke all on function
  public.fokus_liste(), public.fokus_umschalten(uuid, boolean, text, date, date),
  public.agenda_erzeugen(date, boolean), public.agenda_lesen(date), public.agenda_bearbeiten(date, jsonb), public.agenda_freigeben(date, boolean),
  public.termine_liste(), public.termin_speichern(uuid, text, text, date, numeric[], numeric[], boolean, boolean),
  public.termine_serie(text, text, integer, text, numeric[], numeric[], boolean), public.termin_entfernen(uuid),
  public.versand_faellig(timestamptz), public.versand_beanspruchen(uuid, text, timestamptz),
  public.agenda_fuer_versand(uuid, timestamptz), public.versand_abschliessen(uuid, text, boolean, text)
from public, anon, authenticated;

grant execute on function
  public.fokus_liste(), public.fokus_umschalten(uuid, boolean, text, date, date),
  public.agenda_erzeugen(date, boolean), public.agenda_lesen(date), public.agenda_bearbeiten(date, jsonb), public.agenda_freigeben(date, boolean),
  public.termine_liste(), public.termin_speichern(uuid, text, text, date, numeric[], numeric[], boolean, boolean),
  public.termine_serie(text, text, integer, text, numeric[], numeric[], boolean), public.termin_entfernen(uuid)
to authenticated;

grant execute on function
  public.versand_faellig(timestamptz), public.versand_beanspruchen(uuid, text, timestamptz),
  public.agenda_fuer_versand(uuid, timestamptz), public.versand_abschliessen(uuid, text, boolean, text)
to service_role;

-- ----------------------------------------------------------------------------
-- PDF: der Monatsbericht enthält die Agenda nur, wenn sie freigegeben ist
-- ----------------------------------------------------------------------------
create or replace function public.pdf_monatsbericht(p_monat date)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon uuid := private.leitung_salon();
  v_monat date;
  v_ich   record;
  v_dash  jsonb;
  v_komm  jsonb;
  v_zeit  jsonb;
  v_sb    numeric;
  v_fb    numeric;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  if p_monat is null then
    raise exception 'Der Monat fehlt.' using errcode = '22023';
  end if;
  v_monat := p_monat - (extract(day from p_monat)::integer - 1);

  if not exists (select 1 from public.umfrage_abgaben a where a.salon_id = v_salon and a.monat = v_monat) then
    raise exception 'Für diesen Monat gibt es keine Auswertung.' using errcode = '22023';
  end if;

  select p.id, p.name into v_ich
  from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;

  v_dash := public.team_dashboard(v_monat);
  v_komm := public.kommentar_auswertung(v_monat);
  v_zeit := public.zeit_auswertung(v_monat);

  select round(avg((x->>'sb')::numeric), 2), round(avg((x->>'fb')::numeric), 2)
    into v_sb, v_fb
  from jsonb_array_elements(v_dash->'personen') x;

  insert into public.pdf_export_log (salon_id, exportiert_von, von_name, art, monat)
  values (v_salon, v_ich.id, coalesce(v_ich.name, 'unbekannt'), 'monatsbericht', v_monat);

  return jsonb_build_object(
    'salon', (select s.name from public.salons s where s.id = v_salon),
    'monat', to_char(v_monat, 'YYYY-MM'),
    'erstellt_am', now(),
    'schwellen', v_dash->'schwellen',
    'beteiligung', jsonb_build_object(
      'erwartet', v_komm->'team'->'erwartet',
      'abgegeben', v_komm->'team'->'abgegeben'),
    'kennzahlen', jsonb_build_object(
      'sb', v_sb, 'fb', v_fb,
      'differenz', case when v_sb is not null and v_fb is not null then round(v_sb - v_fb, 2) end),
    'verhalten', v_dash->'verhalten',
    'kommentare', jsonb_build_object('team', v_komm->'team', 'personen', v_komm->'personen'),
    'zeit', v_zeit->'zusammenfassung',
    -- nur eine freigegebene Agenda, ohne Kommentar-Beispiele
    'agenda', (
      select jsonb_build_object(
               'bloecke', private.agenda_ohne_beispiele(a.ausgabe)->'bloecke',
               'unvollstaendig', coalesce((a.ausgabe->>'unvollstaendig')::boolean, false),
               'hinweise', coalesce(a.ausgabe->'hinweise', '[]'::jsonb),
               'freigegeben_am', a.freigegeben_am, 'freigegeben_von', a.freigegeben_von)
      from public.analysen a
      where a.salon_id = v_salon and a.monat = v_monat and a.typ = 'team_agenda' and a.status = 'freigegeben')
  );
end
$$;
