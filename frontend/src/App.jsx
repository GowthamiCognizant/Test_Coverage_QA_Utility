import { useState, useEffect, createContext, useContext } from "react"
import Dashboard from "./pages/Dashboard"
import Upload from "./pages/Upload"
import FeatureFiles from "./pages/FeatureFiles"
import Analysis from "./pages/Analysis"
import GeneratedScripts from "./pages/GeneratedScripts"
import AuthModal from "./components/AuthModal"
import Sidebar from "./components/Sidebar"
import Topbar from "./components/Topbar"

export const AuthContext = createContext(null)
export const ProjectContext = createContext(null)

export function useAuth() { return useContext(AuthContext) }
export function useProject() { return useContext(ProjectContext) }

const API = "http://localhost:8000/api"

export async function apiFetch(path, opts = {}, token = null) {
  const headers = { ...(opts.headers || {}) }
  if (token) headers["Authorization"] = `Bearer ${token}`
  if (!(opts.body instanceof FormData)) headers["Content-Type"] = "application/json"
  const res = await fetch(`${API}${path}`, { ...opts, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }))
    throw new Error(err.detail || "Request failed")
  }
  return res.json()
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("tcu_user")) } catch { return null }
  })
  const [project, setProject] = useState(null)
  const [page, setPage] = useState("dashboard")
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState("login")

  useEffect(() => {
    if (user) localStorage.setItem("tcu_user", JSON.stringify(user))
    else localStorage.removeItem("tcu_user")
  }, [user])

  useEffect(() => { initProject() }, [user])

  async function initProject() {
    const token = user?.token || null
    try {
      const projects = await apiFetch("/projects", {}, token)
      if (projects.length > 0) {
        setProject(projects[0])
      } else {
        const fd = new FormData()
        fd.append("name", "default")
        fd.append("model", "claude")
        const p = await apiFetch("/projects", { method: "POST", body: fd }, token)
        setProject(p)
      }
    } catch (e) { console.error("initProject failed", e) }
  }

  function openLogin() { setAuthMode("login"); setShowAuthModal(true) }
  function openRegister() { setAuthMode("register"); setShowAuthModal(true) }

  const pages = { dashboard: Dashboard, upload: Upload, features: FeatureFiles, analysis: Analysis, scripts: GeneratedScripts }
  const PageComponent = pages[page] || Dashboard

  return (
    <AuthContext.Provider value={{ user, setUser, openLogin, openRegister }}>
      <ProjectContext.Provider value={{ project, setProject }}>
        <div style={{ display: "flex", height: "100vh", background: "var(--color-background-tertiary)", fontFamily: "var(--font-sans)" }}>
          <Sidebar page={page} setPage={setPage} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Topbar />
            <div style={{ flex: 1, overflow: "auto", padding: "32px 36px" }}>
              <PageComponent setPage={setPage} currentPage={page} />
            </div>
          </div>
        </div>
        {showAuthModal && (
          <AuthModal initialMode={authMode}
            onClose={() => setShowAuthModal(false)}
            onSuccess={u => { setUser(u); setShowAuthModal(false) }} />
        )}
      </ProjectContext.Provider>
    </AuthContext.Provider>
  )
}