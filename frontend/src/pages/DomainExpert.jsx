import { useState, useEffect, useRef } from "react"
import { useAuth, useProject, apiFetch } from "../App"
import { Button } from "../components/ui"

// ── Keyword chip topics ───────────────────────────────────────────────────────
const TOPICS = [
  { group: "Operations",  color: "#185FA5", bg: "#e8f0fb",
    chips: [
      { label: "Inbound / Receipts",   q: "What is the inbound receipts process at Americold, step by step?" },
      { label: "Outbound / Shipping",  q: "How does the outbound order fulfillment process work?" },
      { label: "Order Maintenance",    q: "What operations can I do in Order Maintenance in AMCC?" },
      { label: "FEFO / FIFO",          q: "What is FEFO and how does Americold apply it for inventory rotation?" },
      { label: "Holds Management",     q: "How does Holds Management work? What types of holds exist?" },
      { label: "CMO Services",         q: "What is CMO (Contract Manufacturing Operations) at Americold?" },
      { label: "Action Plans",         q: "What are Action Plans in AMCC and when are they created?" },
      { label: "Claims Process",       q: "How does the claims process work for a temperature deviation?" },
    ]
  },
  { group: "Admin",  color: "#2e5c24", bg: "#eaf3e6",
    chips: [
      { label: "User Management",      q: "How does User Management work in AMCC?" },
      { label: "Role Management",      q: "What roles exist in AMCC and what are their permissions?" },
      { label: "Access Items",         q: "What is Access Item Management and how does it differ from roles?" },
      { label: "Login & Auth",         q: "What are the login and authentication options in AMCC?" },
      { label: "Message Centre",       q: "What is the Message Centre used for in AMCC?" },
      { label: "Dashboard Widgets",    q: "What widgets are available on the AMCC homepage dashboard?" },
      { label: "Menu Config",          q: "How can administrators configure the navigation menu in AMCC?" },
      { label: "Rules Engine",         q: "What does the Rules Engine do in AMCC? Give examples." },
    ]
  },
  { group: "Reporting",  color: "#7a4810", bg: "#fdf3e3",
    chips: [
      { label: "Inventory Report",     q: "What does the Total Inventory Report contain and when is it used?" },
      { label: "Activity Report",      q: "What movement types appear in the Inventory Activity Report?" },
      { label: "Field Reports",        q: "What are Field Reports and who generates them?" },
      { label: "TIV Report",           q: "What is the Total Inventory Valuation (TIV) report?" },
      { label: "CI Events",            q: "What is the CI Events module and what integration types does it support?" },
      { label: "EDI Transactions",     q: "Which EDI transaction sets does Americold use and what do they do?" },
    ]
  },
  { group: "QA & Testing",  color: "#6a2fa0", bg: "#f5f0ff",
    chips: [
      { label: "@admin-module",        q: "What does the @admin-module automation tag cover? How many scenarios?" },
      { label: "@claims-regression",   q: "What are the key regression test scenarios for the Claims module?" },
      { label: "@ci-event-regression-1", q: "What does @ci-event-regression-1 cover? How many scenarios?" },
      { label: "@ci-event-regression-2", q: "What does @ci-event-regression-2 cover?" },
      { label: "@audit-trail",         q: "What are the audit trail regression test scenarios?" },
      { label: "Sanity vs Full Reg",   q: "What is the difference between sanity tests and full regression? How long does each take?" },
      { label: "Automation Suite",     q: "Give me an overview of the AMCC automation suite — tags, scenario counts, runtime." },
      { label: "Release Testing",      q: "What is the AMCC release strategy and how is each release tested?" },
    ]
  },
  { group: "Cold Chain",  color: "#8a1a1a", bg: "#fce8e8",
    chips: [
      { label: "Temperature Zones",    q: "What are the temperature zones at Americold and what products go in each?" },
      { label: "Cold Chain Break",     q: "What happens when a cold chain break occurs? What is the protocol?" },
      { label: "Food Safety Regs",     q: "What food safety regulations does Americold comply with?" },
      { label: "21 CFR Part 11",       q: "How does AMCC support FDA 21 CFR Part 11 compliance?" },
    ]
  },
]

// ── Typing indicator ─────────────────────────────────────────────────────────
function Dots() {
  return (
    <span style={{ display: "inline-flex", gap: "3px", alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: "5px", height: "5px", borderRadius: "50%",
          background: "var(--color-text-tertiary)",
          animation: `de-pulse 1.2s ease-in-out ${i * 0.18}s infinite`,
        }} />
      ))}
    </span>
  )
}

// ── Single message bubble ────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === "user"
  return (
    <div style={{
      display: "flex", gap: "8px", alignItems: "flex-start",
      flexDirection: isUser ? "row-reverse" : "row",
      marginBottom: "10px",
    }}>
      <div style={{
        width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
        background: isUser ? "#256abf" : "linear-gradient(135deg,#6a2fa0,#185FA5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "13px", color: "#fff",
      }}>
        <i className={`ti ${isUser ? "ti-user" : "ti-brain"}`} aria-hidden="true" />
      </div>
      <div style={{
        maxWidth: "80%",
        background: isUser ? "#256abf" : "var(--color-background-primary)",
        color: isUser ? "#fff" : "var(--color-text-primary)",
        border: isUser ? "none" : "1px solid var(--color-border-tertiary)",
        borderRadius: isUser ? "12px 3px 12px 12px" : "3px 12px 12px 12px",
        padding: "9px 13px", fontSize: "13px", lineHeight: 1.6,
      }}>
        {msg.loading
          ? <Dots />
          : <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
        }
        {msg.sources?.length > 0 && (
          <div style={{
            marginTop: "8px", paddingTop: "6px",
            borderTop: `1px solid ${isUser ? "rgba(255,255,255,0.2)" : "var(--color-border-tertiary)"}`,
            display: "flex", flexWrap: "wrap", gap: "4px",
          }}>
            <span style={{ fontSize: "10px", color: isUser ? "rgba(255,255,255,0.6)" : "var(--color-text-tertiary)", alignSelf: "center", marginRight: "2px" }}>from:</span>
            {msg.sources.slice(0, 3).map((s, i) => (
              <span key={i} style={{
                fontSize: "10px", padding: "1px 6px", borderRadius: "999px",
                background: isUser ? "rgba(255,255,255,0.18)" : "var(--color-background-secondary)",
                color: isUser ? "#fff" : "var(--color-text-secondary)",
              }}>{s.title}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function DomainExpert() {
  const { user }   = useAuth()
  const { project } = useProject()
  const token = user?.token

  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState("")
  const [loading, setLoading]   = useState(false)
  const [openGroup, setOpenGroup] = useState("Operations")
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  async function send(text) {
    const q = (text || input).trim()
    if (!q || loading) return
    setInput("")

    setMessages(prev => [
      ...prev,
      { role: "user",      content: q },
      { role: "assistant", content: "", loading: true },
    ])
    setLoading(true)

    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
      const res = await apiFetch("/domain-expert/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history, project_id: project?.id || "" }),
      }, token)
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: "assistant", content: res.answer, sources: res.sources },
      ])
    } catch (e) {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: "assistant", content: `Error: ${e.message}`, sources: [] },
      ])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }

  return (
    <div style={{ maxWidth: "900px" }}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
        <div style={{
          width: "40px", height: "40px", borderRadius: "12px", flexShrink: 0,
          background: "linear-gradient(135deg,#6a2fa0,#185FA5)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <i className="ti ti-brain" style={{ fontSize: "20px", color: "#fff" }} aria-hidden="true" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>Americold Domain Expert</h1>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-tertiary)" }}>
            45+ knowledge articles · Cold chain · AMCC modules · QA testing
          </p>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} style={{
            marginLeft: "auto", padding: "5px 12px", fontSize: "11px", fontWeight: 600,
            border: "1px solid var(--color-border-secondary)", borderRadius: "6px",
            background: "transparent", cursor: "pointer", color: "var(--color-text-tertiary)",
            display: "flex", alignItems: "center", gap: "5px",
          }}>
            <i className="ti ti-trash" style={{ fontSize: "12px" }} /> Clear
          </button>
        )}
      </div>

      {/* ── Topic chips ─────────────────────────────────────────────── */}
      <div style={{
        background: "var(--color-background-primary)",
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: "12px", marginBottom: "12px", overflow: "hidden",
      }}>
        {/* Group tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--color-border-tertiary)", overflowX: "auto" }}>
          {TOPICS.map(t => (
            <button key={t.group} onClick={() => setOpenGroup(t.group)} style={{
              padding: "8px 16px", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap",
              border: "none", borderBottom: openGroup === t.group ? `2px solid ${t.color}` : "2px solid transparent",
              marginBottom: "-1px", background: "transparent", cursor: "pointer",
              color: openGroup === t.group ? t.color : "var(--color-text-tertiary)",
            }}>{t.group}</button>
          ))}
        </div>
        {/* Chips */}
        <div style={{ padding: "10px 12px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {TOPICS.find(t => t.group === openGroup)?.chips.map(c => (
            <button key={c.label} onClick={() => send(c.q)} disabled={loading} style={{
              padding: "5px 12px", fontSize: "12px", fontWeight: 500,
              border: `1px solid ${TOPICS.find(t=>t.group===openGroup)?.color}44`,
              borderRadius: "999px", cursor: loading ? "not-allowed" : "pointer",
              background: TOPICS.find(t=>t.group===openGroup)?.bg,
              color: TOPICS.find(t=>t.group===openGroup)?.color,
              transition: "opacity .1s", opacity: loading ? 0.5 : 1,
            }}>{c.label}</button>
          ))}
        </div>
      </div>

      {/* ── Chat window ─────────────────────────────────────────────── */}
      <div style={{
        background: "var(--color-background-primary)",
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: "12px", overflow: "hidden",
      }}>
        {/* Messages */}
        <div style={{ minHeight: "320px", maxHeight: "520px", overflow: "auto", padding: "14px 16px" }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--color-text-tertiary)" }}>
              <i className="ti ti-message-2-question" style={{ fontSize: "32px", marginBottom: "10px", display: "block" }} aria-hidden="true" />
              <p style={{ margin: 0, fontSize: "13px" }}>Pick a topic above or type a question below</p>
            </div>
          ) : (
            <>
              {messages.map((m, i) => <Bubble key={i} msg={m} />)}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div style={{ borderTop: "1px solid var(--color-border-tertiary)", padding: "10px 12px", display: "flex", gap: "8px", alignItems: "flex-end" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
            rows={2}
            placeholder="Ask about any AMCC module, business flow, cold chain rule, or QA test scenario… (Enter to send)"
            style={{ flex: 1, resize: "none", fontFamily: "var(--font-sans)", fontSize: "13px", border: "1px solid var(--color-border-secondary)", borderRadius: "8px", padding: "8px 10px" }}
            disabled={loading}
          />
          <Button icon={loading ? "ti-loader-2" : "ti-send"} busy={loading} disabled={!input.trim()} onClick={() => send()}>
            Ask
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes de-pulse {
          0%,80%,100%{transform:scale(.65);opacity:.3}
          40%{transform:scale(1);opacity:1}
        }
      `}</style>
    </div>
  )
}
