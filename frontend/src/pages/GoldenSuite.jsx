import { useState, useEffect, useRef } from "react"
import { useAuth, useProject, apiFetch, apiDownload } from "../App"
import {
  PageHeader, Card, Button, Banner, Stat, StatRow, Pill, TierPill, RunPill, StackedBar, Legend,
  TIER_COLORS, th, td, fmtDate,
} from "../components/ui"

const PRESETS = [
  { key: "smoke", label: "Smoke", pct: 10, desc: "P0 only" },
  { key: "core", label: "Core", pct: 30, desc: "P0 + P1" },
  { key: "full", label: "Full", pct: 100, desc: "Everything" },
]

function fmtHrs(hrs) {
  if (!hrs) return "0 min"
  if (hrs < 1) return `${Math.round(hrs * 60)} min`
  return `${hrs.toFixed(1)} hrs`
}
const RUN_COLORS = { Passed: "#0ca30c", Failed: "#d03b3b", Blocked: "#fab219", "In Progress": "#3987e5", "Not Run": "#c9c5bd" }
const KIND_LABEL = { bdd: "BDD scenario", pytest: "pytest", manual: "Manual / QMetry" }
const FACTOR_LABEL = { business_impact: "Business impact (40)", workflow_criticality: "Workflow criticality (30)", execution_history: "Execution history (20)", defect_density: "Defect density (10)", release_relevance: "AI release relevance" }
const CONF_COLOR = c => c >= 80 ? "#0a7a0a" : c >= 60 ? "#b54708" : "#8a1a1a"

const SOURCE_META = {
  module_impact:    { label: "Module Impact",     color: "#1a4f8a", bg: "#e8f0fb", icon: "ti-package" },
  defect_fix:       { label: "Defect Fix",         color: "#7a2e0a", bg: "#fff3e8", icon: "ti-bug" },
  critical_flow:    { label: "Critical Flow",      color: "#166534", bg: "#dcfce7", icon: "ti-shield-check" },
  domain_validated: { label: "Domain Knowledge",  color: "#6b21a8", bg: "#f3e8ff", icon: "ti-brain" },
}

export default function GoldenSuite({ currentPage }) {
  const { user } = useAuth()
  const { project } = useProject()
  const token = user?.token
  const [data, setData] = useState(null)
  const [coverage, setCoverage] = useState(30)
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [ci, setCi] = useState("github")
  const [query, setQuery] = useState("")
  const [downloading, setDownloading] = useState("")
  const [fitBudget, setFitBudget] = useState(false)
  const timer = useRef()

  // Smart tag recommender state
  const [releaseContext, setReleaseContext] = useState("")
  const [tagsResult, setTagsResult] = useState(null)
  const [tagsLoading, setTagsLoading] = useState(false)
  const [tagsError, setTagsError] = useState("")
  const [cmdCopied, setCmdCopied] = useState(false)
  const [buildLookup, setBuildLookup] = useState(null)

  // YAML preview state
  const [yamlPreview, setYamlPreview] = useState(null)
  const [yamlCopied, setYamlCopied] = useState(false)
  const yamlTimer = useRef()

  // Detect if input looks like a build version  e.g. v2.4.1, 2.4.1, build-123
  const BUILD_RE = /^\s*(v?\d+[\.\-]\d+[\.\-]?\d*|build[\-_]?\d+)\s*$/i

  async function analyzeRelease() {
    setTagsLoading(true); setTagsError(""); setTagsResult(null); setBuildLookup(null)
    let contextToSend = releaseContext
    // If input looks like a build version, do a Jira lookup first
    if (BUILD_RE.test(releaseContext)) {
      try {
        const lookup = await apiFetch(`/projects/${project.id}/golden-suite/build-lookup?version=${encodeURIComponent(releaseContext.trim())}`, {}, token)
        setBuildLookup(lookup)
        if (lookup.affected_modules?.length > 0) {
          contextToSend = lookup.affected_modules.join(", ")
        }
      } catch { /* continue with raw input */ }
    }
    try {
      const res = await apiFetch(
        `/projects/${project.id}/golden-suite/smart-tags`,
        { method: "POST", body: JSON.stringify({ release_context: contextToSend }) },
        token
      )
      setTagsResult(res)
      // Refresh YAML preview with the new smart tags injected
      if (res?.recommended_tags?.length > 0) {
        fetchYaml(coverage, fitBudget, res.recommended_tags.map(t => t.tag))
      }
    } catch (e) {
      setTagsError(e.message)
    } finally {
      setTagsLoading(false)
    }
  }

  function copyCmd(cmd) {
    navigator.clipboard?.writeText(cmd).then(() => { setCmdCopied(true); setTimeout(() => setCmdCopied(false), 2000) })
  }

  function copyYaml(text) {
    navigator.clipboard?.writeText(text).then(() => { setYamlCopied(true); setTimeout(() => setYamlCopied(false), 2000) })
  }

  async function fetchYaml(cov, fb, smartTags) {
    try {
      const tagParam = smartTags?.length ? `&tags=${encodeURIComponent(smartTags.join(","))}` : ""
      const res = await apiFetch(`/projects/${project.id}/golden-suite/yaml-preview?coverage=${cov}&fit_budget=${fb}${tagParam}`, {}, token)
      setYamlPreview(res)
    } catch { /* silent */ }
  }

  async function load(cov = coverage, fb = fitBudget) {
    setLoading(true)
    try { setData(await apiFetch(`/projects/${project.id}/golden-suite?coverage=${cov}&limit=300&fit_budget=${fb}`, {}, token)) }
    catch { setData(null) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    if (project) {
      load()
      fetchYaml(coverage, fitBudget, null)
    }
  }, [project, currentPage])

  function changeCoverage(v) {
    setCoverage(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      load(v, fitBudget)
      const smartTags = tagsResult?.recommended_tags?.map(t => t.tag)
      clearTimeout(yamlTimer.current)
      yamlTimer.current = setTimeout(() => fetchYaml(v, fitBudget, smartTags), 400)
    }, 250)
  }

  function toggleBudget(val) {
    setFitBudget(val)
    load(coverage, val)
  }

  async function scan() {
    setScanning(true); setError("")
    try { await apiFetch(`/projects/${project.id}/golden-suite/scan`, { method: "POST" }, token); await load() }
    catch (e) { setError(e.message) }
    finally { setScanning(false) }
  }

  async function download(format) {
    setDownloading(format); setError("")
    try { await apiDownload(`/projects/${project.id}/golden-suite/export?coverage=${coverage}&format=${format}&ci=${ci}&fit_budget=${fitBudget}`, token) }
    catch (e) { setError(e.message) }
    finally { setDownloading("") }
  }

  if (!project) return null
  const scanInfo = data?.scan
  const sel = data?.selection
  const q = query.trim().toLowerCase()
  const rows = (sel?.items || []).filter(i => !q || `${i.id} ${i.name} ${i.module}`.toLowerCase().includes(q))

  return (
    <div style={{ maxWidth: "1180px" }}>
      <PageHeader agent="Agent 03 · Prioritisation" title="Golden suite optimizer"
        subtitle="Scans every test in the repo and QMetry, scores each P0–P3 from business impact, workflow criticality, execution history and defect density, then extracts the smallest suite for the coverage you need.">
        <Button icon="ti-scan" busy={scanning} onClick={scan}>{scanInfo ? "Re-scan repository" : "Scan repository"}</Button>
      </PageHeader>

      {error && <Banner onClose={() => setError("")}>{error}</Banner>}

      {!scanInfo && !loading && (
        <Card>
          <div style={{ textAlign: "center", padding: "30px 10px" }}>
            <i className="ti ti-stars" style={{ fontSize: "34px", color: "#256abf" }} aria-hidden="true" />
            <p style={{ fontSize: "15px", fontWeight: 600, margin: "10px 0 6px" }}>No scan yet</p>
            <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: "0 0 16px" }}>
              Sync QMetry / Jira or upload feature files and a test repo on Data sources, then scan.
            </p>
            <Button icon="ti-scan" busy={scanning} onClick={scan}>Scan repository</Button>
          </div>
        </Card>
      )}

      {scanInfo && (
        <>
          {/* Top tags from feature files */}
          {scanInfo.top_tags && Object.keys(scanInfo.top_tags).length > 0 && (
            <div style={{ marginBottom: "14px" }}>
              <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-tertiary)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: ".05em" }}>Tags in automation suite</p>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {Object.entries(scanInfo.top_tags).slice(0, 18).map(([tag, count]) => (
                  <span key={tag} style={{ fontSize: "11px", background: "#e8f0fb", color: "#1a4f8a", borderRadius: "5px", padding: "2px 8px", fontWeight: 500 }}>
                    @{tag} <span style={{ opacity: .65 }}>{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <p style={{ fontSize: "12px", color: "var(--color-text-tertiary)", margin: "-6px 0 14px" }}>
            Scanned {fmtDate(scanInfo.scanned_at)} · automation repo (feature files only — manual QMetry TCs excluded){scanInfo.ai_enriched ? " · AI release-relevance applied" : ""}
          </p>

          {/* ── AI Tag Recommender ─────────────────────────────────────────── */}
          <Card title="AI Tag Recommender" icon="ti-sparkles">
            {/* Input row */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "12px", alignItems: "flex-start" }}>
              <textarea
                value={releaseContext}
                onChange={e => setReleaseContext(e.target.value)}
                placeholder="Enter modules affected in this release  e.g. reports, orders, claims"
                rows={2}
                style={{
                  flex: 1, padding: "10px 12px", fontSize: "13px",
                  border: "1px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)",
                  resize: "none", fontFamily: "inherit", lineHeight: 1.5,
                  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
                }}
              />
              <button
                onClick={analyzeRelease}
                disabled={tagsLoading}
                style={{
                  padding: "10px 20px", borderRadius: "var(--border-radius-md)", border: "none",
                  background: tagsLoading ? "var(--color-background-secondary)" : "#1a4f8a",
                  color: tagsLoading ? "var(--color-text-secondary)" : "#fff",
                  fontSize: "13px", fontWeight: 600, cursor: tagsLoading ? "wait" : "pointer",
                  display: "flex", alignItems: "center", gap: "7px", flexShrink: 0,
                }}
              >
                <i className={`ti ${tagsLoading ? "ti-loader-2" : "ti-brain"}`}
                   style={{ fontSize: "15px", animation: tagsLoading ? "spin 1s linear infinite" : "none" }} />
                {tagsLoading ? "Analysing…" : "Get Tags"}
              </button>
            </div>

            {/* Build version lookup result */}
            {buildLookup && (
              <div style={{ padding: "10px 14px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", fontSize: "12px", color: "#0c4a6e", marginBottom: "12px" }}>
                <i className="ti ti-building-factory-2" style={{ marginRight: "5px" }} />
                <strong>{buildLookup.version}</strong> — found {buildLookup.matched_stories} Jira stories.
                {buildLookup.affected_modules?.length > 0 && (
                  <> Modules: <strong>{buildLookup.affected_modules.join(", ")}</strong></>
                )}
              </div>
            )}

            {tagsError && (
              <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", fontSize: "13px", color: "#7f1d1d", marginBottom: "12px" }}>
                <i className="ti ti-alert-circle" style={{ marginRight: "5px" }} />
                {tagsError}
              </div>
            )}

            {tagsResult && (
              <div>
                {/* Summary bar */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "12px 16px", background: "var(--color-background-secondary)", borderRadius: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <i className="ti ti-tags" style={{ fontSize: "16px", color: "#1a4f8a" }} />
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>{tagsResult.tag_count} tags</span>
                    <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>· {tagsResult.total_scenarios} scenarios</span>
                  </div>
                  {tagsResult.ai_accuracy > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <i className="ti ti-brain" style={{ fontSize: "14px", color: tagsResult.ai_accuracy >= 85 ? "#166534" : "#92400e" }} />
                      <span style={{ fontSize: "13px", fontWeight: 700, color: tagsResult.ai_accuracy >= 85 ? "#166534" : "#92400e" }}>
                        {tagsResult.ai_accuracy}% AI accuracy
                      </span>
                    </div>
                  )}
                  {tagsResult.affected_modules?.length > 0 && (
                    <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                      Impacted: {tagsResult.affected_modules.join(", ")}
                    </div>
                  )}
                  {tagsResult.hot_modules?.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#7a2e0a" }}>
                      <i className="ti ti-flame" style={{ fontSize: "13px" }} />
                      Hot modules: {tagsResult.hot_modules.join(", ")}
                    </div>
                  )}
                </div>

                {/* Analysis summary */}
                {tagsResult.analysis_summary && (
                  <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: "0 0 14px", fontStyle: "italic" }}>
                    {tagsResult.analysis_summary}
                  </p>
                )}

                {/* Tags by group */}
                {Object.entries(SOURCE_META).map(([sourceKey, meta]) => {
                  const tags = (tagsResult.recommended_tags || []).filter(t => t.source === sourceKey)
                  if (!tags.length) return null
                  return (
                    <div key={sourceKey} style={{ marginBottom: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <div style={{ width: "22px", height: "22px", borderRadius: "6px", background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <i className={`ti ${meta.icon}`} style={{ fontSize: "12px", color: meta.color }} />
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {meta.label}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>{tags.length} tag{tags.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {tags.map(t => (
                          <div key={t.tag} style={{ background: meta.bg, border: `1px solid ${meta.color}22`, borderRadius: "10px", padding: "8px 12px", minWidth: "160px", maxWidth: "260px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                              <span style={{ fontSize: "13px", fontWeight: 700, color: meta.color }}>@{t.tag}</span>
                              <span style={{
                                fontSize: "11px", fontWeight: 700, padding: "1px 7px", borderRadius: "999px",
                                background: t.confidence >= 91 ? "#dcfce7" : t.confidence >= 80 ? "#fef3c7" : "#fee2e2",
                                color: t.confidence >= 91 ? "#166534" : t.confidence >= 80 ? "#92400e" : "#7f1d1d",
                              }}>{t.confidence}%</span>
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>{t.scenarios} scenarios</div>
                            {t.modules?.length > 0 && (
                              <div style={{ fontSize: "10px", color: meta.color, opacity: 0.75, marginTop: "3px", fontWeight: 600 }}>
                                {t.modules.slice(0, 2).join(", ")}
                              </div>
                            )}
                            <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "3px", lineHeight: 1.4 }}>{t.reason}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {/* pytest command */}
                {tagsResult.pytest_command && (
                  <div style={{ marginTop: "8px", background: "#0f172a", borderRadius: "10px", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                    <code style={{ fontSize: "12px", color: "#93c5fd", flex: 1, wordBreak: "break-all" }}>{tagsResult.pytest_command}</code>
                    <button
                      onClick={() => copyCmd(tagsResult.pytest_command)}
                      style={{ background: cmdCopied ? "#166534" : "#334155", border: "none", borderRadius: "6px", padding: "5px 12px", cursor: "pointer", color: "#fff", fontSize: "11px", fontWeight: 600, flexShrink: 0, display: "flex", alignItems: "center", gap: "5px" }}>
                      <i className={`ti ${cmdCopied ? "ti-check" : "ti-copy"}`} style={{ fontSize: "12px" }} />
                      {cmdCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title="Coverage" icon="ti-adjustments-horizontal" right={loading && <i className="ti ti-loader-2" style={{ animation: "spin 1s linear infinite", color: "var(--color-text-tertiary)" }} aria-hidden="true" />}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
              {PRESETS.map(p => (
                <button key={p.key} onClick={() => changeCoverage(p.pct)} style={{
                  padding: "8px 14px", borderRadius: "10px", cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left",
                  border: coverage === p.pct ? "1.5px solid #1a4f8a" : "1px solid var(--color-border-secondary)",
                  background: coverage === p.pct ? "#e8f0fb" : "#fff",
                }}>
                  <span style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#1a1a1a" }}>{p.pct}% {p.label}</span>
                  <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>{p.desc}</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
              <input type="range" min="1" max="100" value={coverage} onChange={e => changeCoverage(Number(e.target.value))}
                aria-label="Coverage percentage" style={{ flex: 1, padding: 0, border: "none", boxShadow: "none", accentColor: "#1a4f8a" }} />
              <span style={{ fontSize: "22px", fontWeight: 700, minWidth: "64px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{coverage}%</span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", marginBottom: "18px", userSelect: "none" }}>
              <input type="checkbox" checked={fitBudget} onChange={e => toggleBudget(e.target.checked)} style={{ accentColor: "#1a4f8a", width: "15px", height: "15px" }} />
              <span style={{ fontWeight: 600 }}>Fit to 6 hr GitHub Actions budget</span>
              <span style={{ color: "var(--color-text-tertiary)" }}>— auto-trims selection so CI completes within the runner time limit</span>
            </label>

            {sel && (
              <>
                {!sel.fits_github_budget && (
                  <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                    <div>
                      <span style={{ fontWeight: 700, color: "#856404" }}>⏱ Estimated {fmtHrs(sel.est_runtime_hrs)} — exceeds GitHub Actions {sel.github_budget_hrs}h limit</span>
                      <span style={{ color: "#856404", fontSize: "12px", marginLeft: "8px" }}>Enable "Fit to 6 hr budget" below or reduce coverage %</span>
                    </div>
                    <button onClick={() => toggleBudget(true)} style={{ whiteSpace: "nowrap", padding: "5px 12px", borderRadius: "6px", border: "1px solid #ffc107", background: "#fff", cursor: "pointer", fontWeight: 600, color: "#856404", fontSize: "12px" }}>
                      Auto-trim to 6 hrs
                    </button>
                  </div>
                )}
                <StatRow>
                  <Stat label="Selected tests" value={sel.selected.toLocaleString()} sub={`of ${sel.total.toLocaleString()}`} color="#1a4f8a" />
                  <Stat label="P0 included" value={`${sel.p0_included.toLocaleString()} / ${sel.p0_total.toLocaleString()}`} sub={sel.p0_included === sel.p0_total ? "All critical tests kept" : "Raise coverage to keep all P0"} />
                  <Stat label="Est. CI runtime" value={fmtHrs(sel.est_runtime_hrs)}
                    sub={sel.fits_github_budget ? `Within ${sel.github_budget_hrs}h GitHub limit ✓` : `Exceeds ${sel.github_budget_hrs}h limit`}
                    color={sel.fits_github_budget ? "#0a7a0a" : "#8a1a1a"} />
                  <Stat label="Failing / blocked" value={((sel.by_status.Failed || 0) + (sel.by_status.Blocked || 0)).toLocaleString()} sub="in selection, per QMetry" color="#8a1a1a" />
                </StatRow>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
                  <div>
                    <p style={{ fontSize: "12px", fontWeight: 600, margin: "0 0 8px" }}>Selection by priority tier</p>
                    <StackedBar total={sel.selected} segments={Object.entries(sel.by_tier).map(([k, v]) => ({ key: k, value: v, color: TIER_COLORS[k] }))} />
                    <div style={{ marginTop: "8px" }}><Legend items={Object.entries(sel.by_tier).map(([k, v]) => ({ key: k, value: v, color: TIER_COLORS[k] }))} /></div>
                  </div>
                  <div>
                    <p style={{ fontSize: "12px", fontWeight: 600, margin: "0 0 8px" }}>Last execution result (QMetry)</p>
                    <StackedBar total={sel.selected} segments={Object.entries(RUN_COLORS).map(([k, c]) => ({ key: k, value: sel.by_status[k] || 0, color: c }))} />
                    <div style={{ marginTop: "8px" }}><Legend items={Object.entries(RUN_COLORS).filter(([k]) => sel.by_status[k]).map(([k, c]) => ({ key: k, value: sel.by_status[k], color: c }))} /></div>
                  </div>
                </div>

                {Object.keys(sel.by_module).length > 1 && (
                  <div style={{ marginTop: "20px" }}>
                    <p style={{ fontSize: "12px", fontWeight: 600, margin: "0 0 8px" }}>Selected vs total per feature folder</p>
                    {Object.entries(sel.by_module).slice(0, 12).map(([m, v]) => (
                      <div key={m} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 200px) 1fr 110px", gap: "10px", alignItems: "center", marginBottom: "6px", fontSize: "12px" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: "11px" }} title={m}>{m || "root"}</span>
                        <StackedBar height={10} total={v.total} segments={[{ key: "Selected", value: v.selected, color: "#256abf" }, { key: "Not selected", value: v.total - v.selected, color: "#dcd8d0" }]} />
                        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--color-text-secondary)" }}>{v.selected.toLocaleString()} / {v.total.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>

          {sel?.flow_coverage && Object.keys(sel.flow_coverage).length > 0 && (() => {
            // When AI-enriched: flow keys are business categories (Order Management, Billing…)
            // When not enriched: flow keys are automation folder names (billing, receipts…)
            const isAiFlow = scanInfo?.ai_enriched
            const title = isAiFlow ? "Business flow coverage (AI)" : "Automation module coverage"
            const subtitle = isAiFlow
              ? "AI-categorised business flows from the automation suite"
              : "Automation repo feature file folders — not dev codebase modules"
            const BAR_COLOR = (pct) => pct >= 80 ? "#0a7a0a" : pct >= 40 ? "#256abf" : "#c4320a"
            return (
              <Card title={title} icon="ti-chart-bar"
                right={<span style={{ fontSize: "12px", color: "var(--color-text-tertiary)" }}>Drag slider ↑ to cover more flows</span>}>
                <p style={{ fontSize: "12px", color: "var(--color-text-tertiary)", margin: "0 0 12px" }}>{subtitle}</p>
                <div style={{ display: "grid", gap: "8px" }}>
                  {Object.entries(sel.flow_coverage).slice(0, 14).map(([flow, fd]) => (
                    <div key={flow} style={{ display: "grid", gridTemplateColumns: "minmax(160px,220px) 1fr 80px 52px", gap: "10px", alignItems: "center", fontSize: "12px" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: fd.selected > 0 ? 600 : 400 }} title={flow}>{flow}</span>
                      <div style={{ background: "var(--color-border-tertiary)", borderRadius: "4px", height: "8px", overflow: "hidden" }}>
                        <div style={{ width: `${fd.pct}%`, height: "100%", background: BAR_COLOR(fd.pct), borderRadius: "4px", transition: "width .3s" }} />
                      </div>
                      <span style={{ textAlign: "right", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>{fd.selected}/{fd.total}</span>
                      <span style={{ textAlign: "right", fontWeight: 700, color: BAR_COLOR(fd.pct) }}>{fd.pct}%</span>
                    </div>
                  ))}
                </div>
                {!isAiFlow && (
                  <p style={{ fontSize: "11px", color: "var(--color-text-tertiary)", margin: "12px 0 0", display: "flex", alignItems: "center", gap: "5px" }}>
                    <i className="ti ti-info-circle" style={{ fontSize: "13px" }} />
                    Re-scan with AI to see business-flow grouping (Order Management, Billing, etc.)
                  </p>
                )}
              </Card>
            )
          })()}

          <Card title="Export" icon="ti-download">
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <Button variant="secondary" icon="ti-file-spreadsheet" busy={downloading === "xlsx"} onClick={() => download("xlsx")}>Excel</Button>
              <Button variant="secondary" icon="ti-file-type-csv" busy={downloading === "csv"} onClick={() => download("csv")}>CSV</Button>
              <Button variant="secondary" icon="ti-braces" busy={downloading === "json"} onClick={() => download("json")}>JSON</Button>
              <Button variant="secondary" icon="ti-file-code" busy={downloading === "yaml"} onClick={() => download("yaml")}>Golden Suite YAML</Button>
              <Button variant="secondary" icon="ti-tags" busy={downloading === "features"} onClick={() => download("features")} title="Feature files with @golden added to selected scenarios">Tagged feature files</Button>
              <span style={{ width: "1px", height: "26px", background: "var(--color-border-tertiary)", margin: "0 4px" }} />
              <select value={ci} onChange={e => setCi(e.target.value)} style={{ width: "auto" }} aria-label="CI platform">
                <option value="github">GitHub Actions</option>
                <option value="jenkins">Jenkins</option>
                <option value="azure">Azure DevOps</option>
                <option value="gitlab">GitLab CI</option>
              </select>
              <Button icon="ti-git-merge" busy={downloading === "ci"} onClick={() => download("ci")}>CI/CD pipeline file</Button>
            </div>
            <p style={{ fontSize: "12px", color: "var(--color-text-tertiary)", margin: "10px 0 0" }}>
              The pipeline runs <code>pytest -m golden</code>; commit the tagged feature files (they include a <code>pytest.ini</code> registering the marker).
            </p>
          </Card>

          {/* ── Live YAML Preview ───────────────────────────────────────────── */}
          {yamlPreview ? (
            <Card
              title={`YAML preview — ${coverage}% coverage · ${yamlPreview.selected} tests`}
              icon="ti-file-code"
              right={
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => copyYaml(yamlPreview.yaml)}
                    style={{ fontSize: "12px", padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--color-border-secondary)", background: yamlCopied ? "#dcfce7" : "#fff", cursor: "pointer", color: yamlCopied ? "#166534" : "var(--color-text-primary)", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px" }}>
                    <i className={`ti ${yamlCopied ? "ti-check" : "ti-copy"}`} />
                    {yamlCopied ? "Copied!" : "Copy"}
                  </button>
                  <Button variant="secondary" icon="ti-download" onClick={() => download("yaml")}>Download</Button>
                </div>
              }>
              {tagsResult?.recommended_tags?.length > 0 && (
                <div style={{ fontSize: "12px", color: "#166534", background: "#dcfce7", borderRadius: "6px", padding: "6px 12px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <i className="ti ti-sparkles" />
                  Smart tags from AI Tag Recommender injected: {tagsResult.recommended_tags.map(t => `@${t.tag}`).join(", ")}
                </div>
              )}
              <pre style={{
                background: "#0f172a", color: "#e2e8f0", borderRadius: "10px",
                padding: "14px 16px", fontSize: "11px", lineHeight: 1.6,
                overflowX: "auto", maxHeight: "420px", overflowY: "auto", margin: 0,
              }}>{yamlPreview.yaml}</pre>
            </Card>
          ) : scanInfo && (
            <div style={{ textAlign: "center", padding: "16px", color: "var(--color-text-tertiary)", fontSize: "12px" }}>
              <i className="ti ti-file-code" style={{ marginRight: "6px" }} />
              Move the coverage slider or run AI Tag Recommender to see the YAML preview update live.
            </div>
          )}

          {sel && (
            <Card title={`Ranked tests (${rows.length.toLocaleString()}${sel.selected > sel.items.length ? ` of ${sel.selected.toLocaleString()} shown` : ""})`} icon="ti-list-numbers" pad={false}
              right={<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter by scenario, file, flow" style={{ width: "240px" }} aria-label="Filter tests" />}>
              <div style={{ maxHeight: "560px", overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={{ ...th, textAlign: "right" }}>#</th>
                    <th style={th}>Tier</th>
                    <th style={{ ...th, textAlign: "right" }}>Score</th>
                    <th style={th}>Scenario / File</th>
                    <th style={th}>Business Flow</th>
                    <th style={th}>AI Reason</th>
                    <th style={{ ...th, textAlign: "right" }}>Confidence</th>
                    <th style={th}>Last run</th>
                    <th style={{ ...th, textAlign: "right" }}>Runs/Fails</th>
                  </tr></thead>
                  <tbody>
                    {rows.map(i => (
                      <tr key={i.id}>
                        <td style={{ ...td, textAlign: "right", color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{i.rank}</td>
                        <td style={td}><TierPill tier={i.tier} /></td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", cursor: "help" }}
                          title={Object.entries(i.factors || {}).map(([k, v]) => `${FACTOR_LABEL[k] || k}: ${v}`).join("\n")}>{i.score}</td>
                        <td style={{ ...td, maxWidth: "300px" }}>
                          <span style={{ fontWeight: 600, color: "#1a4f8a", fontSize: "11px" }}>{i.kind === "manual" ? i.id : i.file}</span>
                          <div style={{ color: "var(--color-text-secondary)", fontSize: "12px" }}>{i.name}</div>
                          {i.tags?.length > 0 && (
                            <div style={{ marginTop: "2px", display: "flex", gap: "3px", flexWrap: "wrap" }}>
                              {i.tags.slice(0, 4).map(t => (
                                <span key={t} style={{ fontSize: "10px", background: "#e8f0fb", color: "#1a4f8a", borderRadius: "4px", padding: "1px 5px" }}>@{t}</span>
                              ))}
                              {i.tags.length > 4 && <span style={{ fontSize: "10px", color: "var(--color-text-tertiary)" }}>+{i.tags.length - 4}</span>}
                            </div>
                          )}
                        </td>
                        <td style={{ ...td, fontSize: "11px", whiteSpace: "nowrap" }}>
                          {i.ai_flow ? <Pill color="#256abf" bg="#e8f0fb">{i.ai_flow}</Pill> : <span style={{ color: "var(--color-text-tertiary)" }}>{i.module || "—"}</span>}
                        </td>
                        <td style={{ ...td, maxWidth: "260px", fontSize: "11px", color: "var(--color-text-secondary)", fontStyle: i.ai_reason ? "normal" : "italic" }}>
                          {i.ai_reason || "Re-scan with AI to get justification"}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {i.ai_confidence != null
                            ? <span style={{ fontWeight: 700, color: CONF_COLOR(i.ai_confidence) }}>{i.ai_confidence}%</span>
                            : <span style={{ color: "var(--color-text-tertiary)" }}>—</span>}
                        </td>
                        <td style={td}><RunPill status={i.last_status} /></td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{i.runs} / {i.fails}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
