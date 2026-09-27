import { useState, useEffect } from "react"
import { useAuth, useProject, apiFetch } from "../App"

function StatCard({ label, value, sub, color, bg, icon }) {
  return (
    <div style={{
      background: bg || "#ffffff", borderRadius: "14px", padding: "20px 22px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
      border: "1px solid rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: "8px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: "11px", fontWeight: 600, color: color || "#9a968e", margin: 0, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</p>
        {icon && <i className={`ti ${icon}`} style={{ fontSize: "16px", color: color || "#9a968e", opacity: 0.6 }} aria-hidden="true" />}
      </div>
      <p style={{ fontSize: "32px", fontWeight: 700, color: color || "#1a1a1a", margin: 0, lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</p>
      {sub && <p style={{ fontSize: "12px", color: "#9a968e", margin: 0 }}>{sub}</p>}
    </div>
  )
}

function ActionCard({ icon, label, desc, onClick, accent, bg }) {
  return (
    <div onClick={onClick} style={{
      background: "#ffffff", border: "1px solid rgba(0,0,0,0.06)",
      borderRadius: "14px", padding: "20px", cursor: "pointer",
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      transition: "all 0.15s", display: "flex", flexDirection: "column", gap: "12px",
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.1)"; e.currentTarget.style.transform = "translateY(-2px)" }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "none" }}
    >
      <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: bg || accent + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <i className={`ti ${icon}`} style={{ fontSize: "20px", color: accent }} aria-hidden="true" />
      </div>
      <div>
        <p style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", margin: "0 0 4px", letterSpacing: "-0.01em" }}>{label}</p>
        <p style={{ fontSize: "12px", color: "#9a968e", margin: 0 }}>{desc}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: accent, fontWeight: 600, marginTop: "auto" }}>
        Open <i className="ti ti-arrow-right" style={{ fontSize: "13px" }} aria-hidden="true" />
      </div>
    </div>
  )
}

export default function Dashboard({ setPage, currentPage }) {
  const { user } = useAuth()
  const { project } = useProject()
  const [analysis, setAnalysis] = useState(null)
  const [files, setFiles] = useState([])

  async function loadData() {
    if (!project) return
    // Load all uploaded files
    const fileData = await apiFetch(`/projects/${project.id}/files`, {}, user?.token).catch(() => [])
    const jiraCount = fileData.filter(f => f.type === "jira").length
    const featCount = fileData.filter(f => f.type === "features").length

    // If EITHER side is missing, wipe everything and reset state
    if (jiraCount === 0 || featCount === 0) {
      await apiFetch(`/projects/${project.id}/clear-analysis`, { method: "DELETE" }, user?.token).catch(() => {})
      // Re-fetch files after wipe to get true empty state
      const freshFiles = await apiFetch(`/projects/${project.id}/files`, {}, user?.token).catch(() => [])
      setFiles(freshFiles)
      setAnalysis(null)
    } else {
      setFiles(fileData)
      apiFetch(`/projects/${project.id}/analysis`, {}, user?.token)
        .then(setAnalysis).catch(() => setAnalysis(null))
    }
  }

  // Re-fetch every time page is visited or project changes
  useEffect(() => { loadData() }, [project, currentPage])

  const s = analysis?.summary || {}
  const pct = s.coverage_pct || 0
  const jiraCount = files.filter(f => f.type === "jira").length
  const featCount = files.filter(f => f.type === "features").length
  const hasAnalysis = s.total > 0

  return (
    <div style={{ maxWidth: "960px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 700, margin: "0 0 6px", color: "#1a1a1a", letterSpacing: "-0.02em" }}>
          Dashboard
        </h1>
        <p style={{ fontSize: "14px", color: "#9a968e", margin: 0 }}>
          Upload Jira regression files and feature files — AI analyses coverage gaps and generates missing scripts.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "28px" }}>
        <StatCard label="Jira files"     value={jiraCount}         sub="uploaded"         color="#1a4f8a" icon="ti-table" />
        <StatCard label="Feature files"  value={featCount}         sub="uploaded"         color="#2e6b24" icon="ti-file-code" />
        <StatCard label="Total TCs"      value={s.total || "—"}    sub={hasAnalysis ? "from Jira" : "run analysis"} color="#1a1a1a" icon="ti-list-check" />
        <StatCard label="Coverage"
          value={hasAnalysis ? `${pct}%` : "—"}
          sub={hasAnalysis ? `${s.covered} covered · ${s.uncovered} gaps` : "not yet run"}
          color={hasAnalysis ? (pct >= 80 ? "#2e6b24" : "#a06020") : "#9a968e"}
          bg={hasAnalysis ? (pct >= 80 ? "#eaf3e6" : "#fdf3e3") : "#ffffff"}
          icon="ti-chart-pie"
        />
      </div>

      {hasAnalysis && (
        <div style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: "14px", padding: "18px 22px", marginBottom: "28px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>Coverage progress</span>
            <span style={{ fontSize: "13px", fontWeight: 700, color: pct >= 80 ? "#2e6b24" : "#a06020" }}>{pct}%</span>
          </div>
          <div style={{ height: "8px", background: "#f0ede8", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? "linear-gradient(90deg,#4a7c3f,#6aac5f)" : "linear-gradient(90deg,#c8a96e,#e8c87a)", borderRadius: "4px", transition: "width 0.6s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
            <span style={{ fontSize: "11px", color: "#9a968e" }}>{s.covered} TCs covered</span>
            <span style={{ fontSize: "11px", color: "#9a968e" }}>{s.uncovered} gaps remaining</span>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "28px" }}>
        <ActionCard icon="ti-upload"    label="Upload Jira"     desc="Excel or CSV exports"      accent="#1a4f8a" bg="#e8f0fb" onClick={() => setPage("upload")} />
        <ActionCard icon="ti-file-code" label="Feature files"   desc="Upload or paste .feature"  accent="#2e6b24" bg="#eaf3e6" onClick={() => setPage("features")} />
        <ActionCard icon="ti-chart-bar" label="Gap analysis"    desc="AI-powered coverage check" accent="#a06020" bg="#fdf3e3" onClick={() => setPage("analysis")} />
        <ActionCard icon="ti-download"  label="Get scripts"     desc="Download generated files"  accent="#6b3fb6" bg="#f0ebfc" onClick={() => setPage("scripts")} />
      </div>

      {analysis?.uncovered_flows && Object.keys(analysis.uncovered_flows).length > 0 && (
        <div style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: "14px", padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
            <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "#fdf3e3", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: "15px", color: "#a06020" }} aria-hidden="true" />
            </div>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", margin: 0 }}>
              Uncovered flow groups
              <span style={{ marginLeft: "8px", fontSize: "11px", padding: "2px 8px", borderRadius: "999px", background: "#fdf3e3", color: "#a06020", fontWeight: 600 }}>
                {Object.keys(analysis.uncovered_flows).length}
              </span>
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {Object.entries(analysis.uncovered_flows).map(([flow, tcs]) => (
              <span key={flow} style={{ padding: "5px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 500, background: "#fdf3e3", color: "#7a4810", border: "1px solid rgba(200,169,110,0.3)" }}>
                {flow} <span style={{ opacity: 0.6 }}>({tcs.length})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {!hasAnalysis && (
        <div style={{ background: "#ffffff", border: "1.5px dashed rgba(0,0,0,0.1)", borderRadius: "14px", padding: "48px 20px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "#f0ede8", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <i className="ti ti-chart-dots" style={{ fontSize: "26px", color: "#c8a96e" }} aria-hidden="true" />
          </div>
          <p style={{ fontSize: "16px", fontWeight: 600, color: "#1a1a1a", margin: "0 0 6px" }}>No analysis run yet</p>
          <p style={{ fontSize: "13px", color: "#9a968e", margin: "0 0 18px" }}>Upload your Jira files and feature files, then run a gap analysis.</p>
          <button onClick={() => setPage("upload")} style={{
            padding: "9px 22px", background: "linear-gradient(135deg,#c8a96e,#e8c87a)", color: "#1a1a1a",
            border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
            boxShadow: "0 2px 8px rgba(200,169,110,0.3)",
          }}>
            Start by uploading files
          </button>
        </div>
      )}
    </div>
  )
}