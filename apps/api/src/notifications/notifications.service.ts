import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'
import { db } from '../reservations/reservations.service'

/** In-process event bus feeding SSE. For multiple API instances, swap for Redis pub/sub. */
export const bus = new Subject<{ hotelId: string; data: any }>()

/** Persists a notification and pushes it to connected dashboards. Call AFTER the business transaction commits. */
export async function notify(client: any, hotelId: string, type: string, title: string, body = '') {
  const n = await client.notification.create({ data: { hotelId, type, title, body } })
  bus.next({ hotelId, data: n })
  return n
}

@Injectable()
export class NotificationsService {
  list(hotelId: string) { return db.notification.findMany({ where: { hotelId }, orderBy: { createdAt: 'desc' }, take: 50 }) }
  read(hotelId: string, id: string) { return db.notification.updateMany({ where: { id, hotelId, readAt: null }, data: { readAt: new Date() } }) }
  readAll(hotelId: string) { return db.notification.updateMany({ where: { hotelId, readAt: null }, data: { readAt: new Date() } }) }
}
