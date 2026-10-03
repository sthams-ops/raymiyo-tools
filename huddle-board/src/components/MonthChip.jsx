import { Check, Target } from "lucide-react";

const fmt = (n) => (Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`);

// Small chip on each person's card: where they stand against the monthly 50% bar.
// status = byMember[id] from /api/leaderboard; live = the month is still being played.
export default function MonthChip({ status, monthShort, live }) {
  if (!status || !live || !status.tasks) return null;
  const ok = status.eligible;
  const c = ok ? "#34D399" : "#FBBF24";
  const Icon = ok ? Check : Target;
  return (
    <span
      title={ok ? "You are on track to qualify for this month's leaderboard" : `Finish ${fmt(status.gap)} more of this month's tasks to qualify`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 999,
        fontSize: 10, fontWeight: 700, color: c, background: `${c}14`, border: `1px solid ${c}33`,
        fontFamily: "var(--font-head)", whiteSpace: "nowrap",
      }}
    >
      <Icon size={10} />
      {monthShort} {fmt(status.score)} &middot; {ok ? "in the race" : `${fmt(status.gap)} to qualify`}
    </span>
  );
}
