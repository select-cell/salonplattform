-- ============================================================================
-- Seed: Inhalte der Dawiid-Umfrage (Plan §5.1, Phase 2)
--
-- Quelle: die bestehende Umfrage. Ausgelesen aus der vorhandenen Abgabe, also
-- Texte, Nummern, Grundpfeiler und Säulen exakt so, wie die Umfrage sie bisher
-- verwendet hat. Nichts davon ist neu formuliert.
--
-- NOCH NICHT ENTHALTEN, weil es in einer Abgabe nicht vorkommt und deshalb nicht
-- belegt ist (kommt aus referenz/umfrage-dawiid.html):
--   * Bewertungsstufen 1–5 (verhalten_kriterien): Bezeichnung, Prozent, Leitsatz, Punkte
--   * Videos (video_url) für Verhalten und Rituale
--   * die Auswahl-Frage „Welche Phase war am wenigsten stabil?“ je Ritual samt Optionen
--
-- Die Umfrage funktioniert auch ohne diese Teile; sie erscheinen, sobald sie in den
-- Tabellen stehen. Die Migration ist wiederholbar (on conflict do nothing).
-- ============================================================================

with salon as (
  select id from public.salons where name = 'Dawiid'
)
insert into public.verhalten (salon_id, nr, grundpfeiler, saeule, titel)
select salon.id, v.nr, v.grundpfeiler, v.saeule, v.titel
from salon,
(values
  (1,  'Grundpfeiler 1: Philosophie', 'Säule 1: Umgangsformen und Respekt',
       'Bittet den Gast um Erlaubnis, bevor ein Kollege im Gespräch unterbrochen wird.'),
  (2,  'Grundpfeiler 1: Philosophie', 'Säule 1: Umgangsformen und Respekt',
       'Tritt vor dem Gast professionell auf und strahlt auch in anspruchsvollen Situationen Ruhe und Professionalität aus.'),
  (3,  'Grundpfeiler 1: Philosophie', 'Säule 1: Umgangsformen und Respekt',
       'Übernimmt die Gesprächsführung bewusst und richtet den Fokus konsequent auf den Gast.'),
  (4,  'Grundpfeiler 1: Philosophie', 'Säule 1: Umgangsformen und Respekt',
       'Wahrt professionelle Themenwahl und schützt die Salon-Atmosphäre.'),
  (5,  'Grundpfeiler 1: Philosophie', 'Säule 2: Vertrauen und Entspannung',
       'Sorgt für Ruhe und eine entspannte Atmosphäre am Waschbecken.'),
  (6,  'Grundpfeiler 1: Philosophie', 'Säule 2: Vertrauen und Entspannung',
       'Geht sorgsam und respektvoll mit den Haaren des Gastes um.'),
  (7,  'Grundpfeiler 1: Philosophie', 'Säule 2: Vertrauen und Entspannung',
       'Sammelt relevante Gästeinformationen im System und nutzt diese aktiv.'),
  (8,  'Grundpfeiler 1: Philosophie', 'Säule 2: Vertrauen und Entspannung',
       'Spricht den Gast bewusst und angemessen mit Namen an.'),
  (9,  'Grundpfeiler 1: Philosophie', 'Säule 2: Vertrauen und Entspannung',
       'Informiert den Gast aktiv und passend über das Bücherregal.'),
  (10, 'Grundpfeiler 2: Kultur', 'Säule 1: Motivation',
       'Beginnt Aufgaben selbstständig – ohne Erinnerung.'),
  (11, 'Grundpfeiler 2: Kultur', 'Säule 1: Motivation',
       'Ist zu Mehrarbeit bereit, wenn es die Situation verlangt.'),
  (12, 'Grundpfeiler 2: Kultur', 'Säule 1: Motivation',
       'Nutzt Leerlaufzeiten sinnvoll für Ordnung, Unterstützung und Vorbereitung.'),
  (13, 'Grundpfeiler 2: Kultur', 'Säule 2: Teamfähigkeit',
       'Reagiert verbindlich auf Team-Nachrichten (Apple Watch / WhatsApp).'),
  (14, 'Grundpfeiler 2: Kultur', 'Säule 2: Teamfähigkeit',
       'Sorgt aktiv für ein gutes Miteinander im Team.'),
  (15, 'Grundpfeiler 2: Kultur', 'Säule 2: Teamfähigkeit',
       'Handelt im Sinne des Gesamterfolgs des Salons.'),
  (16, 'Grundpfeiler 2: Kultur', 'Säule 2: Teamfähigkeit',
       'Ist 15 Minuten vor dem ersten Gast präsent und vorbereitet.'),
  (17, 'Grundpfeiler 3: Professionalität und Exklusivität', 'Säule 1: Fachkompetenz',
       'Informiert den Gast bei jedem Arbeitsschritt über verwendete Produkte, Tools und Dienstleistungen.'),
  (18, 'Grundpfeiler 3: Professionalität und Exklusivität', 'Säule 1: Fachkompetenz',
       'Fragt Gäste regelmäßig und passend nach Feedback (z. B. Google).'),
  (19, 'Grundpfeiler 3: Professionalität und Exklusivität', 'Säule 1: Fachkompetenz',
       'Sendet 3 Tage nach dem Termin eine Follow-up-Nachricht per WhatsApp, um die Zufriedenheit des Gastes zu erfragen.'),
  (20, 'Grundpfeiler 3: Professionalität und Exklusivität', 'Säule 1: Fachkompetenz',
       'Bietet aktiv ein neues Getränk an oder schenkt nach, sobald das Glas des Gastes leer ist.')
) as v (nr, grundpfeiler, saeule, titel)
on conflict (salon_id, nr) do nothing;

-- Rituale
with salon as (
  select id from public.salons where name = 'Dawiid'
)
insert into public.rituale (salon_id, nr, titel)
select salon.id, r.nr, r.titel
from salon,
(values
  (1, 'Empfangsritual'),
  (2, 'Verabschiedungsritual')
) as r (nr, titel)
on conflict (salon_id, nr) do nothing;

-- Fragen der Rituale. Die Skalen-Fragen sind Pflicht (sie fließen in die Auswertung ein),
-- Anmerkungen sind freiwillig. Die Wortlaute sind unverändert („im vergangenen Monat“
-- siehe offener Punkt 2 im Plan).
insert into public.ritual_fragen (ritual_id, nr, typ, frage, pflicht)
select ri.id, f.nr, f.typ, f.frage, f.pflicht
from public.rituale ri
join public.salons s on s.id = ri.salon_id and s.name = 'Dawiid'
join (values
  (1, 1, 'skala', 'Wie nah war deine Umsetzung im vergangenen Monat am idealen Empfangsritual?', true),
  (1, 2, 'text',  'Anmerkungen (Empfangsritual)', false),
  (1, 4, 'skala', 'Wie klar und selbstverständlich wird das Empfangsritual aktuell im Team gelebt?', true),
  (1, 5, 'text',  'Anmerkungen (Teamsicht – Empfangsritual)', false),
  (2, 1, 'skala', 'Wie nah war deine Umsetzung im vergangenen Monat am idealen Verabschiedungsritual?', true),
  (2, 2, 'text',  'Anmerkungen (Verabschiedungsritual)', false),
  (2, 4, 'skala', 'Wie stabil lebt das gesamte Team das Verabschiedungsritual?', true),
  (2, 5, 'text',  'Anmerkungen (Verabschiedungsritual aus Teamsicht)', false),
  (2, 6, 'text',  'Was wirst du im nächsten Monat bewusster leben?', false)
) as f (ritual_nr, nr, typ, frage, pflicht) on f.ritual_nr = ri.nr
on conflict (ritual_id, nr) do nothing;
