import { agenda, countdown, timeOf, offsetMinutes, localTime, dayOf, timeline, nowOffset, festivalDay, parseTestNow } from './lib.js';
import { esc, $, dayLabel, stageColours, loadLineup, loadState, person } from './shared.js';

// Testing only: ?now=2026-01-16T19:00 freezes the clock at that one moment (festival time unless a zone is given).
const NOW_PARAM = new URLSearchParams(location.search).get('now');
let testNow = null; // ms, set once the lineup (and so the festival's time zone) is known
const now = () => testNow ?? Date.now();

const PAST_SCALE = 0.4; // sets that are over shrink to this share of their height
const PX_PER_MIN = 3.2; // a 30-minute set gets 96px: enough for stage, artist, time and friend icons at PARTY MODE's text size
// Break between picks: 🚶 if you have to change stage, 🍹 if the next pick is on the stage you're already at.
function breakIcon(before, after) {
  const here = new Set(before.sets.map(s => s.stage));
  const walk = !after.sets.some(s => here.has(s.stage));
  const mins = countdown(after.start - before.end);
  return walk ? ['🚶', `Walk to ${[...new Set(after.sets.map(s => s.stage))].join(' / ')} · ${mins}`] : ['🍹', `Chill at ${after.sets[0].stage} · ${mins}`];
}

let lineup, state, colour;
let selDay = null; // day picked in the date bar; null = today's / the next set's day
let example = false; // no picks yet, so showing made-up ones
let centred = false; // the now line is scrolled to the middle once, not on every 30s refresh
let draw; // render() once set times are out, else renderUntimed()

// Date bar: one button per festival day you have picks on.
function dayBar(picks, active) {
  const days = [...new Set(picks.map(dayOf))].sort();
  $('days').hidden = !days.length;
  $('days').innerHTML = days.map(d => `<button data-day="${d}" aria-pressed="${d === active}">${esc(dayLabel(d))}</button>`).join('');
}
$('days').onclick = e => {
  const d = e.target.closest('button')?.dataset.day;
  if (d) { selDay = d; draw(); }
};

function card(s, t, style, cls = '') {
  const going = [state, ...state.friends].filter(p => p.favourites[s.id]);
  const lvl = state.favourites[s.id];
  const a = Date.parse(s.start), b = Date.parse(s.end);
  const kind = b <= t ? 'past' : a <= t ? 'playing' : 'later';
  // Start over end, each on its own line.
  const when = `<span>${timeOf(s.start)}</span><span>${timeOf(s.end)}</span>`;
  return `<div class="card ${kind}${lvl === 2 ? ' must' : ''} ${cls}" style="--stage:${colour[s.stage]}; ${style}">
    <div class="where">${esc(s.stage)}</div>
    <div class="artist">${lvl === 2 ? '🌟 ' : ''}${esc(s.artist)}</div>
    <div class="meta">${when}</div>
    <div>${going.map(p => person(p, p.favourites[s.id], state)).join('')}</div>
  </div>`;
}

function dayTimeline(picks, t) {
  const segs = timeline(picks, { pxPerMin: PX_PER_MIN });
  for (const seg of segs) if (!seg.gap && seg.end <= t) seg.px *= PAST_SCALE; // nowOffset reads seg.px, so the now line stays right
  let html = '';
  segs.forEach((seg, i) => {
    if (seg.gap) {
      const [icon, label] = breakIcon(segs[i - 1], segs[i + 1]);
      html += `<div class="gap" style="height:${seg.px}px" title="${esc(label)}" role="img" aria-label="${esc(label)}">${icon}</div>`;
      return;
    }
    // Clashing picks overlap at full width, each at its own time; later ones sit on top, nudged right so the edge below shows.
    const ppm = seg.end <= t ? PX_PER_MIN * PAST_SCALE : PX_PER_MIN;
    html += `<div class="cluster" style="height:${seg.px}px">` + seg.sets.map((s, i) => card(s, t,
      `top:${(Date.parse(s.start) - seg.start) / 60000 * ppm}px; height:${(Date.parse(s.end) - Date.parse(s.start)) / 60000 * ppm}px;` +
      `left:${i * 24}px; right:0; z-index:${i + 1}`, i < seg.sets.length - 1 ? 'under' : '')).join('') + '</div>';
  });
  const y = nowOffset(segs, t);
  if (y !== null) html += `<div id="nowline" class="nowline" style="top:${y}px"><span>${localTime(t, offsetMinutes(picks[0].start))}</span></div>`;
  return `<div class="timeline">${html}</div>`;
}

const who = s => [state, ...state.friends].filter(p => p.favourites[s.id]).map(p => person(p, p.favourites[s.id], state)).join('');
const star = s => state.favourites[s.id] === 2 ? '🌟 ' : '';

function nowCard(s, t) {
  const a = Date.parse(s.start), b = Date.parse(s.end);
  return `<section class="focus" style="--stage:${colour[s.stage]}">
    <div class="label"><span class="live">●</span> Now at</div>
    <div class="where">${esc(s.stage)}</div>
    <div class="who">${star(s)}${esc(s.artist)}</div>
    <div class="progress" role="progressbar" aria-valuenow="${Math.round((t - a) / (b - a) * 100)}" aria-valuemin="0" aria-valuemax="100">
      <span style="width:${(t - a) / (b - a) * 100}%"></span></div>
    <div class="row"><span>${timeOf(s.start)}–${timeOf(s.end)}</span><b>${countdown(b - t)} left</b></div>
    <div class="people">${who(s)}</div>
  </section>`;
}

// One next set: "Head to <stage>". A clash: each option as a smaller card, pick one.
function nextCard(next, t) {
  const inT = countdown(Date.parse(next[0].start) - t);
  if (next.length === 1) {
    const s = next[0];
    return `<section class="focus next" style="--stage:${colour[s.stage]}">
      <div class="label">Next · in <b>${inT}</b></div>
      <div class="where">Head to ${esc(s.stage)}</div>
      <div class="who">${star(s)}${esc(s.artist)}</div>
      <div class="row"><span>${timeOf(s.start)}–${timeOf(s.end)}</span></div>
      <div class="people">${who(s)}</div>
    </section>`;
  }
  return `<section class="focus next pick">
    <div class="label">Next · in <b>${inT}</b> · clash, pick one</div>
    <div class="options">${next.map(s => `<div class="option" style="--stage:${colour[s.stage]}">
      <div class="where">${esc(s.stage)}</div><div class="who">${star(s)}${esc(s.artist)}</div>
      <div class="row"><span>${timeOf(s.start)}–${timeOf(s.end)}</span></div><div class="people">${who(s)}</div></div>`).join('')}</div>
  </section>`;
}

function render() {
  const t = now();
  $('clock').textContent = localTime(t, offsetMinutes(lineup.sets[0]?.start || 'Z')) + (testNow === null ? '' : ' (test time)');
  const picks = lineup.sets.filter(s => state.favourites[s.id]).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (!picks.length) {
    $('days').hidden = true;
    $('lineup').innerHTML = `<section class="focus empty"><div class="who">No picks yet</div><p><a class="button go" href="index.html${esc(location.search)}">Star some sets →</a></p></section>`;
    $('full').hidden = true;
    return;
  }

  const { playing, next, later } = agenda(lineup.sets, state.favourites, t);
  const festivalStart = Math.min(...lineup.sets.map(s => Date.parse(s.start)));
  let html = example ? `<p class="starts">Example picks · <a href="index.html${esc(location.search)}">star your own →</a></p>` : '';
  if (t < festivalStart) html += `<p class="starts">Festival starts in <b>${countdown(festivalStart - t)}</b></p>`;
  html += playing.map(s => nowCard(s, t)).join('');
  if (!playing.length && next.length && t >= festivalStart) html += `<section class="focus free"><div class="label">Now</div><div class="who">Free time 🍹</div></section>`;
  if (next.length) html += nextCard(next, t);

  // Rest of the next set's night, as a compact list.
  const day = next[0] && dayOf(next[0]);
  const rest = later.filter(s => dayOf(s) === day);
  if (rest.length) html += `<h2>Later ${t < festivalStart ? 'that night' : 'tonight'}</h2><ul class="later">` + rest.map(s =>
    `<li style="--stage:${colour[s.stage]}"><time>${timeOf(s.start)}</time><span><b>${star(s)}${esc(s.artist)}</b><br><span class="muted">${esc(s.stage)}</span></span><span class="people">${who(s)}</span></li>`).join('') + '</ul>';
  $('lineup').innerHTML = html;
  const onTheDay = festivalDay(lineup.sets, t) !== null;
  $('lineup').hidden = onTheDay; // on the day the timeline says it all

  // Timeline: the day picked in the date bar, else the current festival day, else the next set's day, else the first.
  const tlDay = selDay || festivalDay(lineup.sets, t) || day || dayOf(picks[0]); // after the festival: its first day
  dayBar(picks, tlDay);
  const dayPicks = picks.filter(s => dayOf(s) === tlDay);
  $('full').hidden = !dayPicks.length;
  if (dayPicks.length) {
    $('full-title').textContent = `Timeline · ${dayLabel(tlDay)}`;
    // Only today's sets get the finished (shrunk, muted) look; any other day shows at full size.
    $('timeline').innerHTML = dayTimeline(dayPicks, tlDay === festivalDay(lineup.sets, t) ? t : -Infinity);
    if (onTheDay && !centred && $('nowline')) { $('nowline').scrollIntoView({ block: 'center' }); centred = true; }
  }
}

// Before set times are out: the date bar plus the chosen day's sets, grouped by stage (in lineup order).
// Shows your picks; with none yet, the whole lineup so the page isn't empty.
function renderUntimed() {
  const mine = lineup.sets.filter(s => state.favourites[s.id]);
  const sets = mine.length ? mine : lineup.sets;
  const day = selDay || sets.map(dayOf).sort()[0];
  dayBar(sets, day);
  const stageRank = st => st in colour ? Object.keys(colour).indexOf(st) : Infinity; // TBA last
  const byStage = Map.groupBy(sets.filter(s => dayOf(s) === day), s => s.stage || 'Stage TBA');
  $('lineup').innerHTML = `<p class="starts">Set times aren't out yet</p>` +
    (mine.length ? '' : `<p class="muted">No picks yet, so this is everyone. <a href="index.html${esc(location.search)}">Star some artists →</a></p>`) +
    [...byStage].sort(([a], [b]) => stageRank(a) - stageRank(b)).map(([stage, list]) => `<h2 class="stage" style="--stage:${colour[stage] || 'var(--line)'}">${esc(stage)}</h2><ul class="later">` +
      list.map(s => `<li style="--stage:${colour[stage] || 'var(--line)'}"><b class="grow">${star(s)}${esc(s.artist)}</b><span class="people">${who(s)}</span></li>`).join('') + '</ul>').join('');
}

lineup = await loadLineup();
if (lineup) {
  state = loadState(lineup);
  colour = stageColours(lineup);
  console.log('[line-us-up] party mode state for', lineup.id, state);
}
if (lineup && !lineup.sets.some(s => s.start)) {
  $('full').hidden = true;
  $('title').textContent = lineup.event;
  $('back').href = 'index.html' + location.search;
  (draw = renderUntimed)();
} else if (lineup) {
  lineup.sets = lineup.sets.filter(s => s.start); // artists without set times can't be scheduled yet
  // No picks yet: make example picks so the page shows what it does. Never saved.
  // Sets in start order with a 30-min break between, plus the odd overlapping one (every 9th) so a clash shows too.
  example = !lineup.sets.some(s => state.favourites[s.id]);
  if (example) {
    let busyUntil = 0;
    state.favourites = Object.fromEntries(lineup.sets.toSorted((a, b) => Date.parse(a.start) - Date.parse(b.start)).filter((s, i) => {
      const a = Date.parse(s.start);
      if (a < busyUntil + 30 * 60000 && !(i % 9 === 0 && a < busyUntil)) return false;
      busyUntil = Math.max(busyUntil, Date.parse(s.end));
      return true;
    }).map(s => [s.id, 1]));
  }
  if (NOW_PARAM !== null) {
    const t = parseTestNow(NOW_PARAM, offsetMinutes(lineup.sets[0]?.start || 'Z'));
    if (Number.isNaN(t)) console.warn('[line-us-up] ignoring ?now=, expected one datetime like 2026-01-16T19:00, got', NOW_PARAM);
    else testNow = t;
  }
  $('title').textContent = lineup.event;
  $('back').href = 'index.html' + location.search;
  (draw = render)();
  setInterval(render, 30000);
  // Phones pause timers in background tabs; refresh as soon as you look again.
  document.addEventListener('visibilitychange', () => document.hidden || render());
}
