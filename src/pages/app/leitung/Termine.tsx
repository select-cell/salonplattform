import { useState } from 'react'
import { Abschnitt, DatenZustand } from '../../../components/auswertung/Bausteine'
import { Icon } from '../../../components/Icon'
import { entferneTermin, holeTermine, speichereSerie, speichereTermin } from '../../../lib/api'
import {
  formatZahlenListe, leseZahlenListe, mailAnzeige, MAIL_ART_NAME, RHYTHMEN, type Rhythmus, type Termin,
} from '../../../lib/agenda'
import { monatName } from '../../../lib/auswertung'
import { zeitpunkt } from '../../../lib/abschluss'
import { useDaten } from '../../../lib/useDaten'

const fehlertext = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Das hat nicht geklappt. Bitte versuche es erneut.')
const wochentagDatum = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })

/** „2026-10-26T10:00“ → „Mo., 26.10.2026, 10:00 Uhr“ (reine Wanduhrzeit, keine Zeitzonen-Umrechnung im Browser) */
function ortszeit(lokal: string): string {
  const [datum, uhr] = lokal.split('T')
  return `${wochentagDatum.format(new Date(`${datum}T00:00:00Z`))}, ${uhr} Uhr`
}

interface Formular {
  id: string | null
  startetLokal: string
  titel: string
  bezugsmonat: string
  vorlauf: string
  erinnerung: string
  adminInKopie: boolean
  mailsPausiert: boolean
  serie: boolean
  rhythmus: Rhythmus
  anzahl: string
}

const LEER: Formular = {
  id: null, startetLokal: '', titel: 'Teammeeting', bezugsmonat: '', vorlauf: '2', erinnerung: '1',
  adminInKopie: false, mailsPausiert: false, serie: false, rhythmus: 'woechentlich', anzahl: '4',
}

/** Leitung → Termine (nur Admin): Teammeeting-Termine einzeln oder als Serie, mit dem Mail-Zustand je Termin. */
export default function Termine() {
  const { laedt, daten, fehler, neuLaden } = useDaten(holeTermine, [])
  const [form, setForm] = useState<Formular | null>(null)
  const [probleme, setProbleme] = useState<string[]>([])
  const [arbeitet, setArbeitet] = useState(false)
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null)
  const [entfernen, setEntfernen] = useState<string | null>(null)
  const [alle, setAlle] = useState(false)

  const oeffne = (t?: Termin) => {
    setMeldung(null)
    setProbleme([])
    setForm(
      t
        ? {
            ...LEER, id: t.id, startetLokal: t.startet_lokal, titel: t.titel, bezugsmonat: t.bezugsmonat_fest ?? '',
            vorlauf: formatZahlenListe(t.vorlauf_tage), erinnerung: formatZahlenListe(t.erinnerung_stunden),
            adminInKopie: t.admin_in_kopie, mailsPausiert: t.mails_pausiert,
          }
        : LEER,
    )
  }

  async function speichern() {
    if (!form) return
    const fehlerListe: string[] = []
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(form.startetLokal)) fehlerListe.push('Bitte Datum und Uhrzeit angeben.')
    if (!form.titel.trim()) fehlerListe.push('Bitte einen Titel angeben.')
    const tage = leseZahlenListe(form.vorlauf)
    const stunden = leseZahlenListe(form.erinnerung)
    if (!tage || tage.some((x) => x > 30) || tage.length > 5) fehlerListe.push('Vorlauf in Tagen: ein bis fünf Zahlen größer als 0, höchstens 30, getrennt mit „;“ oder Leerzeichen („0,5“ ist ein halber Tag).')
    if (!stunden || stunden.some((x) => x > 168) || stunden.length > 5) fehlerListe.push('Erinnerung in Stunden: ein bis fünf Zahlen größer als 0, höchstens 168, getrennt mit „;“ oder Leerzeichen („0,5“ ist eine halbe Stunde).')
    const anzahl = Number(form.anzahl)
    if (form.serie && (!Number.isInteger(anzahl) || anzahl < 2 || anzahl > 60)) fehlerListe.push('Eine Serie hat 2 bis 60 Termine.')
    setProbleme(fehlerListe)
    if (fehlerListe.length > 0 || !tage || !stunden) return

    setArbeitet(true)
    setMeldung(null)
    try {
      if (form.serie && !form.id) {
        await speichereSerie({ startetLokal: form.startetLokal, titel: form.titel.trim(), vorlaufTage: tage, erinnerungStunden: stunden, adminInKopie: form.adminInKopie, rhythmus: form.rhythmus, anzahl })
        setMeldung({ art: 'ok', text: `Serie mit ${anzahl} Terminen angelegt.` })
      } else {
        await speichereTermin({
          id: form.id, startetLokal: form.startetLokal, titel: form.titel.trim(), bezugsmonat: form.bezugsmonat,
          vorlaufTage: tage, erinnerungStunden: stunden, adminInKopie: form.adminInKopie, mailsPausiert: form.mailsPausiert,
        })
        setMeldung({ art: 'ok', text: form.id ? 'Termin gespeichert.' : 'Termin angelegt.' })
      }
      setForm(null)
      neuLaden()
    } catch (e) {
      setMeldung({ art: 'fehler', text: fehlertext(e) })
    } finally {
      setArbeitet(false)
    }
  }

  async function pausiere(t: Termin) {
    setArbeitet(true)
    setMeldung(null)
    try {
      await speichereTermin({
        id: t.id, startetLokal: t.startet_lokal, titel: t.titel, bezugsmonat: t.bezugsmonat_fest ?? '',
        vorlaufTage: t.vorlauf_tage, erinnerungStunden: t.erinnerung_stunden, adminInKopie: t.admin_in_kopie, mailsPausiert: !t.mails_pausiert,
      })
      setMeldung({ art: 'ok', text: t.mails_pausiert ? 'Mails werden wieder gesendet.' : 'Mails pausiert. Der Termin bleibt, es geht keine Mail raus.' })
      neuLaden()
    } catch (e) {
      setMeldung({ art: 'fehler', text: fehlertext(e) })
    } finally {
      setArbeitet(false)
    }
  }

  async function entferne(id: string) {
    setArbeitet(true)
    setMeldung(null)
    try {
      await entferneTermin(id)
      setMeldung({ art: 'ok', text: 'Termin entfernt. Er wird nicht gelöscht, sondern nur gekennzeichnet; Mails gehen dafür nicht mehr raus.' })
      setEntfernen(null)
      neuLaden()
    } catch (e) {
      setMeldung({ art: 'fehler', text: fehlertext(e) })
    } finally {
      setArbeitet(false)
    }
  }

  const sichtbar = (daten?.termine ?? []).filter((t) => alle || !t.entfernt)
  const naechste = daten ? Date.parse(daten.jetzt) : 0

  return (
    <div className="stack stack-l">
      <header className="seitenkopf">
        <p className="overline">Leitung · nur Admin</p>
        <h1 style={{ marginTop: 8 }}>Termine</h1>
        <p>
          Teammeeting-Termine, einzeln oder als Serie. Die Verantwortlichen bekommen die Agenda einige Tage vorher und eine kurze Erinnerung kurz vorher per Mail. Mitarbeiter
          bekommen nie eine Mail. Eingegeben und angezeigt wird die Ortszeit (Europe/Berlin).
        </p>
      </header>

      {meldung && (
        <p className={`hinweis hinweis--${meldung.art === 'ok' ? 'ok' : 'fehler'}`} role={meldung.art === 'ok' ? 'status' : 'alert'}>
          <Icon name={meldung.art === 'ok' ? 'haken' : 'achtung'} groesse={18} />
          <span>{meldung.text}</span>
        </p>
      )}

      <DatenZustand laedt={laedt && !daten} fehler={fehler} onNeu={neuLaden}>
        {daten && (
          <>
            {daten.fehlgeschlagen > 0 && (
              <p className="hinweis hinweis--fehler" role="alert" data-testid="versand-warnung">
                <Icon name="achtung" groesse={18} />
                <span>
                  {daten.fehlgeschlagen === 1 ? 'Eine Mail ist' : `${daten.fehlgeschlagen} Mails sind`} nach drei Versuchen endgültig fehlgeschlagen. Den Grund siehst du beim Termin. Meist hilft: Resend-Schlüssel, Absender-Domain
                  und Secrets prüfen.
                </span>
              </p>
            )}

            {!form && (
              <div className="aktionen">
                <button type="button" className="btn" onClick={() => oeffne()}>
                  Termin anlegen
                </button>
                <label className="klein" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} /> Entfernte anzeigen
                </label>
              </div>
            )}

            {form && (
              <Abschnitt titel={form.id ? 'Termin ändern' : 'Termin anlegen'}>
                <form
                  className="stack"
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault()
                    void speichern()
                  }}
                >
                  <div className="feld" style={{ maxWidth: 280 }}>
                    <label className="feld__label" htmlFor="t-start">Beginn (Ortszeit)</label>
                    <input id="t-start" className="feld__eingabe" type="datetime-local" value={form.startetLokal} onChange={(e) => setForm({ ...form, startetLokal: e.target.value })} />
                  </div>
                  <div className="feld">
                    <label className="feld__label" htmlFor="t-titel">Titel</label>
                    <input id="t-titel" className="feld__eingabe" maxLength={100} value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} />
                  </div>
                  {!form.serie && (
                    <div className="feld" style={{ maxWidth: 240 }}>
                      <label className="feld__label" htmlFor="t-monat">Bezugsmonat der Agenda (leer = Monat vor dem Termin)</label>
                      <input id="t-monat" className="feld__eingabe" type="month" value={form.bezugsmonat} onChange={(e) => setForm({ ...form, bezugsmonat: e.target.value })} />
                    </div>
                  )}
                  <div className="feld" style={{ maxWidth: 360 }}>
                    <label className="feld__label" htmlFor="t-vorlauf">Agenda-Mail: Tage vorher</label>
                    <input id="t-vorlauf" className="feld__eingabe" inputMode="decimal" value={form.vorlauf} onChange={(e) => setForm({ ...form, vorlauf: e.target.value })} />
                    <p className="klein muted">Mehrere Werte mit „;“ oder Leerzeichen trennen, der größte löst aus. Das Komma ist das Dezimalzeichen („0,5“).</p>
                  </div>
                  <div className="feld" style={{ maxWidth: 360 }}>
                    <label className="feld__label" htmlFor="t-erinnerung">Erinnerung: Stunden vorher</label>
                    <input id="t-erinnerung" className="feld__eingabe" inputMode="decimal" value={form.erinnerung} onChange={(e) => setForm({ ...form, erinnerung: e.target.value })} />
                  </div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={form.adminInKopie} onChange={(e) => setForm({ ...form, adminInKopie: e.target.checked })} /> Admin zusätzlich in Kopie
                  </label>
                  {form.id && (
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={form.mailsPausiert} onChange={(e) => setForm({ ...form, mailsPausiert: e.target.checked })} /> Mails pausieren
                    </label>
                  )}
                  {!form.id && (
                    <>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="checkbox" checked={form.serie} onChange={(e) => setForm({ ...form, serie: e.target.checked })} /> Als Serie anlegen
                      </label>
                      {form.serie && (
                        <div className="aktionen">
                          <div className="feld">
                            <label className="feld__label" htmlFor="t-rhythmus">Rhythmus</label>
                            <select id="t-rhythmus" className="feld__eingabe" value={form.rhythmus} onChange={(e) => setForm({ ...form, rhythmus: e.target.value as Rhythmus })}>
                              {RHYTHMEN.map((r) => (
                                <option key={r.wert} value={r.wert}>{r.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="feld" style={{ maxWidth: 140 }}>
                            <label className="feld__label" htmlFor="t-anzahl">Anzahl (2 bis 60)</label>
                            <input id="t-anzahl" className="feld__eingabe" inputMode="numeric" value={form.anzahl} onChange={(e) => setForm({ ...form, anzahl: e.target.value })} />
                          </div>
                        </div>
                      )}
                      {form.serie && <p className="klein muted">Die Uhrzeit bleibt über die Zeitumstellung gleich. Der Bezugsmonat ist bei jedem Termin der Monat davor.</p>}
                    </>
                  )}
                  {probleme.length > 0 && (
                    <div className="hinweis hinweis--fehler" role="alert" data-testid="termin-probleme">
                      <Icon name="achtung" groesse={18} />
                      <span>{probleme.join(' ')}</span>
                    </div>
                  )}
                  <div className="aktionen">
                    <button type="submit" className="btn" disabled={arbeitet}>
                      {arbeitet ? 'Wird gespeichert …' : 'Speichern'}
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => setForm(null)}>
                      Abbrechen
                    </button>
                  </div>
                </form>
              </Abschnitt>
            )}

            <Abschnitt titel="Termine" kurz={sichtbar.length === 0 ? undefined : `${sichtbar.length} ${sichtbar.length === 1 ? 'Termin' : 'Termine'}`}>
              {sichtbar.length === 0 ? (
                <p className="muted">Noch keine Termine. Ohne Termin geht keine Mail raus.</p>
              ) : (
                <ul className="analyse-liste" data-testid="termin-liste">
                  {sichtbar.map((t) => (
                    <li key={t.id} className={t.entfernt ? 'termin--entfernt' : undefined} data-termin={t.id}>
                      <span className="analyse-liste__name">
                        {ortszeit(t.startet_lokal)}
                        <span className="klein muted"> · {t.titel} · Agenda für {monatName(t.bezugsmonat)}{Date.parse(t.startet_am) < naechste ? ' · vorbei' : ''}</span>
                      </span>
                      {!t.entfernt && (
                        <span className="aktionen">
                          <button type="button" className="btn btn--ghost" disabled={arbeitet} onClick={() => oeffne(t)}>Ändern</button>
                          <button type="button" className="btn btn--ghost" disabled={arbeitet} onClick={() => pausiere(t)}>
                            {t.mails_pausiert ? 'Mails fortsetzen' : 'Mails pausieren'}
                          </button>
                          {entfernen === t.id ? (
                            <>
                              <button type="button" className="btn" disabled={arbeitet} onClick={() => entferne(t.id)}>Ja, entfernen</button>
                              <button type="button" className="btn btn--ghost" onClick={() => setEntfernen(null)}>Abbrechen</button>
                            </>
                          ) : (
                            <button type="button" className="btn btn--ghost" disabled={arbeitet} onClick={() => setEntfernen(t.id)}>Entfernen</button>
                          )}
                        </span>
                      )}
                      <span className="badges analyse-liste__zusatz">
                        {t.entfernt && <span className="badge">entfernt</span>}
                        {t.admin_in_kopie && <span className="badge">Admin in Kopie</span>}
                        {t.mails.map((m) => {
                          const a = mailAnzeige(m)
                          return (
                            <span key={m.art} className={`badge${a.ton === 'neutral' ? '' : ` badge--${a.ton}`}`} data-mail={m.art} title={m.fehler ?? undefined}>
                              {MAIL_ART_NAME[m.art]}: {a.text}
                              {m.status === 'geplant' ? ` (ab ${zeitpunkt(m.faellig_ab)})` : ''}
                            </span>
                          )
                        })}
                      </span>
                      {t.mails.filter((m) => m.fehler && (m.status === 'fehler' || m.status === 'fehlgeschlagen')).map((m) => (
                        <p key={m.art} className="klein analyse-liste__zusatz" style={{ color: 'var(--red)' }}>
                          {MAIL_ART_NAME[m.art]}: {m.fehler}
                        </p>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </Abschnitt>
          </>
        )}
      </DatenZustand>
    </div>
  )
}
