import { inlineTeile, parseMarkdown } from '../../lib/markdown'

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineTeile(text).map((t, i) => (t.fett ? <strong key={i}>{t.text}</strong> : <span key={i}>{t.text}</span>))}
    </>
  )
}

/** Zeigt den Analyse-Text. Es gibt nur Überschriften, Aufzählungen und Fettdruck, nie eingefügtes HTML. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="md" data-testid="analyse-text">
      {parseMarkdown(text).map((b, i) =>
        b.art === 'ueberschrift' ? (
          <h3 key={i} className="md__titel">
            <Inline text={b.text} />
          </h3>
        ) : b.art === 'liste' ? (
          <ul key={i} className="md__liste">
            {b.punkte.map((p, j) => (
              <li key={j}>
                <Inline text={p} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Inline text={b.text} />
          </p>
        ),
      )}
    </div>
  )
}
