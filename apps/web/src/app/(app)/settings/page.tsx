"use client"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"

const TIMEZONES = ["Asia/Colombo", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "Australia/Sydney"]

export default function Settings() {
  const [data, setData] = useState<any>(null), [err, setErr] = useState(""), [saved, setSaved] = useState(false)
  useEffect(() => { api("/hotel-settings").then(setData).catch(e => setErr(e.message)) }, [])
  if (err) return <><h1>Settings</h1><div className="err">{err}</div></>
  if (!data) return <><h1>Settings</h1><div className="muted">Loading…</div></>
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaved(false); setErr("")
    const f = new FormData(e.currentTarget)
    try {
      const next = await api("/hotel-settings", { method: "PATCH", body: { name: String(f.get("name")), timezone: String(f.get("timezone")), currency: String(f.get("currency")).toUpperCase(), taxPercent: Number(f.get("taxPercent")) } })
      setData(next); setSaved(true)
    } catch (e: any) { setErr(e.message) }
  }
  return <>
    <h1>Settings</h1>
    <p className="muted">Manage the hotel information used across bookings, invoices, reports, and the booking widget.</p>
    {err && <div className="err">{err}</div>}{saved && <div className="ok">Settings saved successfully.</div>}
    <div className="card">
      <h3>Hotel profile and booking defaults</h3>
      <form onSubmit={save}>
        <div className="row"><label style={{ flex: 1 }}>Hotel name<input name="name" defaultValue={data.name} required maxLength={120} /></label>
          <label>Currency<input name="currency" defaultValue={data.currency} pattern="[A-Za-z]{3}" maxLength={3} required title="Use a 3-letter currency code, for example LKR" /></label></div>
        <div className="row"><label style={{ flex: 1 }}>Timezone<select name="timezone" defaultValue={data.timezone}>{TIMEZONES.includes(data.timezone) ? null : <option value={data.timezone}>{data.timezone}</option>}{TIMEZONES.map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Tax percentage<input name="taxPercent" type="number" min="0" max="50" step="0.01" defaultValue={(data.taxBp / 100).toFixed(2)} /></label></div>
        <p className="muted">The timezone controls date validation and reminder timing. Tax is applied to the discounted booking subtotal.</p>
        <button>Save settings</button>
      </form>
    </div>
    <div className="card" style={{ marginTop: 16 }}><h3>Other settings</h3><div className="row">
      <a className="btn" href="/setup">Rooms, rates, staff and payments</a><a className="btn" href="/widget">Widget branding and domains</a><a className="btn" href="/notifications">Notification delivery</a>
    </div></div>
  </>
}
