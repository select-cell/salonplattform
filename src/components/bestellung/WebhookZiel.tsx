import { useState } from 'react'
import { testWebhookUrl, BESTELL_WEBHOOK_URL } from '../../lib/bestellKonfiguration'
import { leseZiel, speichereZiel, type Ziel } from '../../lib/testversion'

/** Nur Testversion: Anfragen an die Produktions-URL oder an die Test-URL von n8n („Listen for test event“) senden */
export function WebhookZiel() {
  const [ziel, setZiel] = useState<Ziel>(leseZiel)
  const waehle = (neu: Ziel) => {
    speichereZiel(neu)
    setZiel(neu)
  }
  const keineTestUrl = testWebhookUrl(BESTELL_WEBHOOK_URL) === BESTELL_WEBHOOK_URL
  return (
    <div className="webhookziel" role="group" aria-label="Webhook-Ziel">
      <span>Webhook-Ziel:</span>
      <button type="button" aria-pressed={ziel === 'produktion'} onClick={() => waehle('produktion')} title="…/webhook/… (Workflow muss veröffentlicht sein)">
        Produktion
      </button>
      <button
        type="button"
        aria-pressed={ziel === 'test'}
        disabled={keineTestUrl}
        onClick={() => waehle('test')}
        title="…/webhook-test/… (in n8n „Listen for test event“ klicken; gilt nur für eine Anfrage)"
      >
        Test (n8n-Editor)
      </button>
    </div>
  )
}
