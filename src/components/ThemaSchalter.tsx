import { useThema } from '../lib/thema'
import { Icon } from './Icon'

/** Umschalter Hell/Nacht. Symbol: halb gefüllter Kreis. */
export function ThemaSchalter() {
  const { thema, umschalten } = useThema()
  const dunkel = thema === 'dark'
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={umschalten}
      aria-pressed={dunkel}
      aria-label={dunkel ? 'Nachtmodus ausschalten' : 'Nachtmodus einschalten'}
      title={dunkel ? 'Zum hellen Design wechseln' : 'Zum Nachtmodus wechseln'}
    >
      <Icon name="thema" />
    </button>
  )
}
