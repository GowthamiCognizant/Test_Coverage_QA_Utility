import { useState, useEffect } from "react"
import { useAuth, useProject, apiFetch } from "../App"

// ── Code Coverage Matrix ─────────────────────────────────────────────────────

function CovBar({ pct, height = 7 }) {
  const color = pct >= 70 ? "#4a7c3f" : pct >= 35 ? "#c8a96e" : "#d05538"
  return (
    <div style={{ background: "#f0ede8", borderRadius: 4, overflow: "hidden", height }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.4s" }} />
    </div>
  )
}

function CovPill({ pct }) {
  const [color, bg] = pct >= 70 ? ["#2e6b24", "#eaf3e6"] : pct >= 35 ? ["#a06020", "#fdf3e3"] : ["#8a1a1a", "#fce8e8"]
  return <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: 999, fontWeight: 700, background: bg, color }}>{pct}%</span>
}

function SemanticBadge({ score, confidence }) {
  if (score == null) return null
  const pct    = Math.round(score * 100)
  const color  = pct >= 70 ? "#2e6b24" : pct >= 40 ? "#a06020" : "#8a1a1a"
  const bg     = pct >= 70 ? "#eaf3e6" : pct >= 40 ? "#fdf3e3" : "#fce8e8"
  const label  = pct >= 70 ? "Strong match" : pct >= 40 ? "Weak match" : "Low overlap"
  return (
    <span title={`Semantic score: keyword overlap between flow and automation = ${pct}%\nAI confidence: ${Math.round((confidence||0)*100)}%`}
      style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: bg, color, cursor: "help", flexShrink: 0, display: "flex", alignItems: "center", gap: "3px" }}>
      <i className="ti ti-math-function" style={{ fontSize: "9px" }} />
      {pct}% {label}
    </span>
  )
}

function FlowRow({ flow }) {
  const [open, setOpen] = useState(false)
  const statusCfg = {
    covered: { color: "#2e6b24", bg: "#eaf3e6", icon: "ti-circle-check", label: "Covered" },
    partial: { color: "#a06020", bg: "#fdf3e3", icon: "ti-circle-half",  label: "Partial" },
    missing: { color: "#8a1a1a", bg: "#fce8e8", icon: "ti-circle-x",     label: "Missing" },
  }
  const cfg = statusCfg[flow.coverage] || statusCfg.missing
  const hasMeta = !!(flow.covered_by?.length || flow.missing_scenarios?.length || flow.operations?.length || flow.source_evidence || flow.match_evidence)
  return (
    <div style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
      <div
        onClick={() => hasMeta && setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", cursor: hasMeta ? "pointer" : "default", fontSize: "12px" }}
      >
        <i className={`ti ${cfg.icon}`} style={{ color: cfg.color, fontSize: "14px", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{flow.name}</span>
          {flow.module && <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginLeft: "8px" }}>{flow.module}</span>}
        </div>
        {/* AI confidence — the model's own certainty in this specific claim */}
        {flow.confidence != null && (() => {
          const pct = Math.round(flow.confidence * 100)
          const c = pct >= 80 ? "#2e6b24" : pct >= 50 ? "#a06020" : "#8a1a1a"
          const b = pct >= 80 ? "#eaf3e6" : pct >= 50 ? "#fdf3e3" : "#fce8e8"
          return (
            <span
              title={`AI confidence: Claude/Gemini returned ${pct}% certainty that this coverage claim is correct`}
              style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: b, color: c, flexShrink: 0, display: "flex", alignItems: "center", gap: "3px", cursor: "help" }}
            >
              <i className="ti ti-brain" style={{ fontSize: "9px" }} />
              AI {pct}%
            </span>
          )
        })()}
        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: cfg.bg, color: cfg.color, flexShrink: 0 }}>
          {cfg.label}
        </span>
        {hasMeta && <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ fontSize: "11px", color: "var(--color-text-tertiary)", flexShrink: 0 }} />}
      </div>

      {open && (
        <div style={{ background: "#fafaf8", padding: "10px 14px 12px 38px", fontSize: "11px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {flow.description && (
            <p style={{ margin: 0, color: "var(--color-text-secondary)", fontStyle: "italic" }}>{flow.description}</p>
          )}

          {flow.operations?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
              <span style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}>Operations:</span>
              {flow.operations.map((op, i) => (
                <span key={i} style={{ background: "#f0ede8", padding: "1px 7px", borderRadius: 999, color: "var(--color-text-secondary)" }}>{op}</span>
              ))}
            </div>
          )}

          {flow.source_evidence && (
            <div style={{ background: "#f0f4ff", border: "1px solid #c8d8f8", borderRadius: "6px", padding: "8px 10px" }}>
              <div style={{ fontWeight: 700, color: "#1a3a7a", marginBottom: "4px", display: "flex", alignItems: "center", gap: "5px" }}>
                <i className="ti ti-code" style={{ fontSize: "11px" }} />
                Source evidence — proves this flow exists in the codebase:
              </div>
              <code style={{ color: "#1a3a7a", display: "block", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "11px" }}>{flow.source_evidence}</code>
            </div>
          )}

          {flow.covered_by?.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, color: "#2e6b24", marginBottom: "3px" }}>Covered by scenarios:</div>
              {flow.covered_by.map((s, i) => (
                <div key={i} style={{ paddingLeft: 10, color: "#2e6b24", marginTop: 2 }}>↳ {s}</div>
              ))}
            </div>
          )}

          {flow.match_evidence && (
            <div style={{ background: "#f2faea", border: "1px solid #b8d8a8", borderRadius: "6px", padding: "8px 10px" }}>
              <div style={{ fontWeight: 700, color: "#2e6b24", marginBottom: "4px", display: "flex", alignItems: "center", gap: "5px" }}>
                <i className="ti ti-robot" style={{ fontSize: "11px" }} />
                Automation evidence — steps extracted from feature file:
              </div>
              <code style={{ color: "#2e4e24", display: "block", whiteSpace: "pre-wrap", fontSize: "11px" }}>{flow.match_evidence}</code>
            </div>
          )}

          {(flow.confidence != null || flow.semantic_score != null) && (
            <div style={{ display: "flex", gap: "12px", fontSize: "10px", color: "var(--color-text-tertiary)", paddingTop: "2px", borderTop: "1px solid #e8e4de" }}>
              {flow.confidence != null && (
                <span>AI confidence: <b style={{ color: flow.confidence >= 0.8 ? "#2e6b24" : flow.confidence >= 0.5 ? "#a06020" : "#8a1a1a" }}>{Math.round(flow.confidence * 100)}%</b></span>
              )}
              {flow.semantic_score != null && (
                <span>Keyword overlap score: <b style={{ color: flow.semantic_score >= 0.7 ? "#2e6b24" : flow.semantic_score >= 0.4 ? "#a06020" : "#8a1a1a" }}>{Math.round(flow.semantic_score * 100)}%</b></span>
              )}
              <span style={{ fontStyle: "italic" }}>Two independent signals — AI semantic match + deterministic token overlap</span>
            </div>
          )}

          {flow.missing_scenarios?.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, color: "#8a1a1a", marginBottom: "3px" }}>Automation gaps:</div>
              {flow.missing_scenarios.map((s, i) => (
                <div key={i} style={{ paddingLeft: 10, color: "#8a1a1a", marginTop: 2 }}>✗ {s}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AICoverageView({ data }) {
  const s = data.summary || {}
  const flows = data.business_flows || []
  const pct = s.coverage_pct ?? 0
  const covered = flows.filter(f => f.coverage === "covered")
  const partial  = flows.filter(f => f.coverage === "partial")
  const missing  = flows.filter(f => f.coverage === "missing")
  const [showPartial, setShowPartial]  = useState(true)
  const [showMissing, setShowMissing]  = useState(true)
  const [showCovered, setShowCovered]  = useState(false)
  const [showFiles, setShowFiles]      = useState(false)

  // Hard error — codebase had no application logic files
  if (data.error && flows.length === 0) {
    return (
      <div style={{ padding: "18px 20px" }}>
        <div style={{ background: "#fdf3e3", border: "1px solid #f0c080", borderRadius: "8px", padding: "14px 16px", marginBottom: "14px" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <i className="ti ti-alert-triangle" style={{ color: "#a06020", fontSize: "18px", flexShrink: 0, marginTop: "1px" }} />
            <div>
              <div style={{ fontWeight: 700, color: "#7a4810", marginBottom: "4px", fontSize: "13px" }}>No business logic found in codebase</div>
              <div style={{ fontSize: "12px", color: "#5a3010", lineHeight: 1.6 }}>{data.error}</div>
            </div>
          </div>
        </div>
        {data.sampled_files?.length > 0 && (
          <div style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
            <div onClick={() => setShowFiles(!showFiles)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", background: "var(--color-background-secondary)", cursor: "pointer", fontSize: "12px" }}>
              <i className="ti ti-files" style={{ color: "var(--color-text-secondary)" }} />
              <span style={{ flex: 1, fontWeight: 600 }}>Files the AI read ({data.sampled_files.length})</span>
              <i className={`ti ti-chevron-${showFiles ? "up" : "down"}`} style={{ fontSize: "12px" }} />
            </div>
            {showFiles && data.sampled_files.map((f, i) => (
              <div key={i} style={{ padding: "5px 14px", borderTop: "1px solid var(--color-border-tertiary)", fontSize: "11px", fontFamily: "monospace", color: "var(--color-text-secondary)" }}>{f}</div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: "16px 18px" }}>
      {/* Sampled files transparency — always show what the AI actually read */}
      {data.sampled_files?.length > 0 && (
        <div style={{ border: "1px solid #d8e8f8", borderRadius: "8px", overflow: "hidden", marginBottom: "14px" }}>
          <div onClick={() => setShowFiles(!showFiles)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", background: "#f0f6ff", cursor: "pointer", fontSize: "11px" }}>
            <i className="ti ti-file-code" style={{ color: "#1a5fa5", fontSize: "13px" }} />
            <span style={{ flex: 1, fontWeight: 600, color: "#1a3a7a" }}>Source files the AI read ({data.sampled_files.length} files from dev codebase)</span>
            <i className={`ti ti-chevron-${showFiles ? "up" : "down"}`} style={{ fontSize: "11px", color: "#1a5fa5" }} />
          </div>
          {showFiles && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "10px 14px", background: "#f8fbff" }}>
              {data.sampled_files.map((f, i) => (
                <code key={i} style={{ fontSize: "10px", background: "#e8f0fb", color: "#1a3a7a", padding: "2px 7px", borderRadius: "4px" }}>{f.split("/").pop()}</code>
              ))}
            </div>
          )}
        </div>
      )}
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "18px" }}>
        {[
          { label: "AI coverage",         pct, sub: `${covered.length} covered · ${partial.length} partial` },
          { label: "Flows covered",        pct: s.total_flows ? Math.round(100*covered.length/s.total_flows) : 0, sub: `${covered.length} / ${s.total_flows} business flows` },
          { label: "Partial — needs work", pct: s.total_flows ? Math.round(100*partial.length/s.total_flows) : 0, sub: `${partial.length} flows need more scenarios` },
          { label: "Accuracy signal",      pct: Math.round((s.overall_accuracy ?? 0) * 100), sub: "AI confidence × keyword overlap" },
        ].map(k => (
          <div key={k.label} style={{ background: "var(--color-background-secondary)", borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.label}</span>
              <CovPill pct={k.pct} />
            </div>
            <CovBar pct={k.pct} />
            <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "5px" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Accuracy explanation banner */}
      <div style={{ background: "#f0f4ff", border: "1px solid #c8d8f8", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "11px", color: "#1a3a7a" }}>
        <b>How accuracy is validated — 3 independent signals per flow:</b>
        <div style={{ display: "flex", gap: "20px", marginTop: "6px", flexWrap: "wrap" }}>
          <span><b>1. Source evidence</b> — actual code lines proving the flow exists in the dev codebase (expand any row)</span>
          <span><b>2. Automation evidence</b> — verbatim Gherkin steps from the feature file proving coverage</span>
          <span><b>3. Semantic score</b> — deterministic keyword overlap between flow's terms and automation text (independent of AI)</span>
        </div>
      </div>

      {/* Missing flows */}
      {missing.length > 0 && (
        <div style={{ marginBottom: "10px", border: "1px solid #fcd5c0", borderRadius: "8px", overflow: "hidden" }}>
          <div onClick={() => setShowMissing(!showMissing)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", background: "#fff5f2", cursor: "pointer", fontSize: "12px" }}>
            <i className="ti ti-circle-x" style={{ color: "#d05538" }} />
            <span style={{ flex: 1, fontWeight: 600, color: "#7a1818" }}>No automation — {missing.length} business flows not tested</span>
            <i className={`ti ti-chevron-${showMissing ? "up" : "down"}`} style={{ fontSize: "12px", color: "#d05538" }} />
          </div>
          {showMissing && missing.map((f, i) => <FlowRow key={f.id || i} flow={f} />)}
        </div>
      )}

      {/* Partial flows */}
      {partial.length > 0 && (
        <div style={{ marginBottom: "10px", border: "1px solid #f0d8a0", borderRadius: "8px", overflow: "hidden" }}>
          <div onClick={() => setShowPartial(!showPartial)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", background: "#fdf8e8", cursor: "pointer", fontSize: "12px" }}>
            <i className="ti ti-circle-half" style={{ color: "#a06020" }} />
            <span style={{ flex: 1, fontWeight: 600, color: "#7a4810" }}>Partial coverage — {partial.length} flows missing edge cases</span>
            <i className={`ti ti-chevron-${showPartial ? "up" : "down"}`} style={{ fontSize: "12px", color: "#a06020" }} />
          </div>
          {showPartial && partial.map((f, i) => <FlowRow key={f.id || i} flow={f} />)}
        </div>
      )}

      {/* Covered flows */}
      {covered.length > 0 && (
        <div style={{ marginBottom: "10px", border: "1px solid #c0dab0", borderRadius: "8px", overflow: "hidden" }}>
          <div onClick={() => setShowCovered(!showCovered)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", background: "#f2faea", cursor: "pointer", fontSize: "12px" }}>
            <i className="ti ti-circle-check" style={{ color: "#2e6b24" }} />
            <span style={{ flex: 1, fontWeight: 600, color: "#2e6b24" }}>Well covered — {covered.length} flows fully automated</span>
            <i className={`ti ti-chevron-${showCovered ? "up" : "down"}`} style={{ fontSize: "12px", color: "#2e6b24" }} />
          </div>
          {showCovered && covered.map((f, i) => <FlowRow key={f.id || i} flow={f} />)}
        </div>
      )}

      <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "8px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <span>Analysed {new Date(data.scanned_at).toLocaleString()}</span>
        <span style={{ color: "#1a5fa5", background: "#e8f0fb", padding: "1px 8px", borderRadius: 999, fontWeight: 600 }}>
          <i className="ti ti-brain" style={{ marginRight: 4, fontSize: "10px" }} />AI-powered · {data.total_scenarios ?? 0} feature files · {data.total_modules ?? 0} source modules
        </span>
      </div>
    </div>
  )
}

function StaticCoverageView({ data, openRoutes, setOpenRoutes, expandedMod, setExpandedMod }) {
  return (
    <div style={{ padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px", marginBottom: "18px" }}>
        {[
          { label: "Module coverage", pct: data.module_coverage_pct, sub: `${data.modules_covered} / ${data.total_modules} modules` },
          { label: "Route coverage",  pct: data.route_coverage_pct,  sub: `${data.covered_routes} / ${data.total_routes} routes` },
        ].map(k => (
          <div key={k.label} style={{ background: "var(--color-background-secondary)", borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.label}</span>
              <CovPill pct={k.pct} />
            </div>
            <CovBar pct={k.pct} />
            <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "5px" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {data.modules?.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, margin: "0 0 8px", color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Per-module breakdown ({data.modules.length})
          </p>
          <div style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 90px 90px 100px", padding: "7px 12px", background: "var(--color-background-secondary)", fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border-tertiary)" }}>
              <span>Module</span><span style={{ textAlign: "center" }}>Layer</span>
              <span style={{ textAlign: "center" }}>Routes</span><span style={{ textAlign: "center" }}>Scenarios</span><span style={{ textAlign: "right" }}>Coverage</span>
            </div>
            {data.modules.slice(0, 20).map((m, i) => (
              <div key={m.module}>
                <div
                  onClick={() => setExpandedMod(expandedMod === m.module ? null : m.module)}
                  style={{ display: "grid", gridTemplateColumns: "1fr 60px 90px 90px 100px", padding: "8px 12px", borderBottom: i < data.modules.length - 1 ? "1px solid var(--color-border-tertiary)" : "none", fontSize: "12px", cursor: m.route_detail?.length > 0 ? "pointer" : "default", alignItems: "center" }}
                >
                  <span style={{ fontWeight: 500, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    {m.route_detail?.length > 0 && <i className={`ti ti-chevron-${expandedMod === m.module ? "up" : "down"}`} style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }} />}
                    {m.module}
                  </span>
                  <span style={{ textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "11px" }}>{m.layer}</span>
                  <span style={{ textAlign: "center", color: "var(--color-text-secondary)" }}>{m.routes_covered}/{m.routes_total}</span>
                  <span style={{ textAlign: "center", color: "var(--color-text-secondary)" }}>{m.scenarios_count}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" }}>
                    <div style={{ flex: 1, minWidth: 50 }}><CovBar pct={m.coverage_pct} /></div>
                    <CovPill pct={m.coverage_pct} />
                  </div>
                </div>
                {expandedMod === m.module && m.route_detail?.length > 0 && (
                  <div style={{ background: "#fafaf8", borderBottom: "1px solid var(--color-border-tertiary)" }}>
                    {m.route_detail.map((r, ri) => {
                      const confColor = r.confidence === "high" ? "#2e6b24" : r.confidence === "medium" ? "#a06020" : "#9a968e"
                      return (
                        <div key={ri} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 28px", borderBottom: ri < m.route_detail.length - 1 ? "1px solid #f0ede8" : "none", fontSize: "11px" }}>
                          <i className={`ti ${r.covered ? "ti-circle-check" : "ti-circle-x"}`} style={{ color: r.covered ? "#4a7c3f" : "#d05538", flexShrink: 0 }} aria-hidden="true" />
                          <code style={{ flex: 1, fontSize: "11px", color: "var(--color-text-secondary)" }}>{r.route}</code>
                          {r.description && <span style={{ color: "var(--color-text-tertiary)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: "italic" }} title={r.description}>{r.description}</span>}
                          {r.confidence && r.confidence !== "none" && <span style={{ color: confColor, fontSize: "10px", fontWeight: 700, flexShrink: 0 }}>{r.confidence}</span>}
                          {r.matched_by && <span style={{ color: "var(--color-text-tertiary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.matched_by}>↳ {r.matched_by}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.uncovered_routes?.length > 0 && (
        <div style={{ marginBottom: "10px", border: "1px solid #fcd5c0", borderRadius: "8px", overflow: "hidden" }}>
          <div onClick={() => setOpenRoutes(!openRoutes)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", background: "#fff5f2", cursor: "pointer", fontSize: "12px" }}>
            <i className="ti ti-route-x" style={{ color: "#d05538" }} />
            <span style={{ flex: 1, fontWeight: 500, color: "#7a1818" }}>Uncovered routes — {data.uncovered_routes.length} with no feature scenario</span>
            <i className={`ti ti-chevron-${openRoutes ? "up" : "down"}`} style={{ fontSize: "12px", color: "#d05538" }} />
          </div>
          {openRoutes && (
            <div style={{ maxHeight: "240px", overflow: "auto" }}>
              {data.uncovered_routes.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: "10px", padding: "6px 14px", borderTop: "1px solid #fce8e8", fontSize: "11px" }}>
                  <span style={{ color: "var(--color-text-tertiary)", minWidth: 100, flexShrink: 0 }}>{r.module}</span>
                  <code style={{ color: "#8a1a1a" }}>{r.route}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", marginTop: "10px", fontSize: "11px", color: "var(--color-text-tertiary)" }}>
        <span>Scanned {new Date(data.scanned_at).toLocaleString()} · {data.total_scenarios} feature scenarios</span>
        {data.openapi_used
          ? <span style={{ color: "#1a4f8a", background: "#e8f0fb", padding: "2px 8px", borderRadius: 999, fontWeight: 600 }}>
              <i className="ti ti-api" style={{ marginRight: "4px", fontSize: "10px" }} />OpenAPI · {data.openapi_endpoints_total} endpoints
            </span>
          : <span>keyword matching — upload OpenAPI spec for higher accuracy</span>
        }
      </div>
    </div>
  )
}

function CodeCoverageMatrix({ project, token, onGenerate, onExport }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [err, setErr] = useState("")
  const [openRoutes, setOpenRoutes] = useState(false)
  const [openBacklog, setOpenBacklog] = useState(false)
  const [expandedMod, setExpandedMod] = useState(null)

  useEffect(() => {
    if (!project) return
    apiFetch(`/projects/${project.id}/coverage/code-scan`, {}, token)
      .then(setData).catch(() => setData(null))
  }, [project])

  async function scan() {
    setLoading(true); setErr("")
    try { setData(await apiFetch(`/projects/${project.id}/coverage/code-scan`, { method: "POST" }, token)) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  async function generateScripts() {
    setGenerating(true); setErr("")
    try {
      const res = await apiFetch(`/projects/${project.id}/generate`, { method: "POST" }, token)
      const count = res.generated_files?.filter(f => f.endsWith(".feature")).length || 0
      if (count === 0) {
        setErr("No gaps found to generate — all business flows are already covered.")
      } else {
        setErr(`✓ ${count} feature file${count !== 1 ? "s" : ""} generated using ${res.model_used || "AI"} — opening Script Generator…`)
        setTimeout(() => { onGenerate && onGenerate() }, 600)
      }
    } catch (e) { setErr("Generate failed: " + e.message) }
    finally { setGenerating(false) }
  }

  async function exportReport() {
    setExporting(true)
    try {
      const res = await fetch(
        `http://localhost:8080/api/projects/${project.id}/report`,
        { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} }
      )
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = "coverage_report.docx"
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch (e) { setErr("Export failed: " + e.message) }
    finally { setExporting(false) }
  }

  return (
    <div style={{ marginBottom: "24px", border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", background: "var(--color-background-primary)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 18px", background: data?.ai_powered ? "#eef3fc" : "#f0ede8", borderBottom: "1px solid var(--color-border-tertiary)" }}>
        <i className={`ti ${data?.ai_powered ? "ti-brain" : "ti-code-dots"}`} style={{ fontSize: "17px", color: data?.ai_powered ? "#1a5fa5" : "#00897b" }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>
            {data?.ai_powered ? "AI business-flow coverage" : "Code coverage matrix"}
          </span>
          <span style={{ fontSize: "12px", color: "var(--color-text-tertiary)", marginLeft: "10px" }}>
            {data?.ai_powered
              ? "Claude reads source code → extracts business flows → maps to automation"
              : "Static — no AI, no test run needed"}
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {data && (
            <>
              <button onClick={exportReport} disabled={exporting} title="Export Word coverage report" style={{
                display: "flex", alignItems: "center", gap: "5px", padding: "7px 12px",
                background: "transparent", border: "1px solid #c8d8f8", borderRadius: "8px",
                fontSize: "12px", fontWeight: 600, cursor: exporting ? "wait" : "pointer", color: "#1a5fa5",
              }}>
                <i className={`ti ${exporting ? "ti-loader" : "ti-file-word"}`} style={{ fontSize: "13px", animation: exporting ? "spin 1s linear infinite" : "none" }} />
                {exporting ? "Exporting…" : "Export"}
              </button>
              <button onClick={generateScripts} disabled={generating} title="Generate feature files + step defs for coverage gaps (Agent 2)" style={{
                display: "flex", alignItems: "center", gap: "5px", padding: "7px 14px",
                background: generating ? "#e8e4de" : "#2e6b24", color: generating ? "#9a968e" : "#fff",
                border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: generating ? "wait" : "pointer",
              }}>
                <i className={`ti ${generating ? "ti-loader" : "ti-wand"}`} style={{ fontSize: "13px", animation: generating ? "spin 1s linear infinite" : "none" }} />
                {generating ? "Generating…" : "Generate Scripts"}
              </button>
            </>
          )}
          <button onClick={scan} disabled={loading} style={{
            display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px",
            background: loading ? "#e8e4de" : data?.ai_powered ? "#1a5fa5" : "#00897b",
            color: loading ? "#9a968e" : "#fff",
            border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: loading ? "wait" : "pointer",
          }}>
            <i className={`ti ${loading ? "ti-loader" : "ti-scan"}`} style={{ fontSize: "13px", animation: loading ? "spin 1s linear infinite" : "none" }} />
            {loading ? "Analysing…" : data ? "Re-scan" : "Scan code"}
          </button>
        </div>
      </div>

      {err && (
        <div style={{ padding: "12px 18px", background: "#fdf3e3", borderBottom: "1px solid var(--color-border-tertiary)", fontSize: "12px", color: "#7a4810", display: "flex", gap: "8px", alignItems: "center" }}>
          <i className="ti ti-alert-circle" style={{ fontSize: "14px", flexShrink: 0 }} />
          {err}
        </div>
      )}

      {!data && !err && (
        <div style={{ padding: "28px 20px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "13px" }}>
          <i className="ti ti-brain" style={{ fontSize: "28px", display: "block", marginBottom: "8px", color: "#1a5fa5" }} />
          Claude reads your dev team's source code, extracts every business flow, then checks which flows have automation coverage.
          <br /><span style={{ fontSize: "12px", marginTop: "6px", display: "block" }}>Requires: uploaded app codebase (Data sources → Application code)</span>
        </div>
      )}

      {data && data.ai_powered && <AICoverageView data={data} />}
      {data && !data.ai_powered && (
        <StaticCoverageView
          data={data}
          openRoutes={openRoutes} setOpenRoutes={setOpenRoutes}
          openBacklog={openBacklog} setOpenBacklog={setOpenBacklog}
          expandedMod={expandedMod} setExpandedMod={setExpandedMod}
        />
      )}
    </div>
  )
}

function Badge({ label, color, bg }) {
  return (
    <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "999px", fontWeight: 600, background: bg, color, flexShrink: 0 }}>
      {label}
    </span>
  )
}

// ── Accuracy Score Badge ─────────────────────────────────────────────────────
function AccuracyBadge({ score, label, breakdown }) {
  const [open, setOpen] = useState(false)
  if (score == null) return null
  const cfg = label === "High"
    ? { color: "#2e6b24", bg: "#eaf3e6", border: "#c0dd97" }
    : label === "Medium"
    ? { color: "#a06020", bg: "#fdf3e3", border: "#e8c87a" }
    : { color: "#8a1a1a", bg: "#fce8e8", border: "#f0a0a0" }

  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: "10px", padding: "12px 16px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", cursor: breakdown ? "pointer" : "default" }} onClick={() => breakdown && setOpen(o => !o)}>
        <i className="ti ti-chart-pie-2" style={{ fontSize: "18px", color: cfg.color }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: "14px", color: cfg.color }}>Accuracy: {label} — {score}%</span>
          <span style={{ fontSize: "12px", color: cfg.color + "aa", marginLeft: "10px" }}>AI analysis confidence for this project</span>
        </div>
        <span style={{ fontSize: "22px", fontWeight: 800, color: cfg.color, fontVariantNumeric: "tabular-nums" }}>{score}%</span>
        {breakdown && <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ fontSize: "12px", color: cfg.color }} />}
      </div>
      {open && breakdown && (
        <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px" }}>
          {[
            { key: "domain_knowledge",   label: "Domain knowledge",   desc: "Americold logistics terms in automation" },
            { key: "story_traceability", label: "Story traceability",  desc: "Stories with TC ID tags in feature files" },
            { key: "tc_mapping",         label: "TC mapping",          desc: "Stories matched to scenarios" },
            { key: "flow_coverage",      label: "Business flow cover", desc: "Key Americold flows referenced" },
          ].map(({ key, label: l, desc }) => {
            const pct = breakdown[key] ?? 0
            const bc = pct >= 80 ? "#2e6b24" : pct >= 60 ? "#a06020" : "#8a1a1a"
            return (
              <div key={key} style={{ background: "rgba(255,255,255,0.7)", borderRadius: "8px", padding: "8px 10px" }} title={desc}>
                <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>{l}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ flex: 1, height: "5px", background: "#e8e4de", borderRadius: "3px" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: bc, borderRadius: "3px", transition: "width 0.4s" }} />
                  </div>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: bc }}>{pct}%</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Story Coverage View (Type 2) ─────────────────────────────────────────────
function StoryRow({ item }) {
  const cfg = item.coverage === "covered"
    ? { color: "#2e6b24", bg: "#eaf3e6", icon: "ti-circle-check", label: "Covered" }
    : item.coverage === "partial"
    ? { color: "#a06020", bg: "#fdf3e3", icon: "ti-circle-half",  label: "Partial" }
    : { color: "#8a1a1a", bg: "#fce8e8", icon: "ti-circle-x",     label: "Missing" }

  const scorePct = Math.round((item.match_score || 0) * 100)
  const scoreColor = scorePct >= 80 ? "#2e6b24" : scorePct >= 40 ? "#a06020" : "#8a1a1a"
  const scoreBg    = scorePct >= 80 ? "#eaf3e6" : scorePct >= 40 ? "#fdf3e3" : "#fce8e8"
  const scoreLabel = scorePct >= 80 ? "Strong match" : scorePct >= 40 ? "Partial match" : "No match"

  return (
    <div style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "8px 14px", fontSize: "12px" }}>
        <i className={`ti ${cfg.icon}`} style={{ color: cfg.color, fontSize: "14px", flexShrink: 0, marginTop: "2px" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, color: "#1a4f8a", flexShrink: 0 }}>{item.key}</span>
            {item.priority && <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: 999, background: "#f5f2ed", color: "var(--color-text-secondary)" }}>{item.priority}</span>}
            {item.component && <span style={{ fontSize: "10px", color: "var(--color-text-tertiary)", fontStyle: "italic" }}>{item.component}</span>}
          </div>
          <div style={{ color: "var(--color-text-secondary)", marginTop: "2px" }}>{item.summary}</div>
          {item.matched_scenario && (
            <div style={{ fontSize: "11px", color: "#2e6b24", marginTop: "3px" }}>
              ↳ <i className="ti ti-test-pipe" style={{ fontSize: "10px" }} /> {item.matched_scenario}
              {item.matched_file && <span style={{ color: "var(--color-text-tertiary)", marginLeft: "6px" }}>({item.matched_file})</span>}
            </div>
          )}
          {/* AI reason — why the AI made this coverage decision */}
          {item.ai_reason && (
            <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "3px", fontStyle: "italic" }}>
              <i className="ti ti-brain" style={{ fontSize: "10px", marginRight: "4px", color: "#1a5fa5" }} />
              {item.ai_reason}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
          <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
          {/* AI confidence — always shown so user can judge every AI output claim */}
          <span
            title={`AI confidence: the model's own certainty that this coverage decision is correct.\n${scorePct}% — ${scoreLabel}`}
            style={{ fontSize: "10px", fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: scoreBg, color: scoreColor, cursor: "help", display: "flex", alignItems: "center", gap: "3px" }}
          >
            <i className="ti ti-brain" style={{ fontSize: "9px" }} />
            AI {scorePct}%
          </span>
        </div>
      </div>
    </div>
  )
}

const DEMO_STORY_DATA = {
  summary: {
    total_stories: 16, covered: 10, partial: 3, missing: 3,
    story_coverage_pct: 71.9,
    accuracy_score: 91.3, accuracy_label: "High", accuracy_color: "green",
    accuracy_breakdown: { domain_knowledge: 94, story_traceability: 78, tc_mapping: 81, flow_coverage: 88 },
    total_scenarios: 248,
    ai_powered: true, model_used: "claude-sonnet-4-5", ai_confidence: 93,
  },
  covered: [
    { key: "AMCC-101", summary: "Inbound receipt — scan pallet barcode on dock arrival", component: "Inbound", priority: "High", status: "Done", coverage: "covered", match_score: 0.94, matched_scenario: "Scan pallet on dock arrival", matched_file: "inbound_receiving.feature", ai_confidence: 0.94, ai_reason: "Scenario Given/When/Then steps directly match the receipt scan and WMS creation flow" },
    { key: "AMCC-102", summary: "Putaway — assign pallet to cold storage bin", component: "Putaway", priority: "High", status: "Done", coverage: "covered", match_score: 0.91, matched_scenario: "Assign pallet to storage location", matched_file: "putaway_flow.feature", ai_confidence: 0.91, ai_reason: "Feature file explicitly tests putaway assignment with cold storage bin and zone validation" },
    { key: "AMCC-103", summary: "Outbound pick — generate pick list for shipment order", component: "Outbound", priority: "High", status: "Done", coverage: "covered", match_score: 0.89, matched_scenario: "Generate pick list for outbound order", matched_file: "outbound_shipment.feature", ai_confidence: 0.89, ai_reason: "Steps include pick list generation, wave release, and order dispatch logic" },
    { key: "AMCC-110", summary: "User login — authenticate with LDAP credentials", component: "Auth", priority: "Medium", status: "Done", coverage: "covered", match_score: 0.96, matched_scenario: "Login with valid credentials", matched_file: "auth_login.feature", ai_confidence: 0.96, ai_reason: "Exact match on authentication scenario — LDAP path, token and session steps all present" },
    { key: "AMCC-115", summary: "Inventory count — cycle count for zone A", component: "Inventory", priority: "Medium", status: "Done", coverage: "covered", match_score: 0.87, matched_scenario: "Cycle count reconciliation for zone", matched_file: "inventory_count.feature", ai_confidence: 0.87, ai_reason: "Zone-level cycle count, variance capture and WMS reconciliation fully covered" },
    { key: "AMCC-116", summary: "Dock scheduling — book inbound appointment slot", component: "Dock", priority: "High", status: "Done", coverage: "covered", match_score: 0.88, matched_scenario: "Book dock appointment for inbound carrier", matched_file: "dock_scheduling.feature", ai_confidence: 0.88, ai_reason: "Appointment creation, slot availability check and carrier notification are all tested" },
    { key: "AMCC-117", summary: "Replenishment — auto-trigger pick face top-up below min level", component: "Replenishment", priority: "High", status: "Done", coverage: "covered", match_score: 0.85, matched_scenario: "Trigger replenishment when bin falls below threshold", matched_file: "replenishment.feature", ai_confidence: 0.85, ai_reason: "Threshold trigger, bin-to-face transfer and WMS update steps all match the story AC" },
    { key: "AMCC-118", summary: "Label printing — generate SSCC barcode label on receipt", component: "Inbound", priority: "Medium", status: "Done", coverage: "covered", match_score: 0.90, matched_scenario: "Print SSCC label on pallet receipt", matched_file: "labeling.feature", ai_confidence: 0.90, ai_reason: "SSCC generation, Zebra printer call and label format validation are present in steps" },
    { key: "AMCC-119", summary: "Outbound dispatch — close load and generate BOL", component: "Outbound", priority: "High", status: "Done", coverage: "covered", match_score: 0.86, matched_scenario: "Close load and generate bill of lading", matched_file: "outbound_dispatch.feature", ai_confidence: 0.86, ai_reason: "Load closure, BOL PDF generation and carrier confirmation steps match acceptance criteria" },
    { key: "AMCC-120", summary: "Defect logging — raise quality hold on damaged receipt", component: "Quality", priority: "High", status: "Done", coverage: "covered", match_score: 0.83, matched_scenario: "Place pallet on quality hold", matched_file: "quality_hold.feature", ai_confidence: 0.83, ai_reason: "Hold flag, quarantine location move and Jira defect creation steps are all covered" },
  ],
  partial: [
    { key: "AMCC-104", summary: "Temperature monitoring — alert when reefer drops below threshold", component: "Temperature", priority: "Critical", status: "In Progress", coverage: "partial", match_score: 0.61, matched_scenario: "Monitor reefer temperature", matched_file: "temperature_alerts.feature", ai_confidence: 0.61, ai_reason: "Monitoring is covered but the threshold-breach alert email and escalation steps are absent" },
    { key: "AMCC-108", summary: "Returns processing — damaged goods inspection and re-label", component: "Returns", priority: "Medium", status: "In Progress", coverage: "partial", match_score: 0.57, matched_scenario: "Process returned shipment", matched_file: "returns_flow.feature", ai_confidence: 0.57, ai_reason: "Return receipt is tested but damaged goods inspection, photo capture and re-label steps are missing" },
    { key: "AMCC-112", summary: "Yard management — assign trailer to dock door by appointment", component: "Yard", priority: "Medium", status: "Backlog", coverage: "partial", match_score: 0.53, matched_scenario: "Assign trailer to available dock", matched_file: "yard_management.feature", ai_confidence: 0.53, ai_reason: "Dock door assignment is tested but appointment-time validation and TMS sync steps are not covered" },
  ],
  missing: [
    { key: "AMCC-106", summary: "ASN processing — auto-match advance shipment notice to inbound order", component: "Inbound", priority: "High", status: "Backlog", coverage: "missing", match_score: 0.09, ai_confidence: 0.09, ai_reason: "No feature file scenario references ASN matching or advance shipment notice processing" },
    { key: "AMCC-107", summary: "Wave planning — optimise pick routes by zone and carrier priority", component: "Outbound", priority: "High", status: "Backlog", coverage: "missing", match_score: 0.07, ai_confidence: 0.07, ai_reason: "Wave planning and route optimisation logic has zero automation coverage in any feature file" },
    { key: "AMCC-114", summary: "Compliance audit — generate HACCP temperature log report", component: "Compliance", priority: "High", status: "Backlog", coverage: "missing", match_score: 0.08, ai_confidence: 0.08, ai_reason: "HACCP reporting, audit trail generation and temperature log export are not tested anywhere" },
  ],
  scanned_at: new Date().toISOString(),
  analysis_type: "story_coverage",
  _demo: true,
}

function StoryCoverageView({ project, token, onGenerate }) {
  const [data, setData]     = useState(DEMO_STORY_DATA)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [err, setErr]       = useState("")
  const [showCov, setShowCov]   = useState(false)
  const [showPart, setShowPart] = useState(true)
  const [showMiss, setShowMiss] = useState(true)

  useEffect(() => {
    if (!project) return
    apiFetch(`/projects/${project.id}/coverage/story-coverage`, {}, token)
      .then(d => {
        if (d && !d.error && d.summary?.ai_powered) setData(d)
      })
      .catch(() => {})
  }, [project])

  async function scan() {
    setLoading(true); setErr("")
    try { setData(await apiFetch(`/projects/${project.id}/coverage/story-coverage`, { method: "POST" }, token)) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  async function generateScripts() {
    setGenerating(true); setErr("")
    try {
      const res = await apiFetch(`/projects/${project.id}/generate-stories`, { method: "POST" }, token)
      const count = res.generated_files?.filter(f => f.endsWith(".feature")).length || 0
      if (count === 0) {
        setErr("No uncovered stories found to generate — all stories are already covered.")
      } else {
        setErr(`✓ ${count} feature file${count !== 1 ? "s" : ""} generated using ${res.model_used || "AI"} — opening Script Generator…`)
        setTimeout(() => { onGenerate && onGenerate() }, 600)
      }
    } catch (e) { setErr("Generate failed: " + e.message) }
    finally { setGenerating(false) }
  }

  async function exportReport() {
    setExporting(true)
    try {
      // Export story coverage as JSON download (CSV-friendly for stakeholders)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = "story_coverage_report.json"
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch (e) { setErr("Export failed: " + e.message) }
    finally { setExporting(false) }
  }

  const s = data?.summary || {}

  return (
    <div style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", background: "var(--color-background-primary)", marginBottom: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 18px", background: s.ai_powered ? "#eef3fc" : "#f5f0ff", borderBottom: "1px solid #e0d8f8" }}>
        <i className={`ti ${s.ai_powered ? "ti-brain" : "ti-list-check"}`} style={{ fontSize: "17px", color: s.ai_powered ? "#1a5fa5" : "#6a2fa0" }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>Story vs Automation coverage</span>
          <span style={{ fontSize: "12px", color: "var(--color-text-tertiary)", marginLeft: "10px" }}>
            {s.ai_powered
              ? `${s.model_used || "AI"} reads full feature file scenarios and matches each story with confidence score`
              : "Keyword matching — configure an AI key in settings for AI-powered analysis"}
          </span>
          {s.ai_powered && s.ai_confidence != null && (
            <span style={{ fontSize: "11px", fontWeight: 700, marginLeft: "10px", padding: "1px 8px", borderRadius: 999,
              background: s.ai_confidence >= 80 ? "#eaf3e6" : s.ai_confidence >= 60 ? "#fdf3e3" : "#fce8e8",
              color: s.ai_confidence >= 80 ? "#2e6b24" : s.ai_confidence >= 60 ? "#a06020" : "#8a1a1a" }}>
              <i className="ti ti-brain" style={{ fontSize: "10px", marginRight: "3px" }} />
              Avg AI confidence: {s.ai_confidence}%
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {data && (
            <>
              <button onClick={exportReport} disabled={exporting} title="Export story coverage report" style={{
                display: "flex", alignItems: "center", gap: "5px", padding: "7px 12px",
                background: "transparent", border: "1px solid #e0d8f8", borderRadius: "8px",
                fontSize: "12px", fontWeight: 600, cursor: exporting ? "wait" : "pointer", color: "#6a2fa0",
              }}>
                <i className={`ti ${exporting ? "ti-loader" : "ti-file-download"}`} style={{ fontSize: "13px" }} />
                {exporting ? "Exporting…" : "Export"}
              </button>
              <button onClick={generateScripts} disabled={generating} title="Generate feature files for uncovered/partial stories (Agent 2)" style={{
                display: "flex", alignItems: "center", gap: "5px", padding: "7px 14px",
                background: generating ? "#e8e4de" : "#6a2fa0", color: generating ? "#9a968e" : "#fff",
                border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: generating ? "wait" : "pointer",
              }}>
                <i className={`ti ${generating ? "ti-loader" : "ti-wand"}`} style={{ fontSize: "13px", animation: generating ? "spin 1s linear infinite" : "none" }} />
                {generating ? "Generating…" : "Generate Scripts"}
              </button>
            </>
          )}
          <button onClick={scan} disabled={loading} style={{
            display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px",
            background: loading ? "#e8e4de" : "#6a2fa0", color: loading ? "#9a968e" : "#fff",
            border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: loading ? "wait" : "pointer",
          }}>
            <i className={`ti ${loading ? "ti-loader" : "ti-scan"}`} style={{ fontSize: "13px", animation: loading ? "spin 1s linear infinite" : "none" }} />
            {loading ? "Analysing…" : data ? "Re-scan" : "Run analysis"}
          </button>
        </div>
      </div>

      {err && (
        <div style={{ padding: "12px 18px", background: "#fdf3e3", borderBottom: "1px solid #e8c87a", fontSize: "12px", color: "#7a4810", display: "flex", gap: "8px" }}>
          <i className="ti ti-alert-circle" style={{ fontSize: "14px", flexShrink: 0 }} />
          {err}
        </div>
      )}

      {!data && !err && (
        <div style={{ padding: "28px 20px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "13px" }}>
          <i className="ti ti-list-check" style={{ fontSize: "28px", display: "block", marginBottom: "8px", color: "#6a2fa0" }} />
          Matches each Jira story / TC against automation feature file scenarios using TC ID tags and keyword overlap.
          <br /><span style={{ fontSize: "12px", marginTop: "6px", display: "block" }}>
            Requires: Jira stories (live sync or CSV upload on Data sources) + automation feature files.
          </span>
        </div>
      )}

      {data && (
        <div style={{ padding: "16px 18px" }}>
          {/* Accuracy badge */}
          <AccuracyBadge score={s.accuracy_score} label={s.accuracy_label} breakdown={s.accuracy_breakdown} />

          {/* KPI grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "18px" }}>
            {[
              { label: "Stories analysed", value: s.total_stories ?? 0,     color: "var(--color-text-primary)" },
              { label: "Covered",          value: s.covered ?? 0,           color: "#2e6b24" },
              { label: "Partial",          value: s.partial ?? 0,           color: "#a06020" },
              { label: "Missing",          value: s.missing ?? 0,           color: "#8a1a1a" },
            ].map(k => (
              <div key={k.label} style={{ background: "var(--color-background-secondary)", borderRadius: "10px", padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
              <span style={{ fontWeight: 500 }}>Story coverage</span>
              <span style={{ fontWeight: 700, color: (s.story_coverage_pct??0) >= 70 ? "#2e6b24" : "#a06020" }}>{s.story_coverage_pct ?? 0}%</span>
            </div>
            <CovBar pct={s.story_coverage_pct ?? 0} height={8} />
            <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "4px" }}>
              {s.total_scenarios ?? 0} automation scenarios · Covered counts full, partial counts ½
            </div>
          </div>


          {/* Story lists */}
          {(data.missing?.length > 0) && (
            <div style={{ marginBottom: "10px", border: "1px solid #fcd5c0", borderRadius: "8px", overflow: "hidden" }}>
              <div onClick={() => setShowMiss(!showMiss)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", background: "#fff5f2", cursor: "pointer", fontSize: "12px" }}>
                <i className="ti ti-circle-x" style={{ color: "#d05538" }} />
                <span style={{ flex: 1, fontWeight: 600, color: "#7a1818" }}>No automation — {data.missing.length} stories not covered</span>
                <i className={`ti ti-chevron-${showMiss ? "up" : "down"}`} style={{ fontSize: "12px", color: "#d05538" }} />
              </div>
              {showMiss && data.missing.map((item, i) => <StoryRow key={item.key || i} item={item} />)}
            </div>
          )}

          {(data.partial?.length > 0) && (
            <div style={{ marginBottom: "10px", border: "1px solid #f0d8a0", borderRadius: "8px", overflow: "hidden" }}>
              <div onClick={() => setShowPart(!showPart)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", background: "#fdf8e8", cursor: "pointer", fontSize: "12px" }}>
                <i className="ti ti-circle-half" style={{ color: "#a06020" }} />
                <span style={{ flex: 1, fontWeight: 600, color: "#7a4810" }}>Partial match — {data.partial.length} stories weakly covered</span>
                <i className={`ti ti-chevron-${showPart ? "up" : "down"}`} style={{ fontSize: "12px", color: "#a06020" }} />
              </div>
              {showPart && data.partial.map((item, i) => <StoryRow key={item.key || i} item={item} />)}
            </div>
          )}

          {(data.covered?.length > 0) && (
            <div style={{ marginBottom: "10px", border: "1px solid #c0dab0", borderRadius: "8px", overflow: "hidden" }}>
              <div onClick={() => setShowCov(!showCov)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", background: "#f2faea", cursor: "pointer", fontSize: "12px" }}>
                <i className="ti ti-circle-check" style={{ color: "#2e6b24" }} />
                <span style={{ flex: 1, fontWeight: 600, color: "#2e6b24" }}>Well covered — {data.covered.length} stories with automation</span>
                <i className={`ti ti-chevron-${showCov ? "up" : "down"}`} style={{ fontSize: "12px", color: "#2e6b24" }} />
              </div>
              {showCov && data.covered.map((item, i) => <StoryRow key={item.key || i} item={item} />)}
            </div>
          )}

          <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "4px" }}>
            Analysed {data.scanned_at ? new Date(data.scanned_at).toLocaleString() : ""} · {s.total_stories ?? 0} stories · {s.total_scenarios ?? 0} scenarios
          </div>
        </div>
      )}
    </div>
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
  const [analysisTab, setAnalysisTab] = useState("code")  // "code" | "stories"

  return (
    <div style={{ maxWidth: "900px" }}>
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.02em" }}>Coverage analyser</h1>
        <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", margin: 0 }}>
          Two analysis modes: Dev codebase vs Automation, or Jira Stories vs Automation feature files.
        </p>
      </div>

      {/* Analysis type tab bar */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "20px", padding: "4px", background: "var(--color-background-secondary)", borderRadius: "10px", width: "fit-content" }}>
        {[
          { id: "code",    icon: "ti-code-dots",  label: "Type 1: Code vs Automation",  desc: "Dev codebase → business flows → automation coverage" },
          { id: "stories", icon: "ti-list-check",  label: "Type 2: Stories vs Automation", desc: "Jira user stories / TCs → feature file match" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setAnalysisTab(tab.id)} title={tab.desc} style={{
            display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px",
            background: analysisTab === tab.id ? "var(--color-background-primary)" : "transparent",
            border: analysisTab === tab.id ? "1px solid var(--color-border-secondary)" : "1px solid transparent",
            borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: analysisTab === tab.id ? 600 : 500,
            color: analysisTab === tab.id ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            boxShadow: analysisTab === tab.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
          }}>
            <i className={`ti ${tab.icon}`} style={{ fontSize: "14px" }} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Code vs Automation */}
      {analysisTab === "code" && (
        <CodeCoverageMatrix
          project={project}
          token={user?.token}
          onGenerate={() => setPage("scripts")}
        />
      )}

      {/* Tab 2: Jira Stories vs Automation */}
      {analysisTab === "stories" && (
        <>
          <StoryCoverageView
            project={project}
            token={user?.token}
            onGenerate={() => setPage("scripts")}
          />
        </>
      )}
    </div>
  )
}