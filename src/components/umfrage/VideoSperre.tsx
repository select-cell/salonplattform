import { useEffect, useRef, useState } from 'react'
import { klassifiziere } from '../../lib/videoQuelle'
import { Icon } from '../Icon'

interface Props {
  url: string | null
  titel: string
  gesehen: boolean
  onGesehen: () => void
}

/** Wie lange wir warten, bevor wir einen Ausweg anbieten, falls ein Video nicht abspielbar ist. */
const AUSWEG_NACH_MS = 20_000

/**
 * Video mit Pflicht (Plan §1): Die Bewertung wird erst frei, wenn das Video bis zum Ende
 * gelaufen ist. Ohne Video-Link (Platzhalter) gibt es keine Sperre.
 */
export function VideoSperre({ url, titel, gesehen, onGesehen }: Props) {
  const [auswegSichtbar, setAuswegSichtbar] = useState(false)
  const onGesehenRef = useRef(onGesehen)
  useEffect(() => {
    onGesehenRef.current = onGesehen
  })

  useEffect(() => {
    if (gesehen || !url) return
    const timer = window.setTimeout(() => setAuswegSichtbar(true), AUSWEG_NACH_MS)
    return () => window.clearTimeout(timer)
  }, [gesehen, url])

  if (!url) {
    return (
      <div className="video video--platzhalter" role="note">
        <Icon name="umfrage" groesse={26} />
        <span>Das Video folgt.</span>
      </div>
    )
  }

  const quelle = klassifiziere(url)

  return (
    <div className="video">
      <div className="video__rahmen">
        {quelle.art === 'datei' && (
          <video
            src={quelle.src}
            controls
            playsInline
            preload="metadata"
            controlsList="nodownload"
            aria-label={titel}
            onEnded={() => onGesehenRef.current()}
          />
        )}
        {quelle.art === 'vimeo' && <VimeoVideo src={quelle.src} titel={titel} onEnde={() => onGesehenRef.current()} />}
        {quelle.art === 'sonst' && (
          <iframe src={quelle.src} title={titel} allow="fullscreen; picture-in-picture" loading="lazy" />
        )}
      </div>

      <div className="video__status">
        {gesehen ? (
          <span className="badge badge--gruen">
            <Icon name="haken" groesse={14} /> Video gesehen
          </span>
        ) : quelle.art === 'sonst' ? (
          <button type="button" className="btn btn--ghost" onClick={onGesehen}>
            Ich habe das Video gesehen
          </button>
        ) : (
          <span className="badge badge--gelb">Bitte schau das Video bis zum Ende</span>
        )}
        {!gesehen && quelle.art !== 'sonst' && auswegSichtbar && (
          <button type="button" className="textlink" onClick={onGesehen}>
            Das Video lässt sich nicht abspielen? Trotzdem weiter
          </button>
        )}
      </div>
    </div>
  )
}

function VimeoVideo({ src, titel, onEnde }: { src: string; titel: string; onEnde: () => void }) {
  const rahmen = useRef<HTMLIFrameElement>(null)
  const onEndeRef = useRef(onEnde)
  useEffect(() => {
    onEndeRef.current = onEnde
  })

  useEffect(() => {
    let beendet = false
    let spieler: { destroy: () => Promise<void> } | null = null
    // Das offizielle Vimeo-Paket erst laden, wenn wirklich ein Vimeo-Video gezeigt wird.
    void import('@vimeo/player').then(({ default: Player }) => {
      if (beendet || !rahmen.current) return
      const p = new Player(rahmen.current)
      p.on('ended', () => onEndeRef.current())
      spieler = p
    })
    return () => {
      beendet = true
      void spieler?.destroy().catch(() => undefined)
    }
  }, [src])

  return (
    <iframe
      ref={rahmen}
      src={src}
      title={titel}
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      loading="lazy"
    />
  )
}
