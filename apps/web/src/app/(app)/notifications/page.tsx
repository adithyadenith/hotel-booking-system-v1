"use client"
import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
export default function Notifications() {
  const [rows, setRows] = useState<any[] | null>(null), [delivery, setDelivery] = useState<any>(null), [err, setErr] = useState("")
  const load = useCallback(async () => { try { const [n, d] = await Promise.all([api("/notifications"), api("/deliveries")]); setRows(n); setDelivery(d) } catch (e: any) { setErr(e.message) } }, [])
  useEffect(() => { load() }, [load])
  if (!rows) return <div className="muted">{err || "Loading…"}</div>
  return <><h1>Notifications & delivery</h1><div className="row"><button className="sec" onClick={async () => { await api("/notifications/read-all", { method: "POST" }); load() }}>Mark all as read</button></div>{err && <div className="err">{err}</div>}
    <div className="grid">{Object.entries(delivery?.providers || {}).map(([k, v]) => <div className="card stat" key={k}><span className="muted">{k.toUpperCase()}</span><b style={{ color: v ? "var(--ok)" : "var(--warn)" }}>{v ? "Configured" : "Not configured"}</b></div>)}</div>
    <div className="card"><h3>Delivery queue</h3>{(delivery?.jobs || []).length === 0 ? <p className="muted">No guest messages have been queued.</p> : <table><thead><tr><th>Created</th><th>Channel</th><th>Type</th><th>Recipient</th><th>Status</th><th></th></tr></thead><tbody>{delivery.jobs.map((j: any) => <tr key={j.id}><td>{new Date(j.createdAt).toLocaleString()}</td><td>{j.channel}</td><td>{j.messageType}</td><td>{j.recipient}</td><td>{j.status}{j.error && <div className="err">{j.error}</div>}</td><td>{["FAILED", "NOT_CONFIGURED"].includes(j.status) && <button className="sec" onClick={async () => { await api(`/deliveries/${j.id}/retry`, { method: "POST" }); load() }}>Retry</button>}</td></tr>)}</tbody></table>}</div>
    <div className="card" style={{ marginTop: 16 }}><h3>In-app notifications</h3>{rows.length === 0 ? <p className="muted">Nothing yet.</p> : rows.map(n => <div key={n.id} className="row" style={{ borderBottom: "1px solid #e2e8f0", opacity: n.readAt ? .55 : 1 }}><div style={{ flex: 1 }}><b>{n.title}</b><div className="muted">{n.body} · {new Date(n.createdAt).toLocaleString()}</div></div>{!n.readAt && <button className="sec" onClick={async () => { await api(`/notifications/${n.id}/read`, { method: "POST" }); load() }}>Mark read</button>}</div>)}</div></>
}
