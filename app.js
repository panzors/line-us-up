// Spotify playlist export is disabled for now (the app owner needs Spotify Premium). To turn it back on, uncomment the 4 "Spotify" lines in app.js and the button in index.html.
// import { spotifyPlaylist, spotifyReturned } from './spotify.js'; // first: it restores ?lineup= after a Spotify login, before shared.js reads it
import { dayOf, timeOf, clashes, toICS, parseList, offsetMinutes, localTime, pickColour, artistLinks } from './lib.js';
import { esc, $, dayLabel, stageColours, loadLineup, loadState, saveState, clearState, usedColours as used, person as icon } from './shared.js';

const STARS = ['☆', '★', '🌟']; // none, want to see, SUPERMUSTSEE
const LINK_LABELS = { spotify: 'Spotify', soundcloud: 'SoundCloud', instagram: 'Instagram', facebook: 'Facebook', twitter: 'X', x: 'X', website: 'Website' };
// site -> [icon URL, colour]; sites not listed fall back to a text label.
const si = slug => `https://cdn.jsdelivr.net/npm/simple-icons@13.0.0/icons/${slug}.svg`;
// simple-icons has no generic globe, so "website" uses an inline one (encoded: it sits in an unquoted CSS url()).
const GLOBE = 'data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><circle cx='12' cy='12' r='10'/><ellipse cx='12' cy='12' rx='4' ry='10'/><path d='M2 12h20'/></svg>").replace(/'/g, '%27');
const LOGOS = { spotify: [si('spotify'), '#1DB954'], soundcloud: [si('soundcloud'), '#FF5500'], instagram: [si('instagram'), '#E4405F'], facebook: [si('facebook'), '#0866FF'], twitter: [si('x'), 'var(--fg)'], x: [si('x'), 'var(--fg)'], website: [GLOBE, 'var(--cyan)'] };
const linkHTML = (site, url) => {
  const label = esc(LINK_LABELS[site] || site), logo = LOGOS[site];
  return logo
    ? `<a class="logo" href="${esc(url)}" target="_blank" rel="noopener" aria-label="${label}" title="${label}" style="--logo:url(${logo[0]});--brand:${logo[1]}"></a>`
    : `<a href="${esc(url)}" target="_blank" rel="noopener">${label}</a>`;
};

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
  // Friends come and go (import/remove), so rebuild their filter options each render, keeping the current pick if it still exists.
  const sel = $('filter'), prev = sel.value;
  sel.querySelector('optgroup')?.remove();
  if (state.friends.length) sel.insertAdjacentHTML('beforeend', '<optgroup label="Friends">' +
    state.friends.map(f => `<option value="${esc('f:' + f.name)}">${esc(f.name)}'s picks</option>`).join('') + '</optgroup>');
  sel.value = prev;
  if (!sel.value) sel.value = 'all';
  const filter = sel.value;
  const onlyFriend = filter.startsWith('f:') && state.friends.find(f => 'f:' + f.name === filter);
  const clash = clashes(lineup.sets, state.favourites);
  const byId = Object.fromEntries(lineup.sets.map(s => [s.id, s]));
  const friendsOf = s => state.friends.filter(f => f.favourites[s.id]);

  // OR across everything picked in the search box: any picked genre, or the picked artist.
  const matches = s => (!picked.size || picked.has('a:' + s.artist) || genresOf(s).some(g => picked.has('g:' + g)))
    && (filter === 'all'
      || (filter === 'mine' && state.favourites[s.id])
      || (filter === 'friends' && friendsOf(s).length)
      || (filter === 'shared' && state.favourites[s.id] && friendsOf(s).length)
      || (onlyFriend && onlyFriend.favourites[s.id]));

  const days = [...new Set(lineup.sets.map(dayOf))].sort();
  if (!days.length) { $('lineup').innerHTML = '<p class="muted">This lineup has no sets.</p>'; return; }
  if (!days.includes(currentDay)) currentDay = days[0];
  $('days').innerHTML = days.map(d =>
    `<button data-day="${esc(d)}" aria-pressed="${d === currentDay}">${esc(dayLabel(d))}</button>`).join('');

  // Timetable: one grid row per 5 minutes (row 1 = stage headers), column 1 = times, then one column per stage.
  // Artists without set times yet (just `artist` + `day`) are listed under the grid instead.
  const daySets = lineup.sets.filter(s => dayOf(s) === currentDay);
  const timed = daySets.filter(s => s.start), tba = daySets.filter(s => !s.start);
  const colour = stageColours(lineup);
  const card = (s, style) => {
    const lvl = state.favourites[s.id] || 0;
    const search = encodeURIComponent(s.artist);
    // Links from lineup.artists; only http(s) so a bad data file can't inject javascript: links.
    let links = Object.fromEntries(Object.entries(artistLinks(lineup, s.artist)).filter(([, u]) => /^https?:\/\//i.test(u)));
    if (!Object.keys(links).length) links = { spotify: 'https://open.spotify.com/search/' + search, soundcloud: 'https://soundcloud.com/search?q=' + search };
    return `<div class="set${lvl ? ' fav' : ''}${matches(s) ? '' : ' dim'}" style="${style}">
      <button class="star" data-id="${esc(s.id)}" aria-label="Favourite level ${lvl} of 2 for ${esc(s.artist)}">${STARS[lvl]}</button>
      <div class="artist">${esc(s.artist)}</div>
      <div class="meta">${s.start ? `${timeOf(s.start)}–${timeOf(s.end)}` : 'Time TBA'}${s.genres?.length ? ' · ' + s.genres.map(esc).join(', ') : ''}</div>
      ${clash[s.id] ? `<div class="clash">⚠ ${clash[s.id].map(id => esc(byId[id].artist)).join(', ')}</div>` : ''}
      <div>${(lvl ? [state] : []).concat(friendsOf(s)).map(p => person(p, p.favourites[s.id])).join('')}</div>
      <div class="links">${Object.entries(links).map(([site, url]) => linkHTML(site, url)).join(' ')}</div>
    </div>`;
  };

  let html = '';
  if (timed.length) {
    const stages = [...new Set(timed.map(s => s.stage))]; // order of first appearance in the JSON
    const offset = offsetMinutes(timed[0].start);
    const HALF_HOUR = 1800000;
    const t0 = Math.floor(Math.min(...timed.map(s => Date.parse(s.start))) / HALF_HOUR) * HALF_HOUR;
    const tEnd = Math.max(...timed.map(s => Date.parse(s.end)));
    const row = ms => Math.round((ms - t0) / 300000) + 2;
    html += `<div class="grid" style="grid-template-columns: 44px repeat(${stages.length}, minmax(0, 1fr))">`;
    html += stages.map((st, i) => `<div class="stage" style="grid-column:${i + 2}; --stage:${colour[st]}">${esc(st)}</div>`).join('');
    for (let t = t0; t < tEnd; t += HALF_HOUR) {
      html += `<div class="tick" style="grid-row:${row(t)} / span 6">${localTime(t, offset)}</div>`;
    }
    html += timed.map(s => card(s, `--stage:${colour[s.stage]}; grid-column:${stages.indexOf(s.stage) + 2}; grid-row:${row(Date.parse(s.start))} / ${row(Date.parse(s.end))}`)).join('') + '</div>';
  }
  if (tba.length) {
    html += `<h2 class="tba marquee"><span>Set times TBA</span></h2><div class="tba-list">` +
      [...tba].sort((a, b) => a.artist.localeCompare(b.artist)).map(s => card(s, '')).join('') + '</div>';
  }
  $('lineup').innerHTML = html;

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
  $('print').href = 'print.html' + location.search;
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
  // Both paths read the native <select>, which Tom Select keeps in sync. Picks show as chips in their own row (#picks), not in the box.
  const syncSearch = () => {
    picked.clear();
    for (const o of searchSelect.selectedOptions) picked.add(o.value);
    $('picks').innerHTML = [...searchSelect.selectedOptions].map(o =>
      `<button class="pick${o.value.startsWith('g:') ? ' genre' : ''}" data-value="${esc(o.value)}" aria-label="Remove ${esc(o.textContent)}">${esc(o.textContent)} ✕</button>`).join('');
    render();
  };
  const ts = window.TomSelect && new TomSelect(searchSelect, { maxOptions: null, hidePlaceholder: false, onChange: syncSearch });
  if (!ts) searchSelect.onchange = syncSearch;
  $('picks').onclick = e => {
    const v = e.target.dataset?.value;
    if (v === undefined) return;
    if (ts) ts.removeItem(v); // fires onChange → syncSearch
    else { [...searchSelect.options].find(o => o.value === v).selected = false; syncSearch(); }
  };
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
    if (!lineup.sets.some(s => s.start && state.favourites[s.id])) return alert("None of your picks have set times yet, so there's nothing to add to a calendar.");
    download(fileBase() + '.ics', toICS(lineup, state.favourites), 'text/calendar');
  };
  // const spotifyError = e => { console.error('[line-us-up] spotify', e); alert(e.message); };
  // $('export-spotify').onclick = e => spotifyPlaylist(lineup, state, e.target).catch(spotifyError);
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
  // if (spotifyReturned()) spotifyPlaylist(lineup, state, $('export-spotify')).catch(spotifyError); // back from Spotify login: finish the job
}

// First visit only: one site-wide flag, not per lineup. If storage is blocked it just shows every visit.
try {
  if (!localStorage.getItem('line-us-up:welcomed')) {
    $('welcome').addEventListener('close', () => { try { localStorage.setItem('line-us-up:welcomed', '1'); } catch {} });
    $('welcome').showModal();
  }
} catch { $('welcome').showModal(); }

init().catch(e => {
  console.error('[line-us-up] page failed after loading', e);
  $('lineup').innerHTML = `<p class="clash">Something broke while drawing the lineup: ${esc(e.message)} (see console)</p>`;
});
