"use client"
import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { api, lkr, session } from "@/lib/api"
import AddOns from "../add-ons/page"
import Packages from "../packages/page"

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
  const [editingType, setEditingType] = useState<any>(null), [savingType, setSavingType] = useState(false), [editingRoom, setEditingRoom] = useState<any>(null), [savingRoom, setSavingRoom] = useState(false)
  const reload = () => { types.load(); rooms.load() }
  const editType = (t: any) => setEditingType({ ...t, rate: String(t.baseRate / 100), occupancy: String(t.maxOccupancy) })
  const saveType = async (e: React.FormEvent) => { e.preventDefault(); if (!editingType) return; setSavingType(true); try { await api(`/room-types/${editingType.id}`, { method: "PATCH", body: { name: editingType.name.trim(), baseRate: Math.round(Number(editingType.rate) * 100), maxOccupancy: Number(editingType.occupancy) } }); setEditingType(null); reload(); setErr("") } catch (e: any) { setErr(e.message) } finally { setSavingType(false) } }
  const deleteType = async (t: any) => { if (!confirm(`Delete room type ${t.name}? It must not have rooms assigned.`)) return; go(() => api(`/room-types/${t.id}`, { method: "DELETE" }), setErr, reload) }
  const editRoom = async (r: any) => { const floor = prompt("Floor", String(r.floor)); if (floor === null) return; go(() => api(`/rooms/${r.id}`, { method: "PATCH", body: { floor: Number(floor) } }), setErr, reload) }
  const openRoomEdit = (r: any) => setEditingRoom({ ...r, type: r.roomTypeId, floorValue: String(r.floor) })
  const saveRoom = async (e: React.FormEvent) => { e.preventDefault(); if (!editingRoom) return; setSavingRoom(true); try { await api(`/rooms/${editingRoom.id}`, { method: "PATCH", body: { number: editingRoom.number.trim(), roomTypeId: editingRoom.type, floor: Number(editingRoom.floorValue) } }); setEditingRoom(null); reload(); setErr("") } catch (e: any) { setErr(e.message) } finally { setSavingRoom(false) } }
  return <>
    <div className="card"><div className="setup-card-heading"><div><h3>Room types</h3><p className="muted">Edit the name, nightly price, and maximum guests for any room type.</p></div></div>
      {editingType && <form className="room-type-edit-card" onSubmit={saveType}><div><span className="setup-form-eyebrow">EDIT ROOM TYPE</span><h3>Edit {editingType.name}</h3><p>Changes will apply to this room type and its available rooms.</p></div><div className="room-type-edit-fields"><label>Name<input value={editingType.name} onChange={e => setEditingType({ ...editingType, name: e.target.value })} required /></label><label>Nightly rate (LKR)<input type="number" min="0" step="0.01" value={editingType.rate} onChange={e => setEditingType({ ...editingType, rate: e.target.value })} required /></label><label>Maximum guests<input type="number" min="1" max="20" value={editingType.occupancy} onChange={e => setEditingType({ ...editingType, occupancy: e.target.value })} required /></label></div><div className="room-type-edit-actions"><button type="button" className="sec" onClick={() => setEditingType(null)}>Cancel</button><button type="submit" disabled={savingType}>{savingType ? "Saving..." : "Save changes"}</button></div></form>}
      <table><tbody>{(types.d || []).map(t => <tr key={t.id}><td>{t.name}</td><td>{lkr(t.baseRate)} / night</td><td>Sleeps {t.maxOccupancy}</td>
        <td><button className="sec" onClick={() => editType(t)}>Edit</button><button className="danger-mini" onClick={() => deleteType(t)}>Delete</button></td></tr>)}</tbody></table>
      <form className="row" onSubmit={e => { const f = fd(e), form = e.currentTarget; go(async () => { await api("/room-types", { method: "POST", body: { name: f.name, baseRate: Math.round(+f.rate * 100), maxOccupancy: +f.occ } }); form.reset() }, setErr, reload) }}>
        <input name="name" placeholder="Name (e.g. Deluxe)" required /><input name="rate" type="number" min="0" step="0.01" placeholder="Base rate LKR" required /><input name="occ" type="number" min="1" placeholder="Max guests" required /><button>Add type</button></form></div>
    <div className="card" style={{ marginTop: 16 }}><div className="setup-card-heading"><div><h3>Rooms</h3><p className="muted">Edit room details without leaving the setup screen.</p></div></div>
      {editingRoom && <form className="room-type-edit-card" onSubmit={saveRoom}><div><span className="setup-form-eyebrow">EDIT ROOM</span><h3>Edit room {editingRoom.number}</h3><p>Update the room number, room type, or floor.</p></div><div className="room-type-edit-fields"><label>Room number<input value={editingRoom.number} onChange={e => setEditingRoom({ ...editingRoom, number: e.target.value })} required /></label><label>Room type<select value={editingRoom.type} onChange={e => setEditingRoom({ ...editingRoom, type: e.target.value })} required>{(types.d || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Floor<input type="number" min="0" max="100" value={editingRoom.floorValue} onChange={e => setEditingRoom({ ...editingRoom, floorValue: e.target.value })} required /></label></div><div className="room-type-edit-actions"><button type="button" className="sec" onClick={() => setEditingRoom(null)}>Cancel</button><button type="submit" disabled={savingRoom}>{savingRoom ? "Saving..." : "Save changes"}</button></div></form>}
      <div style={{ overflowX: "auto" }}><table><tbody>{(rooms.d || []).map(r => <tr key={r.id} style={{ opacity: r.archivedAt ? 0.5 : 1 }}><td><b>{r.number}</b></td><td>{r.roomType.name}</td><td>Floor {r.floor}</td><td>{r.archivedAt ? "Archived" : "Active"}</td>
        <td><button className="sec" onClick={() => openRoomEdit(r)}>Edit</button><button className="sec" onClick={() => go(() => api("/rooms/" + r.id, { method: "PATCH", body: { archived: !r.archivedAt } }), setErr, reload)}>{r.archivedAt ? "Restore" : "Archive"}</button></td></tr>)}</tbody></table></div>
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
  const [editing, setEditing] = useState<any>(null), [saving, setSaving] = useState(false)
  const edit = (b: any) => setEditing({ ...b, start: b.startDate.slice(0, 10), end: b.endDate.slice(0, 10) })
  const saveEdit = async (e: React.FormEvent) => { e.preventDefault(); if (!editing) return; setSaving(true); try { await api(`/maintenance-blocks/${editing.id}`, { method: "PATCH", body: { startDate: editing.start, endDate: editing.end, reason: editing.reason || "" } }); setEditing(null); blocks.load(); setErr("") } catch (e: any) { setErr(e.message) } finally { setSaving(false) } }
  return <div className="card"><h3>Maintenance blocks</h3><p className="muted">Blocked nights cannot be booked. End date is exclusive, like check-out.</p>
    {editing && <form className="setup-inline-edit" onSubmit={saveEdit}><div><span className="setup-form-eyebrow">EDIT MAINTENANCE BLOCK</span><h3>Room {editing.room.number}</h3><p>Update the blocked dates or reason.</p></div><div className="setup-inline-fields"><label>Start date<input type="date" value={editing.start} onChange={e => setEditing({ ...editing, start: e.target.value })} required /></label><label>End date<input type="date" value={editing.end} onChange={e => setEditing({ ...editing, end: e.target.value })} required /></label><label>Reason<input value={editing.reason || ""} onChange={e => setEditing({ ...editing, reason: e.target.value })} /></label></div><div className="room-type-edit-actions"><button type="button" className="sec" onClick={() => setEditing(null)}>Cancel</button><button disabled={saving}>{saving ? "Saving..." : "Save changes"}</button></div></form>}
    <table><tbody>{(blocks.d || []).map(b => <tr key={b.id}><td><b>Room {b.room.number}</b></td><td>{b.startDate.slice(0, 10)} → {b.endDate.slice(0, 10)}</td><td>{b.reason}</td>
      <td><button className="sec" onClick={() => edit(b)}>Edit</button><button className="danger-mini" onClick={() => confirm("Remove this block?") && go(() => api("/maintenance-blocks/" + b.id, { method: "DELETE" }), setErr, blocks.load)}>Remove</button></td></tr>)}</tbody></table>
    <form className="row" onSubmit={e => { const f = fd(e), form = e.currentTarget; go(async () => { await api("/maintenance-blocks", { method: "POST", body: { roomId: f.room, startDate: f.start, endDate: f.end, reason: f.reason } }); form.reset() }, setErr, blocks.load) }}>
      <select name="room" required>{(rooms.d || []).filter(r => !r.archivedAt).map(r => <option key={r.id} value={r.id}>Room {r.number}</option>)}</select>
      <input name="start" type="date" required /><input name="end" type="date" required /><input name="reason" placeholder="Reason" /><button>Block dates</button></form></div>
}

const ROLES = ["ADMIN", "MANAGER", "RECEPTIONIST", "HOUSEKEEPING"]
function Staff({ setErr }: any) {
  const staff = useLoad("/staff"), me = session()
  const [reset, setReset] = useState<any>(null), [password, setPassword] = useState(""), [busy, setBusy] = useState(false)
  const submitReset = async (e: React.FormEvent) => { e.preventDefault(); if (!reset) return; setBusy(true); try { await api(`/staff/${reset.userId}/reset-password`, { method: "POST", body: { password } }); setPassword(""); setReset(null); setErr("") } catch (e: any) { setErr(e.message) } finally { setBusy(false) } }
  return <div className="card"><div className="setup-card-heading"><div><h3>Staff accounts</h3><p className="muted">Create hotel access, assign work roles, and reset a staff password when needed.</p></div></div>
    {reset && <form className="setup-inline-edit" onSubmit={submitReset}><div><span className="setup-form-eyebrow">RESET STAFF PASSWORD</span><h3>{reset.name}</h3><p>Give the staff member a temporary password of at least 10 characters.</p></div><div className="setup-inline-fields"><label>New temporary password<input value={password} type="password" minLength={10} onChange={e => setPassword(e.target.value)} required /></label></div><div className="room-type-edit-actions"><button type="button" className="sec" onClick={() => { setReset(null); setPassword("") }}>Cancel</button><button disabled={busy}>{busy ? "Saving..." : "Reset password"}</button></div></form>}
    <div style={{ overflowX: "auto" }}><table><thead><tr><th>Staff member</th><th>Role</th><th>Account actions</th></tr></thead><tbody>{(staff.d || []).map(s => <tr key={s.userId}><td><b>{s.name}</b><br /><span className="muted">{s.email}</span></td>
      <td><select value={s.role} disabled={s.userId === me?.userId} onChange={e => go(() => api("/staff/" + s.userId, { method: "PATCH", body: { role: e.target.value } }), setErr, staff.load)}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></td>
      <td><div className="setup-action-group"><button className="sec" onClick={() => setReset(s)}>Reset password</button><button className="danger-mini" disabled={s.userId === me?.userId} onClick={() => confirm("Remove " + s.name + " from this hotel?") && go(() => api("/staff/" + s.userId, { method: "DELETE" }), setErr, staff.load)}>Remove</button></div></td></tr>)}</tbody></table></div>
    <form className="row" onSubmit={e => { const f = fd(e), form = e.currentTarget; go(async () => { await api("/staff", { method: "POST", body: { name: f.name, email: f.email, password: f.password || undefined, role: f.role } }); form.reset() }, setErr, staff.load) }}>
      <input name="name" placeholder="Full name" required /><input name="email" type="email" placeholder="Email" required /><input name="password" type="password" minLength={10} placeholder="Temporary password" required />
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
  const params = useSearchParams(), [tab, setTab] = useState(params.get("tab") || "rooms"), [err, setErr] = useState(""), [role, setRole] = useState("")
  useEffect(() => { if (params.get("tab")) setTab(params.get("tab")!) }, [params])
  useEffect(() => setRole(session()?.role), [])
  return <div className="setup-page"><div className="setup-hub-heading"><div><span className="setup-hub-eyebrow">HOTEL CONFIGURATION</span><h1>Hotel setup</h1><p>Manage your rooms, pricing, offers, extra services, staff, and payments from one place.</p></div></div>
    <div className="setup-tabs" role="tablist">{[["rooms", "Rooms"], ["addons", "Extra services"], ["offers", "Offers"], ...(role === "ADMIN" ? [["staff", "Staff"], ["gateway", "Payment"]] : [])].map(([k, l]) => <button key={k} className={(["rooms", "rates", "maint"].includes(tab) && k === "rooms") || tab === k ? "active" : ""} onClick={() => { setTab(k); setErr("") }}>{l}</button>)}</div>
    {(["rooms", "rates", "maint"].includes(tab)) && <div className="setup-room-tabs" role="tablist">{[["rooms", "Rooms"], ["rates", "Rates & promos"], ["maint", "Maintenance"]].map(([k, l]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => { setTab(k); setErr("") }}>{l}</button>)}</div>}
    {err && <div className="err">{err}</div>}
    {tab === "rooms" && <Rooms setErr={setErr} />}{tab === "addons" && <AddOns />}{tab === "offers" && <Packages />}{tab === "maint" && <Maint setErr={setErr} />}{tab === "rates" && <Rates setErr={setErr} />}{tab === "staff" && <Staff setErr={setErr} />}{tab === "gateway" && <Gateway setErr={setErr} />}</div>
}
