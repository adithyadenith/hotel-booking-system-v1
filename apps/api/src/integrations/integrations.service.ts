import { createHash } from 'node:crypto'
import { db } from '../reservations/reservations.service'

export const hashIntegrationKey = (key: string) => createHash('sha256').update(key).digest('hex')

/** Sends enabled booking events without delaying the booking request. Every attempt is recorded on the endpoint. */
export async function dispatchWebhookEvent(hotelId: string, event: string, payload: unknown) {
  const endpoints = await db.webhookEndpoint.findMany({ where: { hotelId, active: true, events: { array_contains: event } as any } })
  await Promise.allSettled(endpoints.map(async endpoint => {
    try {
      const body = JSON.stringify({ id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, event, createdAt: new Date().toISOString(), data: payload })
      const signature = createHash('sha256').update(endpoint.secret + body).digest('hex')
      const response = await fetch(endpoint.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Method89-Event': event, 'X-Method89-Signature': signature }, body, signal: AbortSignal.timeout(10000) })
      await db.webhookEndpoint.update({ where: { id: endpoint.id }, data: { lastStatus: response.ok ? 'DELIVERED' : `HTTP_${response.status}`, lastError: response.ok ? '' : await response.text().catch(() => ''), lastDeliveryAt: new Date() } })
    } catch (error) {
      await db.webhookEndpoint.update({ where: { id: endpoint.id }, data: { lastStatus: 'FAILED', lastError: String((error as Error)?.message || error).slice(0, 500), lastDeliveryAt: new Date() } }).catch(() => {})
    }
  }))
}
