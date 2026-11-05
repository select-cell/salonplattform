// Einstieg fürs PDF: wird erst beim Klick geladen (dynamischer Import in lib/pdf.ts), damit die Seiten klein bleiben.
import { createElement, type ReactElement } from 'react'
import { pdf, type DocumentProps } from '@react-pdf/renderer'
import { ladeLogoPng } from './logo'
import { Monatsbericht, type MonatsberichtDaten } from './Monatsbericht'
import { Personenbericht, type PersonenberichtDaten } from './Personenbericht'
import { registriereSchriften } from './schriften'

export async function erzeugeMonatsbericht(daten: MonatsberichtDaten): Promise<Blob> {
  registriereSchriften()
  const logo = await ladeLogoPng()
  return pdf(createElement(Monatsbericht, { daten, logo }) as ReactElement<DocumentProps>).toBlob()
}

export async function erzeugePersonenbericht(daten: PersonenberichtDaten): Promise<Blob> {
  registriereSchriften()
  const logo = await ladeLogoPng()
  return pdf(createElement(Personenbericht, { daten, logo }) as ReactElement<DocumentProps>).toBlob()
}
