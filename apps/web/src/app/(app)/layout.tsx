"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { api, API, session } from "@/lib/api"
const NAV = [["/dashboard", "Dashboard"], ["/calendar", "Calendar"], ["/reservations", "Bookings"], ["/guests", "Guests"], ["/housekeeping", "Housekeeping"], ["/reports", "Reports"], ["/widget", "Booking Widget"], ["/setup", "Setup"], ["/audit", "Audit log"], ["/notifications", "Notifications"]]
export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const [s, setS] = useState<any>(null), [unread, setUnread] = useState(0), [toast, setToast] = useState("")
  useEffect(() => { const x = session(); if (!x) location.href = "/login"; else setS(x) }, [])
  useEffect(() => {
    if (!s) return
    api("/notifications").then((l: any[]) => setUnread(l.filter(n => !n.readAt).length)).catch(() => {})
    const es = new EventSource(API + "/events?token=" + encodeURIComponent(s.token) + "&hotelId=" + s.hotelId)
    es.onmessage = e => { const n = JSON.parse(e.data); setUnread(u => u + 1); setToast(n.title); setTimeout(() => setToast(""), 5000) }
    return () => es.close()
  }, [s])
  if (!s) return null
  return <div className="shell"><nav className="side"><h2>{s.hotelName}</h2>
    {NAV.filter(([h]) => s.role !== "HOUSEKEEPING" || h === "/housekeeping").map(([h, l]) => <Link key={h} href={h} className={path === h ? "on" : ""}>{l}</Link>)}
    <a href="#" onClick={() => { localStorage.removeItem("m89"); location.href = "/login" }}>Sign out</a></nav>
    <main className="main">{toast && <div className="card" style={{ position: "fixed", top: 16, right: 16, zIndex: 20 }}>🔔 {toast}</div>}<div className="muted" style={{ textAlign: "right" }}>🔔 {unread} unread</div>{children}</main></div>
}
