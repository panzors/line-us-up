// "Create Spotify playlist": logs in with Spotify (PKCE, no backend), takes 2 top search hits per starred artist, makes a private playlist.
// Setup: create an app at https://developer.spotify.com/dashboard (Web API), add the redirect URIs below, paste its Client ID here.
// Dev-mode Spotify apps only work for users added under Settings → User Management (max 5).
import { pickTracks, artistLinks } from './lib.js';

const CLIENT_ID = ''; // public by design (PKCE has no secret), safe to commit
// Register exactly these in the dashboard, e.g. https://<you>.github.io/line-us-up/ and http://127.0.0.1:8000/
const REDIRECT = location.origin + location.pathname.replace(/index\.html$/, '');
const API = 'https://api.spotify.com/v1';
const KEY = 'line-us-up:spotify';

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const session = { get: () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; } },
  set: v => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch {} } };

// Coming back from Spotify: Spotify only redirects to the bare REDIRECT, so put back the ?lineup=… we had before leaving.
// This runs at import time, so app.js must import this file before shared.js (which reads location.search on import).
const back = new URLSearchParams(location.search);
let returned = null;
if (back.has('code') || back.has('error')) {
  const saved = session.get();
  returned = { code: back.get('code'), ok: back.get('state') && back.get('state') === saved.state };
  history.replaceState(null, '', location.pathname + (saved.search || ''));
}
export const spotifyReturned = () => !!returned;

async function login() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  session.set({ verifier, state, search: location.search });
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
    client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT, scope: 'playlist-modify-private',
    code_challenge_method: 'S256', code_challenge: challenge, state });
}

// shortcut: no refresh token, so after an hour the user just clicks Agree again; add refresh if people make many playlists.
async function token() {
  const s = session.get();
  if (s.token && s.expires > Date.now()) return s.token;
  if (!returned?.code || !returned.ok) return null;
  const { code } = returned;
  returned = null; // a code works once
  const res = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', body: new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: CLIENT_ID, code_verifier: s.verifier }) });
  if (!res.ok) throw new Error(`Spotify login failed (${res.status})`);
  const t = await res.json();
  session.set({ token: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000 });
  return t.access_token;
}

async function api(tok, path, body) {
  const res = await fetch(API + path, { method: body ? 'POST' : 'GET', body: body && JSON.stringify(body),
    headers: { Authorization: 'Bearer ' + tok, ...(body && { 'Content-Type': 'application/json' }) } });
  if (res.status === 403) throw new Error("Spotify refused (403). This app is in Spotify's development mode, so your Spotify account's email has to be added to the app's user list by the site owner.");
  if (!res.ok) throw new Error(`Spotify error ${res.status} on ${path.split('?')[0]}`);
  return res.json();
}

export async function spotifyPlaylist(lineup, state, button) {
  if (!CLIENT_ID) return alert('Spotify isn\'t set up on this site yet (no Client ID in spotify.js).');
  // Must-sees first, then the rest; one entry per artist even if they play twice.
  const artists = [...new Set(lineup.sets.filter(s => state.favourites[s.id])
    .sort((a, b) => state.favourites[b.id] - state.favourites[a.id]).map(s => s.artist))];
  if (!artists.length) return alert('Star some artists first.');
  const tok = await token();
  if (!tok) return login(); // page leaves; app.js calls us again when Spotify sends the user back

  const label = button.textContent;
  button.disabled = true;
  try {
    const uris = [], missing = [];
    for (const [i, artist] of artists.entries()) {
      button.textContent = `Finding songs ${i + 1}/${artists.length}…`;
      const id = artistLinks(lineup, artist).spotify?.match(/artist\/(\w+)/)?.[1];
      const res = await api(tok, '/search?' + new URLSearchParams({ q: `artist:"${artist}"`, type: 'track', limit: 10, market: 'from_token' }));
      const found = pickTracks(res.tracks.items, artist, id);
      if (found.length) uris.push(...found); else missing.push(artist);
    }
    if (!uris.length) return alert("Couldn't find songs for any of your picks on Spotify.");
    const list = await api(tok, '/me/playlists', { name: `${lineup.event} · ${state.name || 'my picks'}`, public: false,
      description: 'Two songs from each artist I starred, made with Line Us Up' });
    for (let i = 0; i < uris.length; i += 100) await api(tok, `/playlists/${list.id}/items`, { uris: uris.slice(i, i + 100) });
    const msg = `Made "${list.name}" with ${uris.length} songs.` + (missing.length ? `\n\nNo songs found for: ${missing.join(', ')}` : '');
    if (confirm(msg + '\n\nOpen it in Spotify?')) location.href = list.external_urls.spotify;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}
