import { motion } from "framer-motion";
import { Flame, TrendingUp } from "lucide-react";

const TIERS = [
  { min: 6, label: "Legendary", from: "#F9A8D4", to: "#8B5CF6", glow: "#A78BFA" },
  { min: 3, label: "On fire", from: "#FDE68A", to: "#F97316", glow: "#F97316" },
  { min: 1, label: "Warming up", from: "#FDBA74", to: "#FB923C", glow: "#FB923C" },
];

// Flame badge: consecutive completed weeks at 80%+. "+1" appears while they are holding 80%+ this week.
export default function StreakBadge({ streak = 0, holding = false, size = "md" }) {
  if (!streak) return null;
  const tier = TIERS.find((t) => streak >= t.min);
  const sm = size === "sm";
  return (
    <motion.span
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 18 }}
      title={`${streak}-week streak of 80%+ weeks · ${tier.label}${holding ? " · holding it this week" : ""}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: sm ? "2px 7px" : "3px 10px", borderRadius: 999,
        background: `linear-gradient(135deg, ${tier.to}26, ${tier.glow}2e)`,
        border: `1px solid ${tier.glow}66`, color: tier.from,
        fontSize: sm ? 10 : 12, fontWeight: 800, fontFamily: "var(--font-head)", letterSpacing: 0.3,
        boxShadow: `0 0 14px ${tier.glow}30`, whiteSpace: "nowrap",
      }}
    >
      <motion.span
        animate={{ scale: [1, 1.2, 1], rotate: [0, -7, 6, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        style={{ display: "inline-flex" }}
      >
        <Flame size={sm ? 11 : 14} color={tier.from} fill={tier.to} strokeWidth={2} />
      </motion.span>
      {streak}
      <span style={{ opacity: 0.7, fontWeight: 600 }}>wk</span>
      {holding && <span style={{ color: "#34D399", fontSize: sm ? 9 : 10 }}>+1</span>}
    </motion.span>
  );
}

// "4-wk avg 76%" chip - steady performance over the last few weeks
export function ConsistencyChip({ value, weeks }) {
  if (value === null || value === undefined || weeks < 2) return null;
  const c = value >= 80 ? "#34D399" : value >= 50 ? "#FBBF24" : "#F87171";
  return (
    <span
      title={`Average of the last ${weeks} completed weeks`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 999,
        fontSize: 10, fontWeight: 700, color: c, background: `${c}14`, border: `1px solid ${c}33`,
        fontFamily: "var(--font-head)", whiteSpace: "nowrap",
      }}
    >
      <TrendingUp size={10} />
      {weeks}-wk avg {value}%
    </span>
  );
}
