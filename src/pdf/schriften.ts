// Schriften fürs PDF: DM Sans und DM Serif Display, eingebettet (kein Fremdserver).
// react-pdf liest WOFF, kein WOFF2; die Dateien kommen aus den @fontsource-Paketen und werden von Vite ausgeliefert.
import { Font } from '@react-pdf/renderer'
import sans400 from '@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff?url'
import sans500 from '@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff?url'
import sans700 from '@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff?url'
import serif400 from '@fontsource/dm-serif-display/files/dm-serif-display-latin-400-normal.woff?url'

let registriert = false

export function registriereSchriften(): void {
  if (registriert) return
  registriert = true
  Font.register({
    family: 'DM Sans',
    fonts: [
      { src: sans400, fontWeight: 400 },
      { src: sans500, fontWeight: 500 },
      { src: sans700, fontWeight: 700 },
    ],
  })
  Font.register({ family: 'DM Serif Display', src: serif400 })
  // Keine Silbentrennung: Wörter brechen nur an Leerzeichen um
  Font.registerHyphenationCallback((wort) => [wort])
}
