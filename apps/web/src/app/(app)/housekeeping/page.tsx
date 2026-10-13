"use client"
import { useEffect, useState, useCallback } from "react"
import { api, session } from "@/lib/api"
const ST: Record<string, string> = { CLEAN: "✓ Clean", DIRTY: "● Dirty", CLEANING: "◔ Cleaning in progress", INSPECTION: "? Inspection required", OUT_OF_SERVICE: "⛔ Out of service" }
export default function Housekeeping() {
  const [rooms, setRooms] = useState<any[] | null>(null), [staff, setStaff] = useState<any[]>([]), [err, setErr] = useState(""), [role, setRole] = useState("")
  const load = useCallback(async () => {
    try { const r = session()?.role; setRole(r); setRooms(await api("/housekeeping")); if (r !== "HOUSEKEEPING") setStaff(await api("/housekeeping/staff")) } catch (e: any) { setErr(e.message) } }, [])
  useEffect(() => { load() }, [load])
  async function patch(id: string, body: any) { try { await api("/housekeeping/" + id, { method: "PATCH", body }); load() } catch (e: any) { setErr(e.message) } }
  if (!rooms) return <div className="muted">{err || "Loading…"}</div>
  return <><h1>Housekeeping</h1>{err && <div className="err">{err}</div>}
    <div className="card" style={{ overflowX: "auto" }}>{rooms.length === 0 ? <p className="muted">No rooms to show.</p> :
      <table><thead><tr><th>Room</th><th>Status</th>{role !== "HOUSEKEEPING" && <th>Assigned to</th>}<th>Notes</th></tr></thead><tbody>
        {rooms.map(r => <tr key={r.id}><td><b>{r.number}</b> <span className="muted">{r.roomType.name} · floor {r.floor}</span></td>
          <td><select value={r.housekeeping} onChange={e => patch(r.id, { status: e.target.value })}>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
          {role !== "HOUSEKEEPING" && <td><select value={r.hkAssigneeId || ""} onChange={e => patch(r.id, { assigneeId: e.target.value || null })}><option value="">Unassigned</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>}
          <td><input defaultValue={r.hkNotes || ""} placeholder="Maintenance notes" onBlur={e => e.target.value !== (r.hkNotes || "") && patch(r.id, { notes: e.target.value })} /></td></tr>)}</tbody></table>}</div></>
}
