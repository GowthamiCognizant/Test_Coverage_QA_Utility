import { useState, useEffect } from "react"
import { useAuth, useProject, apiFetch } from "../App"

export default function ProjectSelector({ onSelect }) {
  const { user } = useAuth()
  const { project, setProject } = useProject()
  const [projects, setProjects] = useState([])
  const [models, setModels] = useState([])
  const [newName, setNewName] = useState("")
  const [newModel, setNewModel] = useState("claude")
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => { loadProjects(); loadModels() }, [])

  async function loadProjects() {
    setLoading(true)
    try {
      const token = user?.token || null
      const data = await apiFetch("/projects", {}, token)
      setProjects(data)
      if (data.length === 1 && !project) {
        setProject(data[0])
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function loadModels() {
    try { setModels(await apiFetch("/models")) } catch (e) { console.error(e) }
  }

  async function createProject() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const token = user?.token || null
      const fd = new FormData()
      fd.append("name", newName.trim())
      fd.append("model", newModel)
      const p = await apiFetch("/projects", { method: "POST", body: fd }, token)
      setProjects([...projects, p])
      setProject(p)
      setNewName("")
      onSelect?.()
    } catch (e) { alert(e.message) }
    finally { setCreating(false) }
  }

  return (
    <div>
      <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "12px" }}>
        {user ? "Your projects" : "Guest projects"}
      </p>

      {loading ? (
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Loading...</p>
      ) : projects.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "12px" }}>No projects yet. Create one below to get started.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
          {projects.map(p => (
            <div key={p.id} onClick={() => { setProject(p); onSelect?.() }} style={{
              padding: "8px 12px", borderRadius: "var(--border-radius-md)", cursor: "pointer", fontSize: "13px",
              background: project?.id === p.id ? "var(--color-background-info)" : "var(--color-background-secondary)",
              color: project?.id === p.id ? "var(--color-text-info)" : "var(--color-text-primary)",
              border: project?.id === p.id ? "0.5px solid var(--color-border-info)" : "0.5px solid transparent",
              display: "flex", alignItems: "center", gap: "8px",
            }}>
              <i className="ti ti-folder" style={{ fontSize: "14px" }} aria-hidden="true" />
              <span style={{ flex: 1 }}>{p.name}</span>
              <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "999px", background: "var(--color-background-tertiary)", color: "var(--color-text-tertiary)", border: "0.5px solid var(--color-border-tertiary)" }}>
                {p.model || "claude"}
              </span>
              {project?.id === p.id && <span style={{ fontSize: "11px", color: "var(--color-text-info)" }}>Active</span>}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <input value={newName} onChange={e => setNewName(e.target.value)}
          placeholder="New project name..." onKeyDown={e => e.key === "Enter" && createProject()} />
        {models.length > 0 && (
          <select value={newModel} onChange={e => setNewModel(e.target.value)}>
            {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <button onClick={createProject} disabled={creating || !newName.trim()} style={{
          padding: "8px 14px", background: "var(--color-text-primary)", color: "var(--color-background-primary)",
          border: "none", borderRadius: "var(--border-radius-md)", fontSize: "13px",
          cursor: creating || !newName.trim() ? "not-allowed" : "pointer", fontWeight: 500, opacity: creating || !newName.trim() ? 0.6 : 1,
        }}>
          {creating ? "Creating..." : "Create project"}
        </button>
      </div>
    </div>
  )
}
