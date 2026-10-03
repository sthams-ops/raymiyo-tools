import { motion } from "framer-motion";
import { Crown, Trophy, TrendingUp, TrendingDown, ShieldCheck, Hourglass } from "lucide-react";
import StreakBadge from "./StreakBadge.jsx";

// Layout follows the 21st.dev LeaderboardCard: header (title + date range + selector), podium, ranked list.
// Gold / silver / bronze medal language follows its Podium + Rankings components.
const MEDAL = {
  1: { text: "#FBBF24", ring: "rgba(251,191,36,0.5)", block: "linear-gradient(180deg, rgba(251,191,36,0.55), rgba(251,191,36,0.05))", h: 132 },
  2: { text: "#CBD5E1", ring: "rgba(203,213,225,0.42)", block: "linear-gradient(180deg, rgba(203,213,225,0.42), rgba(203,213,225,0.04))", h: 100 },
  3: { text: "#FDBA74", ring: "rgba(251,146,60,0.42)", block: "linear-gradient(180deg, rgba(251,146,60,0.45), rgba(251,146,60,0.04))", h: 76 },
};
const medalFor = (rank) => MEDAL[Math.min(rank, 3)];
const fmt = (n) => (Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`);
const tier = (p) => (p >= 80 ? "#34D399" : p >= 50 ? "#FBBF24" : "#F87171");
const dateOpts = { month: "short", day: "numeric", timeZone: "UTC" };
const shortDate = (key) => new Date(key + "T00:00:00Z").toLocaleDateString("en-US", dateOpts);
const longDate = (key) => new Date(key + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", ...dateOpts });

function Avatar({ entry, size = 44 }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: entry.gradient || "#475569", display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontWeight: 800, fontSize: Math.round(size * 0.42), fontFamily: "var(--font-head)",
        boxShadow: `0 0 ${Math.round(size / 2)}px ${(entry.color || "#94A3B8")}55`,
      }}
    >
      {entry.name[0]}
    </div>
  );
}

function StatusPill({ month }) {
  const cfg = month.status === "live"
    ? { c: "#34D399", label: "LIVE", dot: true }
    : month.status === "final"
      ? { c: "#FBBF24", label: "FINAL", dot: false }
      : { c: "#94A3B8", label: "UPCOMING", dot: false };
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 9px", borderRadius: 999,
        fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: cfg.c, background: `${cfg.c}14`, border: `1px solid ${cfg.c}44`,
      }}
    >
      {cfg.dot && (
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.c, display: "inline-block" }}
        />
      )}
      {cfg.label}
    </span>
  );
}

function Podium({ entries, final }) {
  const top = entries.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean); // 2nd, 1st, 3rd
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 10, minHeight: 270, paddingTop: 38 }}>
      {order.map((e) => {
        const m = medalFor(e.rank);
        const first = e.rank === 1;
        return (
          <div key={e.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 94 }}>
            <div style={{ position: "relative", marginBottom: 6 }}>
              {first && final && (
                <motion.div
                  animate={{ y: [0, -4, 0], rotate: [-6, 6, -6] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  style={{ position: "absolute", top: -24, left: "50%", marginLeft: -11, zIndex: 2, display: "flex" }}
                >
                  <Crown size={22} color="#FBBF24" fill="#FBBF24" />
                </motion.div>
              )}
              {first && !final && (
                <span style={{ position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)", fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: "#FBBF24", whiteSpace: "nowrap" }}>
                  LEADING
                </span>
              )}
              <Avatar entry={e} size={first ? 60 : 48} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-head)" }}>{e.name}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: m.text, fontFamily: "var(--font-head)" }}>{fmt(e.score)}</div>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: m.h }}
              transition={{ type: "spring", stiffness: 120, damping: 18, delay: first ? 0.35 : e.rank === 2 ? 0.15 : 0.05 }}
              style={{
                width: "100%", marginTop: 6, borderRadius: "10px 10px 0 0", overflow: "hidden",
                background: m.block, border: `1px solid ${m.ring}`, borderBottom: "none",
                display: "flex", justifyContent: "center", paddingTop: 8,
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 800, color: m.text, fontFamily: "var(--font-head)" }}>{e.rank}</span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

function RankChange({ change }) {
  if (typeof change !== "number" || change === 0) return null;
  const up = change > 0;
  const c = up ? "#34D399" : "#F87171";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span title="Rank change vs last month" style={{ display: "inline-flex", alignItems: "center", gap: 3, color: c, fontSize: 11, fontWeight: 800 }}>
      <Icon size={13} /> {Math.abs(change)}
    </span>
  );
}

function Row({ e, isMe, streak }) {
  const m = e.rank <= 3 ? medalFor(e.rank) : null;
  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12,
        background: isMe ? `${e.color}18` : e.rank === 1 ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.02)",
        border: isMe ? `2px solid ${e.color}` : `1px solid ${m ? m.ring : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, width: 38 }}>
        <span style={{ width: 14, fontSize: 14, fontWeight: 800, fontFamily: "var(--font-head)", color: m ? m.text : "rgba(255,255,255,0.5)" }}>{e.rank}</span>
        {m && <Crown size={14} color={m.text} />}
      </div>
      <Avatar entry={e} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-head)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
          {isMe && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: e.color, border: `1px solid ${e.color}`, borderRadius: 4, padding: "0 5px" }}>YOU</span>}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
          {e.tasks} task{e.tasks === 1 ? "" : "s"} &middot; {e.done} fully done &middot; {e.weeksActive} wk{e.weeksActive === 1 ? "" : "s"}
        </div>
      </div>
      <StreakBadge streak={streak && streak.streak} holding={streak && streak.holding} size="sm" />
      <RankChange change={e.rankChange} />
      <span style={{ minWidth: 52, textAlign: "right", fontSize: 17, fontWeight: 800, fontFamily: "var(--font-head)", color: tier(e.score) }}>{fmt(e.score)}</span>
    </motion.div>
  );
}

function NotEligibleRow({ e, isMe, threshold, final }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 12,
        background: "rgba(255,255,255,0.02)", border: isMe ? `2px solid ${e.color}` : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <Avatar entry={e} size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-head)" }}>{e.name}</span>
          {isMe && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: e.color, border: `1px solid ${e.color}`, borderRadius: 4, padding: "0 5px" }}>YOU</span>}
        </div>
        <div style={{ position: "relative", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.07)" }}>
          <div style={{ height: "100%", width: `${Math.min(100, e.score)}%`, borderRadius: 3, background: tier(e.score), opacity: 0.85 }} />
          <div title={`${threshold}% bar`} style={{ position: "absolute", top: -3, bottom: -3, left: `${threshold}%`, width: 2, background: "#fff", opacity: 0.7, borderRadius: 1 }} />
        </div>
      </div>
      <div style={{ textAlign: "right", minWidth: 96 }}>
        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "var(--font-head)", color: tier(e.score) }}>{fmt(e.score)}</div>
        <div style={{ fontSize: 10, color: final ? "#F87171" : "#FBBF24" }}>
          {final ? `missed the ${threshold}% bar` : `${fmt(e.gap)} to qualify`}
        </div>
      </div>
    </div>
  );
}

export default function LeaderboardCard({ month, months = [], selected, onSelect, team = [], currentUserId, streaks, loading }) {
  if (!month) {
    return (
      <div style={{ padding: "36px 20px", textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
        {loading ? "Loading leaderboard..." : "Leaderboard is not available right now."}
      </div>
    );
  }
  const byId = Object.fromEntries(team.map((m) => [m.id, m]));
  const meta = (id) => byId[id] || { id, name: id, color: "#94A3B8", gradient: "#475569" };
  const rows = month.rows.map((r) => ({ ...meta(r.id), ...r }));
  const out = month.notEligible.map((r) => ({ ...meta(r.id), ...r }));
  const final = month.status === "final";
  const live = month.status === "live";
  const win = month.window;
  const champs = months.filter((m) => m.winners && m.winners.length && m.ym !== month.month).slice(0, 4);

  return (
    <div style={{ padding: "20px 22px" }}>
      {/* header: title + date range + month selector */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Trophy size={20} color="#FBBF24" />
            <span style={{ fontFamily: "var(--font-head)", fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>Leaderboard</span>
            <StatusPill month={month} />
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 5 }}>
            {month.label} &middot; {shortDate(win.rangeStart)} &ndash; {shortDate(win.rangeEnd)} &middot; {win.weeks.length} weeks counted
          </div>
        </div>
        {months.length > 0 && (
          <select
            aria-label="Select month"
            value={selected || month.month}
            onChange={(e) => onSelect && onSelect(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, padding: "7px 12px", fontSize: 13, fontFamily: "var(--font-body)", cursor: "pointer", outline: "none",
            }}
          >
            {months.map((m) => (
              <option key={m.ym} value={m.ym} style={{ background: "#0a0a1e" }}>
                {m.label}{m.status === "final" ? " - final" : m.status === "live" ? " - live" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* the rule, always visible */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", borderRadius: 10, marginBottom: 18, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
        <ShieldCheck size={15} color="#34D399" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Finish at least <b style={{ color: "#fff" }}>{month.threshold}%</b> of your month&apos;s tasks to qualify.{" "}
          {live && <>The winner is decided <b style={{ color: "#fff" }}>{longDate(win.decidedOn)}</b>, after the month&apos;s last week closes{month.daysLeft ? ` · ${month.daysLeft} day${month.daysLeft === 1 ? "" : "s"} left` : ""}.</>}
          {final && <>Decided <b style={{ color: "#fff" }}>{longDate(win.decidedOn)}</b>. This result is locked.</>}
          {!live && !final && <>Starts <b style={{ color: "#fff" }}>{longDate(win.rangeStart)}</b>.</>}
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "26px 10px", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
          <Hourglass size={26} color="rgba(255,255,255,0.25)" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.65)" }}>
            {final ? `Nobody reached the ${month.threshold}% bar - no winner this month` : month.totals.tasks ? "No one has qualified yet" : "No tasks logged yet"}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {final ? "" : `Complete ${month.threshold}% of your tasks to enter the race.`}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 28, alignItems: "end" }}>
          <Podium entries={rows} final={final} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 4 }}>
            {rows.map((e) => (
              <Row key={e.id} e={e} isMe={currentUserId === e.id} streak={streaks && streaks[e.id]} />
            ))}
          </div>
        </div>
      )}

      {out.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", fontWeight: 700, marginBottom: 8 }}>
            {final ? "Did not qualify" : "Not yet eligible"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8 }}>
            {out.map((e) => (
              <NotEligibleRow key={e.id} e={e} isMe={currentUserId === e.id} threshold={month.threshold} final={final} />
            ))}
          </div>
        </div>
      )}

      {champs.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", fontWeight: 700 }}>Past champions</span>
          {champs.map((m) => (
            <span key={m.ym} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 11, color: "#FBBF24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
              <Crown size={11} fill="#FBBF24" />
              {m.shortLabel} &middot; {m.winners.map((id) => meta(id).name).join(" & ")} {m.score !== null && m.score !== undefined ? fmt(m.score) : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
