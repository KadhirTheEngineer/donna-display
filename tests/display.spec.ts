import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#events')).not.toHaveClass(/skeleton-lines/);
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
  await expect(page.locator('#uv')).toContainText('·');
  await expect(page.locator('#wind')).toContainText('mph');

  await expect(page.locator('#track-title')).toHaveText('Dreams');
  await expect(page.locator('#record')).toHaveClass(/spinning/);
  await expect(page.locator('#artwork')).toHaveAttribute('src', /^https:\/\//);
});

test('clock seconds advance without reloading', async ({ page }) => {
  const seconds = page.locator('#clock-seconds');
  const first = await seconds.textContent();
  await expect(seconds).not.toHaveText(first!, { timeout: 2_500 });
});

test('dashboard has no unintended horizontal or vertical overflow', async ({ page }) => {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  expect(dimensions.scrollHeight).toBe(dimensions.clientHeight);
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
