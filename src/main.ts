import './style.css';

type CalendarEvent = { id: string; title: string; start: string; end?: string; allDay?: boolean };
type Task = { id: string; title: string; due?: string };
type Weather = {
  location: string; condition: string; temperature: number; high: number; low: number;
  precipitation: number; uv: number; wind: number; windDirection: string;
};
type Playback = {
  connected: boolean; isPlaying: boolean; title: string; artist: string;
  album: string; artwork: string; progressMs: number; durationMs: number;
};
type Dashboard = {
  greeting: string; demo: boolean; googleConnected: boolean; spotifyConnected: boolean;
  events: CalendarEvent[]; tasks: Task[]; weather: Weather; playback: Playback;
};

const app = document.querySelector<HTMLElement>('#app')!;
let playbackSnapshot: Playback | null = null;
let playbackReceivedAt = 0;

app.innerHTML = `
  <div class="shell">
    <section class="home-view view active" id="home-view" aria-label="Home display">
      <div class="left-column">
        <section class="clock-block" aria-label="Clock">
          <p class="eyebrow" id="greeting">GOOD EVENING</p>
          <div class="clock"><span id="clock-main">--:--</span><span class="clock-side"><span id="period">--</span><span id="clock-seconds">--</span></span></div>
          <p class="date" id="date">—</p>
        </section>

        <section class="weather-block" aria-label="Today's weather">
          <div class="weather-heading"><span id="weather-icon">○</span><strong id="temperature">--°</strong><div><p id="condition">—</p><span id="range">—</span></div></div>
          <div class="weather-details">
            <span><small>RAIN</small><strong id="precip">—</strong></span>
            <span><small>UV</small><strong id="uv">—</strong></span>
            <span><small>WIND</small><strong id="wind">—</strong></span>
          </div>
        </section>

        <section class="up-next" aria-label="Up next">
          <p class="eyebrow">UP NEXT</p>
          <div id="next-item"><p class="loading">Checking your day…</p></div>
        </section>

        <section class="track-info" aria-label="Now playing details">
          <p class="eyebrow">NOW PLAYING</p>
          <div class="track-heading"><div><strong id="track-title">Nothing playing</strong><p id="track-artist">Spotify</p></div><a class="connect" id="spotify-connect" href="/auth/spotify">CONNECT</a></div>
          <div class="progress"><span id="progress"></span></div>
          <div class="track-time"><span id="elapsed">0:00</span><span id="duration">0:00</span></div>
        </section>
      </div>

      <section class="spotify-stage" aria-label="Now playing">
        <div class="disc" id="record"><img id="artwork" alt="Album artwork" /><span class="disc-hole"></span></div>
      </section>
    </section>

    <section class="organizer-view view" id="organizer-view" aria-label="Calendar and tasks">
      <header class="organizer-header"><div><p class="eyebrow">YOUR DAY</p><h1>Calendar <span>&</span> Tasks</h1></div><span class="status" id="google-status"></span></header>
      <div class="organizer-grid"><section><h2>Upcoming</h2><div id="events"></div></section><section><h2>Open tasks <span id="task-count">0</span></h2><div id="tasks"></div></section></div>
    </section>

    <nav class="view-switcher" aria-label="Display views">
      <button class="selected" data-view="home-view" aria-label="Home view"></button>
      <button data-view="organizer-view" aria-label="Calendar and tasks view"></button>
    </nav>
    <p class="demo-note" id="demo-note"></p>
  </div>
`;

function tick() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(now);
  document.querySelector('#clock-main')!.textContent = `${parts.find(p => p.type === 'hour')?.value}:${parts.find(p => p.type === 'minute')?.value}`;
  document.querySelector('#period')!.textContent = parts.find(p => p.type === 'dayPeriod')?.value || '';
  document.querySelector('#clock-seconds')!.textContent = new Intl.DateTimeFormat('en-US', { second: '2-digit' }).format(now);
  document.querySelector('#date')!.textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now).toUpperCase();
  updatePlaybackProgress();
}

function render(data: Dashboard) {
  document.querySelector('#greeting')!.textContent = data.greeting.toUpperCase();
  document.querySelector('#google-status')!.innerHTML = data.googleConnected ? '<span class="dot"></span> SYNCED' : '<a href="/auth/google">CONNECT GOOGLE</a>';
  renderOrganizer(data.events, data.tasks);
  renderNext(data.events, data.tasks);
  renderWeather(data.weather);
  renderPlayback(data.playback);
  document.querySelector('#demo-note')!.textContent = data.demo ? 'DEMO' : '';
}

function renderNext(events: CalendarEvent[], tasks: Task[]) {
  const now = Date.now();
  const candidates = [
    ...events.filter(e => !e.allDay && new Date(e.start).getTime() >= now).map(e => ({ type: 'EVENT', title: e.title, at: new Date(e.start), detail: durationLabel(e) })),
    ...tasks.filter(t => t.due && new Date(t.due).getTime() >= now).map(t => ({ type: 'REMINDER', title: t.title, at: new Date(t.due!), detail: 'Task' }))
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const next = candidates[0];
  document.querySelector('#next-item')!.innerHTML = next ? `
    <div class="next-time"><strong>${formatTime(next.at)}</strong><span>${relativeDay(next.at)}</span></div>
    <div class="next-copy"><small>${next.type}</small><strong>${escapeHtml(next.title)}</strong><span>${next.detail}</span></div>
  ` : '<p class="nothing-next">Your day is clear.</p>';
}

function renderWeather(weather: Weather) {
  document.querySelector('#temperature')!.textContent = `${Math.round(weather.temperature)}°`;
  document.querySelector('#condition')!.textContent = weather.condition;
  document.querySelector('#range')!.textContent = `${weather.location} · H ${Math.round(weather.high)}° / L ${Math.round(weather.low)}°`;
  document.querySelector('#precip')!.textContent = `${Math.round(weather.precipitation)}%`;
  document.querySelector('#uv')!.textContent = `${Math.round(weather.uv)} ${uvLabel(weather.uv)}`;
  document.querySelector('#wind')!.textContent = `${weather.windDirection} ${Math.round(weather.wind)}`;
  document.querySelector('#weather-icon')!.textContent = weatherSymbol(weather.condition);
}

function renderPlayback(playing: Playback) {
  playbackSnapshot = playing;
  playbackReceivedAt = Date.now();
  document.querySelector('#record')!.classList.toggle('spinning', playing.isPlaying);
  const artwork = document.querySelector<HTMLImageElement>('#artwork')!;
  if (playing.artwork) { artwork.src = playing.artwork; artwork.hidden = false; } else { artwork.removeAttribute('src'); artwork.hidden = true; }
  document.querySelector('#track-title')!.textContent = playing.title || 'Nothing playing';
  document.querySelector('#track-artist')!.textContent = playing.artist || 'Spotify';
  document.querySelector<HTMLElement>('#progress')!.style.width = `${playing.durationMs ? (playing.progressMs / playing.durationMs) * 100 : 0}%`;
  document.querySelector('#elapsed')!.textContent = formatDuration(playing.progressMs);
  document.querySelector('#duration')!.textContent = formatDuration(playing.durationMs);
  document.querySelector<HTMLElement>('#spotify-connect')!.hidden = playing.connected;
}

function updatePlaybackProgress() {
  if (!playbackSnapshot) return;
  const added = playbackSnapshot.isPlaying ? Date.now() - playbackReceivedAt : 0;
  const progress = Math.min(playbackSnapshot.progressMs + added, playbackSnapshot.durationMs);
  document.querySelector<HTMLElement>('#progress')!.style.width = `${playbackSnapshot.durationMs ? (progress / playbackSnapshot.durationMs) * 100 : 0}%`;
  document.querySelector('#elapsed')!.textContent = formatDuration(progress);
}

function renderOrganizer(events: CalendarEvent[], tasks: Task[]) {
  document.querySelector('#events')!.innerHTML = events.length ? events.map(event => `<article class="event"><time>${event.allDay ? 'ALL DAY' : formatTime(new Date(event.start))}</time><div><strong>${escapeHtml(event.title)}</strong><p>${event.allDay ? 'All day' : durationLabel(event)}</p></div></article>`).join('') : '<p class="empty">Nothing on the calendar.</p>';
  document.querySelector('#task-count')!.textContent = String(tasks.length);
  document.querySelector('#tasks')!.innerHTML = tasks.length ? tasks.map(task => `<article class="task"><span class="checkbox"></span><div><strong>${escapeHtml(task.title)}</strong>${task.due ? `<p>${formatDue(task.due)}</p>` : ''}</div></article>`).join('') : '<p class="empty">No open tasks.</p>';
}

document.querySelectorAll<HTMLButtonElement>('.view-switcher button').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
  document.querySelectorAll('.view-switcher button').forEach(item => item.classList.remove('selected'));
  document.querySelector(`#${button.dataset.view}`)!.classList.add('active');
  button.classList.add('selected');
}));

function formatTime(date: Date) { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date); }
function relativeDay(date: Date) { const today = new Date(); return date.toDateString() === today.toDateString() ? 'TODAY' : new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase(); }
function durationLabel(event: CalendarEvent) { if (!event.end) return ''; const minutes = Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000); return minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes >= 120 ? 's' : ''}` : `${minutes} min`; }
function formatDuration(ms: number) { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
function formatDue(value: string) { const due = new Date(value); const today = new Date(); const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; return value.slice(0, 10) === localDate ? 'Due today' : `Due ${new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(due)}`; }
function uvLabel(uv: number) { return uv < 3 ? 'LOW' : uv < 6 ? 'MOD' : uv < 8 ? 'HIGH' : 'V.HIGH'; }
function weatherSymbol(condition: string) { const c = condition.toLowerCase(); if (c.includes('rain') || c.includes('drizzle')) return '◒'; if (c.includes('cloud') || c.includes('fog')) return '◑'; if (c.includes('snow')) return '✳'; return '☼'; }
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!); }

async function load() {
  try {
    const response = await fetch('/api/dashboard');
    if (!response.ok) throw new Error(`Dashboard returned ${response.status}`);
    render(await response.json() as Dashboard);
  } catch (error) { document.querySelector('#demo-note')!.textContent = 'OFFLINE'; console.error(error); }
}

async function loadPlayback() {
  try {
    const response = await fetch('/api/playback');
    if (response.ok) renderPlayback(await response.json() as Playback);
  } catch (error) { console.error('Spotify refresh failed', error); }
}

tick(); setInterval(tick, 1000); load(); setInterval(load, 60_000); setInterval(loadPlayback, 5_000);
