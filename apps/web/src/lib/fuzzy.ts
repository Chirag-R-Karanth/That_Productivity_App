/**
 * Simple subsequence fuzzy matcher (no dependencies). Returns a score for a
 * query against a haystack, or null when it does not match. Lower is better.
 *
 * Scoring rewards: prefix match, word-boundary hits, consecutive characters.
 */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.trim().toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 0;
  if (t === q) return -200;

  let qi = 0;
  let score = 0;
  let inGap = false;
  let prevMatch = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (ti === 0) score -= 60;
      else if (/[\s/_-]/.test(t[ti - 1])) score -= 40;
      else if (prevMatch === ti - 1) score -= 5;
      else score += inGap ? 8 : 0;
      inGap = false;
      prevMatch = ti;
      qi++;
    } else {
      if (t[ti] !== " ") inGap = true;
      score += 2;
    }
  }

  if (qi < q.length) return null;
  score += (t.length - q.length) * 0.1;
  return score;
}