export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
export const session = () => JSON.parse(localStorage.getItem("m89") || "null")
export async function api(path: string, opts: any = {}) {
  const s = session()
  const r = await fetch(API + path, { method: opts.method || "GET",
    headers: { "Content-Type": "application/json", ...(s ? { Authorization: "Bearer " + s.token, "X-Hotel-Id": s.hotelId } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(Array.isArray(j.message) ? j.message.join(", ") : j.message || "Request failed")
  return j
}
export async function openHtml(path: string) {
  const s = session(); const r = await fetch(API + path, { headers: { Authorization: "Bearer " + s.token, "X-Hotel-Id": s.hotelId } })
  if (!r.ok) throw new Error("Could not load document")
  window.open(URL.createObjectURL(new Blob([await r.text()], { type: "text/html" })), "_blank")
}
export async function download(path: string, name: string) {
  const s = session(); const r = await fetch(API + path, { headers: { Authorization: "Bearer " + s.token, "X-Hotel-Id": s.hotelId } })
  if (!r.ok) throw new Error("Download failed")
  const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click()
}
export const iso = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5)
export const lkr = (cents: number) => "LKR " + (cents / 100).toLocaleString("en-LK")
export const STATUS: Record<string, [string, string]> = {
  CONFIRMED: ["✓ Confirmed", "s-conf"], PENDING: ["◔ Pending", "s-pend"], CHECKED_IN: ["➜ Checked-in", "s-in"],
  CHECKED_OUT: ["⏏ Checked-out", "s-out"], CANCELLED: ["✕ Cancelled", "s-can"], NO_SHOW: ["∅ No-show", "s-can"] }
