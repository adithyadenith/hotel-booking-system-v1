"use client"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
export default function Guests() {
  const params = useSearchParams(), [q, setQ] = useState(params.get("q") || ""), [rows, setRows] = useState<any[] | null>(null), [err, setErr] = useState("")
  useEffect(() => setQ(params.get("q") || ""), [params])
  useEffect(() => { const t = setTimeout(() => api("/guests?q=" + encodeURIComponent(q)).then(setRows).catch(e => setErr(e.message)), 250); return () => clearTimeout(t) }, [q])
  return <><h1>Guests</h1><div className="row"><input placeholder="Search name, email or phone" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 280 }} /></div>
    {err && <div className="err">{err}</div>}<div className="card" style={{ overflowX: "auto" }}>{!rows ? <div className="muted">Loading…</div> : rows.length === 0 ? <p className="muted">No guests found.</p> :
      <table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Stays</th></tr></thead><tbody>{rows.map(g => <tr key={g.id}><td>{g.name}</td><td>{g.email || "-"}</td><td>{g.phone || "-"}</td><td>{g._count.reservations}</td></tr>)}</tbody></table>}</div></>
}
