"use client"
import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
export default function Audit() {
  const [rows, setRows] = useState<any[] | null>(null), [entity, setEntity] = useState(""), [action, setAction] = useState(""), [err, setErr] = useState("")
  const load = useCallback(() => api(`/audit-logs?entity=${encodeURIComponent(entity)}&action=${encodeURIComponent(action)}`).then(setRows).catch(e => setErr(e.message)), [entity, action])
  useEffect(() => { load() }, [load])
  return <><h1>Audit log</h1><p className="muted">Privileged actions for this hotel, newest first.</p><div className="row"><input placeholder="Entity filter" value={entity} onChange={e => setEntity(e.target.value)} /><input placeholder="Action filter" value={action} onChange={e => setAction(e.target.value)} /><button className="sec" onClick={load}>Refresh</button></div>{err && <div className="err">{err}</div>}<div className="card" style={{ overflowX: "auto" }}>{!rows ? <div className="muted">Loading…</div> : rows.length === 0 ? <div className="muted">No matching activity.</div> : <table><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Record</th><th>User</th></tr></thead><tbody>{rows.map(x => <tr key={x.id}><td>{new Date(x.createdAt).toLocaleString()}</td><td><b>{x.action}</b></td><td>{x.entity}</td><td>{x.entityId}</td><td>{x.userId || "System"}</td></tr>)}</tbody></table>}</div></>
}
