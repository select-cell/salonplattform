import type { SendeDetails } from '../../lib/bestellApi'
import { istTestUrl, ordneEin } from '../../lib/testversion'

/** Nur Testversion: zeigt, was gesendet wurde, was zurückkam und woran es liegt */
export function TestDetails({ details }: { details: SendeDetails }) {
  const einordnung = ordneEin(details)
  const klasse = einordnung.stufe === 'ok' ? 'hinweis hinweis--ok' : einordnung.stufe === 'fehler' ? 'hinweis hinweis--fehler' : 'hinweis'
  return (
    <details className="testdetails">
      <summary>Testdetails anzeigen: Was gesendet wurde und was zurückkam</summary>
      <dl>
        <dt>Ziel ({istTestUrl(details.url) ? 'Test-URL' : 'Produktions-URL'})</dt>
        <dd>
          <code>POST {details.url || '(keine URL eingebaut)'}</code>
        </dd>
        <dt>Gesendet (JSON)</dt>
        <dd>
          <pre>{JSON.stringify(details.gesendet, null, 2)}</pre>
        </dd>
        <dt>Antwort</dt>
        <dd>
          {details.status !== null ? (
            <>
              <code>
                HTTP {details.status} · {details.dauerMs} ms
              </code>
              <pre>{details.antwortText?.trim() ? details.antwortText : '(leer)'}</pre>
            </>
          ) : (
            <code>
              keine lesbare Antwort ({details.fehler ?? 'unbekannt'}) · {details.dauerMs} ms
            </code>
          )}
        </dd>
      </dl>
      <div className={klasse} role="status">
        <p>{einordnung.text}</p>
      </div>
    </details>
  )
}
