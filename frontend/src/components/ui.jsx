// Small shared building blocks for the agent pages (Data sources, Golden suite, Risk scanner)

export const BAND_COLORS = { Critical: "#d03b3b", High: "#ec835a", Medium: "#fab219", Low: "#9a968e" }
export const BAND_ICONS = { Critical: "ti-alert-octagon", High: "ti-alert-triangle", Medium: "ti-alert-circle", Low: "ti-info-circle" }
export const TIER_COLORS = { P0: "#104281", P1: "#256abf", P2: "#5598e7", P3: "#86b6ef" }
export const RUN_STATUS = {
  Passed:        { color: "#2e6b24", bg: "#eaf3e6", icon: "ti-circle-check" },
  Failed:        { color: "#8a1a1a", bg: "#fce8e8", icon: "ti-circle-x" },
  Blocked:       { color: "#7a4810", bg: "#fdf3e3", icon: "ti-ban" },
  "In Progress": { color: "#1a4f8a", bg: "#e8f0fb", icon: "ti-progress" },
  "Not Run":     { color: "#5a5650", bg: "#f5f2ed", icon: "ti-circle-dashed" },
}

export function PageHeader({ title, subtitle, agent, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
      <div>
        {agent && <p style={{ fontSize: "11px", fontWeight: 600, color: "#1a4f8a", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{agent}</p>}
        <h1 style={{ fontSize: "24px", fontWeight: 500, margin: "0 0 6px" }}>{title}</h1>
        {subtitle && <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", margin: 0, maxWidth: "720px" }}>{subtitle}</p>}
      </div>
      {children && <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>{children}</div>}
    </div>
  )
}

export function Card({ title, icon, right, children, pad = true, style }) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--color-border-tertiary)", borderRadius: "14px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: "16px", overflow: "hidden", ...style }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 18px", borderBottom: "1px solid var(--color-border-tertiary)" }}>
          {icon && <i className={`ti ${icon}`} style={{ fontSize: "16px", color: "#1a4f8a" }} aria-hidden="true" />}
          <span style={{ flex: 1, fontSize: "14px", fontWeight: 600 }}>{title}</span>
          {right}
        </div>
      )}
      <div style={pad ? { padding: "16px 18px" } : {}}>{children}</div>
    </div>
  )
}

export function Button({ children, onClick, icon, busy, disabled, variant = "primary", title, small }) {
  const styles = {
    primary:   { background: "#1a4f8a", color: "#fff", border: "1px solid #1a4f8a" },
    secondary: { background: "#fff", color: "#1a1a1a", border: "1px solid var(--color-border-secondary)" },
    danger:    { background: "#fce8e8", color: "#8a1a1a", border: "1px solid #f0a0a0" },
    success:   { background: "#eaf3e6", color: "#2e5c24", border: "1px solid #a8cf9b" },
  }[variant]
  return (
    <button onClick={onClick} disabled={disabled || busy} title={title} style={{
      ...styles, display: "inline-flex", alignItems: "center", gap: "6px",
      padding: small ? "5px 10px" : "8px 14px", borderRadius: "8px", fontSize: small ? "12px" : "13px", fontWeight: 600,
      cursor: disabled || busy ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, fontFamily: "var(--font-sans)", whiteSpace: "nowrap",
    }}>
      {(icon || busy) && <i className={`ti ${busy ? "ti-loader-2" : icon}`} style={{ fontSize: small ? "13px" : "15px", animation: busy ? "spin 1s linear infinite" : "none" }} aria-hidden="true" />}
      {children}
    </button>
  )
}

export function Banner({ kind = "error", children, onClose }) {
  const c = {
    error:   { bg: "#FCEBEB", border: "#F09595", color: "#791F1F", icon: "ti-alert-circle" },
    warning: { bg: "#fdf3e3", border: "#f0c98a", color: "#7a4810", icon: "ti-alert-triangle" },
    success: { bg: "#eaf3e6", border: "#a8cf9b", color: "#2e5c24", icon: "ti-circle-check" },
    info:    { bg: "#e8f0fb", border: "#b8cef0", color: "#1a4f8a", icon: "ti-info-circle" },
  }[kind]
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "11px 14px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: "10px", marginBottom: "14px", fontSize: "13px", color: c.color }}>
      <i className={`ti ${c.icon}`} style={{ fontSize: "16px", flexShrink: 0, marginTop: "1px" }} aria-hidden="true" />
      <div style={{ flex: 1 }}>{children}</div>
      {onClose && <button onClick={onClose} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: c.color, padding: 0 }}><i className="ti ti-x" aria-hidden="true" /></button>}
    </div>
  )
}

export function Stat({ label, value, sub, color }) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--color-border-tertiary)", borderRadius: "12px", padding: "14px 16px", minWidth: 0 }}>
      <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-tertiary)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ fontSize: "26px", fontWeight: 700, color: color || "var(--color-text-primary)", margin: 0, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {sub && <p style={{ fontSize: "12px", color: "var(--color-text-tertiary)", margin: "4px 0 0" }}>{sub}</p>}
    </div>
  )
}

export function StatRow({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "16px" }}>{children}</div>
}

export function Pill({ children, color = "#5a5650", bg = "#f5f2ed", icon, title }) {
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px", color, background: bg, whiteSpace: "nowrap" }}>
      {icon && <i className={`ti ${icon}`} style={{ fontSize: "11px" }} aria-hidden="true" />}
      {children}
    </span>
  )
}

export function BandPill({ band, score }) {
  return (
    <Pill color="#1a1a1a" bg={BAND_COLORS[band] + "2e"} icon={BAND_ICONS[band]}>
      <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: BAND_COLORS[band] }} />
      {band}{score !== undefined ? ` · ${score}` : ""}
    </Pill>
  )
}

export function TierPill({ tier }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 700, color: "#1a1a1a" }}>
      <span style={{ width: "9px", height: "9px", borderRadius: "2px", background: TIER_COLORS[tier] }} />{tier}
    </span>
  )
}

export function RunPill({ status }) {
  const s = RUN_STATUS[status] || RUN_STATUS["Not Run"]
  return <Pill color={s.color} bg={s.bg} icon={s.icon}>{status || "Not Run"}</Pill>
}

// One horizontal stacked bar: segments [{key, value, color}], 2px gaps, hover tooltip via title
export function StackedBar({ segments, total, height = 14 }) {
  const sum = total || segments.reduce((a, s) => a + s.value, 0) || 1
  const shown = segments.filter(s => s.value > 0)
  return (
    <div style={{ display: "flex", gap: "2px", height, width: "100%", background: "var(--color-background-secondary)", borderRadius: "4px", overflow: "hidden" }}>
      {shown.map(s => (
        <div key={s.key} title={`${s.key}: ${s.value.toLocaleString()} (${Math.round(s.value / sum * 100)}%)`}
          style={{ width: `${s.value / sum * 100}%`, minWidth: "3px", background: s.color, cursor: "default" }} />
      ))}
    </div>
  )
}

export function Legend({ items }) {
  return (
    <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", fontSize: "12px", color: "var(--color-text-secondary)" }}>
      {items.map(i => (
        <span key={i.key} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: i.color }} />{i.key}
          {i.value !== undefined && <b style={{ color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>{i.value.toLocaleString()}</b>}
        </span>
      ))}
    </div>
  )
}

export function DonutChart({ segments, size = 148, thickness = 30, label, sublabel }) {
  const r    = (size - thickness) / 2
  const circ = 2 * Math.PI * r
  const total = segments.reduce((s, x) => s + (x.value || 0), 0)
  let accumulated = 0
  const arcs = segments.filter(s => s.value > 0).map(seg => {
    const len       = total > 0 ? (seg.value / total) * circ : 0
    const dashoffset = circ / 4 - accumulated
    accumulated    += len
    return { ...seg, len, dashoffset }
  })
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }} aria-label={`Donut chart: ${segments.map(s => `${s.key} ${s.value}`).join(", ")}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f0ede8" strokeWidth={thickness} />
        {arcs.map(arc => (
          <circle key={arc.key} cx={size/2} cy={size/2} r={r} fill="none"
            stroke={arc.color} strokeWidth={thickness}
            strokeDasharray={`${arc.len} ${circ - arc.len}`}
            strokeDashoffset={arc.dashoffset}
            style={{ transition: "stroke-dasharray 0.5s ease" }}>
            <title>{arc.key}: {arc.value} ({Math.round(arc.value/total*100)}%)</title>
          </circle>
        ))}
        <text x={size/2} y={size/2 - 8} textAnchor="middle" fontSize="20" fontWeight="700" fill="#1a1a1a" fontFamily="var(--font-sans)">{label ?? total}</text>
        <text x={size/2} y={size/2 + 12} textAnchor="middle" fontSize="10" fill="#9a968e" fontFamily="var(--font-sans)">{sublabel ?? "total"}</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
        {segments.map(s => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: "var(--color-text-secondary)" }}>{s.key}</span>
            <b style={{ color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>{(s.value || 0).toLocaleString()}</b>
            <span style={{ color: "var(--color-text-tertiary)", minWidth: "30px", textAlign: "right" }}>{total > 0 ? Math.round(s.value/total*100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export const th = { textAlign: "left", fontSize: "11px", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "9px 12px", borderBottom: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", position: "sticky", top: 0, whiteSpace: "nowrap" }
export const td = { fontSize: "12px", padding: "8px 12px", borderBottom: "1px solid var(--color-border-tertiary)", verticalAlign: "top" }

export function fmtDate(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  return isNaN(d) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}
