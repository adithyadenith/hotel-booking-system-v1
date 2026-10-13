"use client"
import { useCallback, useEffect, useState } from "react"
import { api, lkr, session } from "@/lib/api"

function useLoad(path: string) {
  const [d, setD] = useState<any[] | null>(null), [e, setE] = useState("")
  const load = useCallback(() => api(path).then(x => { setD(x); setE("") }).catch(x => setE(x.message)), [path])
  useEffect(() => { load() }, [load]); return { d, e, load }
}
/** Runs an action, shows any error, then reloads the lists. */
async function go(fn: () => Promise<any>, setErr: (s: string) => void, ...reloads: (() => void)[]) {
  try { await fn(); setErr(""); reloads.forEach(r => r()) } catch (x: any) { setErr(x.message) }
}
const fd = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const out: Record<string, string> = {}; new FormData(e.currentTarget).forEach((v, k) => { out[k] = String(v) }); return out }

function Rooms({ setErr }: any) {
  const types = useLoad("/room-types"), rooms = useLoad("/rooms")
  const reload = () => { types.load(); rooms.load() }
  return <>
    <div className="card"><h3>Room types</h3>
      <table><tbody>{(types.d || []).map(t => <tr key={t.id}><td>{t.name}</td><td>{lkr(t.baseRate)} / night</td><td>Sleeps {t.maxOccupancy}</td>
        <td><button className="sec" onClick={() => { const v = prompt("New base rate (LKR)", String(t.baseRate / 100)); if (v) go(() => api("/room-types/" + t.id, { method: "PATCH", body: { baseRate: Math.round(+v * 100) } }), setErr, reload) }}>Edit rate</button></td></tr>)}</tbody></table>
      <form className="row" onSubmit={e => { const f = fd(e), form = e.currentTarget; go(async () => { await api("/room-types", { method: "POST", body: { name: f.name, baseRate: Math.round(+f.rate * 100), maxOccupancy: +f.occ } }); form.reset() }, setErr, reload) }}>
        <input name="name" placeholder="Name (e.g. Deluxe)" required /><input name="rate" type="number" min="0" step="0.01" placeholder="Base rate LKR" required /><input name="occ" type="number" min="1" placeholder="Max guests" required /><button>Add type</button></form></div>
    <div className="card" style={{ marginTop: 16 }}><h3>Rooms</h3>
      <div style={{ overflowX: "auto" }}><table><tbody>{(rooms.d || []).map(r => <tr key={r.id} style={{ opacity: r.archivedAt ? 0.5 : 1 }}><td><b>{r.number}</b></td><td>{r.roomType.name}</td><td>Floor {r.floor}</td><td>{r.archivedAt ? "Archived" : "Active"}</td>
        <td><button className="sec" onClick={() => go(() => api("/rooms/" + r.id, { method: "PATCH", body: { archived: !r.archivedAt } }), setErr, reload)}>{r.archivedAt ? "Restore" : "Archive"}</button></td></tr>)}</tbody></table></div>
      <form className="row" onSubmit={e => { const f = fd(e), form = e.currentTarget; go(async () => { await api("/rooms", { method: "POST", body: { number: f.number, roomTypeId: f.type, floor: +f.floor } }); form.reset() }, setErr, reload) }}>
        <input name="number" placeholder="Room no." required style={{ width: 100 }} /><select name="type" required>{(types.d || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><input name="floor" type="number" min="0" placeholder="Floor" required style={{ width: 90 }} /><button>Add room</button></form></div></>
}

function Rates({ setErr }: any) {
  const rules = useLoad("/rate-rules"), promos = useLoad("/promo-codes"), types = useLoad("/room-types")
  return <>
    <div className="card"><h3>Rate rules</h3><p className="muted">Multiplier is a percentage of the base rate (120 = +20%). Special dates beat seasons, which beat weekends.</p>
      <div style={{ overflowX: "auto" }}><table><tbody>{(rules.d || []).map(r => <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}><td>{r.name}</td><td>{r.type}</td><td>{r.startDate ? r.startDate.slice(0, 10) + " → " + r.endDate.slice(0, 10) : "Fri & Sat nights"}</td><td>{r.multiplierBp / 100}%</td>
        <td><button className="sec" onClick={() => go(() => api("/rate-rules/" + r.id, { method: "PATCH", body: { active: !r.active } }), setErr, rules.load)}>{r.active ? "Disable" : "Enable"}</button>{" "}
          <button className="sec" onClick={() => confirm("Delete this rule?") && go(() => api("/rate-rules/" + r.id, { method: "DELETE" }), setErr, rules.load)}>Delete</button></td></tr>)}</tbody></table></div>
      <form className="row" onSubmit={e => { const f = fd(e), form = e.currentTarget; go(async () => { await api("/rate-rules", { method: "POST", body: { name: f.name, type: f.type, roomTypeId: f.rt || null, startDate: f.start || undefined, endDate: f.end || undefined, multiplierBp: Math.round(+f.pct * 100) } }); form.reset() }, setErr, rules.load) }}>
        <input name="name" placeholder="Rule name" required /><select name="type"><option>SEASON</option><option>SPECIAL</option><option>WEEKEND</option></select>
        <select name="rt"><option value="">All room types</option>{(types.d || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <input name="start" type="date" /><input name="end" type="date" /><input name="pct" type="number" min="10" max="500" placeholder="% of base" required style={{ width: 110 }} /><button>Add rule</button></form></div>
    <div className="card" style={{ marginTop: 16 }}><h3>Promo codes</h3>
      <table><tbody>{(promos.d || []).map(p => <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}><td><b>{p.code}</b></td><td>{p.percentOff}% off</td>
        <td><button className="sec" onClick={() => go(() => api("/promo-codes/" + p.id, { method: "PATCH", body: { active: !p.active } }), setErr, promos.load)}>{p.active ? "Disable" : "Enable"}</button></td></tr>)}</tbody></table>
      <form className="row" onSubmit={e => { const f = fd(e), form = e.currentTarget; go(async () => { await api("/promo-codes", { method: "POST", body: { code: f.code, percentOff: +f.pct } }); form.reset() }, setErr, promos.load) }}>
        <input name="code" placeholder="CODE" required /><input name="pct" type="number" min="1" max="100" placeholder="% off" required style={{ width: 100 }} /><button>Add promo</button></form></div></>
}

function Maint({ setErr }: any) {
  const blocks = useLoad("/maintenance-blocks"), rooms = useLoad("/rooms")
  return <div className="card"><h3>Maintenance blocks</h3><p className="muted">Blocked nights cannot be booked. End date is exclusive, like check-out.</p>
    <table><tbody>{(blocks.d || []).map(b => <tr key={b.id}><td><b>Room {b.room.number}</b></td><td>{b.startDate.slice(0, 10)} → {b.endDate.slice(0, 10)}</td><td>{b.reason}</td>
      <td><button className="sec" onClick={() => confirm("Remove this block?") && go(() => api("/maintenance-blocks/" + b.id, { method: "DELETE" }), setErr, blocks.load)}>Remove</button></td></tr>)}</tbody></table>
    <form className="row" onSubmit={e => { const f = fd(e), form = e.currentTarget; go(async () => { await api("/maintenance-blocks", { method: "POST", body: { roomId: f.room, startDate: f.start, endDate: f.end, reason: f.reason } }); form.reset() }, setErr, blocks.load) }}>
      <select name="room" required>{(rooms.d || []).filter(r => !r.archivedAt).map(r => <option key={r.id} value={r.id}>Room {r.number}</option>)}</select>
      <input name="start" type="date" required /><input name="end" type="date" required /><input name="reason" placeholder="Reason" /><button>Block dates</button></form></div>
}

const ROLES = ["ADMIN", "MANAGER", "RECEPTIONIST", "HOUSEKEEPING"]
function Staff({ setErr }: any) {
  const staff = useLoad("/staff"), me = session()
  return <div className="card"><h3>Staff</h3>
    <div style={{ overflowX: "auto" }}><table><tbody>{(staff.d || []).map(s => <tr key={s.userId}><td>{s.name}</td><td>{s.email}</td>
      <td><select value={s.role} onChange={e => go(() => api("/staff/" + s.userId, { method: "PATCH", body: { role: e.target.value } }), setErr, staff.load)}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></td>
      <td><button className="sec" onClick={() => confirm("Remove " + s.name + " from this hotel?") && go(() => api("/staff/" + s.userId, { method: "DELETE" }), setErr, staff.load)}>Remove</button></td></tr>)}</tbody></table></div>
    <form className="row" onSubmit={e => { const f = fd(e), form = e.currentTarget; go(async () => { await api("/staff", { method: "POST", body: { name: f.name, email: f.email, password: f.password || undefined, role: f.role } }); form.reset() }, setErr, staff.load) }}>
      <input name="name" placeholder="Full name" required /><input name="email" type="email" placeholder="Email" required /><input name="password" type="password" minLength={10} placeholder="Password (new users)" />
      <select name="role">{ROLES.map(r => <option key={r}>{r}</option>)}</select><button>Add staff</button></form></div>
}

function Gateway({ setErr }: any) {
  const [cfg, setCfg] = useState<any>(null)
  useEffect(() => { api("/payment-gateway").then(x => setCfg(x[0] || {})).catch(e => setErr(e.message)) }, [setErr])
  if (!cfg) return <div className="card muted">Loading gateway settings…</div>
  return <div className="card"><h3>PayHere gateway</h3><p className="muted">Checkout uses PayHere’s hosted form and server-side callback verification. Credentials are encrypted before storage. Use SANDBOX until the merchant account and public webhook URL are ready.</p>
    <form className="row" onSubmit={async e => { e.preventDefault(); const f = fd(e); try { await api("/payment-gateway", { method: "PATCH", body: { provider: "PAYHERE", environment: f.environment, merchantId: f.merchantId, merchantSecret: f.merchantSecret, apiToken: f.apiToken || undefined, enabled: f.enabled === "on" } }); setErr(""); alert("Gateway settings saved") } catch (x: any) { setErr(x.message) } }}>
      <select name="environment" defaultValue={cfg.environment || "SANDBOX"}><option>SANDBOX</option><option>LIVE</option></select><input name="merchantId" placeholder="Merchant ID" defaultValue={cfg.merchantId || ""} required /><input name="merchantSecret" type="password" placeholder="Merchant secret" required /><input name="apiToken" type="password" placeholder="Refund API token (optional)" /><label><input name="enabled" type="checkbox" defaultChecked={!!cfg.enabled} /> Enable PayHere</label><button>Save gateway</button></form></div>
}

export default function Setup() {
  const [tab, setTab] = useState("rooms"), [err, setErr] = useState(""), [role, setRole] = useState("")
  useEffect(() => setRole(session()?.role), [])
  return <><h1>Setup</h1>
    <div className="row">{[["rooms", "Rooms"], ["rates", "Rates & promos"], ["maint", "Maintenance"], ...(role === "ADMIN" ? [["staff", "Staff"], ["gateway", "Payments"]] : [])].map(([k, l]) => <button key={k} className={tab === k ? "" : "sec"} onClick={() => { setTab(k); setErr("") }}>{l}</button>)}</div>
    {err && <div className="err">{err}</div>}
    {tab === "rooms" && <Rooms setErr={setErr} />}{tab === "maint" && <Maint setErr={setErr} />}{tab === "rates" && <Rates setErr={setErr} />}{tab === "staff" && <Staff setErr={setErr} />}{tab === "gateway" && <Gateway setErr={setErr} />}</>
}
