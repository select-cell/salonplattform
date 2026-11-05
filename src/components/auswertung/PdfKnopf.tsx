import { useState } from 'react'
import { Icon } from '../Icon'

/**
 * Knopf „Als PDF“ für Monats- und Personenbericht. Die Erzeugung läuft im Browser; die Datenbank prüft die Rechte
 * und protokolliert den Abruf. Fehlermeldungen der Datenbank sind bereits deutsch.
 */
export function PdfKnopf({ label, erzeuge }: { label: string; erzeuge: () => Promise<void> }) {
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function klick() {
    setLaeuft(true)
    setFehler(null)
    try {
      await erzeuge()
    } catch (e) {
      setFehler(e instanceof Error && e.message ? e.message : 'Das PDF konnte nicht erstellt werden.')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div className="pdf-knopf">
      <button type="button" className="btn btn--ghost" onClick={klick} disabled={laeuft} aria-busy={laeuft}>
        <Icon name="download" groesse={18} />
        {laeuft ? 'PDF wird erstellt …' : label}
      </button>
      {fehler && (
        <p className="hinweis hinweis--fehler" role="alert">
          <Icon name="achtung" groesse={18} />
          <span>{fehler}</span>
        </p>
      )}
    </div>
  )
}
