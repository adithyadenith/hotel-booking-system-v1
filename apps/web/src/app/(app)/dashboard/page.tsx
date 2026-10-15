"use client"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { addDays, api, iso, lkr, session } from "@/lib/api"

const statusMeta: Record<string, { label: string; color: string }> = {
  CONFIRMED: { label: "Confirmed", color: "#2563eb" },
  PENDING: { label: "Pending", color: "#f59e0b" },
  CHECKED_IN: { label: "Checked in", color: "#10b981" },
  CHECKED_OUT: { label: "Checked out", color: "#94a3b8" },
  CANCELLED: { label: "Cancelled", color: "#ef4444" },
  NO_SHOW: { label: "No-show", color: "#7c3aed" }
}

const displayDate = (value: string | Date) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })
const displayTime = (value: string | Date) => new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })

function TrendChart({ points }: { points: { label: string; value: number }[] }) {
  const max = Math.max(...points.map(x => x.value), 1)
  const coords = points.map((x, i) => `${i * 100 + 20},${178 - (x.value / max) * 140}`).join(" ")
  return <div className="trend-wrap">
    <svg className="trend-chart" viewBox="0 0 640 210" role="img" aria-label="Revenue over the last seven days">
      {[38, 83, 128, 173].map(y => <line key={y} x1="20" x2="620" y1={y} y2={y} className="chart-grid" />)}
      <polyline points={coords} className="trend-line" />
      {points.map((x, i) => { const y = 178 - (x.value / max) * 140; return <g key={x.label}><circle cx={i * 100 + 20} cy={y} r="4" className="trend-dot"><title>{x.label}: {lkr(x.value)}</title></circle><text x={i * 100 + 20} y="202" textAnchor="middle" className="chart-label">{x.label}</text></g> })}
    </svg>
  </div>
}

function SourceRevenue({ rows }: { rows: { source: string; value: number }[] }) {
  const max = Math.max(...rows.map(x => x.value), 1)
  return <div className="source-revenue-list">{rows.length ? rows.map(x => <div className="source-revenue-row" key={x.source}><div className="source-revenue-label"><span>{x.source}</span><strong>{lkr(x.value)}</strong></div><div className="source-revenue-track"><span style={{ width: `${Math.max(5, x.value / max * 100)}%` }} /></div></div>) : <div className="empty-state">Revenue sources will appear after bookings are made.</div>}</div>
}

function StatusChart({ rows, total }: { rows: { key: string; label: string; color: string; count: number; percent: number }[]; total: number }) {
  let start = 0
  const stops = rows.map(x => { const end = start + x.percent; const part = `${x.color} ${start}% ${end}%`; start = end; return part }).join(", ")
  return <div className="status-chart-layout"><div className="status-donut" style={{ background: rows.length ? `conic-gradient(${stops})` : "#e9eef5" }}><div className="status-donut-hole"><strong>{total}</strong><span>Total</span></div></div><div className="status-legend">{rows.length ? rows.map(x => <div className="status-legend-row" key={x.key}><span><i style={{ background: x.color }} />{x.label}</span><strong>{x.count} <small>{x.percent}%</small></strong></div>) : <p className="muted">No bookings yet.</p>}</div></div>
}

function Metric({ label, value, hint, tone, icon }: any) {
  return <div className="metric-card"><div className="metric-head"><span>{label}</span><span className={`metric-icon ${tone || "blue"}`}>{icon}</span></div><strong>{value}</strong><small>{hint}</small></div>
}

function QuickActions() {
  const actions = [["/calendar", "New booking", "Create a reservation", "+", "blue"], ["/reservations", "Review bookings", "Confirm or update stays", "B", "purple"], ["/operations?tab=housekeeping", "Housekeeping", "Update room readiness", "H", "green"], ["/operations?tab=maintenance", "Maintenance", "Track room repairs", "M", "orange"], ["/reservations", "Record payment", "Collect an outstanding balance", "$", "yellow"], ["/operations", "Hotel operations", "Run today's workflow", "O", "slate"]]
  return <section className="panel quick-actions-panel"><div className="panel-heading"><div><h2>Quick actions</h2><p>Common tasks for today</p></div></div><div className="quick-actions-grid">{actions.map(([href, title, description, icon, tone]) => <Link key={title} href={href} className="quick-action"><span className={`quick-action-icon ${tone}`}>{icon}</span><span><strong>{title}</strong><small>{description}</small></span><b>&gt;</b></Link>)}</div></section>
}

function AlertsPanel({ alerts }: { alerts: { title: string; detail: string; count: number; icon: string; tone: string; href: string }[] }) {
  return <section className="panel alerts-panel"><div className="panel-heading"><div><h2>Alerts and attention</h2><p>Items that may need staff action today</p></div><span className="alert-total">{alerts.reduce((sum, x) => sum + x.count, 0)} open</span></div><div className="alerts-grid">{alerts.map(x => <Link href={x.href} key={x.title} className="alert-card"><span className={`alert-icon ${x.tone}`}>{x.icon}</span><span className="alert-copy"><strong>{x.title}</strong><small>{x.detail}</small></span><b>{x.count}</b></Link>)}</div></section>
}

export default function Dashboard() {
  const [d, setD] = useState<any>(null), [err, setErr] = useState("")
  const today = iso(new Date())
  useEffect(() => { (async () => {
    try {
      const [rooms, reservations] = await Promise.all([
        api("/calendar?from=" + today + "&to=" + iso(addDays(new Date(), 1))),
        api("/reservations")
      ])
      const items = reservations.flatMap((r: any) => r.items.map((i: any) => ({ ...i, reservation: r })))
      const active = reservations.filter((r: any) => !["CANCELLED", "NO_SHOW"].includes(r.status))
      const arrivals = items.filter((i: any) => i.checkIn.slice(0, 10) === today && ["PENDING", "CONFIRMED"].includes(i.reservation.status))
      const departures = items.filter((i: any) => i.checkOut.slice(0, 10) === today && i.reservation.status === "CHECKED_IN")
      const booked = rooms.filter((r: any) => r.items.some((i: any) => !["CANCELLED", "NO_SHOW"].includes(i.reservation.status))).length
      const occupied = rooms.filter((r: any) => r.items.some((i: any) => i.reservation.status === "CHECKED_IN")).length
      const collected = active.reduce((sum: number, r: any) => sum + r.depositPaid, 0)
      const outstanding = active.reduce((sum: number, r: any) => sum + r.totalAmount - r.depositPaid, 0)
      const unpaid = active.filter((r: any) => r.totalAmount > r.depositPaid)
      const dirtyRooms = rooms.filter((r: any) => r.housekeeping === "DIRTY")
      const maintenanceBlocks = rooms.flatMap((r: any) => (r.blocks || []).map((b: any) => ({ ...b, roomNumber: r.number })))
      const trend = Array.from({ length: 7 }, (_, offset) => {
        const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - offset))
        const key = iso(date)
        return { label: date.toLocaleDateString(undefined, { weekday: "short" }), value: reservations.filter((r: any) => r.createdAt?.slice(0, 10) === key).reduce((sum: number, r: any) => sum + r.depositPaid, 0) }
      })
      const sourceTotals: Record<string, number> = {}
      active.forEach((r: any) => { const source = (r.source || "DIRECT").toUpperCase(); sourceTotals[source] = (sourceTotals[source] || 0) + r.depositPaid })
      const sourceRevenue = Object.entries(sourceTotals).map(([source, value]) => ({ source, value })).sort((a, b) => b.value - a.value)
      setD({ rooms, reservations, arrivals, departures, total: rooms.length, booked, occupied, collected, outstanding,
        pending: reservations.filter((r: any) => r.status === "PENDING").length,
        dirty: dirtyRooms.length, unpaid, maintenanceBlocks,
        recent: reservations.slice(0, 6), trend, sourceRevenue })
    } catch (e: any) { setErr(e.message) }
  })() }, [today])

  const breakdown = useMemo(() => {
    if (!d) return []
    const total = d.reservations.length || 1
    return Object.keys(statusMeta).map(key => ({ ...statusMeta[key], key, count: d.reservations.filter((r: any) => r.status === key).length, percent: Math.round(d.reservations.filter((r: any) => r.status === key).length / total * 100) })).filter(x => x.count > 0)
  }, [d])

  if (err) return <div className="err">{err}</div>
  if (!d) return <div className="muted">Loading dashboard…</div>
  const user = session()
  const occupancy = d.total ? Math.round(d.occupied / d.total * 100) : 0
  const availability = Math.max(d.total - d.booked, 0)
  return <div className="dashboard-page">
    <div className="dashboard-hero">
      <div><div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div><h1>Good afternoon{user?.name ? `, ${user.name.split(" ")[0]}` : ""} <span className="wave">👋</span></h1><p>Here’s what’s happening at your hotel today.</p></div>
      <div className="dashboard-actions"><Link className="outline-btn" href="/reservations">Review requests <span className="action-count">{d.pending}</span></Link><Link className="primary-btn" href="/calendar"><span>＋</span> New booking</Link></div>
    </div>

    <section className="metric-grid">
      <Metric label="Total rooms" value={d.total} hint="In your inventory" icon="▣" tone="navy" />
      <Metric label="Occupancy" value={`${occupancy}%`} hint={`${d.occupied} rooms occupied`} icon="%" tone="purple" />
      <Metric label="Arrivals today" value={d.arrivals.length} hint="Guests expected" icon="↓" tone="blue" />
      <Metric label="Departures today" value={d.departures.length} hint="Rooms to turn over" icon="↑" tone="slate" />
    </section>

    <section className="metric-grid lower-metrics">
      <Metric label="Pending bookings" value={d.pending} hint="Awaiting confirmation" icon="◷" tone="yellow" />
      <Metric label="Revenue collected" value={lkr(d.collected)} hint="Deposits received" icon="$" tone="green" />
      <Metric label="Available tonight" value={availability} hint="Ready to sell" icon="⌂" tone="blue" />
      <Metric label="Outstanding balance" value={lkr(d.outstanding)} hint="Across active bookings" icon="$" tone="orange" />
    </section>

    <QuickActions />

    <AlertsPanel alerts={[
      { title: "Unpaid bookings", detail: d.unpaid.length ? `${d.unpaid.length} active booking${d.unpaid.length === 1 ? "" : "s"} with a balance due` : "All active bookings are paid", count: d.unpaid.length, icon: "$", tone: d.unpaid.length ? "warning" : "success", href: "/reservations?filter=unpaid" },
      { title: "Dirty rooms", detail: d.dirty ? `${d.dirty} room${d.dirty === 1 ? "" : "s"} waiting for housekeeping` : "All rooms are ready", count: d.dirty, icon: "H", tone: d.dirty ? "danger" : "success", href: "/operations?tab=housekeeping" },
      { title: "Arrivals today", detail: d.arrivals.length ? `${d.arrivals.length} guest${d.arrivals.length === 1 ? "" : "s"} expected to check in` : "No arrivals scheduled today", count: d.arrivals.length, icon: "A", tone: d.arrivals.length ? "info" : "success", href: "/operations?tab=arrivals" },
      { title: "Maintenance blocks", detail: d.maintenanceBlocks.length ? `${d.maintenanceBlocks.length} room block${d.maintenanceBlocks.length === 1 ? "" : "s"} affects availability` : "No active maintenance blocks", count: d.maintenanceBlocks.length, icon: "M", tone: d.maintenanceBlocks.length ? "purple" : "success", href: "/operations?tab=maintenance" }
    ]} />

    <section className="dashboard-columns">
      <div className="panel chart-panel"><div className="panel-heading"><div><h2>Revenue performance</h2><p>Payments received over the last seven days</p></div><div className="panel-value">{lkr(d.collected)}</div></div><TrendChart points={d.trend} /><div className="chart-footer"><span><i className="legend-dot" /> Collected payments</span><span className="period-pill">Last 7 days</span><Link href="/reports">View full report →</Link></div></div>
      <div className="panel"><div className="panel-heading"><div><h2>Booking status</h2><p>{d.reservations.length} reservations in the system</p></div><Link href="/reservations" className="panel-link">View all</Link></div><StatusChart rows={breakdown} total={d.reservations.length} /></div>
    </section>

    <section className="panel revenue-sources-panel"><div className="panel-heading"><div><h2>Revenue by booking source</h2><p>Collected payments grouped by channel</p></div><Link href="/reports" className="panel-link">View reports →</Link></div><SourceRevenue rows={d.sourceRevenue} /></section>

    <section className="dashboard-columns operations-columns">
      <div className="panel"><div className="panel-heading"><div><h2>Today’s arrivals</h2><p>Guests expected to check in</p></div><Link href="/calendar" className="panel-link">Calendar →</Link></div>{d.arrivals.length ? <div className="arrival-list">{d.arrivals.slice(0, 5).map((x: any) => <div className="arrival-row" key={x.id}><div className="avatar">{x.reservation.guest.name.slice(0, 1).toUpperCase()}</div><div className="arrival-main"><strong>{x.reservation.guest.name}</strong><span>{x.room?.number ? `Room ${x.room.number}` : "Room assignment pending"} · {x.reservation.ref}</span></div><span className="time-pill">{displayTime(x.checkIn)}</span></div>)}</div> : <div className="empty-state">No arrivals scheduled for today.</div>}</div>
      <div className="panel readiness-panel"><div className="panel-heading"><div><h2>Room readiness</h2><p>Live operational overview</p></div><Link href="/housekeeping" className="panel-link">Open board →</Link></div><div className="readiness-grid"><div><span className="readiness-number green-text">{availability}</span><small>Available</small></div><div><span className="readiness-number blue-text">{d.occupied}</span><small>Occupied</small></div><div><span className="readiness-number red-text">{d.dirty}</span><small>Needs cleaning</small></div><div><span className="readiness-number yellow-text">{d.pending}</span><small>Pending</small></div></div><div className="readiness-bar"><span style={{ width: `${d.total ? d.occupied / d.total * 100 : 0}%` }} /><span style={{ width: `${d.total ? d.dirty / d.total * 100 : 0}%` }} /></div><div className="readiness-legend"><span><i className="legend-dot blue-bg" />Occupied</span><span><i className="legend-dot red-bg" />Cleaning</span><span><i className="legend-dot pale-bg" />Available</span></div></div>
    </section>

    <section className="panel recent-panel"><div className="panel-heading"><div><h2>Recent bookings</h2><p>Latest reservation activity</p></div><Link href="/reservations" className="panel-link">View all bookings →</Link></div><div className="table-scroll"><table className="modern-table"><thead><tr><th>Booking</th><th>Guest</th><th>Stay</th><th>Status</th><th className="align-right">Amount</th></tr></thead><tbody>{d.recent.map((r: any) => <tr key={r.id}><td><strong className="booking-ref">{r.ref}</strong><span className="table-muted">{r.source || "DIRECT"}</span></td><td><div className="guest-cell"><span className="mini-avatar">{r.guest.name.slice(0, 1).toUpperCase()}</span>{r.guest.name}</div></td><td>{r.items[0] ? `${displayDate(r.items[0].checkIn)} – ${displayDate(r.items[0].checkOut)}` : "—"}</td><td><span className={`status-badge status-${r.status.toLowerCase()}`}>{statusMeta[r.status]?.label || r.status}</span></td><td className="align-right"><strong>{lkr(r.totalAmount)}</strong><span className="table-muted">{r.depositPaid >= r.totalAmount ? "Paid" : `${lkr(r.totalAmount - r.depositPaid)} due`}</span></td></tr>)}</tbody></table></div>{!d.recent.length && <div className="empty-state">No reservations yet. Create the first booking from the calendar.</div>}</section>
  </div>
}
