import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../App.jsx";
import MemberCard from "../components/MemberCard.jsx";
import QuoteBar from "../components/QuoteBar.jsx";
import CalendarPicker from "../components/CalendarPicker.jsx";

const TEAM = [
  { id: "sajina",  name: "Sajina",  role: "CRM / B2B",    color: "#7C3AED", glow: "#7C3AED35", gradient: "linear-gradient(135deg,#7C3AED,#A78BFA)", light: "#A78BFA" },
  { id: "divash",  name: "Divash",  role: "Field Visits",  color: "#0EA5E9", glow: "#0EA5E935", gradient: "linear-gradient(135deg,#0EA5E9,#38BDF8)", light: "#38BDF8" },
  { id: "manoj",   name: "Manoj",   role: "Accounts",      color: "#D97706", glow: "#D9770635", gradient: "linear-gradient(135deg,#D97706,#FBBF24)", light: "#FBBF24" },
  { id: "krisha",  name: "Krisha",  role: "Content",       color: "#DB2777", glow: "#DB277735", gradient: "linear-gradient(135deg,#DB2777,#F472B6)", light: "#F472B6" },
  { id: "sunil",   name: "Sunil",   role: "Warehouse",     color: "#059669", glow: "#05966935", gradient: "linear-gradient(135deg,#059669,#34D399)", light: "#34D399" },
];

const EMAIL_TO_ID = {
  "sajina@unijoynepal.com":  "sajina",
  "divash@unijoynepal.com":  "divash",
  "manoj@unijoynepal.com":   "manoj",
  "krisha@unijoynepal.com":  "krisha",
  "sunil@unijoynepal.com":   "sunil",
};

function getMondayKey(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function getPrevWeekKey(weekKey) {
  const d = new Date(weekKey + "T00:00:00");
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}

function getNextWeekKey(weekKey) {
  const d = new Date(weekKey + "T00:00:00");
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

function formatWeekRange(weekKey) {
  const start = new Date(weekKey + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const o = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", o)} – ${end.toLocaleDateString("en-US", o)}`;
}

function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    let start = null;
    const step = ts => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setVal(Math.round(p * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target]);
  return val;
}

function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  const h = String(t.getHours()).padStart(2, "0");
  const m = String(t.getMinutes()).padStart(2, "0");
  const s = String(t.getSeconds()).padStart(2, "0");
  return (
    <div style={{ fontFamily: "var(--font-head)", fontSize: 24, fontWeight: 700, letterSpacing: -0.5 }}>
      {h}:{m}<span style={{ fontSize: 14, color: "var(--muted)", marginLeft: 2 }}>:{s}</span>
    </div>
  );
}

export default function Week() {
  const { weekKey } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [weekData, setWeekData] = useState({});
  const [prevWeekData, setPrevWeekData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [showPrev, setShowPrev] = useState(false);

  const isAdmin = user?.isAdmin;
  const currentUserMemberId = EMAIL_TO_ID[user?.email] || null;
  const thisWeek = getMondayKey();
  const isThisWeek = weekKey === thisWeek;
  const prevWeek = getPrevWeekKey(weekKey);
  const nextWeek = getNextWeekKey(weekKey);

  const loadWeek = useCallback(async (wk) => {
    const r = await fetch(`/api/tasks?weekKey=${wk}`);
    const d = await r.json();
    return d.data || {};
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadWeek(weekKey), loadWeek(prevWeek)]).then(([curr, prev]) => {
      setWeekData(curr);
      setPrevWeekData(prev);
      setLoading(false);
    });
  }, [weekKey, loadWeek, prevWeek]);

  const handleUpdate = useCallback(async (memberId, tasks) => {
    setSaving(true);
    const r = await fetch(`/api/tasks?weekKey=${weekKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, tasks }),
    });
    const d = await r.json();
    if (d.data) setWeekData(d.data);
    setSaving(false);
  }, [weekKey]);

  const allTasks = TEAM.flatMap(m => weekData[m.id] || []);
  const totalPct = allTasks.length > 0
    ? Math.round(allTasks.reduce((s, t) => s + (t.pct || 0), 0) / allTasks.length)
    : 0;
  const totalDone = allTasks.filter(t => (t.pct || 0) === 100).length;
  const pctDisplay = useCountUp(totalPct);
  const scoreColor = totalPct >= 80 ? "#34D399" : totalPct >= 50 ? "#FBBF24" : "#F87171";

  // Last week summary
  const prevAllTasks = TEAM.flatMap(m => prevWeekData[m.id] || []);
  const prevPct = prevAllTasks.length > 0
    ? Math.round(prevAllTasks.reduce((s, t) => s + (t.pct || 0), 0) / prevAllTasks.length)
    : null;
  const prevColor = prevPct !== null ? (prevPct >= 80 ? "#34D399" : prevPct >= 50 ? "#FBBF24" : "#F87171") : null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg,#020617 0%,#0a0a1e 40%,#0d0620 70%,#020617 100%)",
      backgroundSize: "400% 400%", animation: "bgDrift 20s ease infinite",
      fontFamily: "var(--font-body)", padding: "24px 28px",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              onClick={() => navigate("/")}
              style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--muted)", borderRadius: 10, padding: "8px 12px",
                cursor: "pointer", fontSize: 16, fontFamily: "var(--font-body)",
              }}
            >← Dashboard</button>
            <div>
              <div style={{ fontFamily: "var(--font-head)", fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>
                Sunday Huddle
                {isThisWeek && (
                  <span style={{ marginLeft: 8, fontSize: 10, background: "rgba(52,211,153,0.15)", color: "#34D399", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 5, padding: "2px 7px", verticalAlign: "middle" }}>
                    THIS WEEK
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                {formatWeekRange(weekKey)}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {saving && <span style={{ fontSize: 12, color: "var(--muted)", animation: "pulse 1s infinite" }}>Saving...</span>}
            <button onClick={() => navigate(`/week/${prevWeek}`)} style={navBtn}>← Prev</button>
            <button onClick={() => setCalOpen(true)} style={{ ...navBtn, color: "#A78BFA", borderColor: "rgba(124,58,237,0.3)", background: "rgba(124,58,237,0.08)" }}>📅</button>
            <button onClick={() => navigate(`/week/${nextWeek}`)} style={navBtn}>Next →</button>
            <Clock />
          </div>
        </div>

        {calOpen && (
          <CalendarPicker
            selectedWeek={weekKey}
            onSelectWeek={wk => navigate(`/week/${wk}`)}
            onClose={() => setCalOpen(false)}
          />
        )}

        {/* Last week banner */}
        {prevPct !== null && (
          <div
            onClick={() => setShowPrev(s => !s)}
            style={{
              display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 12, padding: "10px 16px", cursor: "pointer",
              transition: "border-color 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"}
          >
            <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase" }}>Last week</span>
            <span style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-head)", color: prevColor }}>{prevPct}%</span>
            <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, maxWidth: 120 }}>
              <div style={{ height: "100%", width: `${prevPct}%`, background: prevColor, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{showPrev ? "Hide ↑" : "Show detail ↓"}</span>
          </div>
        )}

        {/* Last week detail */}
        {showPrev && prevPct !== null && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10,
            marginBottom: 16, animation: "fadeUp 0.3s ease",
          }}>
            {TEAM.map(m => {
              const mTasks = prevWeekData[m.id] || [];
              const mPct = mTasks.length > 0
                ? Math.round(mTasks.reduce((s, t) => s + (t.pct || 0), 0) / mTasks.length)
                : null;
              const mc = mPct !== null ? (mPct >= 80 ? "#34D399" : mPct >= 50 ? "#FBBF24" : "#F87171") : null;
              return (
                <div key={m.id} style={{
                  background: "rgba(255,255,255,0.02)", border: `1px solid ${mc ? mc + "25" : "rgba(255,255,255,0.04)"}`,
                  borderRadius: 10, padding: "10px 12px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-head)" }}>{m.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-head)", color: mc || "var(--muted)" }}>
                      {mPct !== null ? `${mPct}%` : "—"}
                    </span>
                  </div>
                  {mPct !== null && (
                    <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${mPct}%`, background: mc, borderRadius: 2 }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Team delivery */}
        <div style={{
          background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 18, padding: "18px 24px", marginBottom: 20,
          backdropFilter: "blur(12px)", animation: "fadeUp 0.4s ease forwards", opacity: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>Team Delivery</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{
                  fontSize: 40, fontWeight: 800, fontFamily: "var(--font-head)", letterSpacing: -2, lineHeight: 1,
                  color: scoreColor, textShadow: `0 0 24px ${scoreColor}50`, transition: "color 0.5s",
                }}>{pctDisplay}%</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>avg completion</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "var(--font-head)", letterSpacing: -1 }}>{totalDone}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1.5 }}>fully done of {allTasks.length}</div>
            </div>
          </div>
          <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 3, width: `${totalPct}%`,
              background: `linear-gradient(90deg,${scoreColor}80,${scoreColor})`,
              boxShadow: `0 0 10px ${scoreColor}70`,
              transition: "width 1.2s cubic-bezier(0.34,1.56,0.64,1)",
            }} />
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
            {[["#34D399","≥ 80% Excellent"],["#FBBF24","50–79% On Track"],["#F87171","< 50% Needs Focus"]].map(([c,l]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: c, boxShadow: `0 0 5px ${c}` }} />
                <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "monospace" }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quote bar */}
        <QuoteBar />

        {/* Cards */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>Loading...</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
            {TEAM.map((m, i) => (
              <div key={m.id} style={{ animationDelay: `${i * 0.08}s` }}>
                <MemberCard
                  member={m}
                  tasks={weekData[m.id] || []}
                  isAdmin={isAdmin}
                  currentUserMemberId={currentUserMemberId}
                  onUpdate={handleUpdate}
                  weekKey={weekKey}
                />
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 32, fontSize: 10, color: "rgba(255,255,255,0.08)", letterSpacing: 1 }}>
          SUNDAY HUDDLE · RAYMIYO TRADING PVT. LTD. · huddle.raymiyo.com
        </div>
      </div>
    </div>
  );
}

const navBtn = {
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.5)", borderRadius: 10, padding: "8px 14px",
  fontSize: 13, cursor: "pointer", fontFamily: "var(--font-body)", transition: "color 0.15s",
};
