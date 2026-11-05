// Kleine Markdown-Auswahl für die Analyse-Texte: Überschriften (#), Aufzählungen (- ) und **fett**.
// Mehr gibt es absichtlich nicht: Der Text kommt aus der KI und wird von der Leitung bearbeitet, es wird nie HTML eingefügt.
export type MdBlock =
  | { art: 'ueberschrift'; text: string }
  | { art: 'absatz'; text: string }
  | { art: 'liste'; punkte: string[] }

export function parseMarkdown(text: string): MdBlock[] {
  const bloecke: MdBlock[] = []
  let absatz: string[] = []
  let punkte: string[] | null = null

  const schliesseAbsatz = () => {
    if (absatz.length) bloecke.push({ art: 'absatz', text: absatz.join(' ') })
    absatz = []
  }
  const schliesseListe = () => {
    if (punkte) bloecke.push({ art: 'liste', punkte })
    punkte = null
  }

  for (const zeile of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!zeile.trim()) {
      schliesseAbsatz()
      schliesseListe()
      continue
    }
    const ueberschrift = /^\s*#{1,6}\s+(.*\S)\s*$/.exec(zeile)
    if (ueberschrift) {
      schliesseAbsatz()
      schliesseListe()
      bloecke.push({ art: 'ueberschrift', text: ueberschrift[1] })
      continue
    }
    const punkt = /^\s*[-*]\s+(.*\S)\s*$/.exec(zeile)
    if (punkt) {
      schliesseAbsatz()
      ;(punkte ??= []).push(punkt[1])
      continue
    }
    schliesseListe()
    absatz.push(zeile.trim())
  }
  schliesseAbsatz()
  schliesseListe()
  return bloecke
}

/** „Das ist **wichtig**.“ → [{Das ist ,false},{wichtig,true},{.,false}] */
export function inlineTeile(text: string): { text: string; fett: boolean }[] {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((t, i) => ({ text: t, fett: i % 2 === 1 }))
    .filter((t) => t.text !== '')
}
