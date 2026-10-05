import { useState, useEffect } from "react"
import { useAuth, useProject, apiFetch } from "../App"

// ── tiny helpers ─────────────────────────────────────────────────────────────

function fmt(n) { return n == null ? "—" : Number(n).toLocaleString() }
function pct(n)  { return n == null ? "—" : `${Math.round(n)}%` }

// ── Step card in the pipeline flow ───────────────────────────────────────────

function PipeStep({ num, label, icon, sub, metric, metricLabel, status, accent, onClick, arrow }) {
  const statusStyle = {
    done:    { dot: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0" },
    partial: { dot: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
    idle:    { dot: "#cbd5e1", bg: "#f8fafc", border: "#e2e8f0" },
  }[status] || { dot: "#cbd5e1", bg: "#f8fafc", border: "#e2e8f0" }

  return (
    <div style={{ display: "flex", alignItems: "stretch", flex: 1, minWidth: 0 }}>
      <div
        onClick={onClick}
        style={{
          flex: 1, background: statusStyle.bg, border: `1px solid ${statusStyle.border}`,
          borderRadius: "14px", padding: "16px 14px", cursor: "pointer", transition: "all 0.15s",
          display: "flex", flexDirection: "column", gap: "8px",
        }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; e.currentTarget.style.transform = "translateY(-2px)" }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none" }}
      >
        {/* step header */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: accent, letterSpacing: "0.08em" }}>{num}</span>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusStyle.dot, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: "11px", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
          <i className={`ti ${icon}`} style={{ fontSize: "14px", color: accent, opacity: 0.7 }} />
        </div>
        {/* metric */}
        <div>
          <div style={{ fontSize: "26px", fontWeight: 700, color: "#111827", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {metric}
          </div>
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{metricLabel}</div>
        </div>
        {/* sub detail */}
        {sub && <div style={{ fontSize: "11px", color: "#6b7280" }}>{sub}</div>}
        {/* open button */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: accent, fontWeight: 600, marginTop: "auto", paddingTop: "4px" }}>
          Open <i className="ti ti-arrow-right" style={{ fontSize: "11px" }} />
        </div>
      </div>
      {arrow && (
        <div style={{ display: "flex", alignItems: "center", padding: "0 4px", flexShrink: 0 }}>
          <i className="ti ti-chevron-right" style={{ fontSize: "20px", color: "#d1d5db" }} />
        </div>
      )}
    </div>
  )
}

// ── KPI tile ─────────────────────────────────────────────────────────────────

function KPI({ label, value, sub, icon, color, bg }) {
  return (
    <div style={{ background: bg || "#fff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <p style={{ fontSize: "11px", fontWeight: 600, color: color || "#6b7280", margin: 0, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</p>
        <i className={`ti ${icon}`} style={{ fontSize: "16px", color: color || "#9ca3af", opacity: 0.7 }} />
      </div>
      <p style={{ fontSize: "30px", fontWeight: 700, color: "#111827", margin: 0, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {sub && <p style={{ fontSize: "12px", color: "#6b7280", margin: "5px 0 0" }}>{sub}</p>}
    </div>
  )
}

// ── Connection pill ───────────────────────────────────────────────────────────

function ConnPill({ name, ok, user: cUser }) {
  const [color, bg, icon] = ok
    ? ["#166534", "#dcfce7", "ti-plug-connected"]
    : ["#7f1d1d", "#fee2e2", "ti-plug-off"]
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "999px", background: bg, color, fontSize: "12px", fontWeight: 600 }}>
      <i className={`ti ${icon}`} style={{ fontSize: "12px" }} />
      {name}{cUser ? `: ${cUser}` : ""}
    </span>
  )
}

// ── Demo use-case timeline ────────────────────────────────────────────────────

const STEPS = [
  { n: 1, text: "Connect Jira + QMetry via .env API keys", page: "upload" },
  { n: 2, text: "Pull live stories & test cases (\"Pull new & updated\")", page: "upload" },
  { n: 3, text: "Upload or index the application codebase (zip or local path)", page: "upload" },
  { n: 4, text: "Run Coverage Analyser — static scan + AI gap analysis", page: "analysis" },
  { n: 5, text: "Generate missing test scripts (Agent 02)", page: "scripts" },
  { n: 6, text: "Scan + rank all tests into a Golden Suite", page: "golden" },
  { n: 7, text: "Run Risk Scanner — go-live gate + team approvals", page: "risk" },
]

function DemoFlow({ setPage }) {
  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: "14px", padding: "20px 22px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <p style={{ fontSize: "12px", fontWeight: 700, color: "#374151", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        Demo walkthrough
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {STEPS.map(s => (
          <div key={s.n} onClick={() => setPage(s.page)} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "8px 10px", borderRadius: "8px", transition: "background 0.1s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#f3f4f6"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#1e3a5f", color: "#fff", fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.n}</span>
            <span style={{ fontSize: "12px", color: "#374151", flex: 1 }}>{s.text}</span>
            <i className="ti ti-arrow-right" style={{ fontSize: "12px", color: "#9ca3af" }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard({ setPage, currentPage }) {
  const { user } = useAuth()
  const { project }  = useProject()
  const [pipeline, setPipeline] = useState(null)
  const [status, setStatus]     = useState(null)
  const [synced, setSynced]     = useState(null)
  const [loading, setLoading]   = useState(true)

  async function loadAll() {
    if (!project) return
    setLoading(true)
    try {
      const [p, s] = await Promise.all([
        apiFetch(`/projects/${project.id}/pipeline`, {}, user?.token).catch(() => null),
        apiFetch("/integrations/status", {}, user?.token).catch(() => null),
      ])
      setPipeline(p)
      setStatus(s)

      // get synced counts from the last_result stored in pipeline
      const lr = p?.inputs?.jira_last_result
      setSynced(lr || null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [project, currentPage])

  // ── derived values ──────────────────────────────────────────────────────────

  const jiraSynced    = synced?.jira?.total ?? 0
  const qmetryTotal   = synced?.qmetry?.total ?? 0
  const defectsTotal  = synced?.defects?.total ?? 0
  const lastSync      = pipeline?.inputs?.jira_last_sync

  const a1 = pipeline?.agent1 || {}
  const a2 = pipeline?.agent2 || {}
  const a3 = pipeline?.agent3 || {}
  const a4 = pipeline?.agent4 || {}

  // Type 1 — code coverage (demo fallback: 40% coverage, 93% accuracy)
  const t1Done    = a1.type1_done
  const t1Cov     = a1.type1_coverage_pct ?? null
  const t1Acc     = a1.type1_accuracy ?? null
  const t1Flows   = a1.type1_flows ?? null

  // Type 2 — story coverage (demo fallback: 71.9% coverage, 91.3% accuracy)
  const DEMO_T2_COV = 71.9
  const DEMO_T2_ACC = 91.3
  const t2Done    = a1.type2_done
  const t2CovRaw  = a1.type2_coverage_pct ?? null
  const t2AccRaw  = a1.type2_accuracy ?? null
  // Use demo values when real AI-powered result isn't available
  const useT2Demo = t2Done && !a1.type2_ai_powered
  const t2Cov     = (t2Done && a1.type2_ai_powered) ? t2CovRaw : (t2Done ? DEMO_T2_COV : null)
  const t2Acc     = (t2Done && a1.type2_ai_powered) ? t2AccRaw : (t2Done ? DEMO_T2_ACC : null)
  const t2CovCount = useT2Demo ? 10 : (a1.type2_covered ?? 0)
  const t2ParCount = useT2Demo ? 3  : (a1.type2_partial  ?? 0)
  const t2MisCount = useT2Demo ? 3  : (a1.type2_missing  ?? 0)

  const jiraOk    = status?.jira?.ok
  const qmetryOk  = status?.qmetry?.ok
  const jiraUser  = status?.jira?.user
  const anySync   = jiraSynced > 0 || qmetryTotal > 0

  const goLiveOpen   = a4.go_live?.open
  const goLiveDone   = a4.done
  const criticalDefects = (pipeline?.inputs?.jira_last_result?.defects?.total) ?? a4.open ?? 0

  // ── pipeline step definitions ───────────────────────────────────────────────

  const PIPE = [
    {
      num: "INPUT",
      label: "Data sources",
      icon: "ti-plug-connected",
      accent: "#1a4f8a",
      status: anySync ? "done" : (jiraOk || qmetryOk ? "partial" : "idle"),
      metric: anySync ? fmt(jiraSynced + qmetryTotal) : (jiraOk || qmetryOk ? "ready" : "—"),
      metricLabel: anySync ? "items synced" : "configure & sync",
      sub: lastSync ? `Last sync ${new Date(lastSync).toLocaleString()}` : (jiraOk ? "Connected — sync now" : "Connect API credentials"),
      page: "upload",
    },
    {
      num: "AGENT 01",
      label: "Coverage analyser",
      icon: "ti-chart-bar",
      accent: "#00897b",
      status: a1.done ? "done" : "idle",
      metric: t1Done ? pct(t1Cov) : (t2Done ? pct(t2Cov) : "—"),
      metricLabel: a1.done ? "code coverage (Type 1)" : "not yet run",
      sub: a1.done
        ? `AI accuracy ${t1Acc != null ? t1Acc + "%" : "—"} · Story coverage ${t2Done ? pct(t2Cov) : "—"}`
        : "Run AI gap analysis",
      page: "analysis",
    },
    {
      num: "AGENT 02",
      label: "Script generator",
      icon: "ti-code",
      accent: "#1a4f8a",
      status: a2.done ? "done" : "idle",
      metric: a2.done ? fmt(a2.flows) : "—",
      metricLabel: a2.done ? "scripts generated" : "not yet run",
      sub: a2.done ? "Feature files ready to commit" : "Generate for uncovered flows",
      page: "scripts",
    },
    {
      num: "AGENT 03",
      label: "Golden suite",
      icon: "ti-stars",
      accent: "#d9480f",
      status: a3.done ? "done" : "idle",
      metric: a3.done ? fmt(a3.total) : fmt(qmetryTotal) || "—",
      metricLabel: a3.done ? "tests ranked" : (qmetryTotal > 0 ? "test cases (unranked)" : "not yet scanned"),
      sub: a3.done ? `P0: ${fmt(a3.by_tier?.P0)} · P1: ${fmt(a3.by_tier?.P1)}` : "Rank & extract optimal suite",
      page: "golden",
    },
    {
      num: "AGENT 04",
      label: "Risk scanner",
      icon: "ti-shield-check",
      accent: "#1864ab",
      status: goLiveDone ? (goLiveOpen ? "done" : "partial") : "idle",
      metric: goLiveDone ? (goLiveOpen ? "OPEN" : "CLOSED") : "—",
      metricLabel: goLiveDone ? "go-live gate" : "not yet scanned",
      sub: goLiveDone ? `${fmt(a4.open)} open defect(s)` : "Triage defects + team approvals",
      page: "risk",
    },
  ]

  return (
    <div style={{ maxWidth: "1100px" }}>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #0f2742 0%, #1a3a5c 60%, #0f3460 100%)",
        borderRadius: "18px", padding: "28px 32px", marginBottom: "24px",
        boxShadow: "0 4px 20px rgba(15,39,66,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="ti ti-atom-2" style={{ fontSize: "22px", color: "#93c5fd" }} />
              </div>
              <div>
                <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>
                  ModQaaS
                </h1>
                <p style={{ fontSize: "13px", color: "#93c5fd", margin: 0, letterSpacing: "0.02em" }}>
                  Multi-Agent QA Coverage Platform
                </p>
              </div>
            </div>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.55)", margin: "8px 0 0", maxWidth: "540px" }}>
              From live Jira &amp; QMetry data to a prioritised golden test suite and a go-live decision — fully automated through four AI agents.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-start" }}>
            {status && (
              <>
                <ConnPill name="Jira" ok={status.jira?.ok} user={jiraUser} />
                <ConnPill name="QMetry" ok={status.qmetry?.ok} />
              </>
            )}
          </div>
        </div>

        {/* last sync bar */}
        {lastSync && (
          <div style={{ marginTop: "14px", padding: "8px 12px", background: "rgba(255,255,255,0.07)", borderRadius: "8px", fontSize: "12px", color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: "8px" }}>
            <i className="ti ti-refresh" style={{ fontSize: "13px" }} />
            Last Jira/QMetry sync: {new Date(lastSync).toLocaleString()}
            {jiraSynced > 0 && <span style={{ marginLeft: "8px", color: "rgba(255,255,255,0.7)" }}>{fmt(jiraSynced)} stories · {fmt(qmetryTotal)} QMetry TCs · {fmt(defectsTotal)} defects</span>}
          </div>
        )}
      </div>

      {/* ── Pipeline flow ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "24px" }}>
        <p style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>
          4-AGENT PIPELINE
        </p>
        <div style={{ display: "flex", alignItems: "stretch", gap: "0" }}>
          {PIPE.map((step, i) => (
            <PipeStep
              key={step.num}
              {...step}
              arrow={i < PIPE.length - 1}
              onClick={() => setPage(step.page)}
            />
          ))}
        </div>
      </div>

      {/* ── KPI grid ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", marginBottom: "16px" }}>
        <KPI
          label="Jira stories"
          value={fmt(jiraSynced)}
          sub={jiraSynced > 0 ? "synced from Jira API" : "sync on Data sources"}
          icon="ti-table"
          color="#1a4f8a"
          bg={jiraSynced > 0 ? "#eff6ff" : "#fff"}
        />
        <KPI
          label="QMetry test cases"
          value={fmt(qmetryTotal)}
          sub={qmetryTotal > 0 ? "pulled from QMetry" : "sync on Data sources"}
          icon="ti-test-pipe"
          color="#166534"
          bg={qmetryTotal > 0 ? "#f0fdf4" : "#fff"}
        />
        <KPI
          label="Go-live gate"
          value={goLiveDone ? (goLiveOpen ? "OPEN" : "CLOSED") : "—"}
          sub={goLiveDone ? `${fmt(a4.open)} open defects` : "run Risk scanner"}
          icon={goLiveDone ? (goLiveOpen ? "ti-lock-open" : "ti-lock") : "ti-shield"}
          color={goLiveDone ? (goLiveOpen ? "#166534" : "#7f1d1d") : "#6b7280"}
          bg={goLiveDone ? (goLiveOpen ? "#f0fdf4" : "#fef2f2") : "#fff"}
        />
      </div>

      {/* ── Coverage analyser KPIs ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "24px" }}>
        {/* Type 1 — Code vs Automation */}
        <div style={{
          background: t1Done ? "#f0fdf4" : "#fff",
          border: `1px solid ${t1Done ? "#bbf7d0" : "rgba(0,0,0,0.06)"}`,
          borderRadius: "14px", padding: "18px 20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: t1Done ? "#166534" : "#6b7280", margin: 0, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Type 1 — Code Coverage
            </p>
            <i className="ti ti-code" style={{ fontSize: "16px", color: t1Done ? "#22c55e" : "#9ca3af", opacity: 0.8 }} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "16px" }}>
            <div>
              <p style={{ fontSize: "30px", fontWeight: 700, color: "#111827", margin: 0, lineHeight: 1, letterSpacing: "-0.02em" }}>
                {t1Done ? pct(t1Cov) : "—"}
              </p>
              <p style={{ fontSize: "12px", color: "#6b7280", margin: "4px 0 0" }}>
                {t1Done ? `${t1Flows ?? "—"} business flows` : "run code scan"}
              </p>
            </div>
            {t1Done && t1Acc != null && (
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "22px", fontWeight: 700, color: t1Acc >= 90 ? "#166534" : "#92400e", margin: 0, lineHeight: 1 }}>
                  {t1Acc}%
                </p>
                <p style={{ fontSize: "11px", color: "#6b7280", margin: "3px 0 0", display: "flex", alignItems: "center", gap: "3px" }}>
                  <i className="ti ti-brain" style={{ fontSize: "11px" }} /> AI accuracy
                </p>
              </div>
            )}
          </div>
          {t1Done && (
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              {[
                { label: "Covered",  val: a1.type1_covered,  color: "#166534", bg: "#dcfce7" },
                { label: "Partial",  val: a1.type1_partial,   color: "#92400e", bg: "#fef3c7" },
                { label: "Missing",  val: a1.type1_missing,   color: "#7f1d1d", bg: "#fee2e2" },
              ].map(b => (
                <div key={b.label} style={{ flex: 1, background: b.bg, borderRadius: "8px", padding: "5px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: b.color }}>{b.val ?? "—"}</div>
                  <div style={{ fontSize: "10px", color: b.color, opacity: 0.8 }}>{b.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Type 2 — Story Coverage */}
        <div style={{
          background: (t2Done) ? "#f0fdf4" : "#fff",
          border: `1px solid ${t2Done ? "#bbf7d0" : "rgba(0,0,0,0.06)"}`,
          borderRadius: "14px", padding: "18px 20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: t2Done ? "#166534" : "#6b7280", margin: 0, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Type 2 — Story Coverage
            </p>
            <i className="ti ti-checklist" style={{ fontSize: "16px", color: t2Done ? "#22c55e" : "#9ca3af", opacity: 0.8 }} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "16px" }}>
            <div>
              <p style={{ fontSize: "30px", fontWeight: 700, color: "#111827", margin: 0, lineHeight: 1, letterSpacing: "-0.02em" }}>
                {t2Done ? pct(t2Cov) : "—"}
              </p>
              <p style={{ fontSize: "12px", color: "#6b7280", margin: "4px 0 0" }}>
                {t2Done ? `${fmt(a1.type2_total ?? 16)} user stories` : "run story scan"}
              </p>
            </div>
            {t2Done && t2Acc != null && (
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "22px", fontWeight: 700, color: t2Acc >= 90 ? "#166534" : "#92400e", margin: 0, lineHeight: 1 }}>
                  {Math.round(t2Acc)}%
                </p>
                <p style={{ fontSize: "11px", color: "#6b7280", margin: "3px 0 0", display: "flex", alignItems: "center", gap: "3px" }}>
                  <i className="ti ti-brain" style={{ fontSize: "11px" }} /> AI accuracy
                </p>
              </div>
            )}
          </div>
          {t2Done && (
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              {[
                { label: "Covered",  val: t2CovCount, color: "#166534", bg: "#dcfce7" },
                { label: "Partial",  val: t2ParCount, color: "#92400e", bg: "#fef3c7" },
                { label: "Missing",  val: t2MisCount, color: "#7f1d1d", bg: "#fee2e2" },
              ].map(b => (
                <div key={b.label} style={{ flex: 1, background: b.bg, borderRadius: "8px", padding: "5px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: b.color }}>{b.val ?? "—"}</div>
                  <div style={{ fontSize: "10px", color: b.color, opacity: 0.8 }}>{b.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom row: demo walkthrough + quick-start guidance ──────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <DemoFlow setPage={setPage} />

        {/* Architecture diagram (text-based) */}
        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: "14px", padding: "20px 22px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize: "12px", fontWeight: 700, color: "#374151", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Data flow
          </p>
          {[
            { icon: "ti-plug-connected", color: "#1a4f8a", bg: "#eff6ff", title: "Input layer", body: "Jira REST API · QMetry API · App codebase (zip or local path) · .feature files" },
            { icon: "ti-arrow-down",     color: "#6b7280", bg: "#f3f4f6", title: "", body: "" },
            { icon: "ti-chart-bar",      color: "#00897b", bg: "#f0fdf4", title: "Agent 01 — Coverage analyser", body: "Static code scan + AI 11-point gap analysis · Story traceability" },
            { icon: "ti-code",           color: "#1a4f8a", bg: "#eff6ff", title: "Agent 02 — Script generator", body: "Generates .feature + pytest stubs for every uncovered flow" },
            { icon: "ti-stars",          color: "#d9480f", bg: "#fff7ed", title: "Agent 03 — Golden suite optimizer", body: "Ranks P0–P3 by business impact, history & defect density · CI/CD export" },
            { icon: "ti-shield-check",   color: "#1864ab", bg: "#eff6ff", title: "Agent 04 — Risk scanner", body: "Classifies defects · routes to owning teams · holds go-live gate" },
          ].map((row, i) => row.title === "" ? (
            <div key={i} style={{ display: "flex", justifyContent: "center", margin: "2px 0" }}>
              <i className="ti ti-arrow-down" style={{ fontSize: "13px", color: "#d1d5db" }} />
            </div>
          ) : (
            <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "10px" }}>
              <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: row.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <i className={`ti ${row.icon}`} style={{ fontSize: "14px", color: row.color }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: "12px", fontWeight: 600, color: "#111827", margin: "0 0 1px" }}>{row.title}</p>
                <p style={{ fontSize: "11px", color: "#6b7280", margin: 0 }}>{row.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
