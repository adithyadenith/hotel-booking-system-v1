"use client"
import { useState } from "react"
import { api } from "@/lib/api"

export default function Login() {
  const [mode, setMode] = useState<"admin" | "staff">("staff")
  const [email, setEmail] = useState("reception@demo.lk")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  function chooseMode(next: "admin" | "staff") {
    setMode(next)
    setErr("")
    if (next === "admin" && email === "reception@demo.lk") setEmail("admin@demo.lk")
    if (next === "staff" && email === "admin@demo.lk") setEmail("reception@demo.lk")
  }

  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("")
    try {
      const r = await api("/auth/login", { method: "POST", body: { email, password } })
      const membership = r.memberships?.[0]
      if (mode === "admin" && !r.isPlatformAdmin && membership?.role !== "ADMIN") throw new Error("Please use an administrator account")
      if (mode === "staff" && (r.isPlatformAdmin || membership?.role === "ADMIN")) throw new Error("Please choose Administrator to use this account")
      if (r.isPlatformAdmin) {
        localStorage.setItem("m89", JSON.stringify({ token: r.token, platform: true, name: r.user.name }))
        location.href = "/platform"; return
      }
      if (!membership) throw new Error("This account has no hotel access")
      localStorage.setItem("m89", JSON.stringify({ token: r.token, userId: r.user.id, hotelId: membership.hotelId, hotelName: membership.hotelName, role: membership.role, name: r.user.name, email: r.user.email }))
      location.href = membership.role === "HOUSEKEEPING" ? "/housekeeping" : "/dashboard"
    } catch (x: any) {
      const message = String(x?.message || "")
      setErr(message.toLowerCase().includes("invalid credentials") || message.toLowerCase().includes("unauthorized")
        ? "Incorrect email or password. Please check your details and try again."
        : message.toLowerCase().includes("failed to fetch") || message.toLowerCase().includes("network")
          ? "The login service is unavailable. Please make sure the hotel system is running and try again."
          : message)
    } finally { setBusy(false) }
  }

  return <main className="login-page">
    <section className="login-brand"><div className="login-brand-mark">M89</div><p className="login-eyebrow">METHOD89 HOTEL</p><h1>Run your hotel<br />with confidence.</h1><p className="login-brand-copy">Bookings, rooms, guests, payments and daily hotel work in one simple place.</p><div className="login-brand-footer">Secure hotel management for your team.</div></section>
    <section className="login-panel"><form className="login-card" onSubmit={go}>
      <div className="login-heading"><p className="login-eyebrow">WELCOME BACK</p><h2>Sign in to your hotel</h2><p>Choose how you want to enter the system.</p></div>
      <div className="login-role-grid" role="radiogroup" aria-label="Choose login type">
        <button type="button" className={`login-role-card ${mode === "admin" ? "selected" : ""}`} onClick={() => chooseMode("admin")} aria-pressed={mode === "admin"}><span className="login-role-icon">A</span><span><strong>Administrator</strong><small>Manage hotel settings, staff, prices and reports.</small></span><i>{mode === "admin" ? "✓" : ""}</i></button>
        <button type="button" className={`login-role-card ${mode === "staff" ? "selected" : ""}`} onClick={() => chooseMode("staff")} aria-pressed={mode === "staff"}><span className="login-role-icon staff">S</span><span><strong>Hotel staff</strong><small>Manage bookings, guests, rooms and daily tasks.</small></span><i>{mode === "staff" ? "✓" : ""}</i></button>
      </div>
      <div className="login-selected-note"><span>{mode === "admin" ? "Administrator login" : "Staff login"}</span><small>{mode === "admin" ? "For hotel administrators and platform owners" : "For managers, front desk and room-cleaning staff"}</small></div>
      <label className="login-field"><span>Email address</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@hotel.com" autoComplete="username" required /></label>
      <label className="login-field"><span>Password</span><div className="login-password-wrap"><input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required /><button type="button" className="login-password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></div></label>
      {err && <div className="login-error" role="alert">{err}</div>}
      <button className="login-submit" disabled={busy}>{busy ? "Signing in..." : `Sign in as ${mode === "admin" ? "administrator" : "staff"}`}<span>→</span></button>
      <p className="login-help">Need access? Ask your hotel administrator to create your account.</p>
    </form></section>
  </main>
}
