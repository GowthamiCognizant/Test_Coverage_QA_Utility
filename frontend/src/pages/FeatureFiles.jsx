import { useState, useEffect, useRef } from "react"
import { useAuth, useProject, apiFetch } from "../App"

export default function FeatureFiles({ currentPage }) {
  const { user } = useAuth()
  const { project } = useProject()
  const [uploaded, setUploaded] = useState([])
  const [mode, setMode] = useState("upload")
  const [filename, setFilename] = useState("")
  const [content, setContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef()

  useEffect(() => { if (project) loadFiles() }, [project, currentPage])

  async function loadFiles() {
    try {
      const all = await apiFetch(`/projects/${project.id}/files`, {}, user?.token)
      setUploaded(all.filter(f => f.type === "features"))
    } catch (e) { console.error(e) }
  }

  async function handleUpload(fileList) {
    setError(""); setUploading(true)
    try {
      const fd = new FormData()
      ;[...fileList].forEach(f => fd.append("files", f))
      fd.append("file_type", "features")
      await apiFetch(`/projects/${project.id}/upload`, { method: "POST", body: fd }, user?.token)
      await loadFiles()
    } catch (e) { setError(e.message) }
    finally { setUploading(false) }
  }

  async function savePasted() {
    if (!filename.trim() || !content.trim()) return alert("Both filename and content are required")
    setError(""); setSaving(true)
    try {
      const fd = new FormData()
      fd.append("filename", filename.trim())
      fd.append("content", content.trim())
      await apiFetch(`/projects/${project.id}/feature-text`, { method: "POST", body: fd }, user?.token)
      setFilename(""); setContent("")
      await loadFiles()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function deleteFile(name) {
    if (!confirm(`Delete all uploaded files?\n\nDeleting any file will remove ALL Jira and feature files and clear the analysis. Continue?`)) return
    try {
      await apiFetch(`/projects/${project.id}/files/features/${encodeURIComponent(name)}`, { method: "DELETE" }, user?.token)
      await loadFiles()
    } catch (e) { alert(e.message) }
  }

  const fmt = b => b < 1024 ? `${b}B` : `${Math.round(b / 1024)}KB`

  return (
    <div style={{ maxWidth: "760px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 500, margin: "0 0 6px" }}>Feature files</h1>
        <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", margin: 0 }}>
          Upload your existing .feature files or paste the content directly — no folder access needed.
          {uploaded.length > 0 && <strong style={{ color: "var(--color-text-primary)", marginLeft: "4px" }}>{uploaded.length} file{uploaded.length !== 1 ? "s" : ""} loaded.</strong>}
        </p>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "12px 16px", background: "#FCEBEB", border: "0.5px solid #F09595", borderRadius: "var(--border-radius-md)", marginBottom: "20px", fontSize: "13px", color: "#791F1F" }}>
          <i className="ti ti-alert-circle" style={{ fontSize: "16px", flexShrink: 0, marginTop: "1px" }} aria-hidden="true" />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#791F1F", padding: 0 }}>
            <i className="ti ti-x" style={{ fontSize: "14px" }} aria-hidden="true" />
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
        {[["upload", "ti-upload", "Upload files"], ["paste", "ti-clipboard", "Paste content"]].map(([m, ic, label]) => (
          <button key={m} onClick={() => setMode(m)} style={{
            display: "flex", alignItems: "center", gap: "7px", padding: "8px 18px",
            border: mode === m ? "0.5px solid #0F6E56" : "0.5px solid var(--color-border-secondary)",
            borderRadius: "var(--border-radius-md)",
            background: mode === m ? "#E1F5EE" : "transparent",
            color: mode === m ? "#0F6E56" : "var(--color-text-secondary)",
            fontSize: "13px", cursor: "pointer", fontWeight: mode === m ? 500 : 400,
            transition: "all 0.15s",
          }}>
            <i className={`ti ${ic}`} style={{ fontSize: "14px" }} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {mode === "upload" ? (
        <div style={{ marginBottom: "24px" }}>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files) }}
            onClick={() => inputRef.current.click()}
            style={{
              border: "0.5px dashed var(--color-border-secondary)", borderRadius: "var(--border-radius-lg)",
              padding: "48px 20px", textAlign: "center", cursor: uploading ? "wait" : "pointer",
              background: "var(--color-background-primary)", transition: "all 0.15s",
            }}
            onMouseEnter={e => !uploading && (e.currentTarget.style.background = "var(--color-background-secondary)")}
            onMouseLeave={e => !uploading && (e.currentTarget.style.background = "var(--color-background-primary)")}
          >
            <input ref={inputRef} type="file" accept=".feature,.Feature" multiple style={{ display: "none" }} onChange={e => handleUpload(e.target.files)} />
            <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#E1F5EE", border: "0.5px solid #5DCAA533", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <i className={`ti ${uploading ? "ti-loader" : "ti-file-code"}`} style={{ fontSize: "24px", color: uploading ? "var(--color-text-tertiary)" : "#0F6E56" }} aria-hidden="true" />
            </div>
            <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 5px" }}>
              {uploading ? "Uploading..." : "Drop .feature files here"}
            </p>
            <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0 }}>
              Upload any number of files — .feature or .Feature extension
            </p>
          </div>
        </div>
      ) : (
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "22px", marginBottom: "24px" }}>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", display: "block", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>File name</label>
            <input value={filename} onChange={e => setFilename(e.target.value)} placeholder="e.g. createMessageFlow.feature" style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", display: "block", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Feature file content</label>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder={"Feature: My Feature\n\n  Background:\n    Given Login...\n\n  Scenario Outline: TC-001 My scenario\n    When ...\n    Then ..."}
              style={{ width: "100%", height: "210px", fontFamily: "var(--font-mono)", fontSize: "12px", resize: "vertical", padding: "12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box", lineHeight: "1.6" }}
            />
          </div>
          <button onClick={savePasted} disabled={saving} style={{
            display: "flex", alignItems: "center", gap: "7px", padding: "9px 20px",
            background: saving ? "var(--color-background-secondary)" : "#0F6E56",
            color: saving ? "var(--color-text-secondary)" : "#fff",
            border: "none", borderRadius: "var(--border-radius-md)", fontSize: "13px", cursor: saving ? "not-allowed" : "pointer", fontWeight: 500,
          }}>
            <i className={`ti ${saving ? "ti-loader" : "ti-device-floppy"}`} style={{ fontSize: "15px" }} aria-hidden="true" />
            {saving ? "Saving..." : "Save feature file"}
          </button>
        </div>
      )}

      {uploaded.length > 0 && (
        <div>
          <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "10px" }}>
            Loaded feature files
            <span style={{ marginLeft: "8px", fontSize: "11px", padding: "2px 8px", borderRadius: "999px", background: "#E1F5EE", color: "#0F6E56", fontWeight: 500 }}>{uploaded.length}</span>
          </p>
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", background: "var(--color-background-primary)" }}>
            {uploaded.map((f, i) => (
              <div key={f.name} style={{
                display: "flex", alignItems: "center", gap: "12px", padding: "11px 16px",
                borderBottom: i < uploaded.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                transition: "background 0.1s",
              }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ width: "30px", height: "30px", borderRadius: "var(--border-radius-md)", background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <i className="ti ti-file-code" style={{ fontSize: "15px", color: "#0F6E56" }} aria-hidden="true" />
                </div>
                <span style={{ flex: 1, fontSize: "13px", color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span style={{ fontSize: "12px", color: "var(--color-text-tertiary)", flexShrink: 0 }}>{fmt(f.size)}</span>
                <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "999px", background: "#eaf3e6", color: "#2e6b24", fontWeight: 600, flexShrink: 0 }}>Ready</span>
                <button onClick={() => deleteFile(f.name)} title="Delete file"
                  style={{ background: "#fce8e8", border: "1px solid #f0a0a0", cursor: "pointer", color: "#8a1a1a", padding: "5px 8px", display: "flex", borderRadius: "6px", flexShrink: 0, transition: "all 0.12s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#f8c8c8" }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#fce8e8" }}
                >
                  <i className="ti ti-trash" style={{ fontSize: "14px" }} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
