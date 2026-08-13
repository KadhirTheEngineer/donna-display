# Donna Display

A calm, glanceable 1920×1080 wall display. The borderless home view pairs time, weather, and one “up next” item with a dedicated 1080×1080 Spotify disc; full Calendar and Tasks lists live on a secondary view.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The UI uses realistic demo events, tasks, and playback until accounts are connected. Weather is live through Open-Meteo.

For the laptop, copy `.env.example` to `.env`, set its location, then build and run:

```bash
npm run build
npm start
```

Open `http://localhost:4173` in a fullscreen browser.

Run the Playwright checks at both the target 1920×1080 size and the narrow fallback:

```bash
npm run build
npm run test:e2e
```

## Connect Google

1. Create a Google Cloud project and enable **Google Calendar API** and **Google Tasks API**.
2. Configure its OAuth consent screen.
3. Create an OAuth client of type **Web application**.
4. Add `http://localhost:4173/auth/google/callback` as an authorized redirect URI.
5. Put the client ID and secret in `.env`, restart, then select **Connect Google** on the display.

The app requests read-only Calendar and Tasks scopes. Refresh tokens are stored locally in `.data/oauth.json`, which is gitignored and created with owner-only permissions.

If Google reports that the OAuth client cannot be found, inspect the safe configuration diagnostic on the display laptop:

```bash
curl http://localhost:4173/api/auth/google/diagnostic
```

It reports whether a plausible Google Web client ID and secret were loaded and shows the exact redirect URI, without returning either credential.

## Connect Spotify

1. Create an app in the Spotify developer dashboard.
2. Add `http://127.0.0.1:4173/auth/spotify/callback` to its redirect URIs. Spotify rejects `localhost`; the explicit loopback IP is required for an HTTP callback.
3. Put its client ID and secret in `.env`, restart, then select **Connect** in Now Playing.

The app only requests current-playback read scopes. The record spins only while Spotify says playback is active.

Spotify access tokens refresh automatically using the locally stored refresh token. Concurrent dashboard and playback requests share one refresh operation, and a rejected access token triggers one forced refresh before failing. Temporary playback API errors retain the last real track instead of showing demo data. If Spotify revokes or expires the authorization, the display shows **Reconnect Spotify**; Spotify currently requires reauthorization after a refresh token's six-month lifetime.

To inspect Spotify readiness without exposing credentials or tokens:

```bash
curl http://127.0.0.1:4173/api/auth/spotify/diagnostic
```

## Display notes

- The layout is optimized for 16:9 at 1920×1080 and has a narrower-screen fallback.
- Weather, calendar, and tasks refresh once per minute. Spotify refreshes every five seconds while playing and every two seconds while paused, while track progress advances locally every second. If Spotify rate-limits requests, the display automatically honors its `Retry-After` delay.
- Navigate with the bottom indicators or keyboard: `1` for Home, `2` for Calendar & Tasks, `3` for Settings, and Left/Right Arrow to move between tabs.
- The Settings tab includes a locally remembered software brightness control. It dims rendered content but cannot lower the monitor's physical backlight.

## Dynamic canvas prototype

The display now has a widget-matrix layout engine. Donna can request multiple clock, seven-day weather, calendar, and task widgets; the display chooses among predetermined focus, standard, compact, horizontal, and vertical variants, packs readable layouts, and creates additional pages when necessary. Pages can cycle, remain pinned, or use manual navigation. Focus always contains exactly one widget and restores the previous canvas when dismissed.

The command schema is [schemas/display-command.v1.schema.json](schemas/display-command.v1.schema.json); examples live in `examples/display-commands/`. The widget provisioning model, matrix, layout rules, lifecycle, and secure Donna network direction are documented in [docs/display-scenes.md](docs/display-scenes.md).

With the production server running, simulate future Donna commands locally:

```bash
npm run display:command -- canvas clock weather calendar tasks
npm run display:command -- focus weather 60
npm run display:command -- pin
npm run display:command -- next
npm run display:command -- cycle 15
npm run display:command -- clear-focus
npm run display:command -- home
```

Focus scenes return to the existing canvas after the requested duration. Press `Esc` to return immediately.

The prototype command endpoint and web server bind only to `127.0.0.1`. It accepts a small allowlist of versioned scene commands, never HTML, CSS, JavaScript, arbitrary URLs, or arbitrary coordinates. A future Donna client connection will feed the same command contract through an authenticated outbound WebSocket; do not expose this prototype endpoint directly to the LAN.

### Scene engine boundary

- Donna selects semantic widget instances, priorities, and canvas behavior.
- The display owns packing, pagination, variant selection, typography, animations, provider data, loading states, and errors.
- Each widget has purpose-built size variants rather than simply scaling one component.
- Unsupported widgets and unknown fields are rejected with stable machine-readable errors.
- Keep `.env` and `.data/oauth.json` private. Never commit either file.
- The Google Font is fetched from the internet. For a completely offline deployment, download and self-host DM Mono and Manrope.
