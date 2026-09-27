import { useState, useEffect } from "react"
import { useAuth, useProject, apiFetch } from "../App"

function Badge({ label, color, bg }) {
  return (
    <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "999px", fontWeight: 600, background: bg, color, flexShrink: 0 }}>
      {label}
    </span>
  )
}

function Section({ title, icon, count, color, bg, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!count) return null
  return (
    <div style={{ marginBottom: "12px", border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", background: "var(--color-background-primary)" }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", cursor: "pointer", background: bg + "44" }}>
        <i className={`ti ${icon}`} style={{ fontSize: "15px", color }} aria-hidden="true" />
        <span style={{ flex: 1, fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>{title}</span>
        <Badge label={count} color={color} bg={bg} />
        <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ fontSize: "13px", color: "var(--color-text-tertiary)" }} aria-hidden="true" />
      </div>
      {open && <div style={{ borderTop: "1px solid var(--color-border-tertiary)" }}>{children}</div>}
    </div>
  )
}

function ConfidencePill({ score, reason }) {
  if (score === undefined || score === null) return null
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? "#2e6b24" : pct >= 50 ? "#a06020" : "#8a1a1a"
  const bg    = pct >= 80 ? "#eaf3e6" : pct >= 50 ? "#fdf3e3" : "#fce8e8"
  return (
    <span title={reason || `Confidence: ${pct}%`} style={{
      fontSize: "11px", padding: "2px 8px", borderRadius: "999px", fontWeight: 600,
      background: bg, color, cursor: reason ? "help" : "default", flexShrink: 0,
      display: "flex", alignItems: "center", gap: "3px",
    }}>
      <i className="ti ti-chart-pie" style={{ fontSize: "10px" }} aria-hidden="true" />
      {pct}%
    </span>
  )
}

function TcRow({ tc, showFile = true }) {
  const statusColor = tc.status === "COVERED" ? "#2e6b24" : tc.status === "INCOMPLETE" ? "#a06020" : "#8a1a1a"
  const statusBg    = tc.status === "COVERED" ? "#eaf3e6" : tc.status === "INCOMPLETE" ? "#fdf3e3" : "#fce8e8"
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "9px 16px", borderBottom: "1px solid var(--color-border-tertiary)", fontSize: "12px" }}>
      <span style={{ fontWeight: 600, color: "#1a4f8a", minWidth: "120px", flexShrink: 0 }}>{tc.key}</span>
      <span style={{ flex: 1, color: "var(--color-text-secondary)" }}>{tc.summary || tc.old_summary || tc.new_summary}</span>
      {showFile && tc.covered_by && <span style={{ color: "var(--color-text-tertiary)", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tc.covered_by}</span>}
      <ConfidencePill score={tc.analysis_confidence} reason={tc.confidence_reason} />
      {tc.status && <Badge label={tc.status} color={statusColor} bg={statusBg} />}
      {tc.alignment_note && tc.alignment_note !== "" && (
        <span title={tc.alignment_note} style={{ color: "#a06020", cursor: "help" }}>
          <i className="ti ti-alert-circle" style={{ fontSize: "13px" }} aria-hidden="true" />
        </span>
      )}
    </div>
  )
}

export default function Analysis({ setPage, currentPage }) {
  const { user } = useAuth()
  const { project } = useProject()
  const [analysis, setAnalysis]   = useState(null)
  const [running, setRunning]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [generatedFiles, setGeneratedFiles] = useState([])
  const [expandedFlows, setExpandedFlows] = useState({})

  useEffect(() => {
    if (!project) return
    async function loadAnalysis() {
      const fileData = await apiFetch(`/projects/${project.id}/files`, {}, user?.token).catch(() => [])
      const jiraCount = fileData.filter(f => f.type === "jira").length
      const featCount = fileData.filter(f => f.type === "features").length
      if (jiraCount === 0 || featCount === 0) {
        await apiFetch(`/projects/${project.id}/clear-analysis`, { method: "DELETE" }, user?.token).catch(() => {})
        setAnalysis(null); setGeneratedFiles([])
      } else {
        apiFetch(`/projects/${project.id}/analysis`, {}, user?.token).then(setAnalysis).catch(() => setAnalysis(null))
        apiFetch(`/projects/${project.id}/generated-files`, {}, user?.token).then(setGeneratedFiles).catch(() => setGeneratedFiles([]))
      }
    }
    loadAnalysis()
  }, [project, currentPage])

  async function runAnalysis() {
    setRunning(true)
    try {
      const result = await apiFetch(`/projects/${project.id}/analyze`, { method: "POST" }, user?.token)
      setAnalysis(result)
      setGeneratedFiles([])
    } catch (e) { alert(e.message) }
    finally { setRunning(false) }
  }

  async function generateScripts() {
    setGenerating(true)
    try {
      await apiFetch(`/projects/${project.id}/generate`, { method: "POST" }, user?.token)
      const files = await apiFetch(`/projects/${project.id}/generated-files`, {}, user?.token)
      setGeneratedFiles(files)
      setPage("scripts")
    } catch (e) { alert(e.message) }
    finally { setGenerating(false) }
  }

  async function exportReport() {
    setExporting(true)
    try {
      const res = await fetch(`http://localhost:8000/api/projects/${project.id}/report`, {
        method: "POST", headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {}
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = "coverage_report.docx"
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch (e) { alert(e.message) }
    finally { setExporting(false) }
  }

  const s = analysis?.summary || {}
  const pct = s.coverage_pct || 0
  const delta = analysis?.delta || {}
  const hasDelta = delta && delta.prev_coverage_pct !== undefined

  return (
    <div style={{ maxWidth: "900px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.02em" }}>Gap analysis</h1>
          <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", margin: 0 }}>
            Full 11-point coverage analysis — gaps, new requirements, data coverage, tailgate chains and more.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button onClick={runAnalysis} disabled={running} style={{
            display: "flex", alignItems: "center", gap: "6px", padding: "9px 18px",
            background: running ? "var(--color-background-secondary)" : "var(--color-text-primary)",
            color: running ? "var(--color-text-secondary)" : "var(--color-background-primary)",
            border: "none", borderRadius: "var(--border-radius-md)", fontSize: "13px", cursor: running ? "wait" : "pointer", fontWeight: 600,
          }}>
            <i className={`ti ${running ? "ti-loader" : "ti-refresh"}`} style={{ fontSize: "14px" }} aria-hidden="true" />
            {running ? "Running..." : "Run analysis"}
          </button>
          {analysis && <>
            <button onClick={generateScripts} disabled={generating} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 16px", border: "1px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "transparent", fontSize: "13px", cursor: "pointer", color: "var(--color-text-primary)", fontWeight: 500 }}>
              <i className={`ti ${generating ? "ti-loader" : "ti-code"}`} style={{ fontSize: "14px" }} aria-hidden="true" />
              {generating ? "Generating..." : "Generate scripts"}
            </button>
            <button onClick={exportReport} disabled={exporting} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 16px", border: "1px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "transparent", fontSize: "13px", cursor: "pointer", color: "var(--color-text-primary)", fontWeight: 500 }}>
              <i className={`ti ${exporting ? "ti-loader" : "ti-file-word"}`} style={{ fontSize: "14px" }} aria-hidden="true" />
              {exporting ? "Exporting..." : "Export report"}
            </button>
          </>}
        </div>
      </div>

      {!analysis ? (
        <div style={{ background: "var(--color-background-secondary)", border: "1.5px dashed var(--color-border-secondary)", borderRadius: "var(--border-radius-lg)", padding: "56px 20px", textAlign: "center" }}>
          <i className="ti ti-chart-bar" style={{ fontSize: "36px", color: "var(--color-text-tertiary)", display: "block", marginBottom: "12px" }} aria-hidden="true" />
          <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 6px" }}>No analysis run yet</p>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0 }}>Upload Jira files and feature files, then click Run analysis.</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "10px", marginBottom: "20px" }}>
            {[
              { label: "Total TCs",   value: s.total || 0,      color: "var(--color-text-primary)" },
              { label: "Covered",     value: s.covered || 0,    color: "#2e6b24" },
              { label: "Incomplete",  value: s.incomplete || 0, color: "#a06020" },
              { label: "Missing",     value: s.uncovered || 0,  color: "#8a1a1a" },
              { label: "Coverage",    value: `${pct}%`,         color: pct >= 80 ? "#2e6b24" : "#a06020" },
            ].map(c => (
              <div key={c.label} style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px", textAlign: "center" }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.value}</div>
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px 18px", marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "8px" }}>
              <span style={{ fontWeight: 500 }}>Coverage progress</span>
              <span style={{ fontWeight: 700, color: pct >= 80 ? "#2e6b24" : "#a06020" }}>{pct}%</span>
            </div>
            <div style={{ height: "6px", background: "#f0ede8", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? "linear-gradient(90deg,#4a7c3f,#6aac5f)" : "linear-gradient(90deg,#c8a96e,#e8c87a)", borderRadius: "3px" }} />
            </div>
          </div>

          {/* Analysis Accuracy Summary */}
          {analysis.tc_traceability && analysis.tc_traceability.length > 0 && (() => {
            const tcs = analysis.tc_traceability
            const scores = tcs.map(t => t.analysis_confidence ?? 0)
            const avg = Math.round(scores.reduce((a,b)=>a+b,0) / scores.length * 100)
            const high = tcs.filter(t => (t.analysis_confidence??0) >= 0.8).length
            const med  = tcs.filter(t => (t.analysis_confidence??0) >= 0.5 && (t.analysis_confidence??0) < 0.8).length
            const low  = tcs.filter(t => (t.analysis_confidence??0) < 0.5).length
            return (
              <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "16px 20px", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                  <i className="ti ti-chart-pie" style={{ fontSize: "18px", color: avg >= 80 ? "#2e6b24" : avg >= 60 ? "#a06020" : "#8a1a1a" }} aria-hidden="true" />
                  <div>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>Analysis accuracy — avg confidence {avg}%</p>
                    <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: 0 }}>Hover over any confidence badge to see why the AI gave that score</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0", height: "8px", borderRadius: "4px", overflow: "hidden", marginBottom: "8px" }}>
                  {high > 0 && <div style={{ flex: high, background: "#4a7c3f" }} title={`${high} high confidence (≥80%)`} />}
                  {med  > 0 && <div style={{ flex: med,  background: "#c8a96e" }} title={`${med} medium confidence (50-79%)`} />}
                  {low  > 0 && <div style={{ flex: low,  background: "#d05538" }} title={`${low} low confidence (<50%)`} />}
                </div>
                <div style={{ display: "flex", gap: "16px", fontSize: "11px" }}>
                  <span style={{ color: "#2e6b24", fontWeight: 500 }}>● {high} high ≥80%</span>
                  <span style={{ color: "#a06020", fontWeight: 500 }}>● {med} medium 50–79%</span>
                  <span style={{ color: "#8a1a1a", fontWeight: 500 }}>● {low} low &lt;50% — review manually</span>
                </div>
              </div>
            )
          })()}

          {/* Point 8: Before/After Delta */}
          {hasDelta && (
            <div style={{ background: delta.improvement ? "#eaf3e6" : "#fce8e8", border: `1px solid ${delta.improvement ? "#c0dd97" : "#f09595"}`, borderRadius: "var(--border-radius-lg)", padding: "14px 18px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
              <i className={`ti ${delta.improvement ? "ti-trending-up" : "ti-trending-down"}`} style={{ fontSize: "20px", color: delta.improvement ? "#2e6b24" : "#8a1a1a" }} aria-hidden="true" />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: delta.improvement ? "#2e6b24" : "#8a1a1a", margin: "0 0 2px" }}>
                  Coverage {delta.improvement ? "improved" : "decreased"} vs last run
                </p>
                <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: 0 }}>
                  {delta.prev_coverage_pct}% → {delta.curr_coverage_pct}% ({delta.pct_change > 0 ? "+" : ""}{delta.pct_change}%)
                  {delta.newly_covered_tcs?.length > 0 && ` · ${delta.newly_covered_tcs.length} newly covered`}
                  {delta.new_tcs_this_run?.length > 0 && ` · ${delta.new_tcs_this_run.length} new TCs added`}
                </p>
              </div>
            </div>
          )}

          {/* Point 1: New TCs */}
          <Section title="New requirements (Point 1)" icon="ti-sparkles" count={analysis.new_tcs?.length} color="#1a4f8a" bg="#e8f0fb">
            {analysis.new_tcs?.map((tc, i) => (
              <div key={tc.key} style={{ padding: "8px 16px", borderBottom: i < analysis.new_tcs.length - 1 ? "1px solid var(--color-border-tertiary)" : "none", display: "flex", gap: "10px", fontSize: "12px" }}>
                <span style={{ fontWeight: 600, color: "#1a4f8a", minWidth: "120px" }}>{tc.key}</span>
                <span style={{ color: "var(--color-text-secondary)" }}>{tc.summary}</span>
                <Badge label="NEW" color="#1a4f8a" bg="#e8f0fb" />
              </div>
            ))}
          </Section>

          {/* Point 2: Changed TCs */}
          <Section title="Changed requirements (Point 2)" icon="ti-edit" count={analysis.changed_tcs?.length} color="#6b3fb6" bg="#f0ebfc">
            {analysis.changed_tcs?.map((tc, i) => (
              <div key={tc.key} style={{ padding: "8px 16px", borderBottom: i < analysis.changed_tcs.length - 1 ? "1px solid var(--color-border-tertiary)" : "none", fontSize: "12px" }}>
                <div style={{ display: "flex", gap: "10px", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 600, color: "#6b3fb6", minWidth: "120px" }}>{tc.key}</span>
                  <Badge label="CHANGED" color="#6b3fb6" bg="#f0ebfc" />
                </div>
                <div style={{ color: "#8a1a1a", marginLeft: "130px" }}>Old: {tc.old_summary}</div>
                <div style={{ color: "#2e6b24", marginLeft: "130px" }}>New: {tc.new_summary}</div>
              </div>
            ))}
          </Section>

          {/* Point 3: Missing coverage */}
          <Section title="Missing coverage — no scripts (Point 3)" icon="ti-circle-x" count={analysis.uncovered_tcs?.length} color="#8a1a1a" bg="#fce8e8" defaultOpen>
            {Object.entries(analysis.uncovered_flows || {}).map(([flow, tcs]) => (
              <div key={flow}>
                <div onClick={() => setExpandedFlows(p => ({ ...p, [flow]: !p[flow] }))} style={{ padding: "8px 16px", background: "#fef8f8", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <i className={`ti ti-chevron-${expandedFlows[flow] ? "up" : "down"}`} style={{ fontSize: "13px" }} aria-hidden="true" />
                  <span style={{ flex: 1, fontSize: "12px", fontWeight: 500 }}>{flow}</span>
                  <Badge label={`${tcs.length} TCs`} color="#8a1a1a" bg="#fce8e8" />
                </div>
                {expandedFlows[flow] && tcs.map(tc => <TcRow key={tc.key} tc={tc} showFile={false} />)}
              </div>
            ))}
          </Section>

          {/* Point 9: Incomplete coverage */}
          <Section title="Incomplete coverage — missing validation (Point 9)" icon="ti-alert-triangle" count={analysis.incomplete_tcs?.length} color="#a06020" bg="#fdf3e3">
            {analysis.incomplete_tcs?.map(tc => <TcRow key={tc.key} tc={tc} />)}
          </Section>

          {/* Point 6: Test data gaps */}
          <Section title="Test data coverage gaps (Point 6)" icon="ti-database" count={analysis.data_gaps?.length} color="#6b3fb6" bg="#f0ebfc">
            {analysis.data_gaps?.map((tc, i) => (
              <div key={tc.key} style={{ padding: "9px 16px", borderBottom: i < analysis.data_gaps.length - 1 ? "1px solid var(--color-border-tertiary)" : "none", display: "flex", gap: "10px", fontSize: "12px" }}>
                <span style={{ fontWeight: 600, color: "#6b3fb6", minWidth: "120px" }}>{tc.key}</span>
                <span style={{ flex: 1, color: "var(--color-text-secondary)" }}>{tc.summary}</span>
                <span style={{ color: "#a06020" }}>{tc.note || "Only 1 test data row — needs multiple variations"}</span>
              </div>
            ))}
          </Section>

          {/* Point 7: Tailgate issues */}
          <Section title="Tailgate dependency issues (Point 7)" icon="ti-link" count={analysis.tailgate_issues?.length} color="#854F0B" bg="#fdf3e3">
            {analysis.tailgate_issues?.map((t, i) => (
              <div key={i} style={{ padding: "9px 16px", borderBottom: i < analysis.tailgate_issues.length - 1 ? "1px solid var(--color-border-tertiary)" : "none", fontSize: "12px" }}>
                <div style={{ display: "flex", gap: "10px", marginBottom: "3px" }}>
                  <span style={{ fontWeight: 600, color: "#854F0B", minWidth: "120px" }}>{t.dependent_tc}</span>
                  <span style={{ color: "var(--color-text-secondary)" }}>depends on</span>
                  <span style={{ fontWeight: 600, color: "#1a4f8a" }}>{t.depends_on}</span>
                  <Badge label={t.risk} color={t.risk === "HIGH" ? "#8a1a1a" : "#a06020"} bg={t.risk === "HIGH" ? "#fce8e8" : "#fdf3e3"} />
                </div>
                <div style={{ color: "var(--color-text-tertiary)", marginLeft: "130px" }}>{t.reason}</div>
              </div>
            ))}
          </Section>

          {/* Point 10: Environment config issues */}
          <Section title="Environment configuration gaps (Point 10)" icon="ti-settings" count={analysis.env_issues?.length} color="#0c5460" bg="#d1ecf1">
            {analysis.env_issues?.map((e, i) => (
              <div key={i} style={{ padding: "9px 16px", borderBottom: i < analysis.env_issues.length - 1 ? "1px solid var(--color-border-tertiary)" : "none", display: "flex", gap: "10px", fontSize: "12px" }}>
                <span style={{ fontWeight: 600, color: "#0c5460", minWidth: "120px" }}>{e.tc_key}</span>
                <span style={{ flex: 1, color: "var(--color-text-secondary)" }}>{e.note}</span>
                <span style={{ color: "#8a1a1a" }}>Missing: {(e.missing_envs || []).join(", ")}</span>
              </div>
            ))}
          </Section>

          {/* Point 5: Per-flow coverage breakdown */}
          {analysis.flow_coverage && Object.keys(analysis.flow_coverage).length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "10px" }}>
                Coverage by flow — Point 4 & 5
              </p>
              <div style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", background: "var(--color-background-primary)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 70px 70px 70px 80px", padding: "8px 16px", background: "var(--color-background-secondary)", fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <span>Flow</span><span style={{ textAlign: "center" }}>Total</span><span style={{ textAlign: "center" }}>Covered</span><span style={{ textAlign: "center" }}>Incomplete</span><span style={{ textAlign: "center" }}>Missing</span><span style={{ textAlign: "center" }}>Coverage</span>
                </div>
                {Object.entries(analysis.flow_coverage).map(([flow, fc], i) => (
                  <div key={flow} style={{ display: "grid", gridTemplateColumns: "1fr 60px 70px 70px 70px 80px", padding: "9px 16px", borderBottom: i < Object.keys(analysis.flow_coverage).length - 1 ? "1px solid var(--color-border-tertiary)" : "none", fontSize: "12px" }}>
                    <span style={{ color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{flow}</span>
                    <span style={{ textAlign: "center", color: "var(--color-text-secondary)" }}>{fc.total}</span>
                    <span style={{ textAlign: "center", color: "#2e6b24", fontWeight: 500 }}>{fc.covered}</span>
                    <span style={{ textAlign: "center", color: "#a06020", fontWeight: 500 }}>{fc.incomplete}</span>
                    <span style={{ textAlign: "center", color: "#8a1a1a", fontWeight: 500 }}>{fc.missing}</span>
                    <span style={{ textAlign: "center", fontWeight: 600, color: fc.pct >= 80 ? "#2e6b24" : fc.pct >= 50 ? "#a06020" : "#8a1a1a" }}>{fc.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feature file coverage — Point 11 */}
          {analysis.feature_summary && Object.keys(analysis.feature_summary).length > 0 && (
            <div>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "10px" }}>
                Feature file coverage — Point 11
              </p>
              <div style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", background: "var(--color-background-primary)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", padding: "8px 16px", background: "var(--color-background-secondary)", fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <span>Feature file</span><span style={{ textAlign: "center" }}>Scenarios</span>
                </div>
                {Object.entries(analysis.feature_summary).map(([file, scenarios], i) => (
                  <div key={file} style={{ display: "grid", gridTemplateColumns: "1fr 80px", padding: "9px 16px", borderBottom: i < Object.keys(analysis.feature_summary).length - 1 ? "1px solid var(--color-border-tertiary)" : "none", fontSize: "12px" }}>
                    <span style={{ color: "#1a4f8a", fontWeight: 500 }}>{file}</span>
                    <span style={{ textAlign: "center", fontWeight: 600, color: "var(--color-text-primary)" }}>{scenarios.length}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}