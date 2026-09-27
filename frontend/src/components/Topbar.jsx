import { useAuth, useProject } from "../App"

export default function Topbar() {
  const { user, setUser, openLogin, openRegister } = useAuth()
  const { project } = useProject()

  return (
    <div style={{ background: "#ffffff", flexShrink: 0, borderBottom: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "15px", fontWeight: 600, color: "#1a1a1a", letterSpacing: "-0.01em" }}>
            Test Analysis Coverage Utility
          </span>
          {project && (
            <span style={{ fontSize: "12px", color: "#9a968e", display: "flex", alignItems: "center", gap: "4px" }}>
              <i className="ti ti-chevron-right" style={{ fontSize: "12px" }} aria-hidden="true" />
              {project.name}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {user ? (
            <>
              <span style={{ fontSize: "12px", color: "#5a5650" }}>{user.team || user.username}</span>
              <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "linear-gradient(135deg,#c8a96e,#e8c87a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "#1a1a1a" }}>
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <button onClick={() => setUser(null)} style={{ fontSize: "12px", padding: "5px 12px", border: "1px solid rgba(0,0,0,0.12)", borderRadius: "6px", background: "transparent", cursor: "pointer", color: "#5a5650", fontFamily: "var(--font-sans)" }}>
                Sign out
              </button>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button onClick={openLogin} style={{ fontSize: "12px", padding: "6px 14px", border: "1px solid rgba(0,0,0,0.12)", borderRadius: "6px", background: "transparent", cursor: "pointer", color: "#5a5650", fontFamily: "var(--font-sans)" }}>
                Sign in
              </button>
              <button onClick={openRegister} style={{ fontSize: "12px", padding: "6px 14px", border: "none", borderRadius: "6px", background: "linear-gradient(135deg,#c8a96e,#e8c87a)", color: "#1a1a1a", cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                Create account
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}