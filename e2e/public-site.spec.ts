import { expect, test, type Page } from '@playwright/test';

const mobileWidths = [320, 360, 390, 430] as const;
const testedWidths = [...mobileWidths, 1440] as const;

async function expectNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - window.innerWidth,
    document: document.documentElement.scrollWidth - window.innerWidth,
  }));

  expect(overflow.body).toBeLessThanOrEqual(0);
  expect(overflow.document).toBeLessThanOrEqual(0);
}

for (const width of testedWidths) {
  test(`public page keeps its content and application action inside ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: '좋은 트레이너가 오래 성장하는 시스템.' })).toBeVisible();
    await expectNoDocumentOverflow(page);

    const mobileBar = page.getByLabel('지원 안내');
    if (width < 768) {
      await expect(mobileBar).toBeVisible();
      await expect(mobileBar.getByRole('link', { name: '지원하기' })).toBeVisible();

      const reservedSpace = await page.evaluate(() => {
        const bar = document.querySelector<HTMLElement>('.mobile-apply-bar');
        if (!bar) throw new Error('Mobile application bar is missing');
        return {
          bodyPaddingBottom: Number.parseFloat(getComputedStyle(document.body).paddingBottom),
          barHeight: bar.getBoundingClientRect().height,
        };
      });
      expect(reservedSpace.bodyPaddingBottom).toBeGreaterThanOrEqual(reservedSpace.barHeight);

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const overlap = await page.evaluate(() => {
        const footer = document.querySelector('footer')?.getBoundingClientRect();
        const bar = document.querySelector<HTMLElement>('.mobile-apply-bar')?.getBoundingClientRect();
        if (!footer || !bar) throw new Error('Footer or mobile application bar is missing');
        return footer.bottom - bar.top;
      });
      expect(overlap).toBeLessThanOrEqual(1);
    } else {
      await expect(mobileBar).toBeHidden();
      await expect(page.locator('.public-header__apply')).toBeVisible();
    }
  });
}

test('mobile application bar reserves an injected bottom safe area', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const initial = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('.mobile-apply-bar');
    if (!bar) throw new Error('Mobile application bar is missing');
    return {
      bodyPaddingBottom: Number.parseFloat(getComputedStyle(document.body).paddingBottom),
      barPaddingBottom: Number.parseFloat(getComputedStyle(bar).paddingBottom),
    };
  });

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-area-bottom', '24px');
  });

  const withSafeArea = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('.mobile-apply-bar');
    if (!bar) throw new Error('Mobile application bar is missing');
    return {
      bodyPaddingBottom: Number.parseFloat(getComputedStyle(document.body).paddingBottom),
      barPaddingBottom: Number.parseFloat(getComputedStyle(bar).paddingBottom),
    };
  });

  expect(withSafeArea.barPaddingBottom - initial.barPaddingBottom).toBe(24);
  expect(withSafeArea.bodyPaddingBottom - initial.bodyPaddingBottom).toBe(24);
});

test('header and page fragment links resolve and the application action opens /apply', async ({ page }) => {
  await page.goto('/');

  const fragmentLinks = page.locator('a[href^="/#"]');
  const hrefs = await fragmentLinks.evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href).toBeTruthy();
    const id = href!.slice(2);
    await expect(page.locator(`#${id}`), `${href} must resolve to a rendered section`).toHaveCount(1);
  }

  await page.goto('/apply');
  await page.getByRole('link', { name: '메타무브짐 홈' }).click();
  await expect(page).toHaveURL(/\/#metamove$/);
  await expect(page.locator('#metamove')).toBeVisible();

  await page.getByRole('link', { name: '지원서 작성하기' }).click();
  await expect(page).toHaveURL(/\/apply$/);
  await expect(page.getByRole('heading', { name: '지원서' })).toBeVisible();
});

test('skip navigation and header links expose unclipped keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');

  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: '본문 바로가기' });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  const skipFocus = await skipLink.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      insideViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0,
    };
  });
  expect(skipFocus).toEqual({ outlineStyle: 'solid', outlineWidth: '2px', insideViewport: true });

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '메타무브짐 홈' })).toBeFocused();
  await page.keyboard.press('Tab');
  const sectionLink = page.getByRole('navigation', { name: '주요 메뉴' })
    .getByRole('link', { name: '메타무브짐', exact: true });
  await expect(sectionLink).toBeFocused();
  expect(await sectionLink.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe('2px');
});

test('reduced motion exposes final HeroEvidence state through computed styles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.getByText('03')).toBeVisible();
  const evidenceState = await page.evaluate(() => {
    const selectors = [
      '.hero-evidence__structural-line',
      '.hero-evidence__headline',
      '.hero-evidence__axis',
      '.hero-evidence__marker',
      '.evidence-rail__item',
      '.evidence-rail__label',
      '.evidence-rail__arrow',
    ];
    return selectors.map((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing reduced-motion target: ${selector}`);
      const style = getComputedStyle(element);
      return {
        selector,
        animationName: style.animationName,
        opacity: style.opacity,
        transform: style.transform,
        transitionDuration: style.transitionDuration,
      };
    });
  });

  for (const state of evidenceState) {
    expect(state, state.selector).toMatchObject({
      animationName: 'none',
      opacity: '1',
      transform: 'none',
      transitionDuration: '0s',
    });
  }
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
});

test('captures representative desktop and mobile public-page evidence', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.screenshot({
    path: '.superpowers/sdd/2026-08-31-metamove-public-site/artifacts/public-home-1440.png',
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({
    path: '.superpowers/sdd/2026-08-31-metamove-public-site/artifacts/public-home-390.png',
    fullPage: true,
  });
});
