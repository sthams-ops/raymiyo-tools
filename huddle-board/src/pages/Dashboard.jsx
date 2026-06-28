import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../App.jsx";
import CalendarPicker from "../components/CalendarPicker.jsx";

function getMondayKey(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
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

function pctColor(pct) {
  if (pct === null || pct === undefined) return "rgba(255,255,255,0.2)";
  return pct >= 80 ? "#34D399" : pct >= 50 ? "#FBBF24" : "#F87171";
}

function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  const h = String(t.getHours()).padStart(2, "0");
  const m = String(t.getMinutes()).padStart(2, "0");
  const s = String(t.getSeconds()).padStart(2, "0");
  const day = t.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontFamily: "var(--font-head)", fontSize: 26, fontWeight: 700, letterSpacing: -1, lineHeight: 1 }}>
        {h}:{m}<span style={{ fontSize: 14, color: "var(--muted)", marginLeft: 2 }}>:{s}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{day}</div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [year, setYear] = useState(new Date().getFullYear());
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [calOpen, setCalOpen] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(getMondayKey());
  const thisWeek = getMondayKey();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/months?year=${year}`)
      .then(r => r.json())
      .then(d => { setMonths(d.months || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [year]);

  const currentMonth = new Date().getMonth() + 1;
  const currentMonthData = months.find(m => m.month === currentMonth);
  const teamPct = currentMonthData?.pct || 0;
  const teamPctDisplay = useCountUp(teamPct);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg,#020617 0%,#0a0a1e 40%,#0d0620 70%,#020617 100%)",
      backgroundSize: "400% 400%", animation: "bgDrift 20s ease infinite",
      fontFamily: "var(--font-body)", padding: "28px 32px",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 13,
              background: "linear-gradient(135deg,#7C3AED,#0EA5E9)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 800, color: "#fff", fontFamily: "var(--font-head)",
              boxShadow: "0 0 24px #7C3AED40",
            }}>H</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-head)", letterSpacing: -0.5 }}>
                Sunday Huddle
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>
                Raymiyo Trading Pvt. Ltd.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Signed in as <span style={{ color: "#A78BFA" }}>{user?.name}</span>
              {user?.isAdmin && <span style={{ marginLeft: 6, fontSize: 10, background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", color: "#A78BFA", borderRadius: 5, padding: "2px 6px" }}>Admin</span>}
            </div>
            <a href="/api/auth?action=logout" style={{
              fontSize: 12, color: "var(--muted)", padding: "6px 12px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none",
              transition: "color 0.2s",
            }}
              onMouseEnter={e => e.currentTarget.style.color = "#fff"}
              onMouseLeave={e => e.currentTarget.style.color = ""}
            >Sign out</a>
            <Clock />
          </div>
        </div>

        {/* Go to week */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, marginBottom: 28,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 14, padding: "14px 20px", flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Jump to week:</span>
          <button
            onClick={() => setCalOpen(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.3)",
              color: "#A78BFA", borderRadius: 10, padding: "8px 14px", fontSize: 13,
              cursor: "pointer", fontFamily: "var(--font-body)",
            }}
          >
            📅 {selectedWeek ? formatWeekRange(selectedWeek) : "Pick a week"}
          </button>
          <button
            onClick={() => navigate(`/week/${selectedWeek}`)}
            style={{
              background: "linear-gradient(135deg,#7C3AED,#0EA5E9)",
              border: "none", color: "#fff", borderRadius: 10, padding: "8px 18px",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)",
              boxShadow: "0 0 20px #7C3AED30",
            }}
          >Open Board →</button>
          <button
            onClick={() => navigate(`/week/${thisWeek}`)}
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--muted)", borderRadius: 10, padding: "8px 14px",
              fontSize: 13, cursor: "pointer", fontFamily: "var(--font-body)",
            }}
          >This week</button>
        </div>

        {calOpen && (
          <CalendarPicker
            selectedWeek={selectedWeek}
            onSelectWeek={setSelectedWeek}
            onClose={() => setCalOpen(false)}
          />
        )}

        {/* Year selector */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-head)" }}>
            Monthly Overview
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setYear(y => y - 1)} style={yearBtn}>‹ {year - 1}</button>
            <span style={{ fontSize: 14, color: "#fff", fontFamily: "var(--font-head)", fontWeight: 700, minWidth: 40, textAlign: "center" }}>{year}</span>
            <button onClick={() => setYear(y => y + 1)} style={yearBtn}>{year + 1} ›</button>
          </div>
        </div>

        {/* Monthly cards grid */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>Loading...</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14, marginBottom: 40 }}>
            {months.map(m => {
              const isExpanded = expandedMonth === m.month;
              const isCurrent = m.month === currentMonth && year === new Date().getFullYear();
              const c = pctColor(m.pct);

              return (
                <div key={m.month} style={{ gridColumn: isExpanded ? "1 / -1" : "auto" }}>
                  {/* Month card */}
                  <div
                    onClick={() => m.hasData && setExpandedMonth(isExpanded ? null : m.month)}
                    style={{
                      background: isCurrent ? "rgba(124,58,237,0.08)" : "rgba(15,15,35,0.6)",
                      border: `1px solid ${isCurrent ? "rgba(124,58,237,0.3)" : m.hasData ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)"}`,
                      borderRadius: 14, padding: "16px 18px",
                      cursor: m.hasData ? "pointer" : "default",
                      transition: "all 0.2s",
                      backdropFilter: "blur(12px)",
                    }}
                    onMouseEnter={e => { if (m.hasData) e.currentTarget.style.borderColor = c + "50"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = isCurrent ? "rgba(124,58,237,0.3)" : m.hasData ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)"; }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-head)" }}>
                          {m.monthLabel}
                          {isCurrent && <span style={{ marginLeft: 6, fontSize: 9, background: "rgba(124,58,237,0.2)", color: "#A78BFA", borderRadius: 4, padding: "1px 5px", verticalAlign: "middle" }}>NOW</span>}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                          {m.hasData ? `${m.weeks.filter(w => w.pct !== null).length} week(s) of data` : "No data yet"}
                        </div>
                      </div>
                      {m.pct !== null ? (
                        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-head)", color: c, textShadow: `0 0 20px ${c}50` }}>
                          {m.pct}%
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.1)" }}>—</div>
                      )}
                    </div>

                    {/* Mini bar */}
                    {m.pct !== null && (
                      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${m.pct}%`, background: c, borderRadius: 2, boxShadow: `0 0 8px ${c}80`, transition: "width 1s ease" }} />
                      </div>
                    )}

                    {m.hasData && (
                      <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
                        {isExpanded ? "Click to collapse ↑" : "Click for weeks ↓"}
                      </div>
                    )}
                  </div>

                  {/* Expanded weeks */}
                  {isExpanded && (
                    <div style={{
                      marginTop: 12, display: "grid",
                      gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10,
                      animation: "fadeUp 0.3s ease",
                    }}>
                      {m.weeks.map(w => {
                        const wc = pctColor(w.pct);
                        const isThisWeek = w.weekKey === thisWeek;
                        return (
                          <div
                            key={w.weekKey}
                            onClick={() => navigate(`/week/${w.weekKey}`)}
                            style={{
                              background: isThisWeek ? "rgba(124,58,237,0.1)" : "rgba(255,255,255,0.02)",
                              border: `1px solid ${isThisWeek ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.06)"}`,
                              borderRadius: 12, padding: "12px 14px", cursor: "pointer",
                              transition: "all 0.15s",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = wc + "40"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = isThisWeek ? "rgba(124,58,237,0.1)" : "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = isThisWeek ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.06)"; }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                                {formatWeekRange(w.weekKey)}
                                {isThisWeek && <span style={{ marginLeft: 6, fontSize: 9, color: "#A78BFA" }}>● now</span>}
                              </div>
                              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-head)", color: wc }}>
                                {w.pct !== null ? `${w.pct}%` : "—"}
                              </div>
                            </div>
                            {w.pct !== null && (
                              <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${w.pct}%`, background: wc, borderRadius: 2 }} />
                              </div>
                            )}
                            <div style={{ marginTop: 8, fontSize: 11, color: "rgba(124,58,237,0.6)" }}>Open board →</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const yearBtn = {
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  color: "var(--muted)", borderRadius: 8, padding: "6px 12px", fontSize: 12,
  cursor: "pointer", fontFamily: "var(--font-body)", transition: "color 0.2s",
};
