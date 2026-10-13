"use client"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
export default function Widget() {
  const [c, setC] = useState<any>(null), [err, setErr] = useState(""), [color, setColor] = useState("#2563EB"), [domains, setDomains] = useState("")
  useEffect(() => { api("/widget-config").then(x => { setC(x); setColor(x.brandColor); setDomains((x.allowedWidgetDomains || []).join("\n")) }).catch(e => setErr(e.message)) }, [])
  if (!c) return <div className="muted">{err || "Loading…"}</div>
  const o = typeof location !== "undefined" ? location.origin : ""
  const link = o + "/book/" + c.widgetKey, embed = '<script src="' + o + '/widget.js" data-key="' + c.widgetKey + '"></script>'
  const Box = ({ t }: { t: string }) => <div className="row"><input readOnly value={t} style={{ flex: 1, minWidth: 260 }} onFocus={e => e.target.select()} /><button className="sec" onClick={() => navigator.clipboard.writeText(t)}>Copy</button></div>
  return <><h1>Booking widget</h1>{err && <div className="err">{err}</div>}
    <div className="card"><h3>Hosted booking page</h3><Box t={link} /><a href={link} target="_blank" className="btn" rel="noreferrer">Open</a></div>
    <div className="card" style={{ marginTop: 16 }}><h3>Embed on your hotel website</h3><p className="muted">Paste where the booking form should appear.</p><Box t={embed} /></div>
    <div className="card" style={{ marginTop: 16 }}><h3>Branding & allowed domains</h3><p className="muted">Add one full origin per line, for example https://www.oceanpearl.lk. When at least one domain is listed, other browser origins are rejected.</p>
      <div className="row"><input type="color" value={color} onChange={e => setColor(e.target.value)} /><button onClick={async () => { try { const x = await api("/widget-config", { method: "PATCH", body: { brandColor: color, allowedWidgetDomains: domains.split(/\r?\n/).map(x => x.trim()).filter(Boolean) } }); setC({ ...c, ...x }); setDomains((x.allowedWidgetDomains || []).join("\n")); setErr("") } catch (e: any) { setErr(e.message) } }}>Save settings</button></div>
      <textarea rows={4} value={domains} onChange={e => setDomains(e.target.value)} style={{ width: "100%", maxWidth: 600, padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }} /></div></>
}
