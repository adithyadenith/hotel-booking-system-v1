"use client"
import { useEffect, useState, useCallback } from "react"
import { api, session } from "@/lib/api"
import { PageError, PageLoading } from "@/components/page-state"

const notificationMeta: Record<string, { icon: string; label: string; tone: string }> = {
  BOOKING_NEW: { icon: "＋", label: "New booking", tone: "blue" },
  BOOKING_CANCELLED: { icon: "×", label: "Booking cancelled", tone: "red" },
  BOOKING_CHECKED_IN: { icon: "↓", label: "Guest checked in", tone: "green" },
  BOOKING_CHECKED_OUT: { icon: "↑", label: "Guest checked out", tone: "purple" },
  PAYMENT_OK: { icon: "₨", label: "Payment update", tone: "green" },
  PAYMENT_DUE: { icon: "!", label: "Payment needed", tone: "orange" },
  ROOM_MAINTENANCE: { icon: "⚒", label: "Maintenance", tone: "orange" },
  HOUSEKEEPING: { icon: "✦", label: "Room status", tone: "purple" },
  HOUSEKEEPING_TASK: { icon: "✓", label: "Housekeeping task", tone: "blue" },
}

const metaFor = (type: string) => notificationMeta[type] || { icon: "•", label: "Hotel update", tone: "slate" }
const dateTime = (value: string) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

export default function Notifications() {
  const [rows, setRows] = useState<any[] | null>(null), [delivery, setDelivery] = useState<any>(null), [err, setErr] = useState("")
  const load = useCallback(async () => {
    try {
      const current = session()
      const canManageDelivery = ["ADMIN", "MANAGER"].includes(current?.role)
      const [n, d] = await Promise.all([api("/notifications"), canManageDelivery ? api("/deliveries") : Promise.resolve(null)])
      setRows(n); setDelivery(d); setErr("")
    } catch (e: any) { setErr(e.message) }
  }, [])
  useEffect(() => { load() }, [load])
  if (!rows && err) return <PageError title="Messages could not be loaded" message={err} onRetry={load} />
  if (!rows) return <PageLoading label="Loading messages and alerts…" />

  const unread = rows.filter(n => !n.readAt).length
  const urgent = rows.filter(n => ["PAYMENT_DUE", "ROOM_MAINTENANCE", "BOOKING_CANCELLED"].includes(n.type) && !n.readAt).length

  return <div className="notifications-page">
    <header className="notifications-hero"><div><span className="notifications-eyebrow">HOTEL OPERATIONS</span><h1>Messages & alerts</h1><p>Important updates and tasks for your hotel team.</p></div><button className="notifications-refresh" onClick={load}>↻ Refresh</button></header>
    {err && <div className="notifications-error" role="alert"><span>{err}</span><button onClick={() => setErr("")}>×</button></div>}
    <div className="notifications-summary"><div><span className="summary-icon blue">✉</span><span><small>Total messages</small><strong>{rows.length}</strong></span></div><div><span className="summary-icon red">●</span><span><small>Unread</small><strong>{unread}</strong></span></div><div><span className="summary-icon orange">!</span><span><small>Needs attention</small><strong>{urgent}</strong></span></div><button className="notifications-read-all" disabled={!unread} onClick={async () => { await api("/notifications/read-all", { method: "POST" }); load() }}>Mark all as read</button></div>

    {delivery && <section className="notification-delivery"><div className="notification-section-heading"><div><span className="notifications-eyebrow">ADMINISTRATION</span><h2>Message delivery</h2><p>Monitor email, SMS, and WhatsApp messages sent to guests.</p></div></div><div className="delivery-providers">{Object.entries(delivery.providers || {}).map(([k, v]) => <div key={k}><span className={`provider-dot ${v ? "online" : "offline"}`} /><strong>{k.toUpperCase()}</strong><small>{v ? "Connected" : "Not configured"}</small></div>)}</div>{(delivery.jobs || []).length > 0 && <div className="delivery-list">{delivery.jobs.slice(0, 5).map((j: any) => <div className="delivery-row" key={j.id}><span>{j.channel}</span><strong>{j.messageType.replace(/_/g, " ")}</strong><small>{j.status} · {dateTime(j.createdAt)}</small>{["FAILED", "NOT_CONFIGURED"].includes(j.status) && <button onClick={async () => { await api(`/deliveries/${j.id}/retry`, { method: "POST" }); load() }}>Retry</button>}</div>)}</div>}</section>}

    <section className="notification-inbox"><div className="notification-section-heading"><div><span className="notifications-eyebrow">YOUR INBOX</span><h2>Recent notifications</h2><p>Updates are filtered according to your staff role.</p></div><span className="notification-count">{unread} unread</span></div>{rows.length === 0 ? <div className="notifications-empty"><span>✓</span><strong>You’re all caught up</strong><small>New hotel updates will appear here.</small></div> : <div className="notification-list">{rows.map(n => { const meta = metaFor(n.type); return <article className={`notification-item ${n.readAt ? "read" : "unread"}`} key={n.id}><span className={`notification-type-icon ${meta.tone}`}>{meta.icon}</span><div className="notification-content"><div className="notification-title-line"><strong>{n.title}</strong>{!n.readAt && <span className="new-badge">NEW</span>}</div><p>{n.body || meta.label}</p><small>{meta.label} · {dateTime(n.createdAt)}</small></div>{!n.readAt && <button className="notification-mark-read" onClick={async () => { await api(`/notifications/${n.id}/read`, { method: "POST" }); load() }}>Mark read</button>}</article> })}</div>}</section>
  </div>
}
