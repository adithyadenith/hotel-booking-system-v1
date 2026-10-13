"use client"
import { useEffect, useState } from "react"
import { api, addDays, download, iso, lkr } from "@/lib/api"
export default function Reports() {
  const [from, setFrom] = useState(iso(addDays(new Date(), -29))), [to, setTo] = useState(iso(addDays(new Date(), 1)))
  const [d, setD] = useState<any>(null), [err, setErr] = useState("")
  useEffect(() => { setErr(""); api("/reports/summary?from=" + from + "&to=" + to).then(setD).catch(e => { setErr(e.message); setD(null) }) }, [from, to])
  const S = ({ l, v }: any) => <div className="card stat"><span className="muted">{l}</span><b>{v}</b></div>
  const max = d ? Math.max(1, ...d.daily.map((x: any) => x.revenue)) : 1
  return <><h1>Reports</h1>
    <div className="row"><label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To (exclusive) <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      <button className="sec" onClick={() => download("/reports/daily.csv?from=" + from + "&to=" + to, "daily-" + from + "_" + to + ".csv").catch(e => setErr(e.message))}>Export CSV</button></div>
    {err && <div className="err">{err}</div>}{!d && !err && <div className="muted">Loading…</div>}
    {d && <><div className="grid"><S l="Occupancy" v={d.occupancyPct + "%"} /><S l="ADR" v={lkr(d.adr)} /><S l="RevPAR" v={lkr(d.revpar)} /><S l="Room revenue" v={lkr(d.roomRevenue)} />
      <S l="Payments collected" v={lkr(d.collected)} /><S l="Outstanding (all open bookings)" v={lkr(d.outstanding)} /><S l="New bookings" v={d.bookings} /><S l="Cancellation rate" v={d.cancellationRatePct + "%"} /></div>
      <div className="card"><h3>Daily room revenue</h3><div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120, overflowX: "auto" }}>
        {d.daily.map((x: any) => <div key={x.date} title={x.date + ": " + lkr(x.revenue) + " · " + x.occupancyPct + "% occ"} style={{ flex: "1 0 6px", background: "#2563EB", height: Math.max(2, x.revenue / max * 100) + "%", borderRadius: 2 }} />)}</div></div>
      <div className="card" style={{ marginTop: 16 }}><h3>By booking source</h3>{Object.keys(d.sources).length === 0 ? <p className="muted">No bookings created in this range.</p> :
        <table><tbody>{Object.entries(d.sources).map(([k, v]: any) => <tr key={k}><td>{k}</td><td>{v.bookings} bookings</td><td>{lkr(v.value)}</td></tr>)}</tbody></table>}</div></>}</>
}
