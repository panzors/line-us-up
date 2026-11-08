import { agenda, countdown, timeOf, offsetMinutes, localTime, dayOf, timeline, nowOffset, festivalDay, parseTestNow } from './lib.js';
import { esc, $, dayLabel, stageColours, loadLineup, loadState, person } from './shared.js';

// Testing only: ?now=2026-01-16T19:00 freezes the clock at that one moment (festival time unless a zone is given).
const NOW_PARAM = new URLSearchParams(location.search).get('now');
let testNow = null; // ms, set once the lineup (and so the festival's time zone) is known
const now = () => testNow ?? Date.now();

const PX_PER_MIN = 2.5;
const PARTY = ['🎉', '🪩', '🍻', '🕺', '💃', '🎊', '🥳', '🍹', '🌈', '✨', '🎶', '🔊'];
// Same emoji for the same break on every refresh.
const partyEmoji = ms => PARTY[Math.floor(ms / 60000) * 7919 % PARTY.length];

let lineup, state, colour;

function card(s, t, style) {
  const going = [state, ...state.friends].filter(p => p.favourites[s.id]);
  const lvl = state.favourites[s.id];
  const a = Date.parse(s.start), b = Date.parse(s.end);
  const kind = b <= t ? 'past' : a <= t ? 'playing' : 'later';
  const when = kind === 'playing' ? `until ${timeOf(s.end)} · ${countdown(b - t)} left`
    : `${timeOf(s.start)}–${timeOf(s.end)}${kind === 'later' ? ` · in ${countdown(a - t)}` : ''}`;
  return `<div class="card ${kind}${lvl === 2 ? ' must' : ''}" style="--stage:${colour[s.stage]}; ${style}">
    <div class="where">${esc(s.stage)}</div>
    <div class="artist">${lvl === 2 ? '🌟 ' : ''}${esc(s.artist)}</div>
    <div class="meta">${when}</div>
    <div>${going.map(p => person(p, p.favourites[s.id], state)).join('')}</div>
  </div>`;
}

function dayTimeline(picks, t) {
  const segs = timeline(picks, { pxPerMin: PX_PER_MIN });
  let html = '';
  for (const seg of segs) {
    if (seg.gap) {
      html += `<div class="gap" style="height:${seg.px}px" title="Break ${countdown(seg.end - seg.start)}">${partyEmoji(seg.start)}</div>`;
      continue;
    }
    // Clashing picks sit side by side, each at its own time within the cluster.
    const n = seg.sets.length;
    html += `<div class="cluster" style="height:${seg.px}px">` + seg.sets.map((s, i) => card(s, t,
      `top:${(Date.parse(s.start) - seg.start) / 60000 * PX_PER_MIN}px; height:${(Date.parse(s.end) - Date.parse(s.start)) / 60000 * PX_PER_MIN}px;` +
      `left:${i * 100 / n}%; width:calc(${100 / n}% - 4px)`)).join('') + '</div>';
  }
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
    $('lineup').innerHTML = `<section class="focus empty"><div class="who">No picks yet</div><p><a class="button go" href="index.html${esc(location.search)}">Star some sets →</a></p></section>`;
    $('full').hidden = true;
    return;
  }

  const { playing, next, later } = agenda(lineup.sets, state.favourites, t);
  const festivalStart = Math.min(...lineup.sets.map(s => Date.parse(s.start)));
  let html = '';
  if (t < festivalStart) html += `<p class="starts">Festival starts in <b>${countdown(festivalStart - t)}</b></p>`;
  html += playing.map(s => nowCard(s, t)).join('');
  if (!playing.length && next.length && t >= festivalStart) html += `<section class="focus free"><div class="label">Now</div><div class="who">Free time 🍹</div></section>`;
  if (next.length) html += nextCard(next, t);
  else if (!playing.length) html += `<section class="focus empty"><div class="who">That's a wrap 🎉</div><p class="muted">None of your picks are left.</p></section>`;

  // Rest of the next set's night, as a compact list.
  const day = next[0] && dayOf(next[0]);
  const rest = later.filter(s => dayOf(s) === day);
  if (rest.length) html += `<h2>Later ${t < festivalStart ? 'that night' : 'tonight'}</h2><ul class="later">` + rest.map(s =>
    `<li style="--stage:${colour[s.stage]}"><time>${timeOf(s.start)}</time><span><b>${star(s)}${esc(s.artist)}</b><br><span class="muted">${esc(s.stage)}</span></span><span class="people">${who(s)}</span></li>`).join('') + '</ul>';
  $('lineup').innerHTML = html;

  // Full timeline: the current festival day, else the next set's day.
  const tlDay = festivalDay(lineup.sets, t) || day;
  const dayPicks = picks.filter(s => dayOf(s) === tlDay);
  $('full').hidden = !dayPicks.length;
  if (dayPicks.length) {
    $('full').querySelector('summary').textContent = `Full timeline · ${dayLabel(tlDay)}`;
    $('timeline').innerHTML = dayTimeline(dayPicks, t);
  }
}

lineup = await loadLineup();
if (lineup) lineup.sets = lineup.sets.filter(s => s.start); // artists without set times can't be scheduled yet
if (lineup && !lineup.sets.length) {
  $('lineup').innerHTML = `<section class="focus empty"><div class="who">Set times aren't out yet</div><p><a class="button go" href="index.html${esc(location.search)}">Star some artists →</a></p></section>`;
  $('full').hidden = true;
} else if (lineup) {
  state = loadState(lineup);
  colour = stageColours(lineup);
  if (NOW_PARAM !== null) {
    const t = parseTestNow(NOW_PARAM, offsetMinutes(lineup.sets[0]?.start || 'Z'));
    if (Number.isNaN(t)) console.warn('[line-us-up] ignoring ?now=, expected one datetime like 2026-01-16T19:00, got', NOW_PARAM);
    else testNow = t;
  }
  $('title').textContent = lineup.event;
  $('back').href = 'index.html' + location.search;
  render();
  setInterval(render, 30000);
  // Phones pause timers in background tabs; refresh as soon as you look again.
  document.addEventListener('visibilitychange', () => document.hidden || render());
}
