"use client"
import { useEffect, useState } from "react"
import { api, iso, addDays, lkr } from "@/lib/api"
export default function Dashboard() {
  const [d, setD] = useState<any>(null), [err, setErr] = useState("")
  useEffect(() => { (async () => {
    try {
      const today = iso(new Date()), [rooms, res] = await Promise.all([api("/calendar?from=" + today + "&to=" + iso(addDays(new Date(), 1))), api("/reservations")])
      const items = res.flatMap((r: any) => r.items.map((i: any) => ({ ...i, r }))).filter((i: any) => i.r.status !== "CANCELLED")
      const arrivals = items.filter((i: any) => i.checkIn.slice(0, 10) === today && ["PENDING", "CONFIRMED"].includes(i.r.status))
      const departures = items.filter((i: any) => i.checkOut.slice(0, 10) === today && i.r.status === "CHECKED_IN")
      const booked = rooms.filter((r: any) => r.items.some((i: any) => i.reservation.status !== "CANCELLED")).length
      const live = res.filter((r: any) => r.status !== "CANCELLED")
      setD({ arrivals, departures, total: rooms.length, booked, occupied: rooms.filter((r: any) => r.items.some((i: any) => i.reservation.status === "CHECKED_IN")).length,
        pending: res.filter((r: any) => r.status === "PENDING").length, dirty: rooms.filter((r: any) => r.housekeeping === "DIRTY").length,
        outstanding: live.reduce((s: number, r: any) => s + r.totalAmount - r.depositPaid, 0), recent: res.slice(0, 5) })
    } catch (e: any) { setErr(e.message) } })() }, [])
  if (err) return <div className="err">{err}</div>
  if (!d) return <div className="muted">Loading…</div>
  const S = ({ l, v }: any) => <div className="card stat"><span className="muted">{l}</span><b>{v}</b></div>
  return <><h1>Dashboard</h1><div className="grid">
    <S l="Arrivals today" v={d.arrivals.length} /><S l="Departures today" v={d.departures.length} /><S l="Occupied (checked-in)" v={d.occupied} />
    <S l="Available tonight" v={d.total - d.booked} /><S l="Occupancy tonight" v={d.total ? Math.round(d.booked / d.total * 100) + "%" : "0%"} />
    <S l="Pending confirmations" v={d.pending} /><S l="Outstanding balance" v={lkr(d.outstanding)} /><S l="Rooms needing cleaning" v={d.dirty} /></div>
    <div className="card"><h3>Recent reservations</h3>{d.recent.length === 0 ? <p className="muted">No reservations yet. Create one from the Calendar.</p> :
      <table><tbody>{d.recent.map((r: any) => <tr key={r.id}><td>{r.ref}</td><td>{r.guest.name}</td><td>{r.status}</td><td>{lkr(r.totalAmount)}</td></tr>)}</tbody></table>}</div></>
}
