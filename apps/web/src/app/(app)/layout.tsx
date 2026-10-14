"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { api, API, session } from "@/lib/api"

const NAV = [["/dashboard", "Dashboard", "⌂"], ["/calendar", "Calendar", "▦"], ["/reservations", "Bookings", "▤"], ["/guests", "Guests", "♙"], ["/housekeeping", "Housekeeping", "♧"], ["/reports", "Reports", "▥"], ["/widget", "Booking Widget", "⌁"], ["/setup", "Setup", "⚙"], ["/settings", "Settings", "◉"], ["/audit", "Audit log", "◌"], ["/notifications", "Notifications", "♧"]]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const [s, setS] = useState<any>(null), [unread, setUnread] = useState(0), [toast, setToast] = useState(""), [collapsed, setCollapsed] = useState(false)
  const current = NAV.find(([h]) => path === h)?.[1] || "Hotel management"
  useEffect(() => { const x = session(); if (!x) location.href = "/login"; else setS(x) }, [])
  useEffect(() => {
    if (!s) return
    api("/notifications").then((l: any[]) => setUnread(l.filter(n => !n.readAt).length)).catch(() => {})
    const es = new EventSource(API + "/events?token=" + encodeURIComponent(s.token) + "&hotelId=" + s.hotelId)
    es.onmessage = e => { const n = JSON.parse(e.data); setUnread(u => u + 1); setToast(n.title); setTimeout(() => setToast(""), 5000) }
    return () => es.close()
  }, [s])
  if (!s) return null
  const initials = (s.name || s.hotelName || "H").split(" ").map((x: string) => x[0]).slice(0, 2).join("").toUpperCase()
  return <div className={`shell ${collapsed ? "shell-collapsed" : ""}`}>
    <nav className="side">
      <div className="brand"><span className="brand-mark">HP</span><span className="brand-copy"><strong>{s.hotelName || "Hotel platform"}</strong><small>HOTEL MANAGEMENT</small></span></div>
      <div className="side-label">MANAGEMENT</div>
      <div className="nav-list">{NAV.filter(([h]) => s.role !== "HOUSEKEEPING" || h === "/housekeeping").map(([h, l, icon]) => <Link key={h} href={h} className={path === h ? "on" : ""} title={collapsed ? l : undefined}><span className="nav-icon">{icon}</span><span className="nav-label">{l}</span>{l === "Notifications" && unread > 0 && <span className="nav-badge">{unread > 9 ? "9+" : unread}</span>}</Link>)}</div>
      <div className="side-spacer" />
      <Link href="/widget" className="website-link" title={collapsed ? "Booking website" : undefined}><span className="nav-icon">↗</span><span className="nav-label">Booking website</span></Link>
      <button className="collapse-btn" onClick={() => setCollapsed(x => !x)}><span>{collapsed ? "»" : "«"}</span><span className="nav-label">Collapse menu</span></button>
      <div className="side-user"><span className="user-avatar">{initials}</span><span className="user-copy"><strong>{s.name || "Staff user"}</strong><small>{s.role || "Staff"}</small></span><span className="user-more">⋮</span></div>
      <a className="signout-link" href="#" onClick={() => { localStorage.removeItem("m89"); location.href = "/login" }}><span className="nav-icon">⇥</span><span className="nav-label">Sign out</span></a>
    </nav>
    <main className="main"><header className="topbar"><div className="topbar-title">{current}</div><div className="top-search"><span>⌕</span><input aria-label="Search" placeholder="Search bookings, guests, rooms…" /></div><div className="topbar-right"><button className="notification-btn" title="Notifications" onClick={() => location.href = "/notifications"}>♧{unread > 0 && <span>{unread > 9 ? "9+" : unread}</span>}</button><div className="top-user"><span className="user-avatar small">{initials}</span><span className="user-copy"><strong>{s.name || "Staff user"}</strong><small>{s.role || "Staff"}</small></span><span className="chevron">⌄</span></div></div></header>{toast && <div className="toast">♧ {toast}</div>}{children}</main>
  </div>
}
