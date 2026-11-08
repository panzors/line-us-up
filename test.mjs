// Run: node test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clashes, toICS, parseList, dayOf, offsetMinutes, localTime, setKey, withKeys, pickColour, RANGER_COLOURS, agenda, countdown, artistLinks, timeline, nowOffset, festivalDay, parseTestNow } from './lib.js';

const used = RANGER_COLOURS.slice(0, 6);
assert.equal(pickColour(used), RANGER_COLOURS[6]); // only unused colour
assert.equal(pickColour([...RANGER_COLOURS, RANGER_COLOURS[0]], () => 0), RANGER_COLOURS[1]); // all used once → skip the doubled one

assert.equal(setKey({ stage: 'Main Stage', start: '2026-12-19T17:00:00+07:00' }), 'MS-2026-12-19T17:00');
assert.equal(setKey({ stage: 'kineticFIELD', start: '2026-12-19T17:00:00+07:00' }), 'K-2026-12-19T17:00');
assert.throws(() => withKeys({ sets: [
  { artist: 'X', stage: 'Main Stage', start: '2026-12-19T17:00:00+07:00' },
  { artist: 'Y', stage: 'Mega Stage', start: '2026-12-19T17:00:00+07:00' },
] }), /both get key MS-2026-12-19T17:00/);

assert.equal(offsetMinutes('2026-12-19T17:00:00+07:00'), 420);
assert.equal(offsetMinutes('2026-12-19T17:00:00-03:30'), -210);
assert.equal(offsetMinutes('2026-12-19T17:00:00Z'), 0);
assert.equal(localTime(Date.parse('2026-12-19T17:00:00+07:00'), 420), '17:00');

const lineup = withKeys(JSON.parse(readFileSync('lineups/edc-thailand-2026-jan.json', 'utf8'))); // also proves lineup keys are unique
const sets = [
  { id: 'a', artist: 'A, B', stage: 'S1', start: '2026-12-19T20:00:00+07:00', end: '2026-12-19T21:00:00+07:00' },
  { id: 'b', artist: 'B', stage: 'S2', start: '2026-12-19T20:30:00+07:00', end: '2026-12-19T21:30:00+07:00' },
  { id: 'c', artist: 'C', stage: 'S1', start: '2026-12-19T21:00:00+07:00', end: '2026-12-19T22:00:00+07:00' },
];

const at = iso => Date.parse(iso);
const ag = agenda(sets, { a: 1, b: 1, c: 1 }, at('2026-12-19T20:15:00+07:00'));
assert.deepEqual([ag.playing, ag.next, ag.later].map(l => l.map(s => s.id)), [['a'], ['b'], ['c']]);
const ag2 = agenda(sets, { a: 1, c: 1 }, at('2026-12-19T22:00:00+07:00')); // end is exclusive
assert.deepEqual([ag2.playing, ag2.next, ag2.later].map(l => l.length), [0, 0, 0]);
const clashSets = [sets[0], { ...sets[1], id: 'd', start: sets[0].start }];
assert.equal(agenda(clashSets, { a: 1, d: 1 }, at('2026-12-19T19:00:00+07:00')).next.length, 2);
// timeline: a,b,c chain-overlap → one cluster (20:00–22:00); e after a 2h break → capped gap
const e = { id: 'e', artist: 'E', stage: 'S1', start: '2026-12-20T00:00:00+07:00', end: '2026-12-20T01:00:00+07:00' };
const tl = timeline([...sets, e]);
assert.deepEqual(tl.map(s => s.gap ? 'gap' : s.sets.map(x => x.id).join('+')), ['a+b+c', 'gap', 'e']);
assert.deepEqual(tl.map(s => s.px), [300, 160, 150]); // 120m, capped 2h gap, 60m at 2.5px/min
assert.deepEqual(timeline([sets[0], sets[2]]).map(s => s.gap ? 'gap' : s.sets.length), [1, 1]); // back-to-back: no gap
assert.equal(nowOffset(tl, at('2026-12-19T20:45:00+07:00')), 112.5);
assert.equal(nowOffset(tl, at('2026-12-19T23:00:00+07:00')), 300 + 80); // halfway through the gap
assert.equal(nowOffset(tl, at('2026-12-19T19:00:00+07:00')), null);
assert.equal(nowOffset(tl, at('2026-12-20T01:00:00+07:00')), null);

const days = [
  { stage: 'S', day: '2026-12-19', start: '2026-12-19T16:00:00+07:00', end: '2026-12-20T01:00:00+07:00' },
  { stage: 'S', day: '2026-12-20', start: '2026-12-20T16:00:00+07:00', end: '2026-12-20T23:00:00+07:00' },
];
assert.equal(festivalDay(days, at('2026-12-19T10:00:00+07:00')), '2026-12-19'); // morning before gates
assert.equal(festivalDay(days, at('2026-12-20T00:30:00+07:00')), '2026-12-19'); // after midnight, still night 1
assert.equal(festivalDay(days, at('2026-12-20T03:00:00+07:00')), '2026-12-20'); // night 1 over → day 2
assert.equal(festivalDay(days, at('2026-12-18T20:00:00+07:00')), null);
assert.equal(festivalDay(days, at('2026-12-21T02:00:00+07:00')), null);

const T = Date.parse('2026-01-16T19:00:00+07:00');
assert.equal(parseTestNow('2026-01-16T19:00', 420), T);                 // no zone → festival time
assert.equal(parseTestNow('2026-01-16T19:00:00+07:00', 0), T);
assert.equal(parseTestNow('2026-01-16T19:00:00 07:00', 0), T);          // "+" decoded as space
assert.equal(parseTestNow('2026-01-16T12:00:00Z', 420), T);
assert.equal(parseTestNow('2026-01-16T09:00', -600), Date.parse('2026-01-16T09:00:00-10:00')); // negative offset formatting
for (const bad of ['', 'tomorrow', '2026-01-16', '2026-01-16T19:00,2026-01-17T19:00', '2026-01-16T19:00&now=x']) {
  assert.ok(Number.isNaN(parseTestNow(bad, 420)), bad);
}

assert.equal(countdown(90 * 60000), '1h 30m');
assert.equal(countdown(59.5 * 60000), '1h 0m');
assert.equal(countdown(26 * 3600000), '1d 2h');
assert.equal(countdown(-5), '0m');

// back-to-back sets don't clash; overlapping ones do
assert.deepEqual(clashes(sets, { a: 1, b: 2, c: 1 }), { a: ['b'], b: ['a', 'c'], c: ['b'] });
assert.deepEqual(clashes(sets, { a: 1, c: 1 }), {});

const ics = toICS({ id: 'x', event: 'Fest', sets }, { a: 2 });
assert.match(ics, /DTSTART:20261219T130000Z\r\n/); // +07:00 converted to UTC
assert.match(ics, /SUMMARY:★ A\\, B\r\n/);
assert.equal(ics.match(/BEGIN:VEVENT/g).length, 1);

const list = parseList(JSON.stringify({ event: lineup.id, name: 'Sam', favourites: { 'KF-2026-01-16T15:00': 2, bogus: 1, 'KF-2026-01-16T16:15': 9 } }), lineup);
assert.deepEqual(list, { name: 'Sam', favourites: { 'KF-2026-01-16T15:00': 2 } });
assert.throws(() => parseList('{"event":"other","favourites":{}}', lineup), /not "edc-thailand-2026"/);

// sample data is well-formed
for (const s of lineup.sets) {
  assert.ok(s.artist && s.stage && dayOf(s), JSON.stringify(s));
  assert.ok(new Date(s.start) < new Date(s.end), s.id);
}
console.log('ok');

// artist links: case/accent-insensitive, B2B sets merge both artists
const al = { artists: { 'Tiësto': { spotify: 'S1' }, 'Adiel': { soundcloud: 'C2' }, 'Afem Syko': { spotify: 'S3', soundcloud: 'C3' } } };
assert.deepEqual(artistLinks(al, 'TIESTO'), { spotify: 'S1' });
assert.deepEqual(artistLinks(al, 'ADIEL B2B AFEM SYKO'), { soundcloud: 'C2', spotify: 'S3' });
assert.deepEqual(artistLinks({}, 'Nobody'), {});
