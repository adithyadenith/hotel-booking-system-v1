"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { api, download } from "@/lib/api"
import { PageError, PageLoading } from "@/components/page-state"

const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())

export default function Audit() {
  const [rows, setRows] = useState<any[] | null>(null)
  const [entity, setEntity] = useState("")
  const [action, setAction] = useState("")
  const [err, setErr] = useState("")
  const load = useCallback(async () => {
    try { setErr(""); setRows(await api(`/audit-logs?entity=${encodeURIComponent(entity)}&action=${encodeURIComponent(action)}`)) }
    catch (e: any) { setErr(e.message) }
  }, [entity, action])
  useEffect(() => { load() }, [load])
  const today = useMemo(() => (rows || []).filter(x => new Date(x.createdAt).toDateString() === new Date().toDateString()).length, [rows])
  if (err && !rows) return <PageError title="Activity history could not be loaded" message={err} onRetry={load} />
  if (!rows) return <PageLoading label="Loading activity history…" />
  const query = `entity=${encodeURIComponent(entity)}&action=${encodeURIComponent(action)}`
  return <main className="audit-page"><header className="audit-hero"><div><span>ACCOUNTABILITY</span><h1>Activity history</h1><p>A clear record of important changes made by your hotel team.</p></div><button className="audit-export" onClick={() => download(`/audit-logs/export.csv?${query}`, "hotel-activity.csv").catch((e: any) => setErr(e.message))}>Export CSV</button></header>
    {err && <div className="audit-message" role="alert">{err}</div>}
    <section className="audit-summary"><div><strong>{rows.length}</strong><span>Recorded actions</span></div><div><strong>{today}</strong><span>Actions today</span></div><div><strong>{new Set(rows.map(x => x.entity)).size}</strong><span>Areas updated</span></div></section>
    <section className="audit-card"><div className="audit-filters"><label>Item type<input value={entity} onChange={e => setEntity(e.target.value)} placeholder="e.g. Reservation" /></label><label>Action<input value={action} onChange={e => setAction(e.target.value)} placeholder="e.g. CHECK_IN" /></label><button className="sec" onClick={load}>Refresh list</button></div><div className="audit-table-wrap"><table><thead><tr><th>When</th><th>What happened</th><th>Area</th><th>Record</th><th>Staff</th></tr></thead><tbody>{rows.length ? rows.map(item => <tr key={item.id}><td><time>{new Date(item.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</time></td><td><span className="audit-action">{label(item.action)}</span></td><td>{label(item.entity)}</td><td><code>{item.entityId}</code></td><td>{item.userId || "System"}</td></tr>) : <tr><td colSpan={5}><div className="audit-empty">No activity matches the selected filters.</div></td></tr>}</tbody></table></div></section>
  </main>
}
