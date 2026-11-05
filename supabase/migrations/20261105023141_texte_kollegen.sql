-- ============================================================================
-- Texte: „Kollege“ statt „Kollegin“ in der Meldung zur Entwicklung des Monats.
-- Nur der Wortlaut einer Fehlermeldung in umfrage_einreichen_v2 ändert sich; die Funktion wird
-- aus ihrer eigenen Definition neu geschrieben (Rechte bleiben erhalten, wiederholbar).
-- ============================================================================

do $$
declare
  v_def text := pg_get_functiondef('public.umfrage_einreichen_v2(jsonb)'::regprocedure);
begin
  if v_def like '%eine Kollegin aus.%' then
    execute replace(v_def, 'eine Kollegin aus.', 'einen Kollegen aus.');
  end if;
end
$$;
