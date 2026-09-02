import { expect, test } from '@playwright/test';

test('the 320px application shell has no horizontal overflow or action overlap', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/apply');

  await expect(page.getByRole('heading', { name: '기본 정보' })).toBeVisible();
  await expect(page.locator('.mobile-apply-bar')).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const action = document.querySelector<HTMLElement>('.application-form__actions');
    if (!action) throw new Error('Application actions are missing');
    const actionRect = action.getBoundingClientRect();
    const controls = [...document.querySelectorAll<HTMLElement>('section:not([hidden]) input, section:not([hidden]) textarea, section:not([hidden]) button')];
    const overlaps = controls
      .filter((control) => !action.contains(control))
      .filter((control) => {
        const rect = control.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0
          && rect.left < actionRect.right
          && rect.right > actionRect.left
          && rect.top < actionRect.bottom
          && rect.bottom > actionRect.top;
      })
      .map((control) => control.getAttribute('aria-label') ?? control.id ?? control.textContent?.trim());
    return {
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      overlaps,
    };
  });

  expect(layout.documentOverflow).toBeLessThanOrEqual(0);
  expect(layout.overlaps).toEqual([]);

  const headingStart = await page.getByRole('heading', { name: '기본 정보' }).evaluate((heading) => {
    const animation = heading.getAnimations()[0];
    if (!animation) throw new Error('Step heading motion is missing');
    animation.pause();
    animation.currentTime = 0;
    return getComputedStyle(heading).opacity;
  });
  expect(headingStart).toBe('1');
});
