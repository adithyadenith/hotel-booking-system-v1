"use client"
import { useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api"

const paymentLabels: Record<string, string> = { FULL_PAYMENT: "Full payment online", DEPOSIT: "Deposit online", PAY_AT_HOTEL: "Pay at hotel" }

export default function Widget() {
  const [c, setC] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)
  const [err, setErr] = useState("")
  const [saved, setSaved] = useState("")
  const [copied, setCopied] = useState("")
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    Promise.all([api("/widget-config"), api("/widget-config/status")])
      .then(([config, status]) => { setC(config); setHealth(status) })
      .catch(e => setErr(e.message))
  }, [])

  const origin = typeof location !== "undefined" ? location.origin : ""
  const link = c ? `${origin}/book/${c.widgetKey}` : ""
  const embed = c ? `<script src="${origin}/widget.js" data-key="${c.widgetKey}"></script>` : ""
  const statusTone = health?.status === "READY" ? "ready" : health?.status === "ATTENTION" ? "attention" : "offline"
  const domainList = useMemo(() => (c?.allowedWidgetDomains || []).join("\n"), [c])

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value); setCopied(label); setTimeout(() => setCopied(""), 1600)
  }
  async function save(patch: any = {}) {
    try {
      const next = await api("/widget-config", { method: "PATCH", body: {
        widgetEnabled: c.widgetEnabled, brandColor: c.brandColor, widgetLogoUrl: c.widgetLogoUrl || "",
        widgetLayout: c.widgetLayout, widgetMinNights: Number(c.widgetMinNights), widgetAdvanceDays: Number(c.widgetAdvanceDays),
        widgetMaxGuests: Number(c.widgetMaxGuests), widgetPaymentMode: c.widgetPaymentMode, widgetDepositPercent: Number(c.widgetDepositPercent),
        widgetConfirmationMessage: c.widgetConfirmationMessage || null, widgetConfirmationEmail: c.widgetConfirmationEmail,
        allowedWidgetDomains: domainList.split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean), ...patch,
      } })
      setC((old: any) => ({ ...old, ...next })); setSaved("Saved"); setErr(""); setTimeout(() => setSaved(""), 1800)
      setHealth(await api("/widget-config/status"))
    } catch (e: any) { setErr(e.message) }
  }
  async function runTest() {
    setTesting(true); setErr("")
    try { await api("/widget-config/test", { method: "POST" }); window.open(`${link}?test=1`, "_blank", "noopener,noreferrer") }
    catch (e: any) { setErr(e.message) } finally { setTesting(false) }
  }
  if (!c) return <div className="muted">{err || "Loading booking widget settings..."}</div>

  return <div className="widget-page">
    <div className="widget-hero"><div><span className="booking-kicker">DIRECT BOOKINGS</span><h1>Booking widget</h1><p>Control how guests book, pay, and receive confirmations from your hotel website.</p></div><div className={`widget-health-pill ${statusTone}`}><i /> {health?.status === "READY" ? "Connected and ready" : health?.status === "ATTENTION" ? "Action needed" : "Offline"}</div></div>
    {err && <div className="err">{err}</div>}

    <section className="widget-control-bar"><div><span className="widget-control-icon">↗</span><div><strong>Online booking widget</strong><small>{c.widgetEnabled ? "Guests can currently make new reservations" : "New online reservations are paused"}</small></div></div><button className={`widget-toggle ${c.widgetEnabled ? "on" : ""}`} onClick={() => save({ widgetEnabled: !c.widgetEnabled })}><span /><b>{c.widgetEnabled ? "Enabled" : "Disabled"}</b></button></section>

    <div className="widget-layout-grid">
      <div>
        <section className="widget-card widget-preview-card"><div className="widget-section-heading"><div><span className="booking-kicker">LIVE PREVIEW</span><h2>See what your guests see</h2><p>The preview uses your current branding, rules, and payment settings.</p></div><div className="widget-heading-actions"><button className="widget-outline-btn widget-test-btn" onClick={runTest}>{testing ? "Opening..." : "Test booking"} <span>→</span></button><a className="widget-outline-btn" href={link} target="_blank" rel="noreferrer">Open full page ↗</a></div></div><div className="widget-preview-frame"><iframe title="Booking widget preview" src={`${link}?embed=1&preview=1`} /></div></section>

        <section className="widget-card"><div className="widget-section-heading"><div><span className="booking-kicker">APPEARANCE</span><h2>Widget settings</h2><p>Match the booking experience to the hotel website.</p></div></div><div className="widget-form-grid"><label><span>Accent color</span><div className="color-setting"><input type="color" value={c.brandColor} onChange={e => setC({ ...c, brandColor: e.target.value })} /><code>{c.brandColor}</code></div></label><label><span>Logo URL <em>optional</em></span><input value={c.widgetLogoUrl || ""} onChange={e => setC({ ...c, widgetLogoUrl: e.target.value })} placeholder="https://yourhotel.com/logo.png" /></label><label><span>Booking form layout</span><select value={c.widgetLayout} onChange={e => setC({ ...c, widgetLayout: e.target.value })}><option value="STANDARD">Standard</option><option value="COMPACT">Compact</option><option value="SINGLE_PAGE">Single page</option></select></label></div></section>

        <section className="widget-card"><div className="widget-section-heading"><div><span className="booking-kicker">BOOKING RULES</span><h2>Set your selling rules</h2><p>These limits are enforced on every public booking request.</p></div></div><div className="widget-form-grid three"><label><span>Minimum nights</span><input type="number" min="1" max="30" value={c.widgetMinNights} onChange={e => setC({ ...c, widgetMinNights: e.target.value })} /></label><label><span>Advance booking days <em>0 = unlimited</em></span><input type="number" min="0" max="730" value={c.widgetAdvanceDays} onChange={e => setC({ ...c, widgetAdvanceDays: e.target.value })} /></label><label><span>Maximum guests</span><input type="number" min="1" max="40" value={c.widgetMaxGuests} onChange={e => setC({ ...c, widgetMaxGuests: e.target.value })} /></label></div></section>

        <section className="widget-card"><div className="widget-section-heading"><div><span className="booking-kicker">PAYMENTS</span><h2>Payment options</h2><p>Choose what guests must pay when they book online.</p></div></div><div className="payment-choice-grid">{Object.entries(paymentLabels).map(([value, label]) => <button key={value} className={`payment-choice ${c.widgetPaymentMode === value ? "selected" : ""}`} onClick={() => setC({ ...c, widgetPaymentMode: value })}><span className="payment-choice-radio" /><strong>{label}</strong><small>{value === "FULL_PAYMENT" ? "Collect the complete booking total." : value === "DEPOSIT" ? "Collect a percentage now and the balance later." : "Confirm the reservation without online payment."}</small></button>)}</div>{c.widgetPaymentMode === "DEPOSIT" && <label className="deposit-field"><span>Deposit percentage</span><input type="number" min="1" max="100" value={c.widgetDepositPercent} onChange={e => setC({ ...c, widgetDepositPercent: e.target.value })} /><small>% of the booking total</small></label>}</section>

        <section className="widget-card"><div className="widget-section-heading"><div><span className="booking-kicker">CONFIRMATIONS</span><h2>Confirmation settings</h2><p>Customize the message sent after a direct booking is created.</p></div></div><label className="widget-checkbox"><input type="checkbox" checked={c.widgetConfirmationEmail} onChange={e => setC({ ...c, widgetConfirmationEmail: e.target.checked })} /><span><strong>Send booking confirmation email</strong><small>Uses the guest email address entered on the widget.</small></span></label><label className="widget-message-field"><span>Confirmation message</span><textarea rows={4} value={c.widgetConfirmationMessage || ""} onChange={e => setC({ ...c, widgetConfirmationMessage: e.target.value })} placeholder="Your reservation {ref} is confirmed. Total: {total}." /><small>Use <code>{"{ref}"}</code> and <code>{"{total}"}</code> as automatic placeholders.</small></label></section>
      </div>

      <aside>
        <section className="widget-card widget-status-card"><div className="widget-section-heading"><div><span className="booking-kicker">CONNECTION STATUS</span><h2>Widget health</h2></div><span className={`status-word ${statusTone}`}>{health?.status || "..."}</span></div><div className="widget-check-list">{(health?.checks || []).map((check: any) => <div key={check.key}><span className={check.ok ? "check-ok" : "check-bad"}>{check.ok ? "✓" : "!"}</span><span>{check.label}</span></div>)}</div><button className="widget-text-btn" onClick={() => api("/widget-config/status").then(setHealth).catch(e => setErr(e.message))}>Refresh status ↻</button></section>
        <section className="widget-card"><div className="widget-section-heading"><div><span className="booking-kicker">PUBLISH</span><h2>Connect your website</h2><p>Use either option on any hotel website.</p></div></div><div className="widget-field-label">SHAREABLE BOOKING LINK</div><div className="integration-code"><code>{link}</code><button onClick={() => copy(link, "link")}>{copied === "link" ? "Copied" : "Copy"}</button></div><div className="widget-field-label">EMBED CODE</div><div className="integration-code"><code>{embed}</code><button onClick={() => copy(embed, "embed")}>{copied === "embed" ? "Copied" : "Copy"}</button></div><div className="widget-help">Paste the embed code into WordPress, Wix, Squarespace, or a custom HTML block.</div></section>
        <section className="widget-card"><div className="widget-section-heading"><div><span className="booking-kicker">SECURITY</span><h2>Allowed websites</h2><p>Only these origins can embed the widget. Leave empty while developing locally.</p></div></div><textarea className="widget-domain-textarea" rows={5} value={domainList} onChange={e => setC({ ...c, allowedWidgetDomains: e.target.value.split(/\r?\n/) })} placeholder="https://www.yourhotel.com" /><small className="widget-help">Enter one complete HTTPS origin per line.</small></section>
      </aside>
    </div>
    <div className="widget-save-bar"><span>{saved || "Changes are saved when you click Save settings."}</span><button onClick={() => save()}>Save settings</button></div>
  </div>
}
