import { useState, useRef } from "react";

const MICRO_QUOTES = {
  high: ["On fire this week 🔥", "Crushing it!", "The team sees you 👏"],
  mid:  ["Almost there, push 💪", "Good momentum!", "You're close!"],
  low:  ["Every task counts", "Small steps, big results", "Keep going!"],
};

function ProgressRing({ pct, color, size = 52, stroke = 3 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)", zIndex: 2 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.34,1.56,0.64,1)", filter: `drop-shadow(0 0 4px ${color})` }}
      />
    </svg>
  );
}

export default function MemberCard({ member, tasks, isAdmin, currentUserMemberId, onUpdate, weekKey }) {
  const [hovered, setHovered] = useState(false);
  const [tooltip, setTooltip] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [carryMode, setCarryMode] = useState(false);
  const [selectedForCarry, setSelectedForCarry] = useState([]);
  const [carrying, setCarrying] = useState(false);
  const [pulse, setPulse] = useState(false);
  const cardRef = useRef(null);

  const canEditTasks = isAdmin;
  const canEditPct = isAdmin || currentUserMemberId === member.id;

  const done = tasks.length > 0
    ? Math.round(tasks.reduce((s, t) => s + (t.pct || 0), 0) / tasks.length)
    : 0;

  const scoreColor = done >= 80 ? "#34D399" : done >= 50 ? "#FBBF24" : "#F87171";
  const mq = done >= 80 ? MICRO_QUOTES.high : done >= 50 ? MICRO_QUOTES.mid : MICRO_QUOTES.low;
  const microQuote = mq[Math.floor(Date.now() / 5000) % mq.length];

  const handleCardMouseMove = (e) => {
    if (!cardRef.current) return;
    const card = cardRef.current;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rX = (y - centerY) / 10;
    const rY = (centerX - x) / 10;
    card.style.setProperty("--x", `${x}px`);
    card.style.setProperty("--y", `${y}px`);
    card.style.setProperty("--bg-x", `${(x / rect.width) * 100}%`);
    card.style.setProperty("--bg-y", `${(y / rect.height) * 100}%`);
    card.style.transform = `perspective(1000px) rotateX(${rX}deg) rotateY(${rY}deg)`;
    setHovered(true);
    setTooltip(true);
  };

  const handleCardMouseLeave = () => {
    if (!cardRef.current) return;
    const card = cardRef.current;
    card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
    card.style.setProperty("--x", "50%");
    card.style.setProperty("--y", "50%");
    card.style.setProperty("--bg-x", "50%");
    card.style.setProperty("--bg-y", "50%");
    setHovered(false);
    setTooltip(false);
  };

  const addTask = () => {
    if (!newTask.trim() || !canEditTasks) return;
    const updated = [...tasks, { text: newTask.trim(), pct: 0, addedAt: Date.now() }];
    onUpdate(member.id, updated);
    setNewTask("");
    setPulse(true);
    setTimeout(() => setPulse(false), 600);
  };

  const removeTask = (i) => {
    if (!canEditTasks) return;
    const updated = tasks.filter((_, idx) => idx !== i);
    onUpdate(member.id, updated);
  };

  const updatePct = (i, val) => {
    if (!canEditPct) return;
    const updated = tasks.map((t, idx) => idx === i ? { ...t, pct: Number(val) } : t);
    onUpdate(member.id, updated);
  };

  const handleCarry = async () => {
    if (selectedForCarry.length === 0) return;
    setCarrying(true);

    const tasksToCarry = selectedForCarry.map(i => ({
      ...tasks[i],
      pct: 0,
      carriedFrom: weekKey,
      carriedFromPct: tasks[i].pct || 0,
      carryCount: (tasks[i].carryCount || 0) + 1,
    }));

    const res = await fetch("/api/carry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromWeek: weekKey,
        memberId: member.id,
        taskIndexes: selectedForCarry,
        tasksData: tasksToCarry,
      }),
    });
    const data = await res.json();
    setCarrying(false);
    setCarryMode(false);
    setSelectedForCarry([]);
    if (data.success) {
      alert(`✅ ${tasksToCarry.length} task(s) carried to next week!`);
    }
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleCardMouseMove}
      onMouseLeave={handleCardMouseLeave}
      style={{
        position: "relative",
        borderRadius: 20,
        overflow: "hidden",
        transition: "box-shadow 0.3s ease",
        animation: "fadeUp 0.5s ease forwards",
        opacity: 0,
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.06)`,
        background: `
          radial-gradient(circle at var(--x, 50%) var(--y, 50%), ${member.color}22 0%, transparent 60%),
          rgba(12, 12, 28, 0.85)
        `,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: `1px solid rgba(255,255,255,0.07)`,
      }}
    >
      {/* Holographic glow layer */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 20, pointerEvents: "none",
        background: `radial-gradient(circle at var(--bg-x, 50%) var(--bg-y, 50%), ${member.color}30 0%, transparent 65%)`,
        transition: "background 0.1s ease",
        zIndex: 0,
      }} />

      {/* Top accent bar */}
      <div style={{ height: 3, background: member.gradient, boxShadow: `0 0 10px ${member.color}80`, position: "relative", zIndex: 1 }} />

      {/* Pulse overlay */}
      {pulse && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 20, pointerEvents: "none",
          animation: "fadeIn 0.1s ease, pulse 0.6s ease forwards",
          background: `radial-gradient(circle at center, ${member.color}25, transparent 70%)`,
          zIndex: 10,
        }} />
      )}

      {/* Carry badge */}
      {tasks.some(t => t.carriedFrom) && (
        <div style={{
          position: "absolute", top: 10, right: 12, fontSize: 10,
          background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)",
          color: "#FBBF24", borderRadius: 6, padding: "2px 7px", letterSpacing: 0.5,
          zIndex: 2,
        }}>↩ has carried tasks</div>
      )}

      <div style={{ padding: "16px 18px 18px", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
            <ProgressRing pct={done} color={member.color} />
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%", zIndex: 1,
              background: member.gradient, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#fff",
              fontFamily: "var(--font-head)", boxShadow: `0 0 16px ${member.glow}`,
            }}>
              {member.name[0]}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-head)", letterSpacing: -0.3 }}>
              {member.name}
            </div>
            <div style={{
              display: "inline-block", fontSize: 10, fontWeight: 600, marginTop: 3,
              color: member.light, background: member.color + "18",
              border: `1px solid ${member.color}28`, borderRadius: 5, padding: "2px 7px",
              letterSpacing: 0.6, textTransform: "uppercase",
            }}>{member.role}</div>
          </div>
          <div style={{
            fontFamily: "var(--font-head)", fontSize: 14, fontWeight: 700,
            color: scoreColor, background: scoreColor + "15",
            border: `1px solid ${scoreColor}28`, borderRadius: 8, padding: "4px 10px",
            animation: tasks.length > 0 ? "breathe 3s ease infinite" : "none",
            boxShadow: tasks.length > 0 ? `0 0 10px ${scoreColor}30` : "none",
          }}>
            {tasks.length > 0 ? `${done}%` : "—"}
          </div>
        </div>

        {/* Hover quote */}
        {hovered && tasks.length > 0 && (
          <div style={{ fontSize: 11, color: member.light, textAlign: "center", fontStyle: "italic", marginBottom: 10, animation: "fadeIn 0.2s ease" }}>
            {microQuote}
          </div>
        )}

        {/* Tasks */}
        <div style={{ minHeight: 60, marginBottom: 12 }}>
          {tasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "18px 0", color: "rgba(255,255,255,0.15)", fontSize: 13 }}>
              No tasks yet this week
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tasks.map((task, i) => (
                <div key={i} style={{
                  padding: "10px 12px", borderRadius: 10,
                  background: task.pct === 100 ? member.color + "12" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${task.pct === 100 ? member.color + "25" : "rgba(255,255,255,0.05)"}`,
                  animation: task.carriedFrom ? "carryIn 0.4s ease" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                    {carryMode && (
                      <input
                        type="checkbox"
                        checked={selectedForCarry.includes(i)}
                        onChange={() => setSelectedForCarry(s =>
                          s.includes(i) ? s.filter(x => x !== i) : [...s, i]
                        )}
                        style={{ marginTop: 2, accentColor: member.color }}
                      />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 13, lineHeight: 1.45,
                        color: task.pct === 100 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.85)",
                        textDecoration: task.pct === 100 ? "line-through" : "none",
                      }}>
                        {task.text}
                        {task.carriedFrom && (
                          <span style={{
                            marginLeft: 6, fontSize: 9,
                            background: "rgba(251,191,36,0.15)",
                            border: "1px solid rgba(251,191,36,0.3)",
                            color: "#FBBF24", borderRadius: 4, padding: "1px 5px",
                            fontWeight: 600, letterSpacing: 0.3,
                          }}>
                            ↩ {task.carryCount > 1 ? `×${task.carryCount}` : "carried"}
                            {task.carriedFromPct > 0 && ` (was ${task.carriedFromPct}%)`}
                          </span>
                        )}
                      </div>
                    </div>
                    {canEditTasks && !carryMode && (
                      <button
                        onClick={() => removeTask(i)}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "rgba(255,255,255,0.15)", fontSize: 16, padding: "0 2px", lineHeight: 1, flexShrink: 0,
                        }}
                        onMouseEnter={e => e.target.style.color = "#F87171"}
                        onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.15)"}
                      >×</button>
                    )}
                  </div>

                  {/* % slider */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="range" min={0} max={100} step={5}
                      value={task.pct || 0}
                      onChange={e => updatePct(i, e.target.value)}
                      disabled={!canEditPct}
                      style={{
                        flex: 1, height: 4, appearance: "none", WebkitAppearance: "none",
                        background: `linear-gradient(to right, ${member.color} ${task.pct}%, rgba(255,255,255,0.1) ${task.pct}%)`,
                        borderRadius: 2, cursor: canEditPct ? "pointer" : "default",
                        outline: "none", border: "none",
                      }}
                    />
                    <div style={{
                      fontSize: 12, fontWeight: 700, fontFamily: "var(--font-head)",
                      color: task.pct >= 80 ? "#34D399" : task.pct >= 50 ? "#FBBF24" : "var(--muted)",
                      minWidth: 36, textAlign: "right",
                    }}>
                      {task.pct || 0}%
                    </div>
                    {canEditPct && (
                      <input
                        type="number" min={0} max={100}
                        value={task.pct || 0}
                        onChange={e => updatePct(i, Math.min(100, Math.max(0, Number(e.target.value))))}
                        style={{
                          width: 44, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 6, color: "#fff", fontSize: 11, padding: "2px 4px", textAlign: "center",
                          fontFamily: "var(--font-head)",
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin: add task */}
        {canEditTasks && (
          <div style={{
            display: "flex", gap: 8, marginBottom: 10,
            background: "rgba(255,255,255,0.03)", borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.07)", padding: "4px 4px 4px 12px",
          }}>
            <input
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTask()}
              placeholder="Add task..."
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: 13, padding: "6px 0" }}
            />
            <button
              onClick={addTask}
              style={{
                width: 32, height: 32, borderRadius: 8, border: "none",
                background: member.gradient, color: "#fff", cursor: "pointer",
                fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: `0 0 10px ${member.glow}`, transition: "transform 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
              onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
            >+</button>
          </div>
        )}

        {/* Admin: carry forward controls */}
        {isAdmin && tasks.some(t => (t.pct || 0) < 100) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {tasks.some(t => (t.pct || 0) < 100) && !carryMode && (
              <div style={{
                fontSize: 11, padding: "6px 10px", borderRadius: 7, marginBottom: 6,
                background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)",
                color: "#FBBF24", lineHeight: 1.5,
              }}>
                ⚠️ {tasks.filter(t => (t.pct || 0) < 100).length} task(s) not at 100% — carry them to next week or they stay here.
              </div>
            )}
            {!carryMode ? (
              <button
                onClick={() => setCarryMode(true)}
                style={{
                  fontSize: 11, padding: "5px 10px", borderRadius: 7, cursor: "pointer",
                  background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)",
                  color: "#FBBF24", fontFamily: "var(--font-body)",
                }}
              >↩ Carry to next week</button>
            ) : (
              <>
                <button
                  onClick={handleCarry}
                  disabled={selectedForCarry.length === 0 || carrying}
                  style={{
                    fontSize: 11, padding: "5px 10px", borderRadius: 7, cursor: "pointer",
                    background: selectedForCarry.length > 0 ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${selectedForCarry.length > 0 ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.08)"}`,
                    color: selectedForCarry.length > 0 ? "#FBBF24" : "var(--muted)",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {carrying ? "Carrying..." : `Carry ${selectedForCarry.length} task(s)`}
                </button>
                <button
                  onClick={() => { setCarryMode(false); setSelectedForCarry([]); }}
                  style={{
                    fontSize: 11, padding: "5px 10px", borderRadius: 7, cursor: "pointer",
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    color: "var(--muted)", fontFamily: "var(--font-body)",
                  }}
                >Cancel</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
