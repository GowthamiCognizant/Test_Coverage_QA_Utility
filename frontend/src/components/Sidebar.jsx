import { useAuth, useProject } from "../App"

const NAV = [
  { id: "dashboard", label: "Dashboard",        icon: "ti-layout-dashboard" },
  { id: "upload",    label: "Upload files",      icon: "ti-upload" },
  { id: "features",  label: "Feature files",     icon: "ti-file-code" },
  { id: "analysis",  label: "Gap analysis",      icon: "ti-chart-bar" },
  { id: "scripts",   label: "Generated scripts", icon: "ti-download" },
]

// SVG coverage icon
function CoverageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="7" height="7" rx="1.5" fill="#1a5fb4" opacity="0.9"/>
      <rect x="11" y="2" width="7" height="7" rx="1.5" fill="#1a5fb4" opacity="0.6"/>
      <rect x="2" y="11" width="7" height="7" rx="1.5" fill="#1a5fb4" opacity="0.6"/>
      <rect x="11" y="11" width="7" height="7" rx="1.5" fill="#26a269" opacity="0.9"/>
      <path d="M13.5 14.5 L15 16 L17.5 13" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function Sidebar({ page, setPage }) {
  const { user, openRegister } = useAuth()
  const { project } = useProject()

  return (
    <div style={{
      width: "240px", display: "flex", flexDirection: "column", flexShrink: 0,
      background: "linear-gradient(180deg, #1e3a5f 0%, #1a3354 60%, #162d4a 100%)",
      fontFamily: "var(--font-sans)",
    }}>
      {/* Logo */}
      <div style={{ padding: "22px 20px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <CoverageIcon />
          </div>
          <div>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "#ffffff", margin: 0, lineHeight: 1.3, letterSpacing: "-0.01em" }}>Test Analysis</p>
            <p style={{ fontSize: "11px", fontWeight: 400, color: "#7eb8f7", margin: 0, lineHeight: 1.3 }}>Coverage Utility</p>
          </div>
        </div>
        <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", margin: "8px 0 0", paddingLeft: "46px", letterSpacing: "0.06em" }}>AI-POWERED · v2.0</p>
      </div>

      <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", margin: "0 16px" }} />

      {/* Active module */}
      {project && (
        <div style={{ padding: "12px 20px" }}>
          <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.09em" }}>Active module</p>
          <p style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255,255,255,0.9)", margin: 0 }}>{project.name}</p>
        </div>
      )}

      <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", margin: "0 16px" }} />

      {/* Nav */}
      <nav style={{ flex: 1, padding: "10px 12px" }}>
        <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", padding: "10px 8px 6px", textTransform: "uppercase", letterSpacing: "0.09em" }}>Workspace</p>
        {NAV.map(item => {
          const active = page === item.id
          return (
            <div key={item.id} onClick={() => setPage(item.id)} style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "9px 10px", borderRadius: "8px",
              fontSize: "13px", cursor: "pointer", marginBottom: "2px",
              color: active ? "#ffffff" : "rgba(255,255,255,0.5)",
              background: active ? "rgba(255,255,255,0.12)" : "transparent",
              fontWeight: active ? 600 : 400, transition: "all 0.12s",
              borderLeft: active ? "2px solid #7eb8f7" : "2px solid transparent",
            }}
              onMouseEnter={e => !active && (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
              onMouseLeave={e => !active && (e.currentTarget.style.background = "transparent")}
            >
              <i className={`ti ${item.icon}`} style={{ fontSize: "15px", flexShrink: 0, color: active ? "#7eb8f7" : "inherit" }} aria-hidden="true" />
              {item.label}
            </div>
          )
        })}
      </nav>

      <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", margin: "0 16px" }} />

      {/* User / CTA */}
      {!user ? (
        <div style={{ padding: "14px 16px" }}>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", margin: "0 0 8px" }}>Save your work privately</p>
          <button onClick={openRegister} style={{
            width: "100%", padding: "9px 0",
            background: "rgba(126,184,247,0.18)", color: "#7eb8f7",
            border: "1px solid rgba(126,184,247,0.3)", borderRadius: "8px",
            fontSize: "12px", fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            transition: "all 0.12s",
          }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(126,184,247,0.28)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(126,184,247,0.18)"}
          >
            <i className="ti ti-user-plus" style={{ fontSize: "13px" }} aria-hidden="true" />
            Create account
          </button>
        </div>
      ) : (
        <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "rgba(126,184,247,0.25)", border: "1px solid rgba(126,184,247,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "#7eb8f7", flexShrink: 0 }}>
            {user.username.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "12px", fontWeight: 500, color: "rgba(255,255,255,0.85)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.username}</p>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", margin: 0 }}>{user.team || "Member"}</p>
          </div>
        </div>
      )}
    </div>
  )
}