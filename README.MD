# Project goals
Standalone app that allows anyone to generate and compare sets that they want to see with their friends.

## Features
- [x] Supports EDC 2026 Thailand first
- [x] Allows you to 'favourite' the sets that you'd like to see
- [x] Exports to JSON
- [x] Imports your own list sharing across devices
- [x] Exports as a google calendar invite so you can add it to your phone 
- [x] Imports other people's lists for diffing
- [x] (optional) Notes clashes
- [x] (optional) SUPERMUSTSEE
- [x] (optional) Searches spotify or soundcloud who they are and how to sample it.
- [ ] (optional) Extract possible genre of this artist so you can search and filter (search already matches `genres` if the lineup JSON has them)
- [ ] "Now" mode which shows you what artist you should be at now and next

## Tech stack
### Hosting 
- Github pages
- Phone support and local browser storage

### Technology
- Html css/javascript


## How this works
- Using the JSON schema below, transform a setlist or table into this format so you can then later export it again.
- Uploading the lineup should be a matter of pointing to the correct json file

## Notes from owner
Data is not guarenteed to stay up to date because I have to upload it. Fork this project if you want to set something up for your own. I'll try and make it easy for you to pick up with your own AI.

## Running locally
`fetch` needs a web server, so opening the file directly won't work:
```
python -m http.server 8000   # then open http://localhost:8000
node test.mjs                # tests
```
On GitHub Pages: Settings → Pages → deploy from the `main` branch root.

**Let's go** (`now.html`): at the festival, shows what you're watching now, where to head next (with a countdown) and the rest of your picks, using your phone's clock.
Test it with a frozen clock: `now.html?now=2026-12-19T18:00` (festival time; add `Z` or `+07:00` for an explicit zone). Anything that isn't a single datetime is ignored.

To use a different lineup: `?lineup=lineups/your-file.json`

## Lineup schema (`lineups/*.json`)
```json
{
  "id": "edc-thailand-2026",              // unique; personal lists and localStorage are tied to it
  "event": "EDC Thailand 2026",
  "notice": "optional banner text",
  "artists": {                            // optional; Spotify/SoundCloud buttons use these instead of a search
    "Artist Name": { "spotify": "https://open.spotify.com/artist/…", "soundcloud": "https://soundcloud.com/…" }
  },
  "sets": [{
    "artist": "Artist Name",
    "stage": "Main Stage",
    "start": "2026-12-19T17:00:00+07:00", // ISO 8601 with the festival's UTC offset
    "end":   "2026-12-19T18:30:00+07:00",
    "day":   "2026-12-19",                // optional; set it for after-midnight sets so they stay under the right night
    "genres": ["house"]                   // optional
  }]
}
```
Each set's saved key is built from the stage initials + local start time, e.g. `Main Stage` at 17:00 → `MS-2026-12-19T17:00`.
The app refuses to load a lineup where two sets get the same key (e.g. "Main Stage" and "Mega Stage" at the same time): rename a stage.
Changing a set's stage name or start time changes its key, so people's saved picks for that set are lost.

`lineups/edc-thailand-2026-jan.json` holds set times scraped various locations.

## Personal list schema (what Export JSON writes)
```json
{ "event": "edc-thailand-2026", "name": "Sam", "favourites": { "MS-2026-12-19T17:00": 1, "SS-2026-12-19T20:00": 2 } }
```
`1` = want to see, `2` = SUPERMUSTSEE. Tap the star to cycle ☆ → ★ → 🌟 → ☆.
