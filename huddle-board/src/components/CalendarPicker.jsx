import { useState } from "react";

function getMondayKey(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = -day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

export default function CalendarPicker({ selectedWeek, onSelectWeek, onClose }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDayOffset = getFirstDayOfMonth(viewYear, viewMonth);
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const cells = [];

  // Empty cells before first day
  for (let i = 0; i < firstDayOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const isInSelectedWeek = (day) => {
    if (!day || !selectedWeek) return false;
    const date = new Date(viewYear, viewMonth, day);
    return getMondayKey(date) === selectedWeek;
  };

  const isToday = (day) => {
    if (!day) return false;
    return day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
  };

  const handleDayClick = (day) => {
    if (!day) return;
    const date = new Date(viewYear, viewMonth, day);
    const weekKey = getMondayKey(date);
    onSelectWeek(weekKey);
    onClose();
  };

  const weekHighlightMap = new Set();
  if (selectedWeek) {
    const monday = new Date(selectedWeek + "T00:00:00");
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      if (d.getMonth() === viewMonth && d.getFullYear() === viewYear) {
        weekHighlightMap.add(d.getDate());
      }
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      animation: "fadeIn 0.15s ease",
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#0d0d1e", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20, padding: 24, width: 320,
          boxShadow: "0 40px 80px rgba(0,0,0,0.8)",
          animation: "fadeUp 0.2s ease",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <button onClick={prevMonth} style={navBtn}>‹</button>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-head)", fontWeight: 700, fontSize: 16 }}>
              {MONTHS[viewMonth]}
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setViewYear(y => y - 1)} style={{ ...navBtn, fontSize: 10, padding: "4px 6px" }}>◀</button>
              <span style={{ fontSize: 14, color: "var(--muted)", minWidth: 36, textAlign: "center", lineHeight: "28px" }}>{viewYear}</span>
              <button onClick={() => setViewYear(y => y + 1)} style={{ ...navBtn, fontSize: 10, padding: "4px 6px" }}>▶</button>
            </div>
          </div>
          <button onClick={nextMonth} style={navBtn}>›</button>
        </div>

        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 8 }}>
          {DAYS.map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 10, color: "var(--muted)", padding: "4px 0", letterSpacing: 0.5 }}>
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {cells.map((day, i) => {
            const inWeek = day && weekHighlightMap.has(day);
            const isTod = isToday(day);
            const isSunday = day && (i % 7 === 0);
            const isSaturday = day && (i % 7 === 6);

            return (
              <div
                key={i}
                onClick={() => handleDayClick(day)}
                style={{
                  height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, cursor: day ? "pointer" : "default",
                  borderRadius: inWeek
                    ? isSunday || (!cells[i - 1] && day)
                      ? "8px 0 0 8px"
                      : isSaturday || (i === cells.length - 1)
                        ? "0 8px 8px 0"
                        : 0
                    : 8,
                  background: inWeek ? "rgba(124,58,237,0.25)" : "transparent",
                  color: !day ? "transparent" : isTod ? "#7C3AED" : inWeek ? "#fff" : "rgba(255,255,255,0.65)",
                  fontWeight: isTod ? 700 : inWeek ? 600 : 400,
                  position: "relative",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { if (day && !inWeek) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={e => { if (day && !inWeek) e.currentTarget.style.background = "transparent"; }}
              >
                {day}
                {isTod && (
                  <div style={{
                    position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)",
                    width: 4, height: 4, borderRadius: "50%", background: "#7C3AED",
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Quick nav */}
        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
          <button
            onClick={() => { onSelectWeek(getMondayKey(new Date())); onClose(); }}
            style={{
              background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)",
              color: "#A78BFA", borderRadius: 8, padding: "6px 14px", fontSize: 12,
              cursor: "pointer", fontFamily: "var(--font-body)",
            }}
          >
            This week
          </button>
        </div>
      </div>
    </div>
  );
}

const navBtn = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  color: "#fff", borderRadius: 8, width: 32, height: 32,
  cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
};
