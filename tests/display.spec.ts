import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/display/commands', { data: { schema_version: 1, command_id: `test-home-${Date.now()}`, action: 'display.scene.home' } });
  await page.goto('/');
  await expect(page.locator('#events')).not.toHaveClass(/skeleton-lines/);
});

test('focus commands render registered widgets and return home', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'wall-display');
  const response = await request.post('/api/display/commands', { data: {
    schema_version: 1,
    command_id: 'test-weather-focus',
    action: 'display.scene.set',
    scene: { layout: 'fullscreen', widget: 'weather.weekly', variant: 'focus' },
    behavior: { duration_seconds: 60, revert_to: 'ambient-home', transition: 'fade' }
  } });
  expect(response.status()).toBe(202);
  await expect(page.locator('#focus-view')).toHaveClass(/active/);
  await expect(page.locator('.forecast-day')).toHaveCount(7);
  await expect(page.locator('.focus-weather h1')).toHaveText('Austin');
  const focusDimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth, height: document.documentElement.scrollHeight, viewportHeight: document.documentElement.clientHeight }));
  expect(focusDimensions.width).toBe(focusDimensions.viewport);
  expect(focusDimensions.height).toBe(focusDimensions.viewportHeight);
  await page.reload();
  await expect(page.locator('#focus-view')).toHaveClass(/active/);
  await expect(page.locator('.forecast-day')).toHaveCount(7);
  await request.post('/api/display/commands', { data: {
    schema_version: 1,
    command_id: 'test-clock-focus',
    action: 'display.scene.set',
    scene: { layout: 'fullscreen', widget: 'clock', variant: 'focus' },
    behavior: { duration_seconds: 60, revert_to: 'ambient-home', transition: 'fade' }
  } });
  await expect(page.locator('#focus-time')).toHaveText(/^\d{1,2}:\d{2}$/);
  await expect(page.locator('#focus-period')).toHaveText(/^(AM|PM)$/);
  await expect(page.locator('#focus-seconds')).toHaveText(/^\d{2}$/);
  const clockBox = await page.locator('.focus-clock-row').boundingBox();
  expect(clockBox).not.toBeNull();
  expect(clockBox!.x + clockBox!.width).toBeLessThanOrEqual(1920);
  await request.post('/api/display/commands', { data: { schema_version: 1, command_id: 'test-return-home', action: 'display.scene.home' } });
  await expect(page.locator('#home-view')).toHaveClass(/active/);
});

test('invalid display commands are rejected without changing the scene', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'wall-display');
  const response = await request.post('/api/display/commands', { data: {
    schema_version: 1,
    command_id: 'test-invalid-widget',
    action: 'display.scene.set',
    scene: { layout: 'fullscreen', widget: 'arbitrary.html', html: '<script>alert(1)</script>' }
  } });
  expect(response.status()).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: 'invalid_display_command' } });
  await expect(page.locator('#home-view')).toHaveClass(/active/);
});

test('widget matrix packs pages, pins navigation, and restores canvas after focus', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'wall-display');
  const canvas = await request.post('/api/display/commands', { data: {
    schema_version: 1,
    command_id: 'test-matrix-canvas',
    action: 'display.canvas.set',
    canvas: {
      widgets: [
        { id: 'clock-main', type: 'clock', priority: 90 },
        { id: 'weather-main', type: 'weather.weekly', priority: 80 },
        { id: 'calendar-main', type: 'calendar.agenda', priority: 70 },
        { id: 'tasks-main', type: 'tasks.list', priority: 60 },
        { id: 'clock-secondary', type: 'clock', preferred_variant: 'compact', priority: 10 }
      ],
      pagination: { mode: 'manual' }
    }
  } });
  expect(canvas.status()).toBe(202);
  await expect(page.locator('#canvas-view')).toHaveClass(/active/);
  await expect(page.locator('.canvas-cell')).toHaveCount(4);
  await expect(page.locator('#page-status')).toHaveText('1 / 2 · MANUAL');
  const variants = await page.locator('.canvas-cell').evaluateAll(cells => cells.map(cell => cell.getAttribute('data-variant')));
  expect(variants.every(variant => ['standard', 'compact', 'horizontal', 'vertical'].includes(variant || ''))).toBeTruthy();

  await request.post('/api/display/commands', { data: { schema_version: 1, command_id: 'test-next-page', action: 'display.page.next' } });
  await expect(page.locator('.canvas-cell')).toHaveCount(1);
  await expect(page.locator('#page-status')).toHaveText('2 / 2 · MANUAL');
  await request.post('/api/display/commands', { data: { schema_version: 1, command_id: 'test-pin-page', action: 'display.page.pin', pagination: { mode: 'pinned' } } });
  await expect(page.locator('#page-status')).toHaveText('2 / 2 · PINNED');
  await page.reload();
  await expect(page.locator('#page-status')).toHaveText('2 / 2 · PINNED');
  await expect(page.locator('.canvas-cell')).toHaveCount(1);

  await request.post('/api/display/commands', { data: {
    schema_version: 1, command_id: 'test-focus-overlay', action: 'display.focus.set',
    widget: { id: 'focused-weather', type: 'weather.weekly', preferred_variant: 'focus' },
    behavior: { duration_seconds: 60, revert_to: 'canvas' }
  } });
  await expect(page.locator('#focus-view')).toHaveClass(/active/);
  await request.post('/api/display/commands', { data: { schema_version: 1, command_id: 'test-clear-focus', action: 'display.focus.clear' } });
  await expect(page.locator('#canvas-view')).toHaveClass(/active/);
  await expect(page.locator('#page-status')).toHaveText('2 / 2 · PINNED');

  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth, height: document.documentElement.scrollHeight, viewportHeight: document.documentElement.clientHeight }));
  expect(dimensions.width).toBe(dimensions.viewport);
  expect(dimensions.height).toBe(dimensions.viewportHeight);
});

test('canvas rejects unknown widgets and duplicate stable ids', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'wall-display');
  const response = await request.post('/api/display/commands', { data: {
    schema_version: 1,
    command_id: 'test-invalid-canvas',
    action: 'display.canvas.set',
    canvas: { widgets: [{ id: 'same', type: 'clock' }, { id: 'same', type: 'stocks.market' }] }
  } });
  expect(response.status()).toBe(422);
  const result = await response.json();
  expect(result.error.fields).toEqual(expect.arrayContaining(['canvas.widgets[1].id must be unique', 'unsupported widget: stocks.market']));
});

test('renders all dashboard regions with populated data', async ({ page }) => {
  await expect(page).toHaveTitle('Donna Display');
  await expect(page.locator('#clock-main')).toHaveText(/^\d{1,2}:\d{2}$/);
  await expect(page.locator('#clock-seconds')).toHaveText(/^\d{2}$/);
  await expect(page.locator('#date')).not.toHaveText('—');

  await expect(page.locator('.event')).toHaveCount(4);
  await expect(page.locator('.task')).toHaveCount(3);
  await expect(page.locator('#temperature')).toHaveText(/^-?\d+°$/);
  await expect(page.locator('#precip')).toHaveText(/^\d+%$/);
  await expect(page.locator('#uv')).toHaveText(/^\d+ (LOW|MOD|HIGH|V\.HIGH)$/);
  await expect(page.locator('#wind')).toHaveText(/^(N|NE|E|SE|S|SW|W|NW) \d+$/);

  await expect(page.locator('#track-title')).toHaveText('Dreams');
  await expect(page.locator('#record')).toHaveClass(/spinning/);
  await expect(page.locator('#artwork')).toHaveAttribute('src', /^https:\/\//);
});

test('clock seconds advance without reloading', async ({ page }) => {
  const seconds = page.locator('#clock-seconds');
  const first = await seconds.textContent();
  await expect(seconds).not.toHaveText(first!, { timeout: 2_500 });
});

test('disc freezes at its current angle when playback pauses', async ({ page }) => {
  const disc = page.locator('#record');
  await expect(disc).toHaveClass(/spinning/);
  await page.route('**/api/playback', route => route.abort());
  await page.waitForTimeout(250);
  await disc.evaluate(element => element.classList.remove('spinning'));
  await page.waitForTimeout(50);
  const pausedAt = await disc.evaluate(element => getComputedStyle(element).transform);
  expect(pausedAt).not.toBe('none');
  await page.waitForTimeout(350);
  const stillAt = await disc.evaluate(element => getComputedStyle(element).transform);
  expect(stillAt).toBe(pausedAt);
  await disc.evaluate(element => element.classList.add('spinning'));
  await page.waitForTimeout(250);
  const resumedAt = await disc.evaluate(element => getComputedStyle(element).transform);
  expect(resumedAt).not.toBe(pausedAt);
});

test('dashboard has no unintended overflow at its target size', async ({ page }, testInfo) => {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  if (testInfo.project.name === 'wall-display') expect(dimensions.scrollHeight).toBe(dimensions.clientHeight);
});

test('Spotify owns a 1080 square and organizer content lives on the second view', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'wall-display') {
    const box = await page.locator('.spotify-stage').boundingBox();
    expect(box?.width).toBe(1080);
    expect(box?.height).toBe(1080);
  }
  await expect(page.locator('#organizer-view')).not.toHaveClass(/active/);
  await page.getByRole('button', { name: 'Calendar and tasks view' }).click();
  await expect(page.locator('#organizer-view')).toHaveClass(/active/);
  await expect(page.locator('.event')).toHaveCount(4);
  await expect(page.locator('.task')).toHaveCount(3);
});

test('keyboard navigation opens organizer and settings views', async ({ page }) => {
  await page.keyboard.press('2');
  await expect(page.locator('#organizer-view')).toHaveClass(/active/);
  await page.keyboard.press('3');
  await expect(page.locator('#settings-view')).toHaveClass(/active/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#home-view')).toHaveClass(/active/);
});

test('brightness control persists without appearing on home', async ({ page }) => {
  await expect(page.locator('#brightness')).not.toBeVisible();
  await page.keyboard.press('3');
  const slider = page.locator('#brightness');
  await expect(slider).toBeVisible();
  await slider.fill('40');
  await expect(page.locator('#brightness-value')).toHaveText('40');
  await expect(page.locator('#screen-dimmer')).toHaveCSS('opacity', '0.6');
  await page.reload();
  await expect(page.locator('#screen-dimmer')).toHaveCSS('opacity', '0.6');
});

test('unconfigured OAuth links fail safely back to the display', async ({ page }) => {
  await page.locator('#spotify-connect').click();
  await expect(page).toHaveURL(/\?setup=missing-credentials$/);
  await expect(page.locator('#track-title')).toHaveText('Dreams');
});

test('dashboard API returns the expected contract', async ({ request }) => {
  const response = await request.get('/api/dashboard');
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data).toMatchObject({
    demo: true,
    googleConnected: false,
    spotifyConnected: false,
    weather: { location: expect.any(String), precipitation: expect.any(Number), uv: expect.any(Number), wind: expect.any(Number) },
    playback: { title: 'Dreams', isPlaying: true }
  });
});

test('Spotify has a dedicated fast-refresh API', async ({ request }) => {
  const response = await request.get('/api/playback');
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toMatchObject({
    connected: false,
    isPlaying: true,
    title: 'Dreams',
    progressMs: expect.any(Number),
    durationMs: expect.any(Number)
  });
});

test('temporary Spotify errors do not replace the displayed track', async ({ page }) => {
  await expect(page.locator('#track-title')).toHaveText('Dreams');
  await page.route('**/api/playback', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary failure' }) }));
  await page.waitForTimeout(2_300);
  await expect(page.locator('#track-title')).toHaveText('Dreams');
});

test('Google auth diagnostic does not expose the client secret', async ({ request }) => {
  const response = await request.get('/api/auth/google/diagnostic');
  expect(response.ok()).toBeTruthy();
  const diagnostic = await response.json();
  expect(diagnostic).toMatchObject({
    provider: 'google',
    configured: false,
    clientIdLooksValid: false,
    clientSecretConfigured: false,
    redirectUri: 'http://localhost:4173/auth/google/callback'
  });
  expect(diagnostic).not.toHaveProperty('clientSecret');
});
