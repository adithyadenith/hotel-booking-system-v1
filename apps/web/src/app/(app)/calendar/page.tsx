"use client"
import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { api, iso, addDays, STATUS } from "@/lib/api"
const DAYS = 14
export default function Calendar() {
  const params = useSearchParams(), [start, setStart] = useState(() => { const date = params.get("date"); return new Date((date || iso(new Date())) + "T00:00:00Z") }), [rooms, setRooms] = useState<any[]>([]), [err, setErr] = useState("")
  const [sel, setSel] = useState<any>(null), [name, setName] = useState(""), [nights, setNights] = useState(1), [adults, setAdults] = useState(1), [busy, setBusy] = useState(false)
  const load = useCallback(async () => { try { setRooms(await api("/calendar?from=" + iso(start) + "&to=" + iso(addDays(start, DAYS)))) } catch (e: any) { setErr(e.message) } }, [start])
  useEffect(() => { load() }, [load])
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i))
  async function book() {
    setBusy(true); setErr("")
    try {
      await api("/reservations", { method: "POST", body: { guest: { name }, adults, items: [{ roomId: sel.room.id, checkIn: sel.date, checkOut: iso(addDays(new Date(sel.date), nights)), adults }] } })
      setSel(null); setName(""); setNights(1); load()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return <><h1>Booking calendar</h1>
    <div className="row"><button className="sec" onClick={() => setStart(addDays(start, -7))}>← Week</button><button className="sec" onClick={() => setStart(new Date(iso(new Date()) + "T00:00:00Z"))}>Today</button><button className="sec" onClick={() => setStart(addDays(start, 7))}>Week →</button></div>
    {err && <div className="err">{err}</div>}
    <div className="card tl"><table><thead><tr><th>Room</th>{days.map(d => <th key={+d}>{d.toUTCString().slice(5, 11)}</th>)}</tr></thead><tbody>
      {rooms.map(room => <tr key={room.id}><td><b>{room.number}</b><br /><span className="muted">{room.roomType.name}</span></td>
        {days.map(d => {
          const k = iso(d), it = room.items.find((i: any) => i.reservation.status !== "CANCELLED" && i.checkIn.slice(0, 10) <= k && i.checkOut.slice(0, 10) > k)
          const blk = room.blocks?.find((b: any) => b.startDate.slice(0, 10) <= k && b.endDate.slice(0, 10) > k)
          if (blk) return <td key={k} title={"Maintenance: " + blk.reason}><span className="badge s-out">⛔ Blocked</span></td>
          if (it) { const [label, cls] = STATUS[it.reservation.status]; return <td key={k} title={it.reservation.guest.name + " · " + label}><span className={"badge " + cls}>{label.split(" ")[0]} {it.reservation.guest.name.split(" ")[0]}</span></td> }
          return <td key={k} className={"free" + (sel?.room.id === room.id && sel?.date === k ? " sel" : "")} onClick={() => setSel({ room, date: k })}>+</td>
        })}</tr>)}</tbody></table></div>
    {sel && <div className="card" style={{ marginTop: 16 }}><b>New booking: Room {sel.room.number}, {sel.date}</b>
      <div className="row"><input placeholder="Guest name" value={name} onChange={e => setName(e.target.value)} />
        <label>Nights <input type="number" min={1} value={nights} onChange={e => setNights(+e.target.value)} style={{ width: 70 }} /></label>
        <label>Adults <input type="number" min={1} value={adults} onChange={e => setAdults(+e.target.value)} style={{ width: 70 }} /></label>
        <button disabled={busy || !name} onClick={book}>{busy ? "Booking…" : "Create booking"}</button><button className="sec" onClick={() => setSel(null)}>Cancel</button></div></div>}</>
}
