"use client"
import { useState } from "react"
import { api } from "@/lib/api"
export default function Login() {
  const [email, setEmail] = useState("reception@demo.lk"), [password, setPassword] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false)
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("")
    try {
      const r = await api("/auth/login", { method: "POST", body: { email, password } })
      if (r.isPlatformAdmin) { localStorage.setItem("m89", JSON.stringify({ token: r.token, platform: true, name: r.user.name })); location.href = "/platform"; return }
      const m = r.memberships[0]
      if (!m) throw new Error("This account has no hotel access")
      localStorage.setItem("m89", JSON.stringify({ token: r.token, hotelId: m.hotelId, hotelName: m.hotelName, role: m.role, name: r.user.name }))
      location.href = m.role === "HOUSEKEEPING" ? "/housekeeping" : "/dashboard"
    } catch (x: any) { setErr(x.message) } finally { setBusy(false) }
  }
  return <form className="login card" onSubmit={go}><h2>Hotel sign in</h2>
    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required />
    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
    {err && <div className="err">{err}</div>}<button disabled={busy} style={{ width: "100%" }}>{busy ? "Signing in…" : "Sign in"}</button></form>
}
