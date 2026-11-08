import { dayOf, timeOf, clashes, toICS, parseList, offsetMinutes, localTime, pickColour, artistLinks } from './lib.js';
import { esc, $, dayLabel, stageColours, loadLineup, loadState, saveState, clearState, usedColours as used, person as icon } from './shared.js';

const STARS = ['☆', '★', '🌟']; // none, want to see, SUPERMUSTSEE
const LINK_LABELS = { spotify: 'Spotify', soundcloud: 'SoundCloud', instagram: 'Instagram', facebook: 'Facebook', twitter: 'X', x: 'X', website: 'Website' };

let lineup, state, currentDay;
const picked = new Set(); // search picks: "g:<lower-cased genre>" or "a:<artist>"; empty = show all
const genresOf = s => (s.genres || []).map(g => g.toLowerCase());
const save = () => saveState(lineup, state);
const usedColours = () => used(state);
const person = (p, lvl) => icon(p, lvl, state);

function download(filename, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function render() {
  const filter = $('filter').value;
  const clash = clashes(lineup.sets, state.favourites);
  const byId = Object.fromEntries(lineup.sets.map(s => [s.id, s]));
  const friendsOf = s => state.friends.filter(f => f.favourites[s.id]);

  // OR across everything picked in the search box: any picked genre, or the picked artist.
  const matches = s => (!picked.size || picked.has('a:' + s.artist) || genresOf(s).some(g => picked.has('g:' + g)))
    && (filter === 'all'
      || (filter === 'mine' && state.favourites[s.id])
      || (filter === 'friends' && friendsOf(s).length)
      || (filter === 'shared' && state.favourites[s.id] && friendsOf(s).length));

  const days = [...new Set(lineup.sets.map(dayOf))].sort();
  if (!days.length) { $('lineup').innerHTML = '<p class="muted">This lineup has no sets.</p>'; return; }
  if (!days.includes(currentDay)) currentDay = days[0];
  $('days').innerHTML = days.map(d =>
    `<button data-day="${esc(d)}" aria-pressed="${d === currentDay}">${esc(dayLabel(d))}</button>`).join('');

  // Timetable: one grid row per 5 minutes (row 1 = stage headers), column 1 = times, then one column per stage.
  const daySets = lineup.sets.filter(s => dayOf(s) === currentDay);
  const stages = [...new Set(daySets.map(s => s.stage))]; // order of first appearance in the JSON
  const offset = offsetMinutes(daySets[0].start);
  const HALF_HOUR = 1800000;
  const t0 = Math.floor(Math.min(...daySets.map(s => Date.parse(s.start))) / HALF_HOUR) * HALF_HOUR;
  const tEnd = Math.max(...daySets.map(s => Date.parse(s.end)));
  const row = ms => Math.round((ms - t0) / 300000) + 2;

  let html = `<div class="grid" style="grid-template-columns: 44px repeat(${stages.length}, minmax(0, 1fr))">`;
  const colour = stageColours(lineup);
  html += stages.map((st, i) => `<div class="stage" style="grid-column:${i + 2}; --stage:${colour[st]}">${esc(st)}</div>`).join('');
  for (let t = t0; t < tEnd; t += HALF_HOUR) {
    html += `<div class="tick" style="grid-row:${row(t)} / span 6">${localTime(t, offset)}</div>`;
  }
  for (const s of daySets) {
    const lvl = state.favourites[s.id] || 0;
    const search = encodeURIComponent(s.artist);
    // Links from lineup.artists; only http(s) so a bad data file can't inject javascript: links.
    let links = Object.fromEntries(Object.entries(artistLinks(lineup, s.artist)).filter(([, u]) => /^https?:\/\//i.test(u)));
    if (!Object.keys(links).length) links = { spotify: 'https://open.spotify.com/search/' + search, soundcloud: 'https://soundcloud.com/search?q=' + search };
    html += `<div class="set${lvl ? ' fav' : ''}${matches(s) ? '' : ' dim'}"
        style="--stage:${colour[s.stage]}; grid-column:${stages.indexOf(s.stage) + 2}; grid-row:${row(Date.parse(s.start))} / ${row(Date.parse(s.end))}">
      <button class="star" data-id="${esc(s.id)}" aria-label="Favourite level ${lvl} of 2 for ${esc(s.artist)}">${STARS[lvl]}</button>
      <div class="artist">${esc(s.artist)}</div>
      <div class="meta">${timeOf(s.start)}–${timeOf(s.end)}${s.genres?.length ? ' · ' + s.genres.map(esc).join(', ') : ''}</div>
      ${clash[s.id] ? `<div class="clash">⚠ ${clash[s.id].map(id => esc(byId[id].artist)).join(', ')}</div>` : ''}
      <div>${(lvl ? [state] : []).concat(friendsOf(s)).map(p => person(p, p.favourites[s.id])).join('')}</div>
      <div class="links">${Object.entries(links).map(([site, url]) =>
        `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(LINK_LABELS[site] || site)}</a>`).join(' ')}</div>
    </div>`;
  }
  $('lineup').innerHTML = html + '</div>';

  $('friends').innerHTML = `<span class="chip">${person(state)} ${esc(state.name || 'You')}</span>` +
    state.friends.map((f, i) => `<span class="chip">${person(f)} ${esc(f.name)}<button data-remove="${i}" aria-label="Remove ${esc(f.name)}">✕</button></span>`).join('');
}

async function readFiles(input, fn) {
  for (const file of input.files) {
    try { fn(parseList(await file.text(), lineup)); }
    catch (e) { alert(`${file.name}: ${e.message}`); }
  }
  input.value = '';
  save(); render();
}

async function init() {
  lineup = await loadLineup();
  if (!lineup) return;
  state = loadState(lineup);
  $('letsgo').href = 'now.html' + location.search;
  $('title').textContent = lineup.event;
  $('notice').textContent = lineup.notice || '';
  $('name').value = state.name;

  $('name').oninput = e => { state.name = e.target.value; save(); render(); };
  $('filter').onchange = render;

  $('lineup').onclick = e => {
    const id = e.target.dataset?.id;
    if (!id) return;
    const next = ((state.favourites[id] || 0) + 1) % 3;
    if (next) state.favourites[id] = next; else delete state.favourites[id];
    save(); render();
  };
  $('days').onclick = e => {
    if (!e.target.dataset?.day) return;
    currentDay = e.target.dataset.day;
    render();
  };
  const searchSelect = $('search-select');
  const group = (label, prefix, values) => `<optgroup label="${label}">` +
    [...new Set(values)].sort((a, b) => a.localeCompare(b)).map(v => `<option value="${esc(prefix + v)}">${esc(v)}</option>`).join('') + '</optgroup>';
  searchSelect.innerHTML = group('Artists', 'a:', lineup.sets.map(s => s.artist)) + group('Genres', 'g:', lineup.sets.flatMap(genresOf));
  // Both paths read the native <select>, which Tom Select keeps in sync.
  const syncSearch = () => {
    picked.clear();
    for (const o of searchSelect.selectedOptions) picked.add(o.value);
    render();
  };
  if (window.TomSelect) new TomSelect(searchSelect, { plugins: ['remove_button'], maxOptions: null, onChange: syncSearch });
  else searchSelect.onchange = syncSearch;
  $('friends').onclick = e => {
    const i = e.target.dataset?.remove;
    if (i === undefined) return;
    state.friends.splice(+i, 1);
    save(); render();
  };

  const fileBase = () => `${lineup.id}-${(state.name || 'me').replace(/\W+/g, '-').toLowerCase()}`;
  $('export-json').onclick = () => download(fileBase() + '.json',
    JSON.stringify({ event: lineup.id, name: state.name || 'Me', favourites: state.favourites }, null, 2), 'application/json');
  $('clear-all').onclick = () => {
    if (!confirm('Delete your picks, name and all imported friends for this lineup? Export JSON first if you want a backup.')) return;
    clearState(lineup);
    location.reload(); // simplest way to reset every control (filters, Tom Select, inputs)
  };
  $('export-ics').onclick = () => {
    if (!Object.keys(state.favourites).length) return alert('Star some sets first.');
    download(fileBase() + '.ics', toICS(lineup, state.favourites), 'text/calendar');
  };
  $('import-mine').onchange = e => readFiles(e.target, list => {
    if (Object.keys(state.favourites).length && !confirm('Replace your current picks with this file?')) return;
    state.favourites = list.favourites;
    state.name ||= list.name;
    $('name').value = state.name;
  });
  $('import-friend').onchange = e => readFiles(e.target, list => {
    // Re-importing the same friend's name replaces their old list.
    const old = state.friends.find(f => f.name === list.name);
    state.friends = state.friends.filter(f => f !== old);
    list.colour = old?.colour || pickColour(usedColours()); // re-import keeps their colour
    state.friends.push(list);
  });

  render();
}

init().catch(e => {
  console.error('[line-us-up] page failed after loading', e);
  $('lineup').innerHTML = `<p class="clash">Something broke while drawing the lineup: ${esc(e.message)} (see console)</p>`;
});
