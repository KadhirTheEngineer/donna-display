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

Spotify access tokens refresh automatically using the locally stored refresh token. Temporary playback API errors retain the last real track instead of showing demo data. If Spotify revokes or expires the authorization, the display shows **Reconnect Spotify**; Spotify currently requires reauthorization after a refresh token's six-month lifetime.

## Display notes

- The layout is optimized for 16:9 at 1920×1080 and has a narrower-screen fallback.
- Weather, calendar, and tasks refresh once per minute. Spotify refreshes every five seconds while playing and every two seconds while paused, while track progress advances locally every second. If Spotify rate-limits requests, the display automatically honors its `Retry-After` delay.
- Navigate with the bottom indicators or keyboard: `1` for Home, `2` for Calendar & Tasks, `3` for Settings, and Left/Right Arrow to move between tabs.
- The Settings tab includes a locally remembered software brightness control. It dims rendered content but cannot lower the monitor's physical backlight.
- Keep `.env` and `.data/oauth.json` private. Never commit either file.
- The Google Font is fetched from the internet. For a completely offline deployment, download and self-host DM Mono and Manrope.
