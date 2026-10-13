"use client"
import { useCallback, useEffect, useState } from "react"
import { api, session } from "@/lib/api"

export default function Platform() {
  const [rows, setRows] = useState<any[] | null>(null), [err, setErr] = useState(""), [made, setMade] = useState<any>(null)
  const load = useCallback(() => api("/platform/hotels").then(setRows).catch(e => setErr(e.message)), [])
  useEffect(() => { if (!session()?.platform) { location.href = "/login"; return } load() }, [load])
  async function act(fn: () => Promise<any>) { try { await fn(); setErr(""); load() } catch (e: any) { setErr(e.message) } }
  async function onboard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f: Record<string, string> = {}; new FormData(e.currentTarget).forEach((v, k) => { f[k] = String(v) }); const form = e.currentTarget
    await act(async () => {
      setMade(await api("/platform/hotels", { method: "POST", body: { name: f.name, slug: f.slug, timezone: f.tz, taxBp: Math.round(+f.tax * 100), adminName: f.adminName, adminEmail: f.adminEmail, adminPassword: f.pw || undefined } }))
      form.reset()
    })
  }
  async function support(h: any) {
    if (!confirm("Open " + h.name + " as support administrator for 1 hour? This is audited.")) return
    try { const t = await api("/platform/hotels/" + h.id + "/support-token", { method: "POST" })
      localStorage.setItem("m89", JSON.stringify({ token: t.token, hotelId: t.hotelId, hotelName: t.hotelName + " (SUPPORT)", role: "ADMIN", name: "Method89 Support" })); location.href = "/dashboard"
    } catch (e: any) { setErr(e.message) }
  }
  return <div style={{ maxWidth: 1000, margin: "0 auto", padding: 20 }}>
    <div className="row" style={{ justifyContent: "space-between" }}><h1>Method89 platform</h1><button className="sec" onClick={() => { localStorage.removeItem("m89"); location.href = "/login" }}>Sign out</button></div>
    {err && <div className="err">{err}</div>}
    <div className="card" style={{ overflowX: "auto" }}><h3>Hotels</h3>{!rows ? <div className="muted">Loading…</div> : rows.length === 0 ? <p className="muted">No hotels yet. Onboard the first one below.</p> :
      <table><thead><tr><th>Hotel</th><th>Slug</th><th>Rooms</th><th>Staff</th><th>Bookings</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(h => <tr key={h.id}>
        <td><b>{h.name}</b></td><td>{h.slug}</td><td>{h._count.rooms}</td><td>{h._count.memberships}</td><td>{h._count.reservations}</td><td>{h.suspendedAt ? "Suspended" : "Active"}</td>
        <td><button className="sec" onClick={() => act(() => api("/platform/hotels/" + h.id, { method: "PATCH", body: { suspended: !h.suspendedAt } }))}>{h.suspendedAt ? "Activate" : "Suspend"}</button>{" "}
          <button className="sec" onClick={() => support(h)}>Support access</button></td></tr>)}</tbody></table>}</div>
    <form className="card" style={{ marginTop: 16 }} onSubmit={onboard}><h3>Onboard a hotel</h3>
      <div className="row"><input name="name" placeholder="Hotel name" required /><input name="slug" placeholder="slug-like-this" required pattern="[a-z0-9-]{3,40}" /><input name="tz" defaultValue="Asia/Colombo" /><input name="tax" type="number" min="0" max="50" step="0.01" defaultValue="0" title="Tax %" style={{ width: 90 }} /></div>
      <div className="row"><input name="adminName" placeholder="Administrator name" required /><input name="adminEmail" type="email" placeholder="Administrator email" required /><input name="pw" type="password" minLength={12} placeholder="Password (new users, 12+)" /><button>Create hotel</button></div></form>
    {made && <div className="card" style={{ marginTop: 16 }}>Created <b>{made.slug}</b>. Administrator: {made.adminEmail}. Public widget key: <code>{made.widgetKey}</code></div>}</div>
}
