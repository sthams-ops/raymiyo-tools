// Builds the monthly leaderboard from the /api/months data already loaded on the Dashboard.

function monthAverages(monthEntry, ids) {
  const avg = {};
  const weeks = {};
  for (const id of ids) {
    const weekly = ((monthEntry && monthEntry.weeks) || [])
      .map((w) => {
        const t = w && w.data && w.data[id];
        return Array.isArray(t) && t.length
          ? t.reduce((s, x) => s + (Number(x && x.pct) || 0), 0) / t.length
          : null;
      })
      .filter((v) => v !== null);
    avg[id] = weekly.length ? Math.round(weekly.reduce((a, b) => a + b, 0) / weekly.length) : null;
    weeks[id] = weekly.length;
  }
  return { avg, weeks };
}

// Competition ranking: equal scores share a rank (1, 2, 2, 4)
function assignRanks(rows) {
  let lastPct = null;
  let lastRank = 0;
  rows.forEach((r, i) => {
    if (r.pct === lastPct) r.rank = lastRank;
    else { r.rank = i + 1; lastRank = r.rank; lastPct = r.pct; }
  });
  return rows;
}

const byScore = (a, b) => b.pct - a.pct || a.name.localeCompare(b.name);

// team: [{id,name,color,gradient,...}]  stats: the "members" object from /api/stats
export function buildLeaderboard(team, monthEntry, prevMonthEntry, stats) {
  const ids = team.map((m) => m.id);
  const cur = monthAverages(monthEntry, ids);
  const prev = monthAverages(prevMonthEntry, ids);

  const rows = assignRanks(
    team.filter((m) => cur.avg[m.id] !== null)
      .map((m) => ({ ...m, pct: cur.avg[m.id], weeks: cur.weeks[m.id] }))
      .sort(byScore)
  );
  const prevRows = assignRanks(
    team.filter((m) => prev.avg[m.id] !== null)
      .map((m) => ({ id: m.id, name: m.name, pct: prev.avg[m.id] }))
      .sort(byScore)
  );
  const prevRank = Object.fromEntries(prevRows.map((r) => [r.id, r.rank]));

  return rows.map((r) => ({
    ...r,
    streak: (stats && stats[r.id] && stats[r.id].streak) || 0,
    holding: !!(stats && stats[r.id] && stats[r.id].holding),
    moved: prevRank[r.id] ? prevRank[r.id] - r.rank : null, // + = moved up vs last month
  }));
}
