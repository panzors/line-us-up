// Pure helpers (no DOM) so they can be tested with `node test.mjs`.

export const dayOf = s => s.day || s.start.slice(0, 10);

// Saved-list key: stage initials + festival-local start, e.g. "MS-2026-12-19T17:00".
export const setKey = s => s.stage.split(/\s+/).map(w => w[0]).join('').toUpperCase() + '-' + s.start.slice(0, 16);

// Gives every set its key as `id`; refuses lineups where two sets share one (e.g. "Main Stage"/"Mega Stage" at the same time).
export function withKeys(lineup) {
  const seen = {};
  for (const s of lineup.sets) {
    s.id = setKey(s);
    if (seen[s.id]) throw new Error(`"${s.artist}" and "${seen[s.id]}" both get key ${s.id}; rename a stage so the initials differ`);
    seen[s.id] = s.artist;
  }
  return lineup;
}
// Profile links for a set's artist from lineup.artists; B2B / "&" sets merge each artist's links (first one wins).
const normName = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function artistLinks(lineup, artist) {
  const by = {};
  for (const [n, links] of Object.entries(lineup.artists || {})) by[normName(n)] = links;
  return Object.assign({}, ...[artist, ...artist.split(/\s+(?:b2b|&|x)\s+/i)].reverse().map(n => by[normName(n)] || {}));
}

export const timeOf = iso => iso.slice(11, 16); // festival-local time as written in the JSON

// "+07:00" / "Z" suffix of an ISO string → offset in minutes, so computed times show in festival-local time.
export function offsetMinutes(iso) {
  const m = iso.match(/([+-])(\d\d):(\d\d)$/);
  return m ? (m[1] === '-' ? -1 : 1) * (m[2] * 60 + +m[3]) : 0;
}
// `?now=` test clock: exactly one ISO datetime, e.g. "2026-01-16T19:00" (festival time) or "2026-01-16T19:00:00+07:00".
// A raw "+" in a query string arrives as a space, so that's accepted too. Returns ms, or NaN if it isn't one datetime.
export function parseTestNow(param, festivalOffset) {
  const m = String(param).trim().match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?)(Z|[+ -]\d\d:\d\d)?$/);
  if (!m) return NaN;
  const off = Math.abs(festivalOffset);
  const zone = m[2]?.replace(' ', '+') ?? `${festivalOffset < 0 ? '-' : '+'}${String(Math.floor(off / 60)).padStart(2, '0')}:${String(off % 60).padStart(2, '0')}`;
  return Date.parse(m[1] + zone);
}
export const localTime =(ms, offset) => new Date(ms + offset * 60000).toISOString().slice(11, 16);

// Favourite level: 1 = want to see, 2 = SUPERMUSTSEE.
export function clashes(sets, favs) {
  const picked = sets.filter(s => favs[s.id]);
  const out = {};
  for (const a of picked) for (const b of picked) {
    if (a !== b && new Date(a.start) < new Date(b.end) && new Date(b.start) < new Date(a.end)) {
      (out[a.id] ||= []).push(b.id);
    }
  }
  return out;
}

const icsDate = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = t => String(t).replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');

export function toICS(lineup, favs) {
  const now = icsDate(new Date().toISOString());
  const events = lineup.sets.filter(s => favs[s.id]).map(s => [
    'BEGIN:VEVENT',
    `UID:${s.id}@${lineup.id}.line-us-up`,
    `DTSTAMP:${now}`,
    `DTSTART:${icsDate(s.start)}`,
    `DTEND:${icsDate(s.end)}`,
    `SUMMARY:${icsText((favs[s.id] === 2 ? '★ ' : '') + s.artist)}`,
    `LOCATION:${icsText(s.stage + ' – ' + lineup.event)}`,
    'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//line-us-up//EN', ...events, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

// Your picks split around `now` (ms). `next` = every pick sharing the earliest upcoming start (more than one = clash).
export function agenda(sets, favs, now) {
  const picked = sets.filter(s => favs[s.id]).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const upcoming = picked.filter(s => Date.parse(s.start) > now);
  const nextStart = upcoming.length && Date.parse(upcoming[0].start);
  return {
    playing: picked.filter(s => Date.parse(s.start) <= now && now < Date.parse(s.end)),
    next: upcoming.filter(s => Date.parse(s.start) === nextStart),
    later: upcoming.filter(s => Date.parse(s.start) !== nextStart),
  };
}

// Festival day (as in `dayOf`) that time `t` belongs to, or null. While a day's sets run (even past midnight) it's that day;
// otherwise it's today's festival-local date if the festival has sets that day (e.g. the afternoon before gates open).
export function festivalDay(sets, t) {
  const ranges = {};
  for (const s of sets) {
    const r = ranges[dayOf(s)] ||= [Infinity, -Infinity];
    r[0] = Math.min(r[0], Date.parse(s.start));
    r[1] = Math.max(r[1], Date.parse(s.end));
  }
  for (const [d, [a, b]] of Object.entries(ranges)) if (t >= a && t < b) return d;
  const today = localDate(t, offsetMinutes(sets[0]?.start || 'Z'));
  return ranges[today] ? today : null;
}
const localDate = (ms, offset) => new Date(ms + offset * 60000).toISOString().slice(0, 10);

// One day's picks (sorted by start) → vertical segments with pixel heights.
// Overlapping picks (clashes) share one "cluster" segment; gaps between clusters get a capped height so long breaks don't eat the screen.
export function timeline(picks, { pxPerMin = 2.5, minGap = 56, maxGap = 160 } = {}) {
  const clusters = [];
  for (const s of picks) {
    const a = Date.parse(s.start), b = Date.parse(s.end), c = clusters.at(-1);
    if (c && a < c.end) { c.sets.push(s); c.end = Math.max(c.end, b); }
    else clusters.push({ start: a, end: b, sets: [s] });
  }
  const segs = [];
  clusters.forEach((c, i) => {
    const prev = clusters[i - 1];
    if (prev && c.start > prev.end) {
      segs.push({ gap: true, start: prev.end, end: c.start, px: Math.min(maxGap, Math.max(minGap, (c.start - prev.end) / 60000 * pxPerMin)) });
    }
    segs.push({ ...c, px: (c.end - c.start) / 60000 * pxPerMin });
  });
  return segs;
}

// Pixel offset of time `t` within timeline segments, or null if `t` is outside them.
export function nowOffset(segs, t) {
  let y = 0;
  for (const s of segs) {
    if (t < s.start) return null;
    if (t < s.end) return y + (t - s.start) / (s.end - s.start) * s.px;
    y += s.px;
  }
  return null;
}

export function countdown(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), min = m % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${min}m` : `${min}m`;
}

export const RANGER_COLOURS = ['#e53935', '#1e63d6', '#fdd835', '#ec4fa1', '#2e9e44', '#222222', '#f5f5f5'];

// Random colour among the least-used ones, so nobody shares until all are taken.
export function pickColour(used, rand = Math.random) {
  const count = c => used.filter(u => u === c).length;
  const min = Math.min(...RANGER_COLOURS.map(count));
  const free = RANGER_COLOURS.filter(c => count(c) === min);
  return free[Math.floor(rand() * free.length)];
}

// Validate an imported personal list (untrusted file).
export function parseList(text, lineup) {
  const data = JSON.parse(text);
  if (data.event !== lineup.id) throw new Error(`List is for "${data.event}", not "${lineup.id}"`);
  if (!data.favourites || typeof data.favourites !== 'object') throw new Error('Missing "favourites"');
  const ids = new Set(lineup.sets.map(s => s.id));
  const favourites = {};
  for (const [id, lvl] of Object.entries(data.favourites)) {
    if (ids.has(id) && (lvl === 1 || lvl === 2)) favourites[id] = lvl;
  }
  return { name: String(data.name || 'Friend').slice(0, 40), favourites };
}
