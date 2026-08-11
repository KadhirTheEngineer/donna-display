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

## Connect Spotify

1. Create an app in the Spotify developer dashboard.
2. Add `http://localhost:4173/auth/spotify/callback` to its redirect URIs.
3. Put its client ID and secret in `.env`, restart, then select **Connect** in Now Playing.

The app only requests current-playback read scopes. The record spins only while Spotify says playback is active.

## Display notes

- The layout is optimized for 16:9 at 1920×1080 and has a narrower-screen fallback.
- Data refreshes once per minute; the clock updates every second.
- Keep `.env` and `.data/oauth.json` private. Never commit either file.
- The Google Font is fetched from the internet. For a completely offline deployment, download and self-host DM Mono and Manrope.
