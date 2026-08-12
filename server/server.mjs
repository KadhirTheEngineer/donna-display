import 'dotenv/config';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';

const port = Number(process.env.PORT || 4173);
const root = new URL('../', import.meta.url).pathname;
const tokenPath = join(root, '.data', 'oauth.json');
const baseUrl = `http://localhost:${port}`;
const states = new Map();

function callbackUrl(provider) {
  if (provider === 'spotify') return process.env.SPOTIFY_REDIRECT_URI || `http://127.0.0.1:${port}/auth/spotify/callback`;
  return process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/auth/google/callback`;
}

const demoEvents = () => {
  const now = new Date();
  const at = (dayOffset, hour, minute = 0) => { const d = new Date(now); d.setDate(d.getDate() + dayOffset); d.setHours(hour, minute, 0, 0); return d.toISOString(); };
  return [
    { id: 'demo-1', title: 'Morning focus', start: at(0, 9), end: at(0, 11) },
    { id: 'demo-2', title: 'Project check-in', start: at(0, 13, 30), end: at(0, 14) },
    { id: 'demo-3', title: 'Gym', start: at(0, 18), end: at(0, 19) },
    { id: 'demo-4', title: 'Plan tomorrow', start: at(0, 21), end: at(0, 21, 30) }
  ];
};
const demoTasks = () => [
  { id: 'demo-t1', title: 'Reply to messages', due: new Date().toISOString() },
  { id: 'demo-t2', title: 'Pick up groceries' },
  { id: 'demo-t3', title: 'Review weekly plan' }
];

async function readTokens() { try { return JSON.parse(await readFile(tokenPath, 'utf8')); } catch { return {}; } }
async function saveTokens(tokens) { await mkdir(join(root, '.data'), { recursive: true }); await writeFile(tokenPath, JSON.stringify(tokens, null, 2), { mode: 0o600 }); }
async function token(provider) {
  const all = await readTokens(); const value = all[provider];
  if (!value) return null;
  if (value.expires_at > Date.now() + 60_000) return value.access_token;
  const config = providerConfig(provider);
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: value.refresh_token, client_id: config.clientId });
  if (config.clientSecret) params.set('client_secret', config.clientSecret);
  const response = await fetch(config.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params });
  if (!response.ok) return null;
  const fresh = await response.json();
  all[provider] = { ...value, ...fresh, expires_at: Date.now() + fresh.expires_in * 1000 };
  await saveTokens(all); return fresh.access_token;
}

function providerConfig(provider) {
  if (provider === 'google') return {
    clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks.readonly',
    extra: { access_type: 'offline', prompt: 'consent' }
  };
  return {
    clientId: process.env.SPOTIFY_CLIENT_ID, clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    authUrl: 'https://accounts.spotify.com/authorize', tokenUrl: 'https://accounts.spotify.com/api/token',
    scopes: 'user-read-currently-playing user-read-playback-state', extra: {}
  };
}

function authDiagnostic(provider) {
  const config = providerConfig(provider);
  const clientId = String(config.clientId || '').trim();
  const clientSecret = String(config.clientSecret || '').trim();
  return {
    provider,
    configured: Boolean(clientId && clientSecret),
    clientIdLooksValid: provider === 'google' ? /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId) : Boolean(clientId),
    clientIdEnding: clientId ? clientId.slice(-28) : null,
    clientSecretConfigured: Boolean(clientSecret),
    redirectUri: callbackUrl(provider)
  };
}

async function oauthStart(provider, res) {
  const config = providerConfig(provider);
  if (!config.clientId || !config.clientSecret) return redirect(res, '/?setup=missing-credentials');
  if (provider === 'google' && !authDiagnostic(provider).clientIdLooksValid) return send(res, 500, { error: 'GOOGLE_CLIENT_ID does not look like a Google OAuth client ID.', diagnostic: authDiagnostic(provider) });
  const state = randomBytes(18).toString('hex'); states.set(state, { provider, expires: Date.now() + 600_000 });
  const params = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: callbackUrl(provider), scope: config.scopes, state, ...config.extra });
  redirect(res, `${config.authUrl}?${params}`);
}
async function oauthCallback(provider, url, res) {
  const state = url.searchParams.get('state'); const pending = states.get(state); states.delete(state);
  if (!pending || pending.provider !== provider || pending.expires < Date.now()) return send(res, 400, { error: 'Invalid or expired OAuth state.' });
  const config = providerConfig(provider);
  const params = new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: callbackUrl(provider), client_id: config.clientId, client_secret: config.clientSecret });
  const response = await fetch(config.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params });
  if (!response.ok) return send(res, 502, { error: `Could not connect ${provider}.`, details: await response.text() });
  const granted = await response.json(); const all = await readTokens();
  all[provider] = { ...granted, expires_at: Date.now() + granted.expires_in * 1000 };
  await saveTokens(all); redirect(res, '/');
}

async function weather() {
  const latitude = process.env.LATITUDE || '30.2672', longitude = process.env.LONGITUDE || '-97.7431';
  const params = new URLSearchParams({ latitude, longitude, current: 'temperature_2m,weather_code', daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,wind_speed_10m_max,wind_direction_10m_dominant', temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', timezone: process.env.TIMEZONE || 'auto', forecast_days: '1' });
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`); if (!response.ok) throw new Error();
    const value = await response.json(); const d = value.daily;
    return { location: process.env.WEATHER_LOCATION || 'Austin', condition: weatherName(value.current.weather_code), temperature: value.current.temperature_2m, high: d.temperature_2m_max[0], low: d.temperature_2m_min[0], precipitation: d.precipitation_probability_max[0], uv: d.uv_index_max[0], wind: d.wind_speed_10m_max[0], windDirection: compass(d.wind_direction_10m_dominant[0]) };
  } catch { return { location: 'Weather offline', condition: 'Clear', temperature: 68, high: 73, low: 58, precipitation: 12, uv: 4, wind: 8, windDirection: 'NW' }; }
}
function weatherName(code) { if (code === 0) return 'Clear'; if (code <= 3) return 'Partly cloudy'; if (code <= 48) return 'Fog'; if (code <= 57) return 'Drizzle'; if (code <= 67) return 'Rain'; if (code <= 77) return 'Snow'; if (code <= 82) return 'Rain showers'; if (code <= 86) return 'Snow showers'; return 'Thunderstorms'; }
function compass(degrees) { return ['N','NE','E','SE','S','SW','W','NW'][Math.round(degrees / 45) % 8]; }

async function googleData(accessToken) {
  if (!accessToken) return { events: demoEvents(), tasks: demoTasks() };
  const now = new Date(), end = new Date(now); end.setDate(end.getDate() + 7);
  const eventParams = new URLSearchParams({ timeMin: now.toISOString(), timeMax: end.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '8' });
  const headers = { Authorization: `Bearer ${accessToken}` };
  const [eventsResponse, listsResponse] = await Promise.all([
    fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${eventParams}`, { headers }),
    fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=10', { headers })
  ]);
  if (!eventsResponse.ok || !listsResponse.ok) throw new Error('Google sync failed');
  const eventJson = await eventsResponse.json(), listJson = await listsResponse.json();
  const taskResponses = await Promise.all((listJson.items || []).map(list => fetch(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?showCompleted=false&showHidden=false&maxResults=20`, { headers })));
  const taskGroups = await Promise.all(taskResponses.filter(r => r.ok).map(r => r.json()));
  return {
    events: (eventJson.items || []).map(e => ({ id: e.id, title: e.summary || 'Untitled', start: e.start.dateTime || `${e.start.date}T00:00:00`, end: e.end.dateTime || `${e.end.date}T00:00:00`, allDay: Boolean(e.start.date) })),
    tasks: taskGroups.flatMap(g => g.items || []).filter(t => t.status !== 'completed').slice(0, 6).map(t => ({ id: t.id, title: t.title, due: t.due }))
  };
}
async function spotifyData(accessToken, propagateRateLimit = false) {
  const fallback = { connected: Boolean(accessToken), isPlaying: true, title: 'Dreams', artist: 'Fleetwood Mac', album: 'Rumours', artwork: 'https://i.scdn.co/image/ab67616d0000b273e52a59a28efa4773dd2bfe1b', progressMs: 126000, durationMs: 257000 };
  if (!accessToken) return fallback;
  const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 429 && propagateRateLimit) {
    const error = new Error('Spotify rate limit reached');
    error.retryAfter = response.headers.get('retry-after') || '5';
    throw error;
  }
  if (response.status === 204) return { ...fallback, connected: true, isPlaying: false, title: 'Nothing playing', artist: 'Spotify', artwork: '' };
  if (!response.ok) return fallback;
  const value = await response.json(), item = value.item;
  return { connected: true, isPlaying: value.is_playing, title: item?.name || 'Nothing playing', artist: item?.artists?.map(a => a.name).join(', ') || item?.show?.name || 'Spotify', album: item?.album?.name || '', artwork: item?.album?.images?.[0]?.url || item?.images?.[0]?.url || '', progressMs: value.progress_ms || 0, durationMs: item?.duration_ms || 0 };
}

async function dashboard(res) {
  const [googleToken, spotifyToken] = await Promise.all([token('google'), token('spotify')]);
  const [forecast, google, playback] = await Promise.all([weather(), googleData(googleToken).catch(() => ({ events: demoEvents(), tasks: demoTasks() })), spotifyData(spotifyToken)]);
  send(res, 200, { greeting: process.env.DISPLAY_NAME || greeting(), demo: !googleToken || !spotifyToken, googleConnected: Boolean(googleToken), spotifyConnected: Boolean(spotifyToken), ...google, weather: forecast, playback });
}
async function playback(res) {
  const spotifyToken = await token('spotify');
  try {
    send(res, 200, await spotifyData(spotifyToken, true));
  } catch (error) {
    if (error.retryAfter) {
      res.writeHead(429, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': error.retryAfter });
      return res.end(JSON.stringify({ error: 'Spotify rate limit reached.' }));
    }
    throw error;
  }
}
function greeting() { const hour = new Date().getHours(); return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'; }
function send(res, status, value) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); }
function redirect(res, location) { res.writeHead(302, { location }); res.end(); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };
function staticFile(pathname, res) {
  const dist = join(root, 'dist'); let file = normalize(join(dist, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(dist)) return send(res, 403, { error: 'Forbidden' });
  if (!existsSync(file)) file = join(dist, 'index.html');
  if (!existsSync(file)) return send(res, 404, { error: 'Run npm run build first.' });
  res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, baseUrl); const parts = url.pathname.split('/').filter(Boolean);
    if (url.pathname === '/api/dashboard') return await dashboard(res);
    if (url.pathname === '/api/playback') return await playback(res);
    if (url.pathname === '/api/auth/google/diagnostic') return send(res, 200, authDiagnostic('google'));
    if (parts[0] === 'auth' && ['google', 'spotify'].includes(parts[1])) return parts[2] === 'callback' ? await oauthCallback(parts[1], url, res) : await oauthStart(parts[1], res);
    return staticFile(url.pathname, res);
  } catch (error) { console.error(error); send(res, 500, { error: 'Unexpected display server error.' }); }
}).listen(port, '0.0.0.0', () => console.log(`Donna Display listening at ${baseUrl}`));
