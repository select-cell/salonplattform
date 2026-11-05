// Tests für die Hilfen in agenda.ts: `node --test src/lib/agenda.test.ts`
import test from 'node:test'
import assert from 'node:assert/strict'
import { formatZahlenListe, leseZahlenListe, mailAnzeige, pruefeZeitbudget, summeMinuten, type MailZustand } from './agenda.ts'

test('leseZahlenListe: Trenner sind „;“, Leerzeichen und „Komma + Leerzeichen“, ein Komma zwischen Ziffern ist dezimal', () => {
  assert.deepEqual(leseZahlenListe('2'), [2])
  assert.deepEqual(leseZahlenListe('0,5'), [0.5], '„0,5“ ist EIN Wert')
  assert.deepEqual(leseZahlenListe('0,5; 2'), [0.5, 2])
  assert.deepEqual(leseZahlenListe('0,5 2'), [0.5, 2])
  assert.deepEqual(leseZahlenListe('1, 2, 3'), [1, 2, 3], 'Komma + Leerzeichen trennt')
  assert.deepEqual(leseZahlenListe('1,2'), [1.2], 'Komma zwischen Ziffern ist dezimal')
  assert.deepEqual(leseZahlenListe('1;2;3'), [1, 2, 3])
  assert.deepEqual(leseZahlenListe('  1  ;  2.5  '), [1, 2.5])
  assert.deepEqual(leseZahlenListe('1, 0,5'), [1, 0.5])
})

test('leseZahlenListe: ungültige Eingaben ergeben null', () => {
  for (const kaputt of ['', '   ', 'abc', '1 x', '0', '-1', '1,,2', ',5', '5,', '1e3', '1,2,3', '∞']) {
    assert.equal(leseZahlenListe(kaputt), null, `„${kaputt}“`)
  }
})

test('formatZahlenListe: Komma als Dezimalzeichen', () => {
  assert.equal(formatZahlenListe([0.5, 2]), '0,5; 2')
  assert.deepEqual(leseZahlenListe(formatZahlenListe([0.5, 2, 12.25])), [0.5, 2, 12.25], 'Rundreise')
})

test('pruefeZeitbudget: wie die Datenbank', () => {
  const ok = [
    { id: 'einstieg', minuten: 2 }, { id: 'kennzahlen', minuten: 3 }, { id: 'fokus', minuten: 7 },
    { id: 'entwicklung', minuten: 4 }, { id: 'vereinbarungen', minuten: 2 },
  ] as const
  assert.deepEqual(pruefeZeitbudget([...ok]), [])
  assert.equal(summeMinuten([...ok]), 18)
  const mit = (id: string, minuten: number) => ok.map((b) => (b.id === id ? { ...b, minuten } : b)) as unknown as Parameters<typeof pruefeZeitbudget>[0]
  assert.deepEqual(pruefeZeitbudget(mit('fokus', 9)), ['Der Block „Fokus-Verhalten“ darf 6 bis 8 Minuten dauern.'])
  assert.deepEqual(pruefeZeitbudget(mit('fokus', 5)), ['Der Block „Fokus-Verhalten“ darf 6 bis 8 Minuten dauern.'])
  assert.deepEqual(pruefeZeitbudget(mit('einstieg', 3)), ['Der Block „Einstieg und Beteiligung“ dauert genau 2 Minuten.'])
  assert.deepEqual(pruefeZeitbudget(mit('fokus', 7.5)), ['Die Minuten von „Fokus-Verhalten“ müssen eine ganze Zahl sein.'])
  assert.deepEqual(pruefeZeitbudget(mit('fokus', 8)), [], 'Summe 19 ist in Ordnung')
  assert.equal(pruefeZeitbudget(mit('fokus', Number.NaN)).length, 1)
})

test('mailAnzeige: Zustände der Terminliste', () => {
  const m = (status: MailZustand['status'], versuche = 0): MailZustand => ({ art: 'vorab', status, versuche, fehler: null, faellig_ab: '', gesendet_am: null })
  assert.deepEqual(mailAnzeige(m('geplant')), { text: 'geplant', ton: 'neutral' })
  assert.deepEqual(mailAnzeige(m('gesendet', 1)), { text: 'gesendet', ton: 'gruen' })
  assert.deepEqual(mailAnzeige(m('fehler', 2)), { text: 'Fehler, Versuch 2 von 3', ton: 'gelb' })
  assert.deepEqual(mailAnzeige(m('fehlgeschlagen', 3)), { text: 'nach 3 Versuchen fehlgeschlagen', ton: 'rot' })
  assert.deepEqual(mailAnzeige(m('pausiert')), { text: 'pausiert', ton: 'neutral' })
  assert.deepEqual(mailAnzeige(m('verpasst')), { text: 'nicht gesendet', ton: 'neutral' })
})
