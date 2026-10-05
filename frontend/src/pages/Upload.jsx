import { useState, useEffect, useRef } from "react"
import { useAuth, useProject, apiFetch } from "../App"
import { PageHeader, Card, Button, Banner, Pill, th, td, fmtDate } from "../components/ui"

function DropZone({ label, subLabel, icon, accent, onFiles, accept, uploading, multiple = true, compact }) {
  const [dragging, setDragging] = useState(false)
  const ref = useRef()
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); onFiles([...e.dataTransfer.files]) }}
      onClick={() => ref.current.click()}
      style={{
        border: `0.5px dashed ${dragging ? accent : "var(--color-border-secondary)"}`,
        background: dragging ? accent + "0d" : "var(--color-background-primary)",
        borderRadius: "var(--border-radius-lg)", padding: compact ? "22px 16px" : "36px 20px", textAlign: "center",
        cursor: uploading ? "wait" : "pointer", transition: "all 0.15s",
      }}
      onMouseEnter={e => !dragging && (e.currentTarget.style.background = "var(--color-background-secondary)")}
      onMouseLeave={e => !dragging && (e.currentTarget.style.background = "var(--color-background-primary)")}
    >
      <input ref={ref} type="file" accept={accept} multiple={multiple} style={{ display: "none" }} onChange={e => { onFiles([...e.target.files]); e.target.value = "" }} />
      <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: accent + "18", border: `0.5px solid ${accent}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
        <i className={`ti ${uploading ? "ti-loader-2" : icon}`} style={{ fontSize: "22px", color: uploading ? "var(--color-text-tertiary)" : accent, animation: uploading ? "spin 1s linear infinite" : "none" }} aria-hidden="true" />
      </div>
      <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 5px" }}>
        {uploading ? "Uploading..." : label}
      </p>
      <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: 0 }}>{subLabel}</p>
    </div>
  )
}

function ConnectionPill({ name, info }) {
  if (!info) return <Pill icon="ti-loader-2">{name}: checking…</Pill>
  if (info.ok) return <Pill color="#2e5c24" bg="#eaf3e6" icon="ti-plug-connected" title={info.base_url}>{name}: connected{info.user ? ` as ${info.user}` : ""}</Pill>
  if (!info.configured) return <Pill color="#7a4810" bg="#fdf3e3" icon="ti-plug-off" title="Add credentials to backend/.env">{name}: not configured</Pill>
  return <Pill color="#8a1a1a" bg="#fce8e8" icon="ti-plug-x" title={info.error}>{name}: error</Pill>
}

const STATE_PILL = {
  new:       { color: "#1a4f8a", bg: "#e8f0fb", label: "New" },
  updated:   { color: "#7a4810", bg: "#fdf3e3", label: "Changed" },
  unchanged: { color: "#5a5650", bg: "#f5f2ed", label: "Unchanged" },
}

function LiveSync({ project, token }) {
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({ project_key: "", issue_types: "Story,Test,Test Case", jql: "", include_defects: true, include_qmetry: true })
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState("")
  const [synced, setSynced] = useState(null)
  const [tab, setTab] = useState("stories")
  const [stateFilter, setStateFilter] = useState("")

  useEffect(() => {
    apiFetch("/integrations/status", {}, token).then(setStatus).catch(() => setStatus({}))
    apiFetch(`/projects/${project.id}/jira/settings`, {}, token).then(s => {
      setForm(f => ({ ...f, project_key: s.project_key || "", issue_types: (s.issue_types || []).join(","), jql: s.jql || "",
        include_defects: s.include_defects, include_qmetry: s.include_qmetry }))
      if (s.last_run || s.last_result) setResult({ ...(s.last_result || {}), last_sync: s.last_run })
    }).catch(() => {})
    loadSynced("")
  }, [project.id])

  async function loadSynced(state) {
    setStateFilter(state)
    try {
      const data = await apiFetch(`/projects/${project.id}/jira/synced?limit=200${state ? `&state=${state}` : ""}`, {}, token)
      setSynced(data)
      // Open the first tab that has data
      setTab(t => data[t]?.total ? t : (["stories", "test_cases", "defects"].find(k => data[k].total) || t))
    }
    catch { setSynced(null) }
  }

  async function sync(full) {
    setSyncing(true); setError("")
    try {
      const fd = new FormData()
      Object.entries({ ...form, full }).forEach(([k, v]) => fd.append(k, v))
      const r = await apiFetch(`/projects/${project.id}/jira/sync`, { method: "POST", body: fd }, token)
      setResult({ ...r, last_sync: new Date().toISOString() })
      await loadSynced(stateFilter)
    } catch (e) { setError(e.message) }
    finally { setSyncing(false) }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const counts = (label, c) => c && (
    <div style={{ flex: "1 1 170px", padding: "12px 14px", background: "var(--color-background-secondary)", borderRadius: "10px" }}>
      <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>{label}</p>
      <p style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 6px", fontVariantNumeric: "tabular-nums" }}>{c.total?.toLocaleString()}</p>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {c.new > 0 && <Pill color={STATE_PILL.new.color} bg="#fff">+{c.new.toLocaleString()} new</Pill>}
        {c.updated > 0 && <Pill color={STATE_PILL.updated.color} bg="#fff">{c.updated.toLocaleString()} changed</Pill>}
        {c.executions !== undefined && <Pill bg="#fff">{c.executions} with runs</Pill>}
      </div>
    </div>
  )
  const rows = synced?.[tab]?.items || []

  return (
    <Card title="Live sync — Jira REST API + QMetry" icon="ti-refresh" right={
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <ConnectionPill name="Jira" info={status?.jira} />
        <ConnectionPill name="QMetry" info={status?.qmetry} />
      </div>
    }>
      {error && <Banner onClose={() => setError("")}>{error}</Banner>}
      {status?.jira && !status.jira.configured && (
        <Banner kind="warning">Jira stories and defects need <code>JIRA_BASE_URL</code> and <code>JIRA_EMAIL</code> in <code>backend/.env</code> (the API token is already set). QMetry sync works without them.</Banner>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "10px 12px", alignItems: "center", marginBottom: "12px" }}>
        <label style={{ fontSize: "12px", fontWeight: 600 }} htmlFor="pk">Project key</label>
        <input id="pk" value={form.project_key} onChange={e => set("project_key", e.target.value.toUpperCase())} placeholder="AMCC" style={{ maxWidth: "200px" }} />
        <label style={{ fontSize: "12px", fontWeight: 600 }} htmlFor="it">Issue types</label>
        <input id="it" value={form.issue_types} onChange={e => set("issue_types", e.target.value)} placeholder="Story,Test,Test Case" />
        <label style={{ fontSize: "12px", fontWeight: 600 }} htmlFor="jql">Extra JQL <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}>(optional)</span></label>
        <input id="jql" value={form.jql} onChange={e => set("jql", e.target.value)} placeholder='sprint in openSprints() AND status != Done' />
      </div>
      <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", alignItems: "center", marginBottom: "14px", fontSize: "13px" }}>
        {[["include_defects", "Also pull defects (Agent 4)"], ["include_qmetry", "QMetry test cases + execution results"]].map(([k, l]) => (
          <label key={k} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
            <input type="checkbox" checked={!!form[k]} onChange={e => set(k, e.target.checked)} style={{ width: "auto" }} />{l}
          </label>
        ))}
        <span style={{ flex: 1 }} />
        <Button variant="secondary" icon="ti-database-import" busy={syncing} onClick={() => sync(true)} title="Re-download everything">Full resync</Button>
        <Button icon="ti-refresh" busy={syncing} onClick={() => sync(false)}>Pull new &amp; updated</Button>
      </div>

      {result && (
        <>
          <p style={{ fontSize: "12px", color: "var(--color-text-tertiary)", margin: "0 0 8px" }}>
            Last sync {fmtDate(result.last_sync)}{result.mode ? ` · ${result.mode}` : ""}{result.since ? ` · changes since ${fmtDate(result.since)}` : ""}
          </p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
            {counts("Jira stories & tests", result.jira)}
            {counts("Jira defects", result.defects)}
            {counts("QMetry test cases", result.qmetry)}
          </div>
          {result.qmetry?.by_status && (
            <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: "0 0 10px" }}>
              Latest QMetry execution results: {Object.entries(result.qmetry.by_status).map(([k, v]) => `${k} ${v}`).join(" · ")}
            </p>
          )}
          {(result.warnings || []).map(w => <Banner key={w} kind="warning">{w}</Banner>)}
        </>
      )}

      {synced && (synced.stories.total + synced.test_cases.total + synced.defects.total > 0) && (
        <div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", margin: "6px 0 10px" }}>
            {[["stories", "Stories & tests"], ["test_cases", "QMetry test cases"], ["defects", "Defects"]].map(([k, l]) => (
              <Button key={k} small variant={tab === k ? "primary" : "secondary"} onClick={() => setTab(k)}>{l} ({synced[k].total.toLocaleString()})</Button>
            ))}
            <span style={{ flex: 1 }} />
            <select value={stateFilter} onChange={e => loadSynced(e.target.value)} style={{ width: "auto" }} aria-label="Filter by change">
              <option value="">All items</option><option value="new">New only</option><option value="updated">Changed only</option>
            </select>
          </div>
          <div style={{ maxHeight: "320px", overflow: "auto", border: "1px solid var(--color-border-tertiary)", borderRadius: "10px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Key</th><th style={th}>Summary</th><th style={th}>Type</th><th style={th}>Priority</th><th style={th}>Status</th><th style={th}>Updated</th><th style={th}>Sync</th></tr></thead>
              <tbody>
                {rows.map(r => {
                  const st = STATE_PILL[r.sync_state] || STATE_PILL.unchanged
                  return (
                    <tr key={r.key}>
                      <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>{r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "#1a4f8a" }}>{r.key}</a> : r.key}</td>
                      <td style={td}>{r.summary}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{r.issue_type}</td>
                      <td style={td}>{r.priority || "—"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{r.status || "—"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", color: "var(--color-text-tertiary)" }}>{r.updated ? fmtDate(r.updated) : "—"}</td>
                      <td style={td}><Pill color={st.color} bg={st.bg}>{st.label}</Pill></td>
                    </tr>
                  )
                })}
                {!rows.length && <tr><td style={{ ...td, color: "var(--color-text-tertiary)" }} colSpan={7}>Nothing here yet.</td></tr>}
              </tbody>
            </table>
          </div>
          {synced[tab].total > rows.length && <p style={{ fontSize: "12px", color: "var(--color-text-tertiary)", margin: "6px 0 0" }}>Showing {rows.length} of {synced[tab].total.toLocaleString()} — new and changed first.</p>}
        </div>
      )}
    </Card>
  )
}

// ── per-kind section: zip upload OR local path ─────────────────────────────

function CodebaseSection({ kind, accent, icon, label, subLabel, busy, onUpload, onLocalPath, info }) {
  const [mode, setMode] = useState("zip")  // "zip" | "local"
  const [pathVal, setPathVal] = useState(info?.local_path || "")
  const [indexing, setIndexing] = useState(false)

  // Sync input when parent reloads info
  useEffect(() => { if (info?.local_path) { setPathVal(info.local_path); setMode("local") } }, [info?.local_path])

  async function doLocalIndex() {
    if (!pathVal.trim()) return
    setIndexing(true)
    try { await onLocalPath(pathVal.trim(), kind) }
    finally { setIndexing(false) }
  }

  const statusIcon = info ? "ti-circle-check" : "ti-circle-dashed"
  const statusColor = info ? "#2e6b24" : "var(--color-text-tertiary)"

  return (
    <div style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: "12px", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", background: accent + "0d", borderBottom: "1px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", gap: "8px" }}>
        <i className={`ti ${icon}`} style={{ fontSize: "16px", color: accent }} aria-hidden="true" />
        <span style={{ fontSize: "13px", fontWeight: 600, flex: 1, color: "var(--color-text-primary)" }}>{label}</span>
        <i className={`ti ${statusIcon}`} style={{ fontSize: "14px", color: statusColor }} aria-hidden="true" />
      </div>

      {/* Mode tabs */}
      <div style={{ display: "flex", padding: "8px 14px 0", gap: "4px" }}>
        {["zip", "local"].map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: "5px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
            border: "1px solid var(--color-border-secondary)", borderRadius: "6px 6px 0 0", borderBottom: "none",
            background: mode === m ? "#fff" : "var(--color-background-secondary)",
            color: mode === m ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
          }}>
            <i className={`ti ${m === "zip" ? "ti-file-zip" : "ti-folder-open"}`} style={{ marginRight: "4px", fontSize: "11px" }} />
            {m === "zip" ? "Upload zip" : "Local path"}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--color-border-tertiary)", borderTop: "none", margin: "0 0 0 0" }}>
        {mode === "zip" ? (
          <DropZone compact multiple={false} accept=".zip" accent={accent} icon={icon} uploading={busy}
            label={`Drop ${label.toLowerCase()} here`} subLabel={subLabel}
            onFiles={f => onUpload(f, kind)} />
        ) : (
          <div>
            <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: "0 0 8px" }}>
              {kind === "app"
                ? "Absolute path to the dev team's source directory — the server reads it in-place, no copying."
                : "Absolute path to your automation repo — the server will scan it for .feature files and pytest files."}
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                value={pathVal}
                onChange={e => setPathVal(e.target.value)}
                onKeyDown={e => e.key === "Enter" && doLocalIndex()}
                placeholder={kind === "app" ? "C:\\dev\\amcc-source  or  /home/dev/amcc" : "C:\\automation\\amcc-tests"}
                style={{ flex: 1 }}
              />
              <button
                onClick={doLocalIndex}
                disabled={indexing || !pathVal.trim()}
                style={{
                  padding: "9px 16px", background: indexing ? "#e8e4de" : accent, color: indexing ? "#9a968e" : "#fff",
                  border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
                  cursor: indexing || !pathVal.trim() ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                }}
              >
                <i className={`ti ${indexing ? "ti-loader-2" : "ti-scan"}`} style={{ marginRight: "5px", fontSize: "12px", animation: indexing ? "spin 1s linear infinite" : "none" }} />
                {indexing ? "Indexing…" : "Index"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status line */}
      {info && (
        <div style={{ padding: "8px 14px", background: "var(--color-background-secondary)", fontSize: "12px", color: "var(--color-text-secondary)", display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
          <span style={{ color: "#2e6b24", fontWeight: 500, display: "flex", alignItems: "center", gap: "4px" }}>
            <i className="ti ti-circle-check" style={{ fontSize: "13px" }} aria-hidden="true" />
            {info.source === "local_path" ? "Local path indexed" : `${info.filename || "zip"} uploaded`}
          </span>
          {info.modules && <span>{info.modules} modules · {info.loc?.toLocaleString()} LOC</span>}
          {info.features != null && <span>{info.features} feature files · {info.pytest_files || 0} pytest files</span>}
          {info.openapi_detected && (
            <span style={{ color: "#1a4f8a", background: "#e8f0fb", padding: "2px 8px", borderRadius: "999px", fontWeight: 600, fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}>
              <i className="ti ti-api" style={{ fontSize: "11px" }} aria-hidden="true" />
              OpenAPI detected · {info.openapi_endpoints} endpoints{info.openapi_title ? ` — ${info.openapi_title}` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function Codebase({ project, token }) {
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState({})
  const [error, setError] = useState("")

  const load = () => apiFetch(`/projects/${project.id}/codebase`, {}, token).then(setInfo).catch(() => {})
  useEffect(() => { load() }, [project.id])

  async function upload(files, kind) {
    const f = files[0]; if (!f) return
    setBusy(b => ({ ...b, [kind]: true })); setError("")
    try {
      const fd = new FormData(); fd.append("file", f); fd.append("kind", kind)
      await apiFetch(`/projects/${project.id}/codebase`, { method: "POST", body: fd }, token)
      await load()
    } catch (e) { setError(e.message) }
    finally { setBusy(b => ({ ...b, [kind]: false })) }
  }

  async function localPath(path, kind) {
    setBusy(b => ({ ...b, [kind]: true })); setError("")
    try {
      await apiFetch(`/projects/${project.id}/codebase/local`, { method: "POST", body: JSON.stringify({ path, kind }), headers: { "Content-Type": "application/json" } }, token)
      await load()
    } catch (e) { setError(e.message) }
    finally { setBusy(b => ({ ...b, [kind]: false })) }
  }

  const SECTIONS = [
    {
      kind: "app", accent: "#7a4810", icon: "ti-app-window",
      label: "Application code (dev team)",
      subLabel: "Frontend + backend source — builds the module index for Agents 1, 3 & 4. Supports any language; detects OpenAPI/Swagger automatically.",
    },
    {
      kind: "tests", accent: "#185FA5", icon: "ti-test-pipe",
      label: "Test automation repo",
      subLabel: ".feature files + pytest / step defs — full-repo scan used by Agent 1 code coverage and Agent 3 golden suite.",
    },
  ]

  return (
    <Card title="Codebases" icon="ti-folder-code"
      right={info?.openapi
        ? <span style={{ fontSize: "12px", color: "#1a4f8a", background: "#e8f0fb", padding: "3px 10px", borderRadius: "999px", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px" }}>
            <i className="ti ti-api" style={{ fontSize: "12px" }} aria-hidden="true" />
            OpenAPI · {info.openapi.endpoints} endpoints
          </span>
        : null}>
      {error && <Banner onClose={() => setError("")}>{error}</Banner>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px", marginBottom: info?.modules?.length ? "16px" : 0 }}>
        {SECTIONS.map(s => (
          <CodebaseSection key={s.kind} {...s}
            busy={busy[s.kind]}
            onUpload={upload}
            onLocalPath={localPath}
            info={info?.uploads?.[s.kind]}
          />
        ))}
      </div>

      {info?.modules?.length > 0 && (
        <div style={{ maxHeight: "260px", overflow: "auto", border: "1px solid var(--color-border-tertiary)", borderRadius: "10px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={th}>Module</th><th style={th}>Layer</th>
              <th style={{ ...th, textAlign: "right" }}>Files</th><th style={{ ...th, textAlign: "right" }}>LOC</th>
              <th style={th}>Weight</th><th style={th}>Sample keywords</th>
            </tr></thead>
            <tbody>
              {info.modules.map(m => (
                <tr key={m.name}>
                  <td style={{ ...td, fontWeight: 600 }}>{m.name}</td>
                  <td style={td}><span style={{ fontSize: "11px", padding: "2px 7px", borderRadius: 999, background: m.layer === "frontend" ? "#e8f0fb" : m.layer === "backend" ? "#eaf3e6" : "#f5f2ed", color: m.layer === "frontend" ? "#1a4f8a" : m.layer === "backend" ? "#2e5c24" : "#5a5650" }}>{m.layer}</span></td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.files}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.loc.toLocaleString()}</td>
                  <td style={{ ...td, minWidth: "120px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ flex: 1, height: "7px", background: "#f0ede8", borderRadius: "4px" }}>
                        <div style={{ width: `${m.weight * 100}%`, height: "100%", background: "#256abf", borderRadius: "4px" }} />
                      </div>
                      <span style={{ fontVariantNumeric: "tabular-nums", fontSize: "12px" }}>{m.weight.toFixed(2)}</span>
                    </div>
                  </td>
                  <td style={{ ...td, color: "var(--color-text-tertiary)", fontSize: "11px" }}>{m.keywords.slice(0, 6).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function ModelSwitcher({ project, token }) {
  const { setProject } = useProject()
  const [models, setModels] = useState([])
  const [saving, setSaving] = useState(false)
  const current = project?.model || "claude"

  useEffect(() => { apiFetch("/models", {}, token).then(setModels).catch(() => {}) }, [])

  async function switchModel(id) {
    if (id === current) return
    setSaving(true)
    try {
      const fd = new FormData(); fd.append("model", id)
      await apiFetch(`/projects/${project.id}/settings`, { method: "PUT", body: fd }, token)
      setProject(p => ({ ...p, model: id }))
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  if (!models.length) return null
  return (
    <Card title="AI model" icon="ti-sparkles" style={{ marginBottom: "16px" }}
      right={
        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "999px", background: "#e8f0fb", color: "#1a4f8a", fontWeight: 600 }}>
          Active: {models.find(m => m.id === current)?.name || current}
        </span>
      }>
      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
        {models.map(m => (
          <button key={m.id} onClick={() => switchModel(m.id)} disabled={saving} style={{
            display: "flex", flexDirection: "column", gap: "3px", padding: "12px 16px", border: `2px solid ${m.id === current ? "#1a4f8a" : "var(--color-border-secondary)"}`,
            borderRadius: "10px", background: m.id === current ? "#e8f0fb" : "#fff", cursor: saving ? "wait" : "pointer",
            textAlign: "left", minWidth: "180px", fontFamily: "var(--font-sans)",
          }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: m.id === current ? "#1a4f8a" : "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
              <i className={`ti ${m.id === current ? "ti-circle-check" : "ti-circle-dashed"}`} style={{ fontSize: "14px" }} aria-hidden="true" />
              {m.name}
            </span>
            <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", paddingLeft: "20px" }}>{m.description}</span>
          </button>
        ))}
      </div>
      {saving && <p style={{ fontSize: "12px", color: "var(--color-text-tertiary)", margin: "10px 0 0" }}>Switching model…</p>}
    </Card>
  )
}

// ── Jira CSV/Excel upload for Coverage POC ───────────────────────────────────
function JiraCsvUpload({ project, token }) {
  const [uploading, setUploading] = useState({})
  const [results, setResults]     = useState({})
  const [err, setErr]             = useState("")

  async function upload(files, fileType) {
    const f = files[0]; if (!f) return
    setErr(""); setUploading(u => ({ ...u, [fileType]: true }))
    try {
      const fd = new FormData()
      fd.append("file", f)
      fd.append("file_type", fileType)
      const r = await apiFetch(`/projects/${project.id}/upload/jira-csv`, { method: "POST", body: fd }, token)
      setResults(prev => ({ ...prev, [fileType]: r }))
    } catch (e) { setErr(e.message) }
    finally { setUploading(u => ({ ...u, [fileType]: false })) }
  }

  return (
    <Card title="File uploads - Jira CSV/Excel" icon="ti-file-spreadsheet"
      right={
        <span style={{ fontSize: "11px", padding: "2px 10px", borderRadius: "999px", background: "#f5f0ff", color: "#6a2fa0", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px" }}>
          <i className="ti ti-shield-check" style={{ fontSize: "11px" }} />
          Offline — no live Jira needed
        </span>
      }>
      <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "12px" }}>
        Client security policy prevents live API access? Export from Jira as CSV/Excel and upload here.
        Stories and defects feed the <b>Story vs Automation coverage</b> analysis (Type 2) in Coverage analyser.
      </div>
      {err && <Banner onClose={() => setErr("")}>{err}</Banner>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
        <div>
          <DropZone compact label="Jira stories / test cases" subLabel="Export from Jira: Issues → Export → Excel/CSV" icon="ti-list-check" accent="#6a2fa0"
            accept=".xlsx,.xls,.csv" uploading={uploading.stories} onFiles={f => upload(f, "stories")} />
          {results.stories && (
            <div style={{ marginTop: "6px", fontSize: "11px", color: "#2e6b24", display: "flex", alignItems: "center", gap: "5px" }}>
              <i className="ti ti-circle-check" />
              {results.stories.rows} stories loaded
            </div>
          )}
        </div>
        <div>
          <DropZone compact label="Jira defects export" subLabel="Bug / Defect issues for context (optional)" icon="ti-bug" accent="#8a1a1a"
            accept=".xlsx,.xls,.csv" uploading={uploading.defects} onFiles={f => upload(f, "defects")} />
          {results.defects && (
            <div style={{ marginTop: "6px", fontSize: "11px", color: "#2e6b24", display: "flex", alignItems: "center", gap: "5px" }}>
              <i className="ti ti-circle-check" />
              {results.defects.rows} defects loaded
            </div>
          )}
        </div>
      </div>
      <div style={{ marginTop: "10px", padding: "8px 12px", background: "#f5f0ff", borderRadius: "8px", fontSize: "11px", color: "#4a1a7a" }}>
        <b>Tip:</b> For best matching accuracy, ensure Jira export includes columns: <code>Issue Key</code>, <code>Summary</code>, <code>Component</code>, <code>Priority</code>, <code>Issue Type</code>.
        Then run <b>Coverage analyser → Type 2: Stories vs Automation</b>.
      </div>
    </Card>
  )
}

export default function Upload({ currentPage }) {
  const { user } = useAuth()
  const { project } = useProject()

  if (!project) return null
  return (
    <div style={{ maxWidth: "1040px" }}>
      <PageHeader agent="Input layer" title="Data sources"
        subtitle="Pull new and changed user stories straight from Jira, test cases and execution results from QMetry, and the application codebase." />

      <ModelSwitcher project={project} token={user?.token} />
      <LiveSync project={project} token={user?.token} />
      <Codebase project={project} token={user?.token} />

      <JiraCsvUpload project={project} token={user?.token} />
    </div>
  )
}
