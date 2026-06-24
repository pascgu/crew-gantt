import { test } from '@playwright/test';
const OUT = 'C:/Users/hotma/AppData/Local/Temp/claude/c--Users-hotma-source-repos-crew-gantt/0ea3d3ff-9912-44b7-8e04-a463b38dc64a/scratchpad';
test('capture guide fig6/fig8', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/');
  await page.locator('nav button', { hasText: 'Aide' }).click();
  await page.getByRole('button', { name: 'Prise en main', exact: true }).click();
  await page.waitForTimeout(200);
  const figs = page.locator('div.overflow-x-auto.rounded-lg');
  for (const i of [6, 8]) {
    await figs.nth(i).scrollIntoViewIfNeeded();
    await figs.nth(i).screenshot({ path: `${OUT}/guide-fig${i}.png` });
  }
});
