"use client"
import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { API, addDays, iso, lkr } from "@/lib/api"

export default function Book() {
  const { key } = useParams<{ key: string }>(); const embed = useSearchParams().get("embed")
  const [cfg, setCfg] = useState<any>(null), [from, setFrom] = useState(iso(addDays(new Date(), 1))), [to, setTo] = useState(iso(addDays(new Date(), 2)))
  const [adults, setAdults] = useState(2), [children, setChildren] = useState(0), [types, setTypes] = useState<any[] | null>(null), [pick, setPick] = useState<any>(null)
  const [g, setG] = useState({ name: "", email: "", phone: "", promo: "" }), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState<any>(null)

  async function call(path: string, body?: any) {
    const r = await fetch(API + "/public/" + key + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(Array.isArray(j.message) ? j.message.join(", ") : j.message || "Request failed")
    return j
  }
  useEffect(() => { call("/config").then(setCfg).catch(e => setErr(e.message)) }, [])
  useEffect(() => {
    if (!embed) return
    const post = () => parent.postMessage({ m89Height: document.body.scrollHeight + 20 }, "*")
    const ro = new ResizeObserver(post); ro.observe(document.body); return () => ro.disconnect()
  }, [embed])

  async function search(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setPick(null); setBusy(true)
    try { setTypes(await call("/availability?from=" + from + "&to=" + to + "&adults=" + adults + "&children=" + children)) } catch (x: any) { setErr(x.message); setTypes(null) } finally { setBusy(false) }
  }
  async function book(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true)
    try {
      setDone(await call("/booking", { roomTypeId: pick.roomTypeId, checkIn: from, checkOut: to, adults, children, promoCode: g.promo || undefined,
        guest: { name: g.name, email: g.email, phone: g.phone || undefined } }))
    } catch (x: any) { setErr(x.message) } finally { setBusy(false) }
  }
  if (!cfg && !err) return <div className="muted" style={{ padding: 20 }}>Loading…</div>
  return <div style={{ ["--blue" as any]: cfg?.brandColor || "#2563EB", maxWidth: 760, margin: "0 auto", padding: 16 }}>
    <h2>{cfg?.name}</h2>
    {done ? <div className="card"><h3>Reservation held: {done.ref}</h3>
      <p>Total {lkr(done.total)}. Complete payment within {done.holdMinutes} minutes or the room is released. A confirmation is recorded once payment is verified.</p>
      <a className="btn" href={done.checkoutUrl} target="_blank" rel="noreferrer">Pay securely{done.provider === "SANDBOX" ? " (development sandbox)" : ""}</a></div> : <>
      <form className="card" onSubmit={search}><div className="row">
        <label>Check-in<br /><input type="date" value={from} min={iso(new Date())} onChange={e => setFrom(e.target.value)} required /></label>
        <label>Check-out<br /><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} required /></label>
        <label>Adults<br /><input type="number" min={1} value={adults} onChange={e => setAdults(+e.target.value)} style={{ width: 70 }} /></label>
        <label>Children<br /><input type="number" min={0} value={children} onChange={e => setChildren(+e.target.value)} style={{ width: 70 }} /></label>
        <button disabled={busy} style={{ alignSelf: "end" }}>{busy ? "Searching…" : "Check availability"}</button></div></form>
      {err && <div className="err">{err}</div>}
      {types && (types.length === 0 ? <p className="muted">No rooms available for those dates and guests. Try different dates.</p> :
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>{types.map(t => <div className="card row" key={t.roomTypeId} style={{ justifyContent: "space-between", outline: pick?.roomTypeId === t.roomTypeId ? "2px solid var(--blue)" : "none" }}>
          <div><b>{t.name}</b><div className="muted">Sleeps {t.maxOccupancy} · {t.available} left · {t.nights} night(s) from {lkr(Math.min(...t.nightly))}/night</div></div>
          <div style={{ textAlign: "right" }}><b>{lkr(t.total)}</b><div className="muted">total incl. taxes</div><button onClick={() => setPick(t)}>Select</button></div></div>)}</div>)}
      {pick && <form className="card" onSubmit={book} style={{ marginTop: 16 }}><h3>Your details: {pick.name}</h3>
        <div className="row"><input placeholder="Full name" value={g.name} onChange={e => setG({ ...g, name: e.target.value })} required />
          <input type="email" placeholder="Email" value={g.email} onChange={e => setG({ ...g, email: e.target.value })} required />
          <input placeholder="Phone (optional)" value={g.phone} onChange={e => setG({ ...g, phone: e.target.value })} />
          <input placeholder="Promo code" value={g.promo} onChange={e => setG({ ...g, promo: e.target.value })} /></div>
        <button disabled={busy}>{busy ? "Booking…" : "Book and pay"}</button></form>}</>}
  </div>
}
