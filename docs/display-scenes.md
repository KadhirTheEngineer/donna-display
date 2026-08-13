# Donna display canvas

## Responsibilities

Donna decides **what** should be visible. The Linux display decides **how** to draw
it legibly on its 1920x1080 canvas. Commands contain semantic widget requests, not
coordinates, HTML, CSS, JavaScript, or shell commands.

The display has three layers of state:

- **Ambient home** is the original clock, weather, next item, and Spotify screen.
- **Canvas** arranges any requested registered widgets and paginates when needed.
- **Focus** temporarily places exactly one registered widget over the canvas.

Clearing focus restores the previous canvas, page, and pin/cycle policy.

## Widget matrix

[`src/widget-engine.ts`](../src/widget-engine.ts) is the provisioning point. Every
widget registers the variants it supports along with minimum readable dimensions,
preferred orientation, and a selection score. Current variant names are `focus`,
`standard`, `compact`, `horizontal`, and `vertical`.

The current matrix is:

| Widget | Focus | Standard | Compact | Horizontal | Vertical |
| --- | --- | --- | --- | --- | --- |
| `clock` | yes | yes | yes | yes | yes |
| `weather.weekly` | yes | yes | yes | yes | yes |
| `calendar.agenda` | yes | yes | yes | yes | yes |
| `tasks.list` | yes | yes | yes | yes | yes |

Each matrix cell is a predetermined trusted template. The engine selects a cell; it
does not scale one large component until it happens to fit.

To provision a new widget:

1. Add its type and variant capabilities to `widgetRegistry`.
2. Add its structured data type and renderer functions in `src/main.ts`.
3. Add its type to the command schema and server allowlist.
4. Add fixtures plus focus, matrix, overflow, and rejection tests.

General widgets such as charts, messages, search results, tables, and editors can use
the same path later without changing the layout engine.

## Packing and pages

The engine evaluates trusted templates for one through four widgets. For each cell it
chooses the highest-scoring variant that satisfies minimum width and height. It also
considers widget priority and whether the cell orientation matches the variant.

If a group cannot fit readably, fewer widgets are placed on that page. Remaining
widgets flow to stable subsequent pages. The engine never knowingly shrink-fits a
widget below its registered minimum.

The canvas pagination policy is one of:

- `cycle`: rotate pages at a validated 5-300 second interval;
- `pinned`: remain on the selected stable page;
- `manual`: move only through page commands.

Page commands are replayed after browser reload, so pinning the currently visible page
is preserved. Stable page IDs are derived from stable widget instance IDs, rather than
fragile page numbers.

## Commands

The normative JSON Schema is
[`schemas/display-command.v1.schema.json`](../schemas/display-command.v1.schema.json).
A normal canvas command looks like:

```json
{
  "schema_version": 1,
  "command_id": "morning-canvas-123",
  "action": "display.canvas.set",
  "canvas": {
    "widgets": [
      { "id": "time", "type": "clock", "priority": 90 },
      { "id": "forecast", "type": "weather.weekly", "priority": 80 },
      { "id": "agenda", "type": "calendar.agenda", "priority": 70 },
      { "id": "todos", "type": "tasks.list", "priority": 60 }
    ],
    "pagination": { "mode": "cycle", "interval_seconds": 15 }
  }
}
```

A focus command contains exactly one widget:

```json
{
  "schema_version": 1,
  "command_id": "focus-weather-123",
  "action": "display.focus.set",
  "widget": {
    "id": "focused-forecast",
    "type": "weather.weekly",
    "preferred_variant": "focus"
  },
  "behavior": { "duration_seconds": 60, "revert_to": "canvas" }
}
```

Other supported actions are `display.focus.clear`, `display.page.pin`,
`display.page.cycle`, `display.page.next`, `display.page.previous`, and the legacy
single-focus compatibility actions. Unknown widgets, duplicate IDs, unknown fields,
multiple focused widgets, and invalid timing/priority values are rejected.

## Prototype transport and production direction

The local prototype uses:

- `POST /api/display/commands` to validate and apply commands;
- `GET /api/display/state` to replay canvas, navigation, and focus after reload;
- `GET /api/display/events` to stream live changes to the browser with SSE.

These endpoints and the web server bind to `127.0.0.1`. They must not be exposed
directly to apartment Wi-Fi.

The production Donna adapter should be an outbound authenticated WebSocket from the
display to Donna over a private Tailscale address. Add one-time enrollment, TLS,
device identity, scoped rotating credentials, replay protection, acknowledgements,
and revocation. Donna remains authoritative for intent; the display remains
authoritative for which trusted widgets and templates can be rendered.
