export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

export type ClientSession = {
  token: string
  userId?: string
  hotelId?: string
  role?: string
  name?: string
  email?: string
  hotelName?: string
  platform?: boolean
}

export function session(): ClientSession | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem("m89")
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function clearExpiredSession() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem("m89")
  if (window.location.pathname !== "/login") window.location.replace("/login?expired=1")
}

export async function api(path: string, options: any = {}) {
  const current = session()
  const headers = new Headers(options.headers || {})
  if (!headers.has("Accept")) headers.set("Accept", "application/json")
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json")
  if (current?.token) headers.set("Authorization", `Bearer ${current.token}`)
  if (current?.hotelId) headers.set("x-hotel-id", current.hotelId)
  const request = { ...options, headers, body: options.body !== undefined && !(options.body instanceof FormData) && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body }
  const response = await fetch(`${API}${path}`, request)
  if (response.status === 401) {
    clearExpiredSession()
    throw new Error("Your session has expired. Please sign in again.")
  }
  if (response.status === 429) throw new Error("Too many requests. Please wait a minute and try again.")
  const text = await response.text()
  let payload: any = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = text }
  if (!response.ok) throw new Error(payload?.message || payload?.error || `Request failed (${response.status})`)
  return payload
}

export const lkr = (cents: number) => `LKR ${(Number(cents || 0) / 100).toLocaleString()}`
export const iso = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
export const addDays = (date: Date, amount: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export const STATUS: Record<string, [string, string]> = {
  PENDING: ["Pending", "s-pend"],
  CONFIRMED: ["Confirmed", "s-conf"],
  CHECKED_IN: ["Checked-in", "s-in"],
  CHECKED_OUT: ["Checked-out", "s-out"],
  CANCELLED: ["Cancelled", "s-can"],
  NO_SHOW: ["No-show", "s-can"],
}

async function authenticatedFile(path: string) {
  const current = session()
  const headers = new Headers({ Accept: "text/csv,text/html,*/*" })
  if (current?.token) headers.set("Authorization", `Bearer ${current.token}`)
  if (current?.hotelId) headers.set("x-hotel-id", current.hotelId)
  const response = await fetch(`${API}${path}`, { headers })
  if (response.status === 401) { clearExpiredSession(); throw new Error("Your session has expired. Please sign in again.") }
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  return response
}

export async function download(path: string, filename: string) {
  const response = await authenticatedFile(path)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function openHtml(path: string) {
  const response = await authenticatedFile(path)
  const html = await response.text()
  const popup = window.open("", "_blank")
  if (!popup) throw new Error("Please allow pop-ups to view the invoice.")
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
}
