import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../App.jsx";
import { motion, useMotionValue, useTransform } from "framer-motion";
import CalendarPicker from "../components/CalendarPicker.jsx";

function getMondayKey(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
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

const TEAM = [
  { id: "sajina", name: "Sajina", color: "#7C3AED", gradient: "linear-gradient(135deg,#7C3AED,#A78BFA)" },
  { id: "divash", name: "Divash", color: "#0EA5E9", gradient: "linear-gradient(135deg,#0EA5E9,#38BDF8)" },
  { id: "manoj",  name: "Manoj",  color: "#D97706", gradient: "linear-gradient(135deg,#D97706,#FBBF24)" },
  { id: "krisha", name: "Krisha", color: "#DB2777", gradient: "linear-gradient(135deg,#DB2777,#F472B6)" },
  { id: "sunil",  name: "Sunil",  color: "#059669", gradient: "linear-gradient(135deg,#059669,#34D399)" },
];

// Animated beam card — same as login page
function BeamCard({ children, style = {}, glowColor = "#7C3AED", delay = 0 }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-150, 150], [6, -6]);
  const rotateY = useTransform(mouseX, [-150, 150], [-6, 6]);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };
  const handleMouseLeave = () => { mouseX.set(0); mouseY.set(0); };

  const beamCss = `
    @keyframes beam-t { 0%{left:-50%;opacity:0.2} 50%{opacity:0.6} 100%{left:100%;opacity:0.2} }
    @keyframes beam-r { 0%{top:-50%;opacity:0.2} 50%{opacity:0.6} 100%{top:100%;opacity:0.2} }
    @keyframes beam-b { 0%{right:-50%;opacity:0.2} 50%{opacity:0.6} 100%{right:100%;opacity:0.2} }
    @keyframes beam-l { 0%{bottom:-50%;opacity:0.2} 50%{opacity:0.6} 100%{bottom:100%;opacity:0.2} }
    @keyframes cpulse { 0%,100%{opacity:0.15} 50%{opacity:0.4} }
    .bt { position:absolute;top:0;left:-50%;height:2px;width:50%;background:linear-gradient(to right,transparent,white,transparent);filter:blur(1.5px);animation:beam-t 3s ease-in-out infinite; }
    .br { position:absolute;right:0;top:-50%;width:2px;height:50%;background:linear-gradient(to bottom,transparent,white,transparent);filter:blur(1.5px);animation:beam-r 3s ease-in-out infinite 0.75s; }
    .bb { position:absolute;bottom:0;right:-50%;height:2px;width:50%;background:linear-gradient(to right,transparent,white,transparent);filter:blur(1.5px);animation:beam-b 3s ease-in-out infinite 1.5s; }
    .bl { position:absolute;left:0;bottom:-50%;width:2px;height:50%;background:linear-gradient(to bottom,transparent,white,transparent);filter:blur(1.5px);animation:beam-l 3s ease-in-out infinite 2.25s; }
    .cp { position:absolute;border-radius:50%;animation:cpulse 2s infinite; }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: beamCss }} />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.5 }}
        style={{ perspective: 1000, ...style }}
      >
        <motion.div
          style={{ rotateX, rotateY, position: "relative" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          whileHover={{ z: 8 }}
        >
          {/* Glow pulse */}
          <motion.div
            animate={{ boxShadow: [`0 0 0px 0px ${glowColor}00`, `0 0 30px 4px ${glowColor}30`, `0 0 0px 0px ${glowColor}00`] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", inset: -1, borderRadius: 16, pointerEvents: "none" }}
          />

          {/* Beams */}
          <div style={{ position: "absolute", inset: -1, borderRadius: 16, overflow: "hidden", pointerEvents: "none" }}>
            <div className="bt" />
            <div className="br" />
            <div className="bb" />
            <div className="bl" />
            <div className="cp" style={{ top:0,left:0,width:5,height:5,background:"rgba(255,255,255,0.35)",filter:"blur(1px)",animationDelay:"0s" }} />
            <div className="cp" style={{ top:0,right:0,width:7,height:7,background:"rgba(255,255,255,0.5)",filter:"blur(2px)",animationDelay:"0.5s" }} />
            <div className="cp" style={{ bottom:0,right:0,width:7,height:7,background:"rgba(255,255,255,0.5)",filter:"blur(2px)",animationDelay:"1s" }} />
            <div className="cp" style={{ bottom:0,left:0,width:5,height:5,background:"rgba(255,255,255,0.35)",filter:"blur(1px)",animationDelay:"1.5s" }} />
          </div>

          {/* Glass */}
          <div style={{
            position: "relative",
            background: "rgba(10,10,25,0.7)",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.06)",
            overflow: "hidden",
          }}>
            {/* Grid pattern */}
            <div style={{ position:"absolute",inset:0,opacity:0.02,backgroundImage:"linear-gradient(135deg,white 0.5px,transparent 0.5px),linear-gradient(45deg,white 0.5px,transparent 0.5px)",backgroundSize:"30px 30px",pointerEvents:"none" }} />
            {children}
          </div>
        </motion.div>
      </motion.div>
    </>
  );
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
        {h}:{m}<span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", marginLeft: 2 }}>:{s}</span>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{day}</div>
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

  const currentMonthIdx = new Date().getMonth();
  const currentMonthData = months[currentMonthIdx];
  const teamPct = currentMonthData?.pct || 0;
  const teamPctDisplay = useCountUp(teamPct);

  // Current month stats
  const currentWeekData = months.find(m => m.month === currentMonthIdx + 1);
  const weeksWithData = currentWeekData?.weeks?.filter(w => w.pct !== null) || [];
  const totalTasksDone = weeksWithData.reduce((s, w) => {
    const allT = Object.values(w.data || {}).flat();
    return s + allT.filter(t => (t.pct || 0) === 100).length;
  }, 0);
  const totalTasks = weeksWithData.reduce((s, w) => {
    return s + Object.values(w.data || {}).flat().length;
  }, 0);

  // Top performer this month
  const memberScores = TEAM.map(m => {
    let total = 0, count = 0;
    weeksWithData.forEach(w => {
      const tasks = (w.data || {})[m.id] || [];
      if (tasks.length > 0) {
        total += tasks.reduce((s, t) => s + (t.pct || 0), 0) / tasks.length;
        count++;
      }
    });
    return { ...m, avg: count > 0 ? Math.round(total / count) : null };
  }).filter(m => m.avg !== null).sort((a, b) => b.avg - a.avg);

  const topPerformer = memberScores[0];

  const yearBtn = {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.5)", borderRadius: 8, padding: "6px 12px", fontSize: 12,
    cursor: "pointer", fontFamily: "var(--font-body)", transition: "color 0.2s",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg,#020617 0%,#0a0a1e 40%,#0d0620 70%,#020617 100%)",
      backgroundSize: "400% 400%", animation: "bgDrift 20s ease infinite",
      fontFamily: "var(--font-body)", padding: "24px 28px",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 13,
              background: "linear-gradient(135deg,#7C3AED,#0EA5E9)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 800, color: "#fff", fontFamily: "var(--font-head)",
              boxShadow: "0 0 24px #7C3AED40",
            }}>H</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-head)", letterSpacing: -0.5 }}>Sunday Huddle</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>Raymiyo Trading Pvt. Ltd.</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              Signed in as <span style={{ color: "#A78BFA" }}>{user?.name}</span>
              {user?.isAdmin && <span style={{ marginLeft: 6, fontSize: 10, background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", color: "#A78BFA", borderRadius: 5, padding: "2px 6px" }}>Admin</span>}
            </div>
            <a href="/api/auth?action=logout" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none" }}>Sign out</a>
            <Clock />
          </div>
        </div>

        {/* Summary cards row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14, marginBottom: 24 }}>

          {/* Team score this month */}
          <BeamCard glowColor="#7C3AED" delay={0}>
            <div style={{ padding: "20px 22px" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 10 }}>Team Score</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>{new Date().toLocaleString("en-US", { month: "long" })} {year}</div>
              <div style={{
                fontSize: 52, fontWeight: 800, fontFamily: "var(--font-head)", letterSpacing: -2, lineHeight: 1,
                color: pctColor(teamPct), textShadow: `0 0 30px ${pctColor(teamPct)}50`,
              }}>{teamPctDisplay}%</div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${teamPct}%` }}
                  transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
                  style={{ height: "100%", background: pctColor(teamPct), borderRadius: 2, boxShadow: `0 0 8px ${pctColor(teamPct)}` }}
                />
              </div>
            </div>
          </BeamCard>

          {/* Tasks done */}
          <BeamCard glowColor="#34D399" delay={0.1}>
            <div style={{ padding: "20px 22px" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 10 }}>Tasks Done</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>This month</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 52, fontWeight: 800, fontFamily: "var(--font-head)", letterSpacing: -2, lineHeight: 1, color: "#34D399", textShadow: "0 0 30px #34D39950" }}>
                  {useCountUp(totalTasksDone)}
                </span>
                <span style={{ fontSize: 16, color: "rgba(255,255,255,0.2)" }}>/ {totalTasks}</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 12 }}>
                {totalTasks > 0 ? `${totalTasks - totalTasksDone} still in progress` : "No tasks yet"}
              </div>
            </div>
          </BeamCard>

          {/* Active weeks */}
          <BeamCard glowColor="#0EA5E9" delay={0.2}>
            <div style={{ padding: "20px 22px" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 10 }}>Active Weeks</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>This month</div>
              <div style={{ fontSize: 52, fontWeight: 800, fontFamily: "var(--font-head)", letterSpacing: -2, lineHeight: 1, color: "#38BDF8", textShadow: "0 0 30px #38BDF850" }}>
                {useCountUp(weeksWithData.length)}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                {(currentWeekData?.weeks || []).map((w, i) => (
                  <div key={i} style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: w.pct !== null ? "#38BDF8" : "rgba(255,255,255,0.1)",
                    boxShadow: w.pct !== null ? "0 0 6px #38BDF8" : "none",
                  }} />
                ))}
              </div>
            </div>
          </BeamCard>

          {/* Top performer */}
          <BeamCard glowColor={topPerformer?.color || "#FBBF24"} delay={0.3}>
            <div style={{ padding: "20px 22px" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 10 }}>Top Performer</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>This month</div>
              {topPerformer ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%",
                      background: topPerformer.gradient,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, fontWeight: 800, color: "#fff",
                      boxShadow: `0 0 16px ${topPerformer.color}50`,
                    }}>{topPerformer.name[0]}</div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-head)" }}>{topPerformer.name}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: topPerformer.color, fontFamily: "var(--font-head)" }}>{topPerformer.avg}%</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    {memberScores.slice(0, 5).map((m, i) => (
                      <div key={m.id} title={`${m.name}: ${m.avg}%`} style={{
                        flex: 1, height: 4, borderRadius: 2,
                        background: i === 0 ? m.color : `${m.color}40`,
                        boxShadow: i === 0 ? `0 0 6px ${m.color}` : "none",
                      }} />
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.2)", marginTop: 8 }}>No data yet</div>
              )}
            </div>
          </BeamCard>
        </div>

        {/* Jump to week */}
        <BeamCard glowColor="#7C3AED" delay={0.4} style={{ marginBottom: 24 }}>
          <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Jump to week:</span>
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
                color: "rgba(255,255,255,0.4)", borderRadius: 10, padding: "8px 14px",
                fontSize: 13, cursor: "pointer", fontFamily: "var(--font-body)",
              }}
            >This week</button>
          </div>
        </BeamCard>

        {calOpen && (
          <CalendarPicker
            selectedWeek={selectedWeek}
            onSelectWeek={wk => setSelectedWeek(wk)}
            onClose={() => setCalOpen(false)}
          />
        )}

        {/* Year selector */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-head)" }}>Monthly Overview</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setYear(y => y - 1)} style={yearBtn}>‹ {year - 1}</button>
            <span style={{ fontSize: 14, color: "#fff", fontFamily: "var(--font-head)", fontWeight: 700, minWidth: 40, textAlign: "center" }}>{year}</span>
            <button onClick={() => setYear(y => y + 1)} style={yearBtn}>{year + 1} ›</button>
          </div>
        </div>

        {/* Monthly cards grid */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>Loading...</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14, marginBottom: 40 }}>
            {months.map((m, idx) => {
              const isExpanded = expandedMonth === m.month;
              const isCurrent = m.month === new Date().getMonth() + 1 && year === new Date().getFullYear();
              const c = pctColor(m.pct);

              return (
                <div key={m.month} style={{ gridColumn: isExpanded ? "1 / -1" : "auto" }}>
                  <BeamCard glowColor={c === "rgba(255,255,255,0.2)" ? "#334155" : c} delay={0.05 * idx}>
                    <div
                      onClick={() => m.hasData && setExpandedMonth(isExpanded ? null : m.month)}
                      style={{ padding: "16px 18px", cursor: m.hasData ? "pointer" : "default" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-head)" }}>
                            {m.monthLabel}
                            {isCurrent && <span style={{ marginLeft: 6, fontSize: 9, background: "rgba(124,58,237,0.2)", color: "#A78BFA", borderRadius: 4, padding: "1px 5px", verticalAlign: "middle" }}>NOW</span>}
                          </div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
                            {m.hasData ? `${m.weeks.filter(w => w.pct !== null).length} week(s)` : "No data yet"}
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
                      {m.pct !== null && (
                        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${m.pct}%` }}
                            transition={{ duration: 1, ease: "easeOut", delay: 0.1 * idx }}
                            style={{ height: "100%", width: `${m.pct}%`, background: c, borderRadius: 2, boxShadow: `0 0 8px ${c}80` }}
                          />
                        </div>
                      )}
                      {m.hasData && (
                        <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "right" }}>
                          {isExpanded ? "Collapse ↑" : "See weeks ↓"}
                        </div>
                      )}
                    </div>

                    {isExpanded && (
                      <div style={{ padding: "0 14px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }}>
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
                                borderRadius: 10, padding: "10px 12px", cursor: "pointer",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                                  {formatWeekRange(w.weekKey)}
                                  {isThisWeek && <span style={{ marginLeft: 4, fontSize: 9, color: "#A78BFA" }}>● now</span>}
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-head)", color: wc }}>
                                  {w.pct !== null ? `${w.pct}%` : "—"}
                                </div>
                              </div>
                              {w.pct !== null && (
                                <div style={{ height: 2, background: "rgba(255,255,255,0.05)", borderRadius: 1 }}>
                                  <div style={{ height: "100%", width: `${w.pct}%`, background: wc, borderRadius: 1 }} />
                                </div>
                              )}
                              <div style={{ marginTop: 6, fontSize: 10, color: "rgba(124,58,237,0.5)" }}>Open →</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </BeamCard>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
