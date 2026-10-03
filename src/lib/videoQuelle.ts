// Erkennt, wie ein Video-Link abgespielt wird (Plan §5.1: Vimeo-Player-URL oder .mp4).

export type Quelle =
  | { art: 'vimeo'; src: string }
  | { art: 'datei'; src: string }
  | { art: 'sonst'; src: string }

export function klassifiziere(url: string): Quelle {
  const sauber = url.trim()
  const vimeo = /^https?:\/\/(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)(?:[/?]h=|\/)?([a-z0-9]+)?/i.exec(sauber)
  if (vimeo) {
    const hash = /[?&]h=([a-z0-9]+)/i.exec(sauber)?.[1] ?? vimeo[2]
    const parameter = new URLSearchParams({ dnt: '1' })
    if (hash) parameter.set('h', hash)
    return { art: 'vimeo', src: `https://player.vimeo.com/video/${vimeo[1]}?${parameter.toString()}` }
  }
  if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(sauber)) return { art: 'datei', src: sauber }
  return { art: 'sonst', src: sauber }
}
