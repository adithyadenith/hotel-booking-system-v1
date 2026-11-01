"use client"

import { useState } from "react"
import { api, session } from "@/lib/api"

const roleName = (role?: string) => ({ ADMIN: "Administrator", MANAGER: "Manager", RECEPTIONIST: "Front desk", HOUSEKEEPING: "Room cleaning" } as Record<string, string>)[role || ""] || "Staff member"

export default function AccountPage() {
  const current = session()
  const [name, setName] = useState(current?.name || "")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setError(""); setNotice(""); setSavingProfile(true)
    try {
      const user = await api("/auth/profile", { method: "PATCH", body: { name } })
      if (current) localStorage.setItem("m89", JSON.stringify({ ...current, name: user.name }))
      setNotice("Your profile has been updated.")
    } catch (e: any) { setError(e.message) } finally { setSavingProfile(false) }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault(); setError(""); setNotice("")
    if (newPassword.length < 10) { setError("Use at least 10 characters for the new password."); return }
    if (newPassword !== confirmPassword) { setError("The new password and confirmation do not match."); return }
    setSavingPassword(true)
    try {
      await api("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } })
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("")
      setNotice("Password changed successfully. Keep it private and do not share it with other staff.")
    } catch (e: any) { setError(e.message) } finally { setSavingPassword(false) }
  }

  const initials = (current?.name || "U").split(" ").map(x => x[0]).slice(0, 2).join("").toUpperCase()
  return <main className="account-page">
    <header className="account-hero"><div><span>MY ACCOUNT</span><h1>Profile & security</h1><p>Keep your staff details and sign-in password up to date.</p></div><div className="account-identity"><b>{initials}</b><span><strong>{current?.name || "Hotel staff"}</strong><small>{roleName(current?.role)} · {current?.hotelName || "Your hotel"}</small></span></div></header>
    {(error || notice) && <div className={error ? "account-message error" : "account-message success"} role="alert">{error || notice}</div>}
    <div className="account-grid">
      <section className="account-card"><div className="account-card-heading"><span>01</span><div><h2>Your profile</h2><p>The name shown to colleagues in hotel activity records.</p></div></div><form onSubmit={saveProfile}><label>Full name<input value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={80} required /></label><label>Email address<input value={current?.email || "Your sign-in email"} disabled /></label><button disabled={savingProfile}>{savingProfile ? "Saving…" : "Save profile"}</button></form></section>
      <section className="account-card"><div className="account-card-heading"><span>02</span><div><h2>Change password</h2><p>Use a unique password with at least 10 characters.</p></div></div><form onSubmit={changePassword}><label>Current password<input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" required /></label><label>New password<input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" minLength={10} required /></label><label>Confirm new password<input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={10} required /></label><button disabled={savingPassword}>{savingPassword ? "Changing password…" : "Change password"}</button></form></section>
    </div>
  </main>
}
