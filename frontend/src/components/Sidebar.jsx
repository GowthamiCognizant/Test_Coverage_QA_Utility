import { useAuth, useProject } from "../App"

const NAV = [
  { id: "dashboard", label: "Dashboard",         icon: "ti-layout-dashboard" },
  { id: "upload",    label: "Data sources",       icon: "ti-plug-connected",  group: "Input layer" },
  { id: "features",  label: "Feature files",      icon: "ti-file-code" },
  { id: "analysis",  label: "Coverage analyser",  icon: "ti-chart-bar",       agent: "01", group: "Agents" },
  { id: "scripts",   label: "Script generator",   icon: "ti-code",            agent: "02" },
  { id: "golden",    label: "Golden suite",        icon: "ti-stars",           agent: "03" },
  { id: "risk",      label: "Risk scanner",        icon: "ti-shield-check",    agent: "04" },
  { id: "domain",    label: "Domain Expert",       icon: "ti-brain",           group: "Knowledge" },
]

export default function Sidebar({ page, setPage }) {
  const { user, openRegister, openLogin } = useAuth()
  const { project } = useProject()

  return (
    <div style={{
      width: "230px", display: "flex", flexDirection: "column", flexShrink: 0,
      background: "linear-gradient(180deg, #0f2742 0%, #0f2742 70%, #0a1f35 100%)",
      fontFamily: "var(--font-sans)",
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "linear-gradient(135deg,#1e5fa5,#0f3a72)", border: "1px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-atom-2" style={{ fontSize: "20px", color: "#93c5fd" }} />
          </div>
          <div>
            <p style={{ fontSize: "15px", fontWeight: 800, color: "#ffffff", margin: 0, letterSpacing: "-0.01em" }}>ModQaaS</p>
            <p style={{ fontSize: "10px", fontWeight: 500, color: "#60a5fa", margin: 0, letterSpacing: "0.04em" }}>MULTI-AGENT QA PLATFORM</p>
          </div>
        </div>
      </div>

      <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "0 14px" }} />

      {/* Active project */}
      {project && (
        <div style={{ padding: "10px 18px" }}>
          <p style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Project</p>
          <p style={{ fontSize: "12px", fontWeight: 500, color: "rgba(255,255,255,0.8)", margin: 0 }}>{project.name}</p>
        </div>
      )}

      <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "0 14px" }} />

      {/* Nav */}
      <nav style={{ flex: 1, padding: "8px 10px", overflowY: "auto" }}>
        {NAV.map(item => {
          const active = page === item.id
          return (
            <div key={item.id}>
              {item.group && (
                <p style={{ fontSize: "9px", color: "rgba(255,255,255,0.28)", padding: "14px 8px 5px", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                  {item.group}
                </p>
              )}
              <div
                onClick={() => setPage(item.id)}
                role="button" tabIndex={0}
                onKeyDown={e => e.key === "Enter" && setPage(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "9px",
                  padding: "8px 10px", borderRadius: "8px",
                  fontSize: "13px", cursor: "pointer", marginBottom: "1px",
                  color: active ? "#ffffff" : "rgba(255,255,255,0.52)",
                  background: active ? "rgba(255,255,255,0.11)" : "transparent",
                  fontWeight: active ? 600 : 400,
                  borderLeft: active ? "2px solid #60a5fa" : "2px solid transparent",
                  transition: "all 0.1s",
                }}
                onMouseEnter={e => !active && (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                onMouseLeave={e => !active && (e.currentTarget.style.background = "transparent")}
              >
                <i className={`ti ${item.icon}`} style={{ fontSize: "15px", flexShrink: 0, color: active ? "#60a5fa" : "inherit" }} aria-hidden="true" />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.agent && (
                  <span style={{ fontSize: "10px", fontWeight: 700, color: active ? "#60a5fa" : "rgba(255,255,255,0.3)", fontVariantNumeric: "tabular-nums" }}>
                    {item.agent}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </nav>

      <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "0 14px" }} />

      {/* User */}
      {!user ? (
        <div style={{ padding: "12px 14px" }}>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", margin: "0 0 6px" }}>Save your work privately</p>
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={openLogin} style={{ flex: 1, padding: "7px 0", background: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)", borderRadius: "7px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
              Log in
            </button>
            <button onClick={openRegister} style={{ flex: 1, padding: "7px 0", background: "rgba(96,165,250,0.25)", color: "#93c5fd", border: "1px solid rgba(96,165,250,0.4)", borderRadius: "7px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
              Sign up
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "linear-gradient(135deg,#1e5fa5,#0f3a72)", border: "1px solid rgba(96,165,250,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "#93c5fd", flexShrink: 0 }}>
            {user.username.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "12px", fontWeight: 500, color: "rgba(255,255,255,0.85)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.username}</p>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", margin: 0 }}>{user.team || "QA Engineer"}</p>
          </div>
        </div>
      )}
    </div>
  )
}
