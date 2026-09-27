import { useState } from "react"
import { apiFetch } from "../App"

export default function AuthModal({ initialMode = "login", onClose, onSuccess }) {
  const [mode, setMode] = useState(initialMode)
  const [form, setForm] = useState({ username: "", password: "", team: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  function update(field, val) { setForm(f => ({ ...f, [field]: val })); setError("") }

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError("")
    try {
      const fd = new FormData()
      fd.append("username", form.username.trim())
      fd.append("password", form.password)
      if (mode === "register") fd.append("team", form.team.trim() || form.username.trim())
      const data = await apiFetch(`/auth/${mode}`, { method: "POST", body: fd })
      onSuccess(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
    >
      <div style={{ background: "var(--color-background-primary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)", padding: "28px", width: "360px", maxWidth: "90vw" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <p style={{ fontSize: "16px", fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 2px" }}>
              {mode === "login" ? "Sign in to your account" : "Create an account"}
            </p>
            <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: 0 }}>
              {mode === "login" ? "Access your saved projects" : "Save projects and isolate your files"}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", padding: "4px" }}>
            <i className="ti ti-x" style={{ fontSize: "18px" }} aria-hidden="true" />
          </button>
        </div>

        <div style={{ display: "flex", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "3px", marginBottom: "18px" }}>
          {[["login", "Sign in"], ["register", "Create account"]].map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setError("") }} style={{
              flex: 1, padding: "6px", border: "none", borderRadius: "6px", fontSize: "13px",
              cursor: "pointer", fontWeight: mode === m ? 500 : 400,
              background: mode === m ? "var(--color-background-primary)" : "transparent",
              color: mode === m ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              boxShadow: mode === m ? "0 0 0 0.5px var(--color-border-secondary)" : "none",
            }}>{label}</button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Username</label>
            <input value={form.username} onChange={e => update("username", e.target.value)}
              placeholder="e.g. qa_team_1" required autoFocus style={{ width: "100%" }} />
          </div>
          {mode === "register" && (
            <div>
              <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>
                Team name <span style={{ color: "var(--color-text-tertiary)" }}>(optional)</span>
              </label>
              <input value={form.team} onChange={e => update("team", e.target.value)}
                placeholder="e.g. QA Team — Americold" style={{ width: "100%" }} />
            </div>
          )}
          <div>
            <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Password</label>
            <input type="password" value={form.password} onChange={e => update("password", e.target.value)}
              placeholder="••••••••" required style={{ width: "100%" }} />
          </div>

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 10px", background: "var(--color-background-danger)", borderRadius: "var(--border-radius-md)", fontSize: "12px", color: "var(--color-text-danger)" }}>
              <i className="ti ti-alert-circle" style={{ fontSize: "14px", flexShrink: 0 }} aria-hidden="true" />
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            padding: "9px", marginTop: "4px",
            background: "var(--color-text-primary)", color: "var(--color-background-primary)",
            border: "none", borderRadius: "var(--border-radius-md)", fontSize: "14px",
            fontWeight: 500, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}>
            <i className={`ti ${loading ? "ti-loader" : mode === "login" ? "ti-login" : "ti-user-plus"}`} style={{ fontSize: "14px" }} aria-hidden="true" />
            {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account & sign in"}
          </button>
        </form>

        {mode === "register" && (
          <p style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "12px", textAlign: "center" }}>
            Your files and projects will be private to your account.
          </p>
        )}
      </div>
    </div>
  )
}
