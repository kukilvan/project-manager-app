// Matching project points to the captions on a drawing: exact pairs, similar ones (other separators, an extra beginning) and those without a pair.
// Pure functions with no imports; used by src/app/views/planlink.js and tests/tohnit.test.js.
export const exactKey = (l) => String(l || '').replace(/#\d+$/, '').replace(/\s+/g, '').toUpperCase().replace(/(^|\D)0+(\d)/g, '$1$2');  // GC/013 = GC/13
// the parts of a label without separators and leading zeros: 1A-01-02 and 1A/01-02 → 1|A|1|2
export const tokens = (l) => (String(l || '').replace(/#\d+$/, '').toUpperCase().match(/[A-Z]+|[א-ת]+|\d+/g) || []).map((t) => (/^\d+$/.test(t) ? String(+t) : t));
const endsWith = (a, b) => b.length >= 2 && b.length < a.length && b.some((t) => /^\d/.test(t)) && b.every((t, i) => a[a.length - b.length + i] === t);

// if the point and the caption both have a known rack and the racks differ, they are different points with the same name
const cabOk = (p, f) => !(p.cabinet && f.cabinet && p.cabinet !== f.cabinet);

/** Pairs «project point ↔ caption on the drawing»: exact (at once) and similar (to ask about). A pure function, for tests. */
export function matchLabels(points, found) {
  const byExact = new Map(); points.forEach((p) => { [p.label, p.planName].filter(Boolean).forEach((l) => { const k = exactKey(l); if (!byExact.has(k)) byExact.set(k, []); byExact.get(k).push(p); }); });
  const used = new Set(); const exact = []; const rest = []; const ambiguous = [];
  for (const f of found) {
    const cand = (byExact.get(exactKey(f.label)) || []).filter((p) => !used.has(p.id) && cabOk(p, f));
    if (!cand.length) { rest.push(f); continue; }
    // a caption without a rack while points with that number exist in different racks: whose it is is not decided automatically (a person assigns it on the plan)
    if (!f.cabinet && new Set(cand.map((p) => p.cabinet || '')).size > 1) { ambiguous.push({ f, cands: cand }); continue; }
    const p = cand.find((x) => x.label === f.label && x.cabinet === f.cabinet) || cand.find((x) => x.label === f.label) || cand[0]; used.add(p.id); exact.push({ p, f });
  }
  // similar: the same parts (other separators) or one is the «tail» of the other (an extra beginning, such as the rack name); only if the pair is unique
  const free = points.filter((p) => !used.has(p.id));
  const simKey = (a, b) => { const ta = tokens(a); const tb = tokens(b); return ta.length && ta.join('|') === tb.join('|') ? 'same' : endsWith(ta, tb) || endsWith(tb, ta) ? 'tail' : null; };
  const cands = rest.map((f) => free.filter((p) => cabOk(p, f) && [p.label, p.planName].filter(Boolean).some((l) => simKey(l, f.label))));
  const count = new Map(); cands.forEach((cs) => cs.forEach((p) => count.set(p.id, (count.get(p.id) || 0) + 1)));
  const similar = []; const unlinked = [];
  rest.forEach((f, i) => {
    const cs = cands[i];
    if (cs.length === 1 && count.get(cs[0].id) === 1) similar.push({ p: cs[0], f, kind: [cs[0].label, cs[0].planName].filter(Boolean).some((l) => simKey(l, f.label) === 'same') ? 'same' : 'tail' });
    else unlinked.push(f);
  });
  return { exact, similar, unlinked, ambiguous };
}

