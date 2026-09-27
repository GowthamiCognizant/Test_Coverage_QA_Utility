import { useState, useEffect, useRef } from "react"
import { useAuth, useProject, apiFetch } from "../App"

function DropZone({ label, subLabel, icon, accent, onFiles, accept, uploading }) {
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
        borderRadius: "var(--border-radius-lg)", padding: "36px 20px", textAlign: "center",
        cursor: uploading ? "wait" : "pointer", transition: "all 0.15s",
      }}
      onMouseEnter={e => !dragging && (e.currentTarget.style.background = "var(--color-background-secondary)")}
      onMouseLeave={e => !dragging && (e.currentTarget.style.background = "var(--color-background-primary)")}
    >
      <input ref={ref} type="file" accept={accept} multiple style={{ display: "none" }} onChange={e => onFiles([...e.target.files])} />
      <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: accent + "18", border: `0.5px solid ${accent}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
        <i className={`ti ${uploading ? "ti-loader" : icon}`} style={{ fontSize: "22px", color: uploading ? "var(--color-text-tertiary)" : accent }} aria-hidden="true" />
      </div>
      <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 5px" }}>
        {uploading ? "Uploading..." : label}
      </p>
      <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: 0 }}>{subLabel}</p>
    </div>
  )
}

export default function Upload({ currentPage }) {
  const { user } = useAuth()
  const { project } = useProject()
  const [uploaded, setUploaded] = useState([])
  const [uploading, setUploading] = useState({})
  const [error, setError] = useState("")

  useEffect(() => { if (project) loadFiles() }, [project, currentPage])

  async function loadFiles() {
    try { setUploaded(await apiFetch(`/projects/${project.id}/files`, {}, user?.token)) }
    catch (e) { console.error(e) }
  }

  async function uploadFiles(fileList, type) {
    if (!project) return
    setError(""); setUploading(u => ({ ...u, [type]: true }))
    try {
      const fd = new FormData()
      fileList.forEach(f => fd.append("files", f))
      fd.append("file_type", type)
      await apiFetch(`/projects/${project.id}/upload`, { method: "POST", body: fd }, user?.token)
      await loadFiles()
    } catch (e) { setError(e.message) }
    finally { setUploading(u => ({ ...u, [type]: false })) }
  }

  async function deleteFile(type, name) {
    if (!confirm(`Delete all uploaded files?\n\nDeleting any file will remove ALL Jira and feature files and clear the analysis. Continue?`)) return
    try {
      await apiFetch(`/projects/${project.id}/files/${type}/${encodeURIComponent(name)}`, { method: "DELETE" }, user?.token)
      await loadFiles()
    } catch (e) { alert(e.message) }
  }

  const jiraFiles = uploaded.filter(f => f.type === "jira")
  const fmt = b => b < 1024 ? `${b}B` : b < 1048576 ? `${Math.round(b / 1024)}KB` : `${(b / 1048576).toFixed(1)}MB`

  return (
    <div style={{ maxWidth: "760px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 500, margin: "0 0 6px" }}>Upload files</h1>
        <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", margin: 0 }}>
          Drop your Jira Excel or CSV exports — defects, enhancements, or regression test cases.
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

      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Jira Excel / CSV
          </p>
          {jiraFiles.length > 0 && (
            <span style={{ fontSize: "11px", padding: "2px 10px", borderRadius: "999px", background: "#EAF3DE", color: "#27500A", fontWeight: 500 }}>
              {jiraFiles.length} file{jiraFiles.length !== 1 ? "s" : ""} uploaded
            </span>
          )}
        </div>
        <DropZone
          label="Drop Jira files here"
          subLabel=".xlsx · .xls · .csv — defects, enhancements, regression TCs"
          icon="ti-table"
          accent="#185FA5"
          accept=".xlsx,.xls,.csv"
          uploading={uploading.jira}
          onFiles={f => uploadFiles(f, "jira")}
        />
      </div>

      {jiraFiles.length > 0 && (
        <div>
          <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "10px" }}>
            Uploaded files
          </p>
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", background: "var(--color-background-primary)" }}>
            {jiraFiles.map((f, i) => (
              <div key={f.name} style={{
                display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px",
                borderBottom: i < jiraFiles.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                transition: "background 0.1s",
              }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ width: "32px", height: "32px", borderRadius: "var(--border-radius-md)", background: "#E6F1FB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <i className="ti ti-file-spreadsheet" style={{ fontSize: "15px", color: "#185FA5" }} aria-hidden="true" />
                </div>
                <span style={{ flex: 1, fontSize: "13px", color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span style={{ fontSize: "12px", color: "var(--color-text-tertiary)", flexShrink: 0 }}>{fmt(f.size)}</span>
                <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "999px", background: "#eaf3e6", color: "#2e6b24", fontWeight: 600, flexShrink: 0 }}>Ready</span>
                <button onClick={() => deleteFile("jira", f.name)} title="Delete file"
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