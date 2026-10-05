import { useState, useEffect } from "react"
import { useAuth, useProject, apiFetch, apiDownload } from "../App"
import {
  PageHeader, Card, Button, Banner, Stat, StatRow, Pill, BandPill, StackedBar, Legend, DonutChart,
  BAND_COLORS, th, td, fmtDate,
} from "../components/ui"

const BANDS = ["Critical", "High", "Medium", "Low"]

function LiveJiraDashboard({ liveDash: ld, liveLoading, liveError, onRefresh }) {
  if (!ld && !liveLoading && !liveError) return null
  return (
    <Card
      title="Live Jira defects"
      icon="ti-brand-jira"
      style={{ marginBottom: "16px" }}
      right={
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {ld && <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>Updated {fmtDate(ld.fetched_at)}</span>}
          <Button small variant="secondary" icon="ti-refresh" busy={liveLoading} onClick={onRefresh}>Refresh</Button>
          {ld && (
            <a href={`${ld.jira_url}/jira/software/projects/${ld.project_key}/boards`} target="_blank" rel="noreferrer"
               style={{ fontSize: "12px", color: "#1a4f8a", fontWeight: 600, whiteSpace: "nowrap" }}>
              Open in Jira ↗
            </a>
          )}
        </div>
      }
    >
      {liveError && <Banner kind="warning">{liveError}</Banner>}
      {liveLoading && !ld && (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--color-text-tertiary)" }}>
          <i className="ti ti-loader-2" style={{ animation: "spin 1s linear infinite", fontSize: "20px" }} aria-hidden="true" />{" "}
          Fetching live Jira data…
        </div>
      )}
      {ld && (
        <>
          <StatRow>
            <Stat label="Open defects" value={ld.total_open} sub="live from Jira" />
            {BANDS.map(b => <Stat key={b} label={b} value={ld.by_priority[b] || 0} color={BAND_COLORS[b]} />)}
          </StatRow>

          <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap" }}>
            <DonutChart
              size={148}
              thickness={30}
              sublabel="open"
              label={ld.total_open}
              segments={BANDS.map(b => ({ key: b, value: ld.by_priority[b] || 0, color: BAND_COLORS[b] }))}
            />
            <div style={{ flex: 1, minWidth: "260px", overflowX: "auto" }}>
              <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>
                Top defects — Critical &amp; High
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={th}>Key</th>
                  <th style={th}>Summary</th>
                  <th style={th}>Priority</th>
                  <th style={th}>Module</th>
                  <th style={th}>Assignee</th>
                </tr></thead>
                <tbody>
                  {(ld.defects || []).slice(0, 8).map(d => (
                    <tr key={d.key}>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <a href={d.url} target="_blank" rel="noreferrer" style={{ color: "#1a4f8a", fontWeight: 600 }}>{d.key}</a>
                      </td>
                      <td style={{ ...td, maxWidth: "320px" }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.summary}>{d.summary}</span>
                      </td>
                      <td style={td}><BandPill band={d.band} /></td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{d.component || "—"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{d.assignee || "Unassigned"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {Object.keys(ld.by_module).length > 0 && (
            <div style={{ marginTop: "16px", borderTop: "1px solid var(--color-border-tertiary)", paddingTop: "14px" }}>
              <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>
                By module
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "7px" }}>
                {Object.entries(ld.by_module).slice(0, 10).map(([m, v]) => (
                  <div key={m} style={{ display: "grid", gridTemplateColumns: "minmax(80px,130px) 1fr 28px", gap: "6px", alignItems: "center", fontSize: "12px" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text-secondary)" }} title={m}>{m}</span>
                    <StackedBar height={10} total={v.total} segments={BANDS.map(b => ({ key: b, value: v[b] || 0, color: BAND_COLORS[b] }))} />
                    <span style={{ textAlign: "right", fontWeight: 600, fontSize: "11px", fontVariantNumeric: "tabular-nums" }}>{v.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
const TEAM_ICONS = { PO: "ti-clipboard-list", Business: "ti-palette", QA: "ti-test-pipe", Dev: "ti-code", DevOps: "ti-server-cog" }
const APPROVAL = {
  pending:       { label: "Pending", color: "#7a4810", bg: "#fdf3e3", icon: "ti-clock" },
  approved:      { label: "Go-Live approved", color: "#2e5c24", bg: "#eaf3e6", icon: "ti-circle-check" },
  risk_accepted: { label: "Risk accepted", color: "#1a4f8a", bg: "#e8f0fb", icon: "ti-shield-half" },
}
const FACTOR_LABEL = { severity: "Severity (40)", business_impact: "Business impact (25)", module_index: "Module index (15)", sla_breach_risk: "SLA breach risk (20)" }

function TeamCard({ team, t, onDecide, busy }) {
  const [note, setNote] = useState("")
  const [accepting, setAccepting] = useState(false)
  const a = APPROVAL[t.approval?.status || "pending"]
  return (
    <div style={{ background: "#fff", border: "1px solid var(--color-border-tertiary)", borderRadius: "12px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px", opacity: t.count ? 1 : 0.6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <i className={`ti ${TEAM_ICONS[team]}`} style={{ fontSize: "18px", color: "#1a4f8a" }} aria-hidden="true" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "14px", fontWeight: 700, margin: 0 }}>{team}</p>
          <p style={{ fontSize: "11px", color: "var(--color-text-tertiary)", margin: 0 }}>{t.label.split("—")[1]?.trim()}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: "22px", fontWeight: 700, margin: 0, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{t.count}</p>
          <p style={{ fontSize: "11px", color: "var(--color-text-tertiary)", margin: 0 }}>{t.share_pct}% of open</p>
        </div>
      </div>
      <StackedBar height={8} total={t.count || 1} segments={BANDS.map(b => ({ key: b, value: t.bands[b] || 0, color: BAND_COLORS[b] }))} />
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
        <Pill color={a.color} bg={a.bg} icon={a.icon} title={t.approval?.note || ""}>{a.label}{t.pending ? ` (${t.pending})` : ""}</Pill>
        {t.sla_breached > 0 && <Pill color="#8a1a1a" bg="#fce8e8" icon="ti-clock-exclamation">{t.sla_breached} SLA breached</Pill>}
      </div>
      {t.approval?.by && t.approval.status !== "pending" && (
        <p style={{ fontSize: "11px", color: "var(--color-text-tertiary)", margin: 0 }}>by {t.approval.by} · {fmtDate(t.approval.at)}{t.approval.note ? ` — “${t.approval.note}”` : ""}</p>
      )}
      {t.count > 0 && (
        accepting ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Why is this risk acceptable?" aria-label={`${team} risk justification`} />
            <div style={{ display: "flex", gap: "6px" }}>
              <Button small busy={busy} disabled={!note.trim()} onClick={() => { onDecide(team, "risk_accepted", note); setAccepting(false) }}>Confirm</Button>
              <Button small variant="secondary" onClick={() => setAccepting(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {t.approval?.status !== "approved" && <Button small variant="success" icon="ti-check" busy={busy} onClick={() => onDecide(team, "approved", "")}>Approve</Button>}
            {t.approval?.status !== "risk_accepted" && <Button small variant="secondary" icon="ti-shield-half" onClick={() => setAccepting(true)}>Accept risk</Button>}
            {t.approval?.status && t.approval.status !== "pending" && <Button small variant="secondary" icon="ti-arrow-back-up" busy={busy} onClick={() => onDecide(team, "pending", "")}>Reset</Button>}
          </div>
        )
      )}
    </div>
  )
}

function MailPanel({ project, token, teams }) {
  const [emails, setEmails] = useState({})
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => { apiFetch(`/projects/${project.id}/risk/recipients`, {}, token).then(setEmails).catch(() => {}) }, [project.id])

  async function save() {
    setSaving(true)
    try { setEmails(await apiFetch(`/projects/${project.id}/risk/recipients`, { method: "PUT", body: JSON.stringify(emails) }, token)) }
    catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }
  async function send() {
    setSending(true); setError("")
    try { await save(); setOutcome(await apiFetch(`/projects/${project.id}/risk/notify`, { method: "POST" }, token)) }
    catch (e) { setError(e.message) }
    finally { setSending(false) }
  }
  const icon = { sent: "ti-send", preview: "ti-mail-opened", skipped: "ti-mail-off", failed: "ti-alert-circle" }
  const color = { sent: "#2e5c24", preview: "#1a4f8a", skipped: "#7a4810", failed: "#8a1a1a" }

  return (
    <Card title="Mail & approve" icon="ti-mail-forward">
      {error && <Banner onClose={() => setError("")}>{error}</Banner>}
      <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: "0 0 12px" }}>
        Each team gets only its own defects, with Jira links and criticality scores, plus a link back here to record Go-Live approval.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "8px 10px", alignItems: "center", marginBottom: "12px" }}>
        {Object.keys(teams).map(t => (
          <div key={t} style={{ display: "contents" }}>
            <label htmlFor={`mail-${t}`} style={{ fontSize: "12px", fontWeight: 600 }}>{t} <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}>({teams[t].count})</span></label>
            <input id={`mail-${t}`} value={emails[t] || ""} onChange={e => setEmails(m => ({ ...m, [t]: e.target.value }))} placeholder="team-lead@company.com, another@company.com" />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <Button variant="secondary" icon="ti-device-floppy" busy={saving} onClick={save}>Save recipients</Button>
        <Button icon="ti-send" busy={sending} onClick={send}>Email each team</Button>
      </div>
      {outcome && (
        <div style={{ marginTop: "12px" }}>
          {!outcome.smtp_configured && <Banner kind="info">SMTP is not configured in <code>backend/.env</code>, so emails were saved as previews in the project <code>outbox/</code> folder instead of being sent.</Banner>}
          {outcome.outcomes.map(o => (
            <p key={o.team} style={{ fontSize: "12px", margin: "4px 0", color: color[o.status], display: "flex", gap: "6px", alignItems: "center" }}>
              <i className={`ti ${icon[o.status]}`} aria-hidden="true" /><b>{o.team}</b> — {o.defects} defect(s) · {o.status}{o.to ? ` → ${o.to.join(", ")}` : ""}{o.detail ? ` (${o.detail})` : ""}
            </p>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Root-cause colours ────────────────────────────────────────────────────────
const RC_COLOR = {
  element_not_found: "#8a1a1a",
  assertion_failed:  "#7a4810",
  timeout:           "#6a2fa0",
  step_mismatch:     "#1a4f8a",
  api_error:         "#8a1a1a",
  data_setup:        "#185FA5",
  env_issue:         "#5a5650",
  locator_change:    "#8a1a1a",
  unknown:           "#5a5650",
}
const RC_BG = {
  element_not_found: "#fce8e8",
  assertion_failed:  "#fdf3e3",
  timeout:           "#f5f0ff",
  step_mismatch:     "#e8f0fb",
  api_error:         "#fce8e8",
  data_setup:        "#e8f4fb",
  env_issue:         "#f5f2ed",
  locator_change:    "#fce8e8",
  unknown:           "#f5f2ed",
}

function FailureCard({ r, idx }) {
  const [open, setOpen] = useState(false)
  const color = RC_COLOR[r.root_cause] || "#5a5650"
  const bg    = RC_BG[r.root_cause]   || "#f5f2ed"

  return (
    <div style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: "12px", overflow: "hidden", marginBottom: "10px" }}>
      {/* Header row */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 14px", cursor: "pointer", background: "var(--color-background-primary)" }}
      >
        <span style={{ minWidth: "22px", height: "22px", borderRadius: "50%", background: "#f5f2ed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "var(--color-text-tertiary)", flexShrink: 0, marginTop: "1px" }}>{idx + 1}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: "0 0 3px", fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.scenario}>{r.scenario}</p>
          <p style={{ margin: 0, fontSize: "11px", color: "var(--color-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.feature || r.feature_uri}</p>
        </div>
        <div style={{ display: "flex", gap: "6px", flexShrink: 0, alignItems: "center" }}>
          <Pill color={color} bg={bg} icon="ti-bug">{r.root_cause_label || r.root_cause}</Pill>
          <Pill color={r.confidence >= 90 ? "#2e5c24" : "#7a4810"} bg={r.confidence >= 90 ? "#eaf3e6" : "#fdf3e3"}>{r.confidence}%</Pill>
          {r.ai_powered && <Pill color="#6a2fa0" bg="#f5f0ff" icon="ti-sparkles">AI</Pill>}
          <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ fontSize: "13px", color: "var(--color-text-tertiary)" }} />
        </div>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ borderTop: "1px solid var(--color-border-tertiary)", padding: "14px", background: "var(--color-background-secondary)", display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* Failed step + error */}
          {r.failed_step && (
            <div>
              <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", margin: "0 0 5px" }}>Failed step</p>
              <code style={{ fontSize: "12px", background: "#fff", border: "1px solid var(--color-border-tertiary)", borderRadius: "6px", padding: "6px 10px", display: "block" }}>{r.failed_step}</code>
            </div>
          )}

          {r.error_snippet && (
            <div>
              <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", margin: "0 0 5px" }}>Error</p>
              <pre style={{ fontSize: "11px", background: "#fce8e8", border: "1px solid #f0a0a0", borderRadius: "6px", padding: "8px 10px", margin: 0, overflow: "auto", maxHeight: "120px", color: "#8a1a1a", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{r.error_snippet}</pre>
            </div>
          )}

          {/* AI explanation */}
          <div style={{ background: bg, border: `1px solid ${color}33`, borderRadius: "8px", padding: "10px 12px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color, margin: "0 0 5px", display: "flex", alignItems: "center", gap: "5px" }}>
              <i className="ti ti-bulb" /> Root cause — {r.root_cause_label}
            </p>
            <p style={{ fontSize: "12px", margin: 0, color: "var(--color-text-primary)", lineHeight: 1.5 }}>{r.explanation}</p>
          </div>

          {/* Fix suggestion */}
          {r.fix_suggestion && (
            <div>
              <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", margin: "0 0 5px" }}>Suggested fix</p>
              <p style={{ fontSize: "12px", margin: 0, lineHeight: 1.5 }}>{r.fix_suggestion}</p>
            </div>
          )}

          {/* Code fix */}
          {r.fix_code && (
            <div>
              <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", margin: "0 0 5px" }}>
                Code fix{r.fix_file ? <span style={{ fontWeight: 400, marginLeft: "6px", fontFamily: "var(--font-mono)", color: "#1a4f8a" }}>{r.fix_file}</span> : ""}
              </p>
              <pre style={{ fontSize: "11px", background: "#1e1e1e", color: "#d4d4d4", borderRadius: "8px", padding: "10px 12px", margin: 0, overflow: "auto", maxHeight: "240px", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.5 }}>{r.fix_code}</pre>
            </div>
          )}

          {/* Feature snippet */}
          {r.feature_snippet && (
            <details>
              <summary style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-tertiary)", cursor: "pointer", textTransform: "uppercase", letterSpacing: ".05em" }}>Gherkin scenario</summary>
              <pre style={{ fontSize: "11px", background: "#fff", border: "1px solid var(--color-border-tertiary)", borderRadius: "6px", padding: "8px 10px", marginTop: "6px", overflow: "auto", maxHeight: "160px", whiteSpace: "pre-wrap" }}>{r.feature_snippet}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

function FailureAnalysis({ project, token }) {
  const [dragging, setDragging]     = useState(false)
  const [analyzing, setAnalyzing]   = useState(false)
  const [results, setResults]       = useState(null)
  const [error, setError]           = useState("")
  const [pasteMode, setPasteMode]   = useState(false)
  const [pasteText, setPasteText]   = useState("")
  const [rcFilter, setRcFilter]     = useState("")

  async function submit(content, filename = "") {
    setAnalyzing(true); setError(""); setResults(null)
    try {
      const fd = new FormData()
      if (filename) {
        const blob = new Blob([content], { type: "text/plain" })
        fd.append("file", blob, filename)
      } else {
        fd.append("text", content)
      }
      const r = await apiFetch(`/projects/${project.id}/failure-analysis`, { method: "POST", body: fd }, token)
      setResults(r)
    } catch (e) { setError(e.message) }
    finally { setAnalyzing(false) }
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = ev => submit(ev.target.result, f.name)
    reader.readAsText(f)
  }

  function onFile(e) {
    const f = e.target.files[0]; if (!f) return
    const reader = new FileReader()
    reader.onload = ev => submit(ev.target.result, f.name)
    reader.readAsText(f)
    e.target.value = ""
  }

  const displayed = results ? results.results.filter(r => !rcFilter || r.root_cause === rcFilter) : []

  return (
    <Card title="Failure analysis" icon="ti-microscope"
      right={
        <span style={{ fontSize: "11px", padding: "2px 10px", borderRadius: "999px", background: "#f5f0ff", color: "#6a2fa0", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px" }}>
          <i className="ti ti-sparkles" style={{ fontSize: "11px" }} /> AI-powered
        </span>
      }
    >
      <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: "0 0 14px" }}>
        Upload a Cucumber JSON / JUnit XML execution report — or paste failure text — and AI investigates each failure, finds the step definition code, and suggests the fix.
      </p>

      {error && <Banner onClose={() => setError("")}>{error}</Banner>}

      {/* Input area */}
      {!analyzing && (
        <div style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
            <Button small variant={!pasteMode ? "primary" : "secondary"} icon="ti-upload" onClick={() => setPasteMode(false)}>Upload report</Button>
            <Button small variant={pasteMode ? "primary" : "secondary"} icon="ti-clipboard-text" onClick={() => setPasteMode(true)}>Paste log</Button>
          </div>

          {!pasteMode ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              style={{
                border: `1.5px dashed ${dragging ? "#256abf" : "var(--color-border-secondary)"}`,
                borderRadius: "10px", padding: "28px 16px", textAlign: "center",
                background: dragging ? "#e8f0fb" : "var(--color-background-primary)", cursor: "pointer",
                transition: "all .15s",
              }}
              onClick={() => document.getElementById("fa-file-input").click()}
            >
              <input id="fa-file-input" type="file" accept=".json,.xml,.txt,.log" style={{ display: "none" }} onChange={onFile} />
              <i className="ti ti-file-upload" style={{ fontSize: "28px", color: "#256abf" }} aria-hidden="true" />
              <p style={{ margin: "8px 0 3px", fontSize: "13px", fontWeight: 600 }}>Drop execution report here</p>
              <p style={{ margin: 0, fontSize: "11px", color: "var(--color-text-tertiary)" }}>Cucumber JSON · JUnit XML · plain log · .json / .xml / .txt</p>
            </div>
          ) : (
            <div>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                rows={6}
                placeholder={"Paste failure log, stack trace, or Cucumber output here…\n\nExample:\n  Scenario: Login as admin\n  FAILED: ElementNotInteractableException at step 'When I click Login button'"}
                style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "11px", resize: "vertical" }}
              />
              <Button icon="ti-microscope" style={{ marginTop: "8px" }} disabled={!pasteText.trim()} onClick={() => submit(pasteText)}>Analyse</Button>
            </div>
          )}
        </div>
      )}

      {analyzing && (
        <div style={{ textAlign: "center", padding: "24px", color: "var(--color-text-secondary)" }}>
          <i className="ti ti-loader-2" style={{ fontSize: "24px", animation: "spin 1s linear infinite" }} aria-hidden="true" />
          <p style={{ margin: "10px 0 0", fontSize: "13px" }}>Investigating failures… AI is reading step definitions from the automation repo.</p>
        </div>
      )}

      {/* Results */}
      {results && !analyzing && (
        <div>
          {/* Summary bar */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", padding: "10px 14px", background: "var(--color-background-secondary)", borderRadius: "10px", marginBottom: "14px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600 }}>{results.total_failures} failure{results.total_failures !== 1 ? "s" : ""}</span>
            <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>{results.format?.replace("_", " ")}</span>
            {results.automation_path && <Pill icon="ti-folder-code" color="#1a4f8a" bg="#e8f0fb">{results.automation_path.split(/[/\\]/).slice(-2).join("/")}</Pill>}
            <span style={{ flex: 1 }} />
            {Object.entries(results.cause_summary || {}).map(([k, v]) => (
              <button key={k} onClick={() => setRcFilter(f => f === k ? "" : k)}
                style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                  background: rcFilter === k ? (RC_BG[k] || "#f5f2ed") : "#fff",
                  color: RC_COLOR[k] || "#5a5650",
                  border: `1px solid ${RC_COLOR[k] || "#c0bab4"}`,
                }}>
                {k.replace(/_/g, " ")} ({v})
              </button>
            ))}
            {rcFilter && <Button small variant="secondary" onClick={() => setRcFilter("")}>Clear filter</Button>}
            <Button small variant="secondary" icon="ti-refresh" onClick={() => setResults(null)}>New report</Button>
          </div>

          {results.message && <Banner kind="info">{results.message}</Banner>}

          {displayed.map((r, i) => <FailureCard key={i} r={r} idx={i} />)}
          {displayed.length === 0 && rcFilter && (
            <p style={{ fontSize: "12px", color: "var(--color-text-tertiary)", textAlign: "center", padding: "16px" }}>No failures match "{rcFilter.replace(/_/g, " ")}".</p>
          )}
        </div>
      )}
    </Card>
  )
}

export default function RiskScanner({ currentPage }) {
  const { user } = useAuth()
  const { project } = useProject()
  const token = user?.token
  const [dash, setDash] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [useAi, setUseAi] = useState(true)
  const [error, setError] = useState("")
  const [deciding, setDeciding] = useState("")
  const [filters, setFilters] = useState({ team: "", band: "", open: "open", q: "" })

  const [liveDash, setLiveDash] = useState(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState("")

  useEffect(() => {
    if (!project) return
    apiFetch(`/projects/${project.id}/risk`, {}, token).then(setDash).catch(() => setDash(null))
  }, [project, currentPage])

  async function refreshLive() {
    if (!project) return
    setLiveLoading(true); setLiveError("")
    try { setLiveDash(await apiFetch(`/projects/${project.id}/defects/live`, {}, token)) }
    catch (e) { setLiveError(e.message) }
    finally { setLiveLoading(false) }
  }

  // No auto-refresh — user triggers live data manually via the Refresh button

  async function scan() {
    setScanning(true); setError("")
    try {
      const fd = new FormData(); fd.append("use_ai", useAi)
      setDash(await apiFetch(`/projects/${project.id}/risk/scan`, { method: "POST", body: fd }, token))
    } catch (e) { setError(e.message) }
    finally { setScanning(false) }
  }

  async function decide(team, status, note) {
    setDeciding(team); setError("")
    try {
      const fd = new FormData()
      fd.append("team", team); fd.append("status", status); fd.append("note", note); fd.append("approver", user?.username || "")
      setDash(await apiFetch(`/projects/${project.id}/risk/approve`, { method: "POST", body: fd }, token))
    } catch (e) { setError(e.message) }
    finally { setDeciding("") }
  }

  async function exportReport(format) {
    try { await apiDownload(`/projects/${project.id}/risk/export?format=${format}`, token) }
    catch (e) { setError(e.message) }
  }

  if (!project) return null
  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const q = filters.q.trim().toLowerCase()
  const rows = (dash?.defects || []).filter(d =>
    (!filters.team || d.owner === filters.team) && (!filters.band || d.band === filters.band) &&
    (filters.open !== "open" || d.open) && (!q || `${d.key} ${d.summary} ${d.module}`.toLowerCase().includes(q)))

  return (
    <div style={{ maxWidth: "1180px" }}>
      <PageHeader agent="Agent 04 · Defect triage" title="Risk scanner"
        subtitle="Classifies every defect by entity, module and owning team, scores its criticality 0–100, and holds the Go-Live gate until each team approves or consciously accepts the risk.">
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
          <input type="checkbox" checked={useAi} onChange={e => setUseAi(e.target.checked)} style={{ width: "auto" }} /> AI classification
        </label>
        {dash && <Button variant="secondary" icon="ti-file-spreadsheet" onClick={() => exportReport("xlsx")}>Triage report</Button>}
        <Button icon="ti-radar" busy={scanning} onClick={scan}>{dash ? "Re-scan defects" : "Run risk scan"}</Button>
      </PageHeader>

      {error && <Banner onClose={() => setError("")}>{error}</Banner>}

      <LiveJiraDashboard liveDash={liveDash} liveLoading={liveLoading} liveError={liveError} onRefresh={refreshLive} />

      {!dash && (
        <Card>
          <div style={{ textAlign: "center", padding: "30px 10px" }}>
            <i className="ti ti-shield-check" style={{ fontSize: "34px", color: "#256abf" }} aria-hidden="true" />
            <p style={{ fontSize: "15px", fontWeight: 600, margin: "10px 0 6px" }}>No risk scan yet</p>
            <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: "0 0 16px" }}>Sync Jira with defects, or upload a defect export on Data sources, then run the scan.</p>
            <Button icon="ti-radar" busy={scanning} onClick={scan}>Run risk scan</Button>
          </div>
        </Card>
      )}

      {dash && (
        <>
          <div style={{
            display: "flex", alignItems: "center", gap: "14px", padding: "16px 18px", borderRadius: "14px", marginBottom: "16px",
            background: dash.go_live.open ? "#eaf3e6" : "#fce8e8", border: `1px solid ${dash.go_live.open ? "#a8cf9b" : "#f0a0a0"}`,
          }}>
            <i className={`ti ${dash.go_live.open ? "ti-lock-open" : "ti-lock"}`} style={{ fontSize: "28px", color: dash.go_live.open ? "#2e5c24" : "#8a1a1a" }} aria-hidden="true" />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: dash.go_live.open ? "#2e5c24" : "#8a1a1a" }}>Go-Live gate {dash.go_live.open ? "OPEN" : "CLOSED"}</p>
              <p style={{ fontSize: "13px", margin: "2px 0 0", color: "var(--color-text-secondary)" }}>
                {dash.go_live.open ? "Every team with open defects has approved or accepted the risk." : `Waiting on: ${dash.go_live.blocking_teams.join(", ")}`}
              </p>
            </div>
            <span style={{ fontSize: "12px", color: "var(--color-text-tertiary)" }}>Scanned {fmtDate(dash.scanned_at)} · {dash.ai_used ? "AI + rules" : "rules"}</span>
          </div>

          <StatRow>
            <Stat label="Open defects" value={dash.open} sub={`${dash.total} total`} />
            {BANDS.map(b => (
              <Stat key={b} label={b} value={dash.bands[b]} sub={b === "Critical" ? "score ≥ 80" : b === "High" ? "60–79" : b === "Medium" ? "40–59" : "< 40"} />
            ))}
            <Stat label="SLA breached" value={dash.sla_breached} color={dash.sla_breached ? "#8a1a1a" : undefined} sub="open past SLA" />
          </StatRow>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "12px", marginBottom: "16px" }}>
            {Object.entries(dash.teams).map(([team, t]) => <TeamCard key={team} team={team} t={t} onDecide={decide} busy={deciding === team} />)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "16px" }}>
            <Card title="Defect distribution — by band &amp; module" icon="ti-chart-pie" right={<Legend items={BANDS.map(b => ({ key: b, color: BAND_COLORS[b], value: dash.bands[b] }))} />}>
              <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                {/* Donut chart — overall band split */}
                <DonutChart
                  size={152}
                  thickness={32}
                  sublabel="open"
                  label={dash.open}
                  segments={BANDS.map(b => ({ key: b, value: dash.bands[b] || 0, color: BAND_COLORS[b] }))}
                />
                {/* Stacked bar chart — per module breakdown */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>Per module</p>
                  {Object.keys(dash.modules).length === 0 && (
                    <p style={{ fontSize: "13px", color: "var(--color-text-tertiary)", margin: 0 }}>No open defects.</p>
                  )}
                  {Object.entries(dash.modules).slice(0, 10).map(([m, v]) => {
                    const maxTotal = Math.max(...Object.values(dash.modules).map(x => x.total), 1)
                    return (
                      <div key={m} style={{ display: "grid", gridTemplateColumns: "minmax(80px,140px) 1fr 32px", gap: "8px", alignItems: "center", marginBottom: "7px", fontSize: "12px" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text-secondary)" }} title={m}>{m}</span>
                        <div style={{ width: `${v.total / maxTotal * 100}%`, minWidth: "4px" }}>
                          <StackedBar height={11} total={v.total} segments={BANDS.map(b => ({ key: b, value: v[b] || 0, color: BAND_COLORS[b] }))} />
                        </div>
                        <span style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", fontSize: "11px" }}>{v.total}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>
            <MailPanel project={project} token={token} teams={dash.teams} />
          </div>

          <Card title={`Defects (${rows.length})`} icon="ti-bug" pad={false} right={
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <select value={filters.team} onChange={e => setF("team", e.target.value)} style={{ width: "auto" }} aria-label="Filter by team">
                <option value="">All teams</option>{Object.keys(dash.teams).map(t => <option key={t}>{t}</option>)}
              </select>
              <select value={filters.band} onChange={e => setF("band", e.target.value)} style={{ width: "auto" }} aria-label="Filter by criticality">
                <option value="">All bands</option>{BANDS.map(b => <option key={b}>{b}</option>)}
              </select>
              <select value={filters.open} onChange={e => setF("open", e.target.value)} style={{ width: "auto" }} aria-label="Filter by status">
                <option value="open">Open only</option><option value="all">Open + closed</option>
              </select>
              <input value={filters.q} onChange={e => setF("q", e.target.value)} placeholder="Search" style={{ width: "160px" }} aria-label="Search defects" />
            </div>
          }>
            <div style={{ maxHeight: "520px", overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={th}>Defect</th><th style={th}>Owner</th><th style={th}>Entity</th><th style={th}>Module</th>
                  <th style={th}>Severity</th><th style={th}>Criticality</th><th style={th}>SLA</th><th style={th}>Status</th>
                </tr></thead>
                <tbody>
                  {rows.map(d => (
                    <tr key={d.key} style={{ opacity: d.open ? 1 : 0.55 }}>
                      <td style={{ ...td, maxWidth: "380px" }}>
                        {d.url ? <a href={d.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: "#1a4f8a" }}>{d.key}</a> : <b style={{ color: "#1a4f8a" }}>{d.key}</b>}
                        <div style={{ color: "var(--color-text-secondary)" }}>{d.summary}</div>
                      </td>
                      <td style={td} title={d.reason}>
                        <b>{d.owner}</b>
                        <div style={{ color: "var(--color-text-tertiary)", cursor: "help" }}>{Math.round(d.confidence * 100)}% · {d.classified_by}</div>
                      </td>
                      <td style={td}>{d.entity_type}</td>
                      <td style={td}>{d.module}</td>
                      <td style={td}>{d.severity}<div style={{ color: "var(--color-text-tertiary)" }}>{d.priority}</div></td>
                      <td style={{ ...td, cursor: "help" }} title={Object.entries(d.factors).map(([k, v]) => `${FACTOR_LABEL[k]}: ${v}`).join("\n")}><BandPill band={d.band} score={d.score} /></td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {d.age_days !== null ? `${d.age_days}d / ${d.sla_days}d` : `— / ${d.sla_days}d`}
                        {d.sla_breached && <div><Pill color="#8a1a1a" bg="#fce8e8" icon="ti-clock-exclamation">Breached</Pill></div>}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{d.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <FailureAnalysis project={project} token={token} />
    </div>
  )
}
