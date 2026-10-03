// Pure logic for streaks, weekly winner and consistency. No I/O, so it is unit-testable.
// Week keys are the SUNDAY date of each week as "YYYY-MM-DD" (Sunday -> Saturday weeks).

export const MEMBER_IDS = ["sajina", "divash", "manoj", "krisha", "sunil"];
export const STREAK_THRESHOLD = 80; // a week counts toward the streak at 80%+
export const LOOKBACK_WEEKS = 12;

export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function toKey(date) {
  return date.toISOString().slice(0, 10);
}
export function addWeeks(key, n) {
  const d = parseKey(key);
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return toKey(d);
}

export function avgPct(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;
  const sum = tasks.reduce((s, t) => s + (Number(t && t.pct) || 0), 0);
  return Math.round(sum / tasks.length);
}

function fullyDone(tasks) {
  return (tasks || []).filter((t) => (Number(t && t.pct) || 0) >= 100).length;
}

function weekAverages(weekData) {
  const out = {};
  for (const id of MEMBER_IDS) out[id] = avgPct(weekData && weekData[id]);
  return out;
}

function teamAvg(weekData) {
  if (!weekData) return null;
  return avgPct(MEMBER_IDS.flatMap((id) => weekData[id] || []));
}

// weeksByKey: { "YYYY-MM-DD": weekData | null }
export function computeStats(weekKey, weeksByKey) {
  const current = weeksByKey[weekKey] || null;
  const currentAvgs = weekAverages(current);
  const members = {};

  for (const id of MEMBER_IDS) {
    // Streak = consecutive COMPLETED weeks (before weekKey) at 80%+.
    // A week where the person had no tasks is skipped: it neither extends nor breaks it.
    let streak = 0;
    for (let i = 1; i <= LOOKBACK_WEEKS; i++) {
      const pct = avgPct((weeksByKey[addWeeks(weekKey, -i)] || {})[id]);
      if (pct === null) continue;
      if (pct >= STREAK_THRESHOLD) streak++;
      else break;
    }

    // Consistency = average of up to the last 4 completed weeks that had tasks.
    const recent = [];
    for (let i = 1; i <= 4; i++) {
      const pct = avgPct((weeksByKey[addWeeks(weekKey, -i)] || {})[id]);
      if (pct !== null) recent.push(pct);
    }

    members[id] = {
      weekPct: currentAvgs[id],
      streak,
      holding: currentAvgs[id] !== null && currentAvgs[id] >= STREAK_THRESHOLD,
      consistency: recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null,
      consistencyWeeks: recent.length,
    };
  }

  // Winner of the week BEFORE the one being viewed.
  // Needs 2+ people with tasks and a score above 0. Ties -> most tasks fully done -> co-winners.
  const prevKey = addWeeks(weekKey, -1);
  const prev = weeksByKey[prevKey] || null;
  const prevAvgs = weekAverages(prev);
  const scored = MEMBER_IDS.filter((id) => prevAvgs[id] !== null).map((id) => ({
    id,
    pct: prevAvgs[id],
    done: fullyDone(prev[id]),
  }));

  let winners = [];
  let winPct = null;
  if (scored.length >= 2) {
    const best = Math.max(...scored.map((s) => s.pct));
    if (best > 0) {
      let top = scored.filter((s) => s.pct === best);
      const bestDone = Math.max(...top.map((s) => s.done));
      top = top.filter((s) => s.done === bestDone);
      winners = top.map((s) => s.id);
      winPct = best;
    }
  }

  return {
    weekKey,
    members,
    lastWeek: { weekKey: prevKey, winners, pct: winPct, participants: scored.length },
    team: { weekPct: teamAvg(current), prevWeekPct: teamAvg(prev) },
  };
}
