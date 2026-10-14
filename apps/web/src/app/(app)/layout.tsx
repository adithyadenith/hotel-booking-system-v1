"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { api, API, session } from "@/lib/api"

const NAV = [["/dashboard", "Dashboard", "D"], ["/calendar", "Calendar", "C"], ["/reservations", "Bookings", "B"], ["/guests", "Guests", "G"], ["/housekeeping", "Housekeeping", "H"], ["/reports", "Reports", "R"], ["/widget", "Booking Widget", "W"], ["/setup", "Setup", "S"], ["/settings", "Settings", "O"], ["/audit", "Audit log", "A"], ["/notifications", "Notifications", "N"]]
const money = (cents: number) => `LKR ${(cents / 100).toLocaleString()}`

function SearchDropdown({ busy, results, query, close }: any) {
  if (busy) return <div className="global-search-results"><div className="search-results-header">Searching...</div></div>
  if (!results) return null
  const hasResults = results.bookings.length > 0 || results.guests.length > 0
  return <div className="global-search-results">
    <div className="search-results-header">Results for &quot;{query}&quot;</div>
    {results.bookings.length > 0 && <><div className="search-section-label">BOOKINGS</div>{results.bookings.map((b: any) => <Link key={b.id} href={`/reservations?q=${encodeURIComponent(b.ref)}`} onClick={close} className="search-result"><span className="search-result-icon booking-search-icon">B</span><span className="search-result-copy"><strong>{b.ref} - {b.guest.name}</strong><small>{b.status.replace(/_/g, " ")} - {money(b.totalAmount)}</small></span><span className="search-arrow">&gt;</span></Link>)}</>}
    {results.guests.length > 0 && <><div className="search-section-label">GUESTS</div>{results.guests.map((g: any) => <Link key={g.id} href={`/guests?q=${encodeURIComponent(g.name)}`} onClick={close} className="search-result"><span className="search-result-icon guest-search-icon">G</span><span className="search-result-copy"><strong>{g.name}</strong><small>{g.email || g.phone || `${g._count.reservations} stays`}</small></span><span className="search-arrow">&gt;</span></Link>)}</>}
    {!hasResults && <div className="search-empty">No bookings or guests found.</div>}
    {hasResults && <div className="search-footer"><Link href={`/reservations?q=${encodeURIComponent(query)}`} onClick={close}>View booking results</Link><Link href={`/guests?q=${encodeURIComponent(query)}`} onClick={close}>View guest results</Link></div>}
  </div>
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const [s, setS] = useState<any>(null), [unread, setUnread] = useState(0), [toast, setToast] = useState(""), [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState(""), [searchOpen, setSearchOpen] = useState(false), [searchBusy, setSearchBusy] = useState(false), [results, setResults] = useState<any>(null)
  const current = NAV.find(([h]) => path === h)?.[1] || "Hotel management"
  useEffect(() => { const x = session(); if (!x) location.href = "/login"; else setS(x) }, [])
  useEffect(() => {
    if (!s) return
    api("/notifications").then((l: any[]) => setUnread(l.filter(n => !n.readAt).length)).catch(() => {})
    const es = new EventSource(API + "/events?token=" + encodeURIComponent(s.token) + "&hotelId=" + s.hotelId)
    es.onmessage = e => { const n = JSON.parse(e.data); setUnread(u => u + 1); setToast(n.title); setTimeout(() => setToast(""), 5000) }
    return () => es.close()
  }, [s])
  useEffect(() => {
    if (!s || s.role === "HOUSEKEEPING") return
    const q = search.trim()
    if (q.length < 2) { setResults(null); setSearchBusy(false); return }
    setSearchBusy(true)
    const timer = setTimeout(() => api("/search?q=" + encodeURIComponent(q)).then(setResults).catch(() => setResults({ guests: [], bookings: [] })).finally(() => setSearchBusy(false)), 220)
    return () => clearTimeout(timer)
  }, [search, s])
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setSearchOpen(false) }
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close)
  }, [])
  if (!s) return null
  const initials = (s.name || s.hotelName || "H").split(" ").map((x: string) => x[0]).slice(0, 2).join("").toUpperCase()
  const closeSearch = () => setSearchOpen(false)
  return <div className={`shell ${collapsed ? "shell-collapsed" : ""}`}>
    <nav className="side">
      <div className="brand"><span className="brand-mark">HP</span><span className="brand-copy"><strong>{s.hotelName || "Hotel platform"}</strong><small>HOTEL MANAGEMENT</small></span></div>
      <div className="side-label">MANAGEMENT</div>
      <div className="nav-list">{NAV.filter(([h]) => s.role !== "HOUSEKEEPING" || h === "/housekeeping").map(([h, l, icon]) => <Link key={h} href={h} className={path === h ? "on" : ""} title={collapsed ? l : undefined}><span className="nav-icon">{icon}</span><span className="nav-label">{l}</span>{l === "Notifications" && unread > 0 && <span className="nav-badge">{unread > 9 ? "9+" : unread}</span>}</Link>)}</div>
      <div className="side-spacer" />
      <Link href="/widget" className="website-link" title={collapsed ? "Booking website" : undefined}><span className="nav-icon">&gt;</span><span className="nav-label">Booking website</span></Link>
      <button className="collapse-btn" onClick={() => setCollapsed(x => !x)}><span>{collapsed ? ">" : "<"}</span><span className="nav-label">Collapse menu</span></button>
      <div className="side-user"><span className="user-avatar">{initials}</span><span className="user-copy"><strong>{s.name || "Staff user"}</strong><small>{s.role || "Staff"}</small></span><span className="user-more">...</span></div>
      <a className="signout-link" href="#" onClick={() => { localStorage.removeItem("m89"); location.href = "/login" }}><span className="nav-icon">X</span><span className="nav-label">Sign out</span></a>
    </nav>
    <main className="main"><header className="topbar"><div className="topbar-title">{current}</div><div className="top-search"><span>?</span><input aria-label="Search bookings and guests" value={search} onChange={e => { setSearch(e.target.value); setSearchOpen(true) }} onFocus={() => setSearchOpen(true)} onKeyDown={e => { if (e.key === "Enter" && search.trim().length >= 2) { setSearchOpen(false); location.href = "/reservations?q=" + encodeURIComponent(search.trim()) } }} placeholder="Search bookings, guests, rooms..." />{search && <button className="search-clear" aria-label="Clear search" onClick={() => { setSearch(""); setResults(null) }}>x</button>}{searchOpen && search.trim().length >= 2 && <SearchDropdown busy={searchBusy} results={results} query={search.trim()} close={closeSearch} />}</div><div className="topbar-right"><button className="notification-btn" title="Notifications" onClick={() => location.href = "/notifications"}>N{unread > 0 && <span>{unread > 9 ? "9+" : unread}</span>}</button><div className="top-user"><span className="user-avatar small">{initials}</span><span className="user-copy"><strong>{s.name || "Staff user"}</strong><small>{s.role || "Staff"}</small></span><span className="chevron">v</span></div></div></header>{toast && <div className="toast">Notice: {toast}</div>}{children}</main>
  </div>
}
