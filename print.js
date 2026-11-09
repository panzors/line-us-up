import { dayOf, timeOf, clashes } from './lib.js';
import { esc, $, dayLabel, loadLineup, loadState } from './shared.js';

function render(lineup, state) {
  const clash = clashes(lineup.sets, state.favourites);
  const me = state.name || 'You';
  const who = s => [state.favourites[s.id] ? me + (state.favourites[s.id] === 2 ? ' ★★' : '') : '',
    ...state.friends.filter(f => f.favourites[s.id]).map(f => f.name + (f.favourites[s.id] === 2 ? ' ★★' : ''))].filter(Boolean);
  // Timed sets by start, then TBA sets alphabetically at the end of each day.
  const sets = lineup.sets.filter(s => who(s).length) // only sets you or a friend picked
    .sort((a, b) => (a.start || '~').localeCompare(b.start || '~') || a.artist.localeCompare(b.artist));
  const days = [...new Set(lineup.sets.map(dayOf))].sort();

  $('lineup').innerHTML = days.map(d => {
    const rows = sets.filter(s => dayOf(s) === d);
    if (!rows.length) return '';
    return `<section><h2>${esc(dayLabel(d))}</h2><table>
      <thead><tr><th>Time</th><th>Stage</th><th>Artist</th><th>Going</th></tr></thead><tbody>` +
      rows.map(s => `<tr${state.favourites[s.id] ? ' class="fav"' : ''}>
        <td class="time">${s.start ? `${timeOf(s.start)}–${timeOf(s.end)}` : 'TBA'}</td>
        <td>${esc(s.stage || '')}</td>
        <td class="artist">${esc(s.artist)}${clash[s.id] ? ' ⚠' : ''}</td>
        <td>${who(s).map(esc).join(', ')}</td></tr>`).join('') +
      '</tbody></table></section>';
  }).join('') || '<p class="muted">Nothing picked yet. Star some sets or add a friend\'s list on the lineup page.</p>';
}

const lineup = await loadLineup();
if (lineup) {
  const state = loadState(lineup);
  $('title').textContent = lineup.event;
  document.title = lineup.event + ' (printable)';
  $('back').href = 'index.html' + location.search;
  render(lineup, state);
}
