import './style.css';
import { buildPages, selectVariant, widgetRegistry, type DisplayPage, type WidgetRequest, type WidgetType, type WidgetVariant } from './widget-engine';

type CalendarEvent = { id: string; title: string; start: string; end?: string; allDay?: boolean };
type Task = { id: string; title: string; due?: string };
type ForecastDay = { date: string; condition: string; high: number; low: number; precipitation: number; uv: number; wind: number; windDirection: string };
type Weather = {
  location: string; condition: string; temperature: number; high: number; low: number;
  precipitation: number; uv: number; wind: number; windDirection: string; forecast: ForecastDay[];
};
type Playback = {
  connected: boolean; isPlaying: boolean; title: string; artist: string;
  album: string; artwork: string; progressMs: number; durationMs: number;
};
type Dashboard = {
  greeting: string; demo: boolean; googleConnected: boolean; spotifyConnected: boolean;
  events: CalendarEvent[]; tasks: Task[]; weather: Weather; playback: Playback;
};
type Pagination = { mode: 'cycle' | 'pinned' | 'manual'; interval_seconds?: number; page_id?: string };
type DisplayCommand = {
  schema_version: 1; command_id: string;
  action: 'display.scene.set' | 'display.scene.home' | 'display.canvas.set' | 'display.focus.set' | 'display.focus.clear' | 'display.page.pin' | 'display.page.cycle' | 'display.page.next' | 'display.page.previous';
  scene?: { layout: 'fullscreen'; widget: WidgetType; variant?: 'focus'; title?: string };
  canvas?: { widgets: WidgetRequest[]; pagination?: Pagination };
  widget?: WidgetRequest;
  pagination?: Pagination;
};

const app = document.querySelector<HTMLElement>('#app')!;
let playbackSnapshot: Playback | null = null;
let playbackReceivedAt = 0;
let dashboardSnapshot: Dashboard | null = null;
let pendingDisplayCommand: DisplayCommand | null = null;
let canvasPages: DisplayPage[] = [];
let activeCanvasPage = 0;
let canvasPagination: Pagination = { mode: 'cycle', interval_seconds: 15 };
let pageCycleTimer: ReturnType<typeof setInterval> | null = null;

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

    <section class="focus-view view" id="focus-view" aria-label="Focused display">
      <div class="focus-content" id="focus-content"></div>
      <p class="focus-hint">ESC · RETURN HOME</p>
    </section>

    <section class="canvas-view view" id="canvas-view" aria-label="Dynamic widget canvas">
      <div class="canvas-grid" id="canvas-grid"></div>
      <div class="page-status" id="page-status" aria-live="polite"></div>
    </section>

    <section class="organizer-view view" id="organizer-view" aria-label="Calendar and tasks">
      <header class="organizer-header"><div><p class="eyebrow">YOUR DAY</p><h1>Calendar <span>&</span> Tasks</h1></div><span class="status" id="google-status"></span></header>
      <div class="organizer-grid"><section><h2>Upcoming</h2><div id="events"></div></section><section><h2>Open tasks <span id="task-count">0</span></h2><div id="tasks"></div></section></div>
    </section>

    <section class="settings-view view" id="settings-view" aria-label="Display settings">
      <div class="settings-panel">
        <p class="eyebrow">DISPLAY SETTINGS</p>
        <h1>Brightness</h1>
        <p class="settings-description">Dim the web display for nighttime viewing. This does not change the monitor's physical backlight.</p>
        <div class="brightness-value"><output id="brightness-value" for="brightness">100</output><span>%</span></div>
        <input id="brightness" type="range" min="10" max="100" step="5" value="100" aria-label="Display brightness" />
        <div class="range-labels"><span>DIM</span><span>FULL</span></div>
        <button id="brightness-reset" type="button">RESET TO 100%</button>
        <div class="shortcut-help"><p class="eyebrow">KEYBOARD</p><p><kbd>1</kbd> Home <kbd>2</kbd> Calendar & Tasks <kbd>3</kbd> Settings</p><p><kbd>←</kbd> Previous tab <kbd>→</kbd> Next tab</p></div>
      </div>
    </section>

    <nav class="view-switcher" aria-label="Display views">
      <button class="selected" data-view="home-view" aria-label="Home view" title="Home (1)"></button>
      <button data-view="organizer-view" aria-label="Calendar and tasks view" title="Calendar & Tasks (2)"></button>
      <button data-view="settings-view" aria-label="Settings view" title="Settings (3)"></button>
    </nav>
    <p class="demo-note" id="demo-note"></p>
    <div class="screen-dimmer" id="screen-dimmer" aria-hidden="true"></div>
  </div>
`;

function tick() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(now);
  document.querySelector('#clock-main')!.textContent = `${parts.find(p => p.type === 'hour')?.value}:${parts.find(p => p.type === 'minute')?.value}`;
  document.querySelector('#period')!.textContent = parts.find(p => p.type === 'dayPeriod')?.value || '';
  document.querySelector('#clock-seconds')!.textContent = String(now.getSeconds()).padStart(2, '0');
  document.querySelector('#date')!.textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now).toUpperCase();
  const focusTime = document.querySelector('#focus-time');
  if (focusTime) focusTime.textContent = `${parts.find(p => p.type === 'hour')?.value}:${parts.find(p => p.type === 'minute')?.value}`;
  const focusPeriod = document.querySelector('#focus-period');
  if (focusPeriod) focusPeriod.textContent = parts.find(p => p.type === 'dayPeriod')?.value || '';
  const focusSeconds = document.querySelector('#focus-seconds');
  if (focusSeconds) focusSeconds.textContent = String(now.getSeconds()).padStart(2, '0');
  document.querySelectorAll('[data-live-time]').forEach(node => { node.textContent = `${parts.find(p => p.type === 'hour')?.value}:${parts.find(p => p.type === 'minute')?.value}`; });
  document.querySelectorAll('[data-live-period]').forEach(node => { node.textContent = parts.find(p => p.type === 'dayPeriod')?.value || ''; });
  document.querySelectorAll('[data-live-seconds]').forEach(node => { node.textContent = String(now.getSeconds()).padStart(2, '0'); });
  updatePlaybackProgress();
}

function render(data: Dashboard) {
  dashboardSnapshot = data;
  document.querySelector('#greeting')!.textContent = data.greeting.toUpperCase();
  document.querySelector('#google-status')!.innerHTML = data.googleConnected ? '<span class="dot"></span> SYNCED' : '<a href="/auth/google">CONNECT GOOGLE</a>';
  renderOrganizer(data.events, data.tasks);
  renderNext(data.events, data.tasks);
  renderWeather(data.weather);
  renderPlayback(data.playback);
  document.querySelector('#demo-note')!.textContent = data.demo ? 'DEMO' : '';
  if (pendingDisplayCommand) {
    const command = pendingDisplayCommand;
    pendingDisplayCommand = null;
    applyDisplayCommand(command);
  }
}

const focusRenderers: Record<WidgetType, (data: Dashboard, title?: string) => string> = {
  clock: (_data, title) => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(now);
    const time = `${parts.find(part => part.type === 'hour')?.value}:${parts.find(part => part.type === 'minute')?.value}`;
    const period = parts.find(part => part.type === 'dayPeriod')?.value || '';
    return `<div class="focus-clock"><p class="focus-kicker">${escapeHtml(title || 'CURRENT TIME')}</p><div class="focus-clock-row"><strong id="focus-time">${time}</strong><span class="focus-clock-side"><b id="focus-period">${period}</b><b id="focus-seconds">${String(now.getSeconds()).padStart(2, '0')}</b></span></div><p>${new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now)}</p></div>`;
  },
  'weather.weekly': (data, title) => {
    const weather = data.weather;
    const days = weather.forecast.length ? weather.forecast : [{ date: new Date().toISOString().slice(0, 10), ...weather }];
    return `<div class="focus-weather"><header><div><p class="focus-kicker">${escapeHtml(title || '7 DAY FORECAST')}</p><h1>${escapeHtml(weather.location)}</h1></div><div class="focus-current"><span>${weatherSymbol(weather.condition)}</span><strong>${Math.round(weather.temperature)}°</strong><p>${escapeHtml(weather.condition)}</p></div></header><div class="forecast-grid">${days.map((day, index) => `<article class="forecast-day ${index === 0 ? 'today' : ''}"><p>${index === 0 ? 'TODAY' : new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day.date}T00:00:00Z`)).toUpperCase()}</p><span class="forecast-icon">${weatherSymbol(day.condition)}</span><strong>${Math.round(day.high)}°</strong><span class="forecast-low">${Math.round(day.low)}°</span><div><span>RAIN ${Math.round(day.precipitation)}%</span><span>UV ${Math.round(day.uv)}</span><span>${day.windDirection} ${Math.round(day.wind)} MPH</span></div></article>`).join('')}</div></div>`;
  },
  'calendar.agenda': (data, title) => `<div class="focus-list"><header><p class="focus-kicker">${escapeHtml(title || 'CALENDAR')}</p><h1>Upcoming</h1></header><div>${data.events.length ? data.events.slice(0, 8).map(event => `<article><time>${event.allDay ? 'ALL DAY' : formatTime(new Date(event.start))}</time><div><strong>${escapeHtml(event.title)}</strong><p>${event.allDay ? relativeDay(new Date(event.start)) : `${relativeDay(new Date(event.start))} · ${durationLabel(event)}`}</p></div></article>`).join('') : '<p class="focus-empty">Your calendar is clear.</p>'}</div></div>`,
  'tasks.list': (data, title) => `<div class="focus-list focus-tasks"><header><p class="focus-kicker">${escapeHtml(title || 'TASKS')}</p><h1>To do</h1></header><div>${data.tasks.length ? data.tasks.slice(0, 9).map(task => `<article><span class="focus-checkbox"></span><div><strong>${escapeHtml(task.title)}</strong><p>${task.due ? formatDue(task.due) : 'No due date'}</p></div></article>`).join('') : '<p class="focus-empty">Nothing left to do.</p>'}</div></div>`
};

const canvasRenderers: Record<WidgetType, (data: Dashboard, variant: WidgetVariant, title?: string) => string> = {
  clock: (_data, variant, title) => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(now);
    const time = `${parts.find(part => part.type === 'hour')?.value}:${parts.find(part => part.type === 'minute')?.value}`;
    const period = parts.find(part => part.type === 'dayPeriod')?.value || '';
    return `<article class="canvas-widget widget-clock variant-${variant}"><p class="widget-label">${escapeHtml(title || 'TIME')}</p><div class="widget-time"><strong data-live-time>${time}</strong><span><b data-live-period>${period}</b><b data-live-seconds>${String(now.getSeconds()).padStart(2, '0')}</b></span></div><p class="widget-date">${new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now)}</p></article>`;
  },
  'weather.weekly': (data, variant, title) => {
    const weather = data.weather;
    const limit = variant === 'compact' ? 3 : variant === 'vertical' ? 4 : 7;
    const days = (weather.forecast.length ? weather.forecast : [{ date: new Date().toISOString().slice(0, 10), ...weather }]).slice(0, limit);
    return `<article class="canvas-widget widget-weather variant-${variant}"><header><div><p class="widget-label">${escapeHtml(title || 'WEATHER')}</p><h2>${escapeHtml(weather.location)}</h2></div><div class="widget-weather-now"><span>${weatherSymbol(weather.condition)}</span><strong>${Math.round(weather.temperature)}°</strong></div></header><div class="widget-forecast">${days.map((day, index) => `<div><p>${index ? new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day.date}T00:00:00Z`)).toUpperCase() : 'TODAY'}</p><span>${weatherSymbol(day.condition)}</span><strong>${Math.round(day.high)}°</strong><small>${Math.round(day.precipitation)}% RAIN</small></div>`).join('')}</div></article>`;
  },
  'calendar.agenda': (data, variant, title) => {
    const limit = variant === 'compact' ? 3 : variant === 'horizontal' ? 4 : 6;
    return `<article class="canvas-widget widget-list variant-${variant}"><header><p class="widget-label">${escapeHtml(title || 'CALENDAR')}</p><h2>Upcoming</h2></header><div class="widget-list-items">${data.events.length ? data.events.slice(0, limit).map(event => `<div><time>${event.allDay ? 'ALL DAY' : formatTime(new Date(event.start))}</time><span><strong>${escapeHtml(event.title)}</strong><small>${relativeDay(new Date(event.start))}</small></span></div>`).join('') : '<p class="widget-empty">Your calendar is clear.</p>'}</div></article>`;
  },
  'tasks.list': (data, variant, title) => {
    const limit = variant === 'compact' ? 3 : variant === 'horizontal' ? 4 : 7;
    return `<article class="canvas-widget widget-list widget-tasks variant-${variant}"><header><p class="widget-label">${escapeHtml(title || 'TASKS')}</p><h2>To do</h2></header><div class="widget-list-items">${data.tasks.length ? data.tasks.slice(0, limit).map(task => `<div><i></i><span><strong>${escapeHtml(task.title)}</strong><small>${task.due ? formatDue(task.due) : 'No due date'}</small></span></div>`).join('') : '<p class="widget-empty">Nothing left to do.</p>'}</div></article>`;
  }
};

function renderCanvasPage() {
  if (!dashboardSnapshot || !canvasPages.length) return;
  activeCanvasPage = Math.max(0, Math.min(activeCanvasPage, canvasPages.length - 1));
  const page = canvasPages[activeCanvasPage];
  const grid = document.querySelector<HTMLElement>('#canvas-grid')!;
  grid.innerHTML = page.widgets.map(placed => `<div class="canvas-cell" data-widget-id="${escapeHtml(placed.request.id)}" data-widget-type="${placed.request.type}" data-variant="${placed.variant}" style="left:${placed.cell.x / 19.2}%;top:${placed.cell.y / 10.8}%;width:${placed.cell.width / 19.2}%;height:${placed.cell.height / 10.8}%">${canvasRenderers[placed.request.type](dashboardSnapshot!, placed.variant, placed.request.title)}</div>`).join('');
  const pinned = canvasPagination.mode === 'pinned' ? ' · PINNED' : canvasPagination.mode === 'manual' ? ' · MANUAL' : '';
  document.querySelector('#page-status')!.textContent = canvasPages.length > 1 ? `${activeCanvasPage + 1} / ${canvasPages.length}${pinned}` : pinned.replace(' · ', '');
}

function startPagePolicy() {
  if (pageCycleTimer) clearInterval(pageCycleTimer);
  pageCycleTimer = null;
  if (canvasPagination.mode === 'cycle' && canvasPages.length > 1) {
    pageCycleTimer = setInterval(() => { activeCanvasPage = (activeCanvasPage + 1) % canvasPages.length; renderCanvasPage(); }, (canvasPagination.interval_seconds || 15) * 1000);
  }
}

function showCanvas() { renderCanvasPage(); showView('canvas-view'); startPagePolicy(); }
function moveCanvasPage(direction: number) {
  if (!canvasPages.length) return;
  activeCanvasPage = (activeCanvasPage + direction + canvasPages.length) % canvasPages.length;
  renderCanvasPage();
}

function applyDisplayCommand(command: DisplayCommand) {
  if (command.action === 'display.scene.home') { pendingDisplayCommand = null; showView('home-view'); return; }
  if (!dashboardSnapshot) { pendingDisplayCommand = command; return; }
  if (command.action === 'display.canvas.set' && command.canvas) {
    const previousPageId = canvasPages[activeCanvasPage]?.id;
    canvasPages = buildPages(command.canvas.widgets);
    canvasPagination = command.canvas.pagination || { mode: 'cycle', interval_seconds: 15 };
    const requestedPage = canvasPagination.page_id || previousPageId;
    activeCanvasPage = Math.max(0, requestedPage ? canvasPages.findIndex(page => page.id === requestedPage) : 0);
    showCanvas();
    return;
  }
  if (command.action === 'display.focus.set' && command.widget) {
    if (!widgetRegistry[command.widget.type].focus || !selectVariant(command.widget, 1920, 1080, true)) return;
    document.querySelector('#focus-content')!.innerHTML = focusRenderers[command.widget.type](dashboardSnapshot, command.widget.title);
    showView('focus-view');
    return;
  }
  if (command.action === 'display.focus.clear') { canvasPages.length ? showCanvas() : showView('home-view'); return; }
  if (command.action === 'display.page.next') { moveCanvasPage(1); return; }
  if (command.action === 'display.page.previous') { moveCanvasPage(-1); return; }
  if (command.action === 'display.page.pin') {
    canvasPagination = { mode: 'pinned', page_id: command.pagination?.page_id || canvasPages[activeCanvasPage]?.id };
    const target = canvasPages.findIndex(page => page.id === canvasPagination.page_id);
    if (target >= 0) activeCanvasPage = target;
    renderCanvasPage(); startPagePolicy(); return;
  }
  if (command.action === 'display.page.cycle') {
    canvasPagination = { mode: 'cycle', interval_seconds: command.pagination?.interval_seconds || 15 };
    renderCanvasPage(); startPagePolicy(); return;
  }
  if (command.action === 'display.scene.set' && command.scene) {
    document.querySelector('#focus-content')!.innerHTML = focusRenderers[command.scene.widget](dashboardSnapshot, command.scene.title);
    showView('focus-view');
  }
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

const viewButtons = [...document.querySelectorAll<HTMLButtonElement>('.view-switcher button')];
function showView(viewId: string) {
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
  viewButtons.forEach(item => item.classList.toggle('selected', item.dataset.view === viewId));
  document.querySelector(`#${viewId}`)?.classList.add('active');
  document.querySelector('.shell')?.classList.toggle('dynamic-active', viewId === 'canvas-view' || viewId === 'focus-view');
}
viewButtons.forEach(button => button.addEventListener('click', () => showView(button.dataset.view!)));

document.addEventListener('keydown', event => {
  if ((event.target as HTMLElement).matches('input, button')) return;
  const activeIndex = viewButtons.findIndex(button => button.classList.contains('selected'));
  if (event.key === '1') showView('home-view');
  if (event.key === '2') showView('organizer-view');
  if (event.key === '3') showView('settings-view');
  if (event.key === 'Escape') canvasPages.length ? showCanvas() : showView('home-view');
  if (event.key === 'ArrowLeft') showView(viewButtons[(activeIndex - 1 + viewButtons.length) % viewButtons.length].dataset.view!);
  if (event.key === 'ArrowRight') showView(viewButtons[(activeIndex + 1) % viewButtons.length].dataset.view!);
});

async function connectSceneCommands() {
  try {
    const response = await fetch('/api/display/state');
    if (response.ok) {
      const state = await response.json() as { scene: DisplayCommand | null; commands?: DisplayCommand[] };
      if (state.commands?.length) state.commands.forEach(applyDisplayCommand);
      else if (state.scene) applyDisplayCommand(state.scene);
    }
  } catch (error) { console.error('Could not load display scene state', error); }
  const events = new EventSource('/api/display/events');
  events.addEventListener('display-command', event => applyDisplayCommand(JSON.parse((event as MessageEvent).data) as DisplayCommand));
  events.onerror = () => console.error('Display command stream disconnected; reconnecting automatically.');
}

const brightness = document.querySelector<HTMLInputElement>('#brightness')!;
const brightnessValue = document.querySelector<HTMLOutputElement>('#brightness-value')!;
function setBrightness(value: number) {
  const safeValue = Math.min(100, Math.max(10, value));
  brightness.value = String(safeValue);
  brightnessValue.value = String(safeValue);
  document.querySelector<HTMLElement>('#screen-dimmer')!.style.opacity = String(1 - safeValue / 100);
  localStorage.setItem('display-brightness', String(safeValue));
}
setBrightness(Number(localStorage.getItem('display-brightness') || 100));
brightness.addEventListener('input', () => setBrightness(Number(brightness.value)));
document.querySelector('#brightness-reset')!.addEventListener('click', () => setBrightness(100));

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
  let nextRefresh = 2_000;
  try {
    const response = await fetch('/api/playback');
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') || 5);
      nextRefresh = Math.max(retryAfter * 1_000, 2_000);
    } else if (response.ok) {
      const playback = await response.json() as Playback;
      renderPlayback(playback);
      nextRefresh = playback.isPlaying ? 15_000 : 5_000;
    } else {
      console.error(`Spotify refresh returned ${response.status}`);
    }
  } catch (error) { console.error('Spotify refresh failed', error); }
  window.setTimeout(loadPlayback, nextRefresh);
}

tick(); setInterval(tick, 1000); load().then(connectSceneCommands); setInterval(load, 60_000); window.setTimeout(loadPlayback, 2_000);
