import { useState, useEffect } from "react"
import { useAuth, useProject } from "../App"

const API = "http://localhost:8080/api"

function AccuracyPanel({ projectId, token }) {
  const [scores, setScores] = useState(null)
  useEffect(() => {
    fetch(`${API}/projects/${projectId}/download/generation_accuracy.json`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    ).then(r => r.json()).then(setScores).catch(() => {})
  }, [projectId])
  if (!scores) return null
  const flows = Object.values(scores)
  const avgOverall = flows.length
    ? Math.round(flows.reduce((a, f) => a + (f.overall_generation_confidence || 0), 0) / flows.length * 100)
    : 0
  const reviewCount = flows.filter(f => Math.round((f.overall_generation_confidence || 0) * 100) < 80).length
  return (
    <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "18px 20px", marginBottom: "20px" }}>
      {reviewCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "#fdf3e3", border: "1px solid #f0c080", borderRadius: "8px", marginBottom: "14px" }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: "18px", color: "#a06020", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#7a4810" }}>
            {reviewCount} script{reviewCount > 1 ? "s" : ""} require manual review (AI confidence &lt; 80%)
          </span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: avgOverall >= 80 ? "#eaf3e6" : "#fdf3e3", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className="ti ti-chart-pie" style={{ fontSize: "16px", color: avgOverall >= 80 ? "#2e6b24" : "#a06020" }} aria-hidden="true" />
        </div>
        <div>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>
            Generation accuracy — avg {avgOverall}% <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--color-text-tertiary)" }}>(threshold: 80% · below = manual review)</span>
          </p>
          <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: 0 }}>AI confidence in the quality of generated scripts</p>
        </div>
      </div>
      {flows.map(flow => {
        const overall = Math.round((flow.overall_generation_confidence || 0) * 100)
        const color = overall >= 80 ? "#2e6b24" : overall >= 60 ? "#a06020" : "#8a1a1a"
        const needsReview = overall < 80
        return (
          <div key={flow.flow} style={{ marginBottom: "12px", padding: "12px 14px", background: needsReview ? "#fff8f0" : "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", border: needsReview ? "1px solid #f0c080" : "none" }}>
            {needsReview && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px", padding: "6px 10px", background: "#fdf3e3", borderRadius: "6px", border: "1px solid #f0c080" }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: "13px", color: "#a06020", flexShrink: 0 }} />
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#7a4810" }}>
                  Manual Review Required — AI confidence {overall}%
                </span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>{flow.flow}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                  background: overall >= 80 ? "#eaf3e6" : overall >= 60 ? "#fdf3e3" : "#fce8e8", color }}>
                  <i className="ti ti-brain" style={{ fontSize: "10px", marginRight: "3px" }} />
                  AI {overall}%
                </span>
                <span style={{ fontSize: "14px", fontWeight: 700, color }}>{overall}%</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: flow.issues?.length > 0 ? "8px" : "0" }}>
              {[
                { label: "Scenario coverage", val: flow.scenario_coverage_score },
                { label: "Step accuracy",     val: flow.step_accuracy_score },
                { label: "Data completeness", val: flow.data_completeness_score },
                { label: "Step def quality",  val: flow.step_def_completeness_score },
              ].map(m => {
                const pct = Math.round((m.val || 0) * 100)
                const mc = pct >= 80 ? "#2e6b24" : pct >= 60 ? "#a06020" : "#8a1a1a"
                const mb = pct >= 80 ? "#eaf3e6" : pct >= 60 ? "#fdf3e3" : "#fce8e8"
                return (
                  <div key={m.label} style={{ background: mb, borderRadius: "6px", padding: "6px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: mc }}>{pct}%</div>
                    <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{m.label}</div>
                  </div>
                )
              })}
            </div>
            {flow.issues?.length > 0 && (
              <div style={{ marginTop: "6px" }}>
                {flow.issues.map((issue, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "6px", fontSize: "11px", color: "#a06020", marginBottom: "2px" }}>
                    <i className="ti ti-alert-circle" style={{ fontSize: "12px", flexShrink: 0, marginTop: "1px" }} aria-hidden="true" />
                    {issue}
                  </div>
                ))}
              </div>
            )}
            {flow.strengths?.length > 0 && (
              <div style={{ marginTop: "4px" }}>
                {flow.strengths.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "6px", fontSize: "11px", color: "#2e6b24", marginBottom: "2px" }}>
                    <i className="ti ti-check" style={{ fontSize: "12px", flexShrink: 0, marginTop: "1px" }} aria-hidden="true" />
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function GeneratedScripts() {
  const { user } = useAuth()
  const { project } = useProject()
  const [files, setFiles] = useState([])
  const [loadError, setLoadError] = useState("")
  const [downloading, setDownloading] = useState({})
  const [downloadingAll, setDownloadingAll] = useState(false)

  // Reload every time the tab is visited by using a random key on mount
  useEffect(() => { if (project) loadFiles() }, [project])
  useEffect(() => { if (project) loadFiles() }, [])

  function authHeaders() {
    const h = {}
    if (user?.token) h["Authorization"] = `Bearer ${user.token}`
    return h
  }

  async function loadFiles() {
    setLoadError("")
    try {
      const res = await fetch(`${API}/projects/${project.id}/generated-files`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setFiles(Array.isArray(data) ? data : [])
    } catch (e) {
      setLoadError(e.message)
    }
  }

  async function downloadFile(name) {
    setDownloading(d => ({ ...d, [name]: true }))
    try {
      const res = await fetch(
        `${API}/projects/${project.id}/download/${encodeURIComponent(name)}`,
        { headers: authHeaders() }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `Server error ${res.status}` }))
        throw new Error(err.detail || `Download failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Could not download "${name}": ${e.message}`)
    } finally {
      setDownloading(d => ({ ...d, [name]: false }))
    }
  }

  async function downloadAll() {
    setDownloadingAll(true)
    try {
      const res = await fetch(
        `${API}/projects/${project.id}/download-all`,
        { headers: authHeaders() }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `Server error ${res.status}` }))
        throw new Error(err.detail || `Download failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `generated_scripts_${project.id}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Could not download zip: ${e.message}`)
    } finally {
      setDownloadingAll(false)
    }
  }

  const features  = files.filter(f => f.name.endsWith(".feature"))
  const stepdefs  = files.filter(f => f.name.endsWith(".py"))
  const jsonFiles = files.filter(f => f.name.endsWith(".json"))
  const fmtSize   = b => b < 1024 ? `${b}B` : b < 1048576 ? `${Math.round(b / 1024)}KB` : `${(b / 1048576).toFixed(1)}MB`

  function FileRow({ file, accent, bg, label }) {
    const isLoading = downloading[file.name]
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: "12px", padding: "11px 16px",
        transition: "background 0.1s",
      }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        <div style={{ width: "30px", height: "30px", borderRadius: "var(--border-radius-md)", background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="ti ti-file-code" style={{ fontSize: "15px", color: accent }} aria-hidden="true" />
        </div>
        <span style={{ flex: 1, fontSize: "13px", color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
        <span style={{ fontSize: "12px", color: "var(--color-text-tertiary)", flexShrink: 0 }}>{fmtSize(file.size)}</span>
        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "999px", background: bg, color: accent, fontWeight: 500, flexShrink: 0 }}>{label}</span>
        <button
          onClick={() => downloadFile(file.name)}
          disabled={isLoading}
          title={`Download ${file.name}`}
          style={{
            display: "flex", alignItems: "center", gap: "4px", padding: "5px 10px",
            background: isLoading ? "var(--color-background-secondary)" : "transparent",
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: "var(--border-radius-md)", cursor: isLoading ? "wait" : "pointer",
            color: "var(--color-text-secondary)", fontSize: "12px", flexShrink: 0,
          }}
          onMouseEnter={e => !isLoading && (e.currentTarget.style.borderColor = accent)}
          onMouseLeave={e => !isLoading && (e.currentTarget.style.borderColor = "var(--color-border-secondary)")}
        >
          <i className={`ti ${isLoading ? "ti-loader" : "ti-download"}`} style={{ fontSize: "13px" }} aria-hidden="true" />
          {isLoading ? "..." : "Download"}
        </button>
      </div>
    )
  }

  function FileGroup({ title, accent, bg, label, fileList }) {
    if (!fileList.length) return null
    return (
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <div style={{ width: "24px", height: "24px", borderRadius: "6px", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="ti ti-file-code" style={{ fontSize: "13px", color: accent }} aria-hidden="true" />
          </div>
          <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>
            {title}
            <span style={{ marginLeft: "8px", fontSize: "11px", padding: "1px 7px", borderRadius: "999px", background: bg, color: accent, fontWeight: 500 }}>{fileList.length}</span>
          </p>
        </div>
        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", background: "var(--color-background-primary)" }}>
          {fileList.map((f, i) => (
            <div key={f.name} style={{ borderBottom: i < fileList.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
              <FileRow file={f} accent={accent} bg={bg} label={label} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: "800px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "28px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 500, margin: "0 0 6px" }}>Generated scripts</h1>
          <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", margin: 0 }}>
            Download the AI-generated feature files and step definitions for uncovered flows.
          </p>
        </div>
        {files.length > 0 && (
          <button onClick={downloadAll} disabled={downloadingAll} style={{
            display: "flex", alignItems: "center", gap: "7px", padding: "9px 18px", flexShrink: 0,
            background: downloadingAll ? "var(--color-background-secondary)" : "var(--color-text-primary)",
            color: downloadingAll ? "var(--color-text-secondary)" : "var(--color-background-primary)",
            border: "none", borderRadius: "var(--border-radius-md)", fontSize: "13px",
            cursor: downloadingAll ? "wait" : "pointer", fontWeight: 500,
          }}>
            <i className={`ti ${downloadingAll ? "ti-loader" : "ti-package"}`} style={{ fontSize: "15px" }} aria-hidden="true" />
            {downloadingAll ? "Preparing zip..." : `Download all (${files.length} files)`}
          </button>
        )}
      </div>

      {loadError && (
        <div style={{ display: "flex", gap: "8px", padding: "12px 16px", background: "#FCEBEB", border: "0.5px solid #F09595", borderRadius: "var(--border-radius-md)", marginBottom: "20px", fontSize: "13px", color: "#791F1F" }}>
          <i className="ti ti-alert-circle" style={{ fontSize: "15px", flexShrink: 0 }} aria-hidden="true" />
          <span style={{ flex: 1 }}>{loadError}</span>
          <button onClick={loadFiles} style={{ background: "none", border: "none", cursor: "pointer", color: "#791F1F", fontSize: "12px", fontWeight: 500 }}>Retry</button>
        </div>
      )}

      {files.length === 0 && !loadError ? (
        <div style={{ background: "var(--color-background-secondary)", border: "0.5px dashed var(--color-border-secondary)", borderRadius: "var(--border-radius-lg)", padding: "56px 20px", textAlign: "center" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "var(--color-background-primary)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <i className="ti ti-code" style={{ fontSize: "26px", color: "var(--color-text-tertiary)" }} aria-hidden="true" />
          </div>
          <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 6px" }}>No scripts generated yet</p>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0 }}>
            Run gap analysis first, then click Generate scripts on the Analysis page.
          </p>
        </div>
      ) : (
        <>
          {files.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "24px" }}>
              {[
                { label: "Feature files",    value: features.length,  color: "#0F6E56", bg: "#E1F5EE" },
                { label: "Step def files",   value: stepdefs.length,  color: "#185FA5", bg: "#E6F1FB" },
                { label: "Test data files",  value: jsonFiles.length, color: "#6B3FB6", bg: "#EDE9FB" },
              ].map(c => (
                <div key={c.label} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "16px 18px" }}>
                  <div style={{ fontSize: "26px", fontWeight: 500, color: c.color, lineHeight: 1, marginBottom: "4px" }}>{c.value}</div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{c.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Generation Accuracy Scores */}
          {files.find(f => f.name === "generation_accuracy.json") && (
            <AccuracyPanel projectId={project.id} token={user?.token} />
          )}

          <FileGroup title="Feature files"         accent="#0F6E56" bg="#E1F5EE" label="Feature"  fileList={features} />
          <FileGroup title="Step definition files" accent="#185FA5" bg="#E6F1FB" label="Step def" fileList={stepdefs} />
          <FileGroup title="Test data"             accent="#6B3FB6" bg="#EDE9FB" label="JSON"     fileList={jsonFiles.filter(f => f.name !== "generation_accuracy.json")} />

          <div style={{ background: "#EEF6FF", border: "0.5px solid #B5D4F4", borderRadius: "var(--border-radius-lg)", padding: "16px 20px", marginTop: "20px" }}>
            <p style={{ fontSize: "13px", fontWeight: 500, color: "#185FA5", margin: "0 0 8px", display: "flex", alignItems: "center", gap: "6px" }}>
              <i className="ti ti-info-circle" style={{ fontSize: "15px" }} aria-hidden="true" />
              Next steps
            </p>
            <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: "13px", color: "#2C5282", lineHeight: "2" }}>
              <li>Place <strong>.feature</strong> files in your <code>features/messageCenter/</code> folder</li>
              <li>Place <strong>test_*.py</strong> files in your <code>tests/</code> folder alongside existing step defs</li>
              <li>Merge <strong>new_test_data.json</strong> entries into your existing <code>messageCenter.json</code></li>
              <li>Fill in the <code># TODO: implement</code> step bodies using your locators and <code>CustomPyAutoWeb</code></li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}