import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'
import { db } from '../reservations/reservations.service'

/** In-process event bus feeding SSE. For multiple API instances, swap for Redis pub/sub. */
export const bus = new Subject<{ hotelId: string; data: any }>()

const RECEPTIONIST_NOTIFICATIONS = new Set([
  'BOOKING_NEW', 'BOOKING_CANCELLED', 'BOOKING_CHECKED_IN', 'BOOKING_CHECKED_OUT',
  'BOOKING_MODIFIED', 'PAYMENT_OK', 'PAYMENT_DUE', 'ROOM_MAINTENANCE',
])
const HOUSEKEEPING_NOTIFICATIONS = new Set([
  'HOUSEKEEPING', 'HOUSEKEEPING_TASK', 'ROOM_MAINTENANCE',
])

export function notificationVisibleToRole(notification: { type: string; audience?: string[] }, role: string) {
  if (role === 'ADMIN' || role === 'MANAGER') return true
  if (notification.audience?.length && !notification.audience.includes(role)) return false
  if (role === 'RECEPTIONIST') return RECEPTIONIST_NOTIFICATIONS.has(notification.type)
  if (role === 'HOUSEKEEPING') return HOUSEKEEPING_NOTIFICATIONS.has(notification.type)
  return false
}

/** Persists a notification and pushes it to connected dashboards. Call AFTER the business transaction commits. */
export async function notify(client: any, hotelId: string, type: string, title: string, body = '', audience?: string[]) {
  const n = await client.notification.create({ data: { hotelId, type, title, body, ...(audience ? { audience } : {}) } })
  bus.next({ hotelId, data: n })
  return n
}

@Injectable()
export class NotificationsService {
  async list(hotelId: string, role: string) {
    const rows = await db.notification.findMany({ where: { hotelId }, orderBy: { createdAt: 'desc' }, take: 100 })
    return rows.filter(notification => notificationVisibleToRole(notification, role)).slice(0, 50)
  }
  read(hotelId: string, id: string, role: string) {
    return db.notification.findFirst({ where: { id, hotelId } }).then(n => n && notificationVisibleToRole(n, role)
      ? db.notification.updateMany({ where: { id, hotelId, readAt: null }, data: { readAt: new Date() } })
      : { count: 0 })
  }
  async readAll(hotelId: string, role: string) {
    if (role === 'ADMIN' || role === 'MANAGER') return db.notification.updateMany({ where: { hotelId, readAt: null }, data: { readAt: new Date() } })
    const rows = await db.notification.findMany({ where: { hotelId, readAt: null }, select: { id: true, type: true, audience: true } })
    const ids = rows.filter(n => notificationVisibleToRole(n, role)).map(n => n.id)
    return ids.length ? db.notification.updateMany({ where: { id: { in: ids }, hotelId, readAt: null }, data: { readAt: new Date() } }) : { count: 0 }
  }
}
