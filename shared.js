// Page code shared by index.html and now.html: lineup loading, saved state, person icons.
import { withKeys, pickColour } from './lib.js';

// Pick a lineup with ?lineup=lineups/<file>.json. Only these files are allowed, so a shared link can't make the site
// show someone else's JSON (fake event name or notice) under this domain. First one is the default.
const LINEUPS = ['lineups/edc-thailand-2026-dec.json', 'lineups/edc-thailand-2026-jan.json'];
const requested = new URLSearchParams(location.search).get('lineup');
export const LINEUP_URL = LINEUPS.includes(requested) ? requested : LINEUPS[0];
export const esc = t => String(t).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export const $ = id => document.getElementById(id);
// "2026-12-19" → "Sat, 19 Dec" (in the viewer's language); UTC so the date never shifts.
export const dayLabel = d => new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// Poster neons, assigned to stages in order of first appearance so both pages agree.
const STAGE_COLOURS = ['#ff2d8a', '#3ee0f5', '#c8f53c', '#ffe714', '#2f6bff', '#ff9a2e', '#b36bff'];
export function stageColours(lineup) {
  const stages = [...new Set(lineup.sets.map(s => s.stage))];
  return Object.fromEntries(stages.map((st, i) => [st, STAGE_COLOURS[i % STAGE_COLOURS.length]]));
}

export async function loadLineup() {
  const url = new URL(LINEUP_URL, location.href).href;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (!Array.isArray(data.sets)) throw new Error('file has no "sets" array, so it is not a lineup file');
    return withKeys(data);
  } catch (e) {
    console.error('[line-us-up] failed to load', url, e);
    $('lineup').innerHTML = `<p class="clash">Could not load ${esc(LINEUP_URL)}: ${esc(e.message)}</p>`;
  }
}

const key = lineup => 'line-us-up:' + lineup.id;
export const usedColours = state => [state, ...state.friends].map(p => p.colour).filter(Boolean);

export function loadState(lineup) {
  let state;
  try { state = JSON.parse(localStorage.getItem(key(lineup))); } catch {}
  state ||= { name: '', favourites: {}, friends: [] };
  for (const p of [state, ...state.friends]) p.colour ||= pickColour(usedColours(state));
  return state;
}
export const clearState = lineup => { try { localStorage.removeItem(key(lineup)); } catch {} };
let saveWarned = false; // warn once, not on every star
export const saveState = (lineup, state) => {
  try { localStorage.setItem(key(lineup), JSON.stringify(state)); }
  catch {
    if (!saveWarned) alert("Your browser won't let this page save, so your picks will be lost on reload. Use My list → Export to keep them.");
    saveWarned = true;
  }
};

export const person = (p, lvl, state) => {
  const label = esc((p === state ? (state.name || 'You') : p.name) + (lvl === 2 ? ' (SUPERMUSTSEE)' : ''));
  return `<span class="person${lvl === 2 ? ' must' : ''}" title="${label}" role="img" aria-label="${label}">` +
    `<svg fill="${esc(p.colour)}" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="7" r="4.5"/><path d="M3 22c0-5 4-8.5 9-8.5s9 3.5 9 8.5z"/></svg></span>`;
};
