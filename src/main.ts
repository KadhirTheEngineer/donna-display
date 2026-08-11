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

app.innerHTML = `
  <div class="dashboard">
    <section class="hero" aria-label="Clock">
      <p class="eyebrow" id="greeting">GOOD EVENING</p>
      <div class="clock"><span id="clock-main">--:--</span><span class="seconds" id="clock-seconds">--</span></div>
      <p class="date" id="date">—</p>
    </section>

    <section class="panel agenda">
      <header><p class="eyebrow">UP NEXT</p><span class="status" id="google-status"></span></header>
      <div id="events" class="event-list skeleton-lines"></div>
    </section>

    <section class="panel weather">
      <header><p class="eyebrow">TODAY · <span id="weather-location">—</span></p></header>
      <div class="weather-main"><span class="weather-icon" id="weather-icon">○</span><strong id="temperature">--°</strong><div><p id="condition">—</p><span id="range">—</span></div></div>
      <div class="metrics">
        <div><span>PRECIP.</span><strong id="precip">—</strong></div>
        <div><span>UV INDEX</span><strong id="uv">—</strong></div>
        <div><span>WIND</span><strong id="wind">—</strong></div>
      </div>
    </section>

    <section class="panel tasks">
      <header><p class="eyebrow">TASKS</p><span class="count" id="task-count">0</span></header>
      <div id="tasks" class="task-list skeleton-lines"></div>
    </section>

    <section class="panel now-playing">
      <div class="record-wrap"><div class="record" id="record"><img id="artwork" alt="Album artwork" /><i></i></div></div>
      <div class="track-copy">
        <p class="eyebrow">NOW PLAYING</p>
        <strong id="track-title">Nothing playing</strong>
        <p id="track-artist">Spotify</p>
        <div class="progress"><span id="progress"></span></div>
      </div>
      <a class="connect" id="spotify-connect" href="/auth/spotify">CONNECT</a>
    </section>
  </div>
  <p class="demo-note" id="demo-note"></p>
`;

function tick() {
  const now = new Date();
  document.querySelector('#clock-main')!.textContent = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  }).format(now).replace(/\s[AP]M$/, '');
  document.querySelector('#clock-seconds')!.textContent = new Intl.DateTimeFormat('en-US', { second: '2-digit' }).format(now);
  document.querySelector('#date')!.textContent = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  }).format(now).toUpperCase();
}

const timeLabel = (event: CalendarEvent) => event.allDay
  ? 'ALL DAY'
  : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(event.start));

function render(data: Dashboard) {
  document.querySelector('#greeting')!.textContent = data.greeting.toUpperCase();
  document.querySelector('#google-status')!.innerHTML = data.googleConnected
    ? '<span class="dot"></span> SYNCED'
    : '<a href="/auth/google">CONNECT GOOGLE</a>';
  document.querySelector('#events')!.classList.remove('skeleton-lines');
  document.querySelector('#events')!.innerHTML = data.events.length ? data.events.map((event, index) => `
    <article class="event"><time>${timeLabel(event)}</time><span class="rule rule-${index % 3}"></span><div><strong>${escapeHtml(event.title)}</strong><p>${event.allDay ? 'All day' : duration(event)}</p></div></article>
  `).join('') : '<p class="empty">Nothing else on the calendar.</p>';

  document.querySelector('#tasks')!.classList.remove('skeleton-lines');
  document.querySelector('#task-count')!.textContent = String(data.tasks.length);
  document.querySelector('#tasks')!.innerHTML = data.tasks.length ? data.tasks.map(task => `
    <article class="task"><span class="checkbox"></span><div><strong>${escapeHtml(task.title)}</strong>${task.due ? `<p>${formatDue(task.due)}</p>` : ''}</div></article>
  `).join('') : '<p class="empty">No open tasks.</p>';

  const weather = data.weather;
  document.querySelector('#weather-location')!.textContent = weather.location.toUpperCase();
  document.querySelector('#temperature')!.textContent = `${Math.round(weather.temperature)}°`;
  document.querySelector('#condition')!.textContent = weather.condition;
  document.querySelector('#range')!.textContent = `H ${Math.round(weather.high)}° · L ${Math.round(weather.low)}°`;
  document.querySelector('#precip')!.textContent = `${Math.round(weather.precipitation)}%`;
  document.querySelector('#uv')!.textContent = `${Math.round(weather.uv)} · ${uvLabel(weather.uv)}`;
  document.querySelector('#wind')!.textContent = `${weather.windDirection} ${Math.round(weather.wind)} mph`;
  document.querySelector('#weather-icon')!.textContent = weatherSymbol(weather.condition);

  const playing = data.playback;
  const record = document.querySelector('#record')!;
  record.classList.toggle('spinning', playing.isPlaying);
  const artwork = document.querySelector<HTMLImageElement>('#artwork')!;
  if (playing.artwork) artwork.src = playing.artwork;
  document.querySelector('#track-title')!.textContent = playing.title || 'Nothing playing';
  document.querySelector('#track-artist')!.textContent = playing.artist || 'Spotify';
  document.querySelector<HTMLElement>('#progress')!.style.width = `${playing.durationMs ? (playing.progressMs / playing.durationMs) * 100 : 0}%`;
  document.querySelector<HTMLElement>('#spotify-connect')!.hidden = playing.connected;
  document.querySelector('#demo-note')!.textContent = data.demo ? 'DEMO DATA · CONNECT ACCOUNTS WHEN THIS MOVES TO THE DISPLAY LAPTOP' : '';
}

function duration(event: CalendarEvent) {
  if (!event.end) return '';
  const minutes = Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes >= 120 ? 's' : ''}` : `${minutes} min`;
}
function formatDue(value: string) {
  const due = new Date(value);
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return value.slice(0, 10) === localDate
    ? 'Due today'
    : `Due ${new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(due)}`;
}
function uvLabel(uv: number) { return uv < 3 ? 'Low' : uv < 6 ? 'Moderate' : uv < 8 ? 'High' : 'Very high'; }
function weatherSymbol(condition: string) {
  const c = condition.toLowerCase();
  if (c.includes('rain') || c.includes('drizzle')) return '◒';
  if (c.includes('cloud') || c.includes('fog')) return '◑';
  if (c.includes('snow')) return '✳';
  return '☼';
}
function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!);
}

async function load() {
  try {
    const response = await fetch('/api/dashboard');
    if (!response.ok) throw new Error(`Dashboard returned ${response.status}`);
    render(await response.json() as Dashboard);
  } catch (error) {
    document.querySelector('#demo-note')!.textContent = 'DISPLAY SERVER OFFLINE · START WITH NPM RUN DEV';
    console.error(error);
  }
}

tick();
setInterval(tick, 1000);
load();
setInterval(load, 60_000);
