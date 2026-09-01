import { expect, test, type Locator, type Page } from '@playwright/test';

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

type TextGeometry = {
  ancestorClips: string[];
  clientHeight: number;
  clientWidth: number;
  contentRect: { bottom: number; left: number; right: number; top: number };
  ownClips: string[];
  rect: { bottom: number; left: number; right: number; top: number };
  scrollHeight: number;
  scrollWidth: number;
  textOutsideElement: string[];
  viewportHeight: number;
  viewportWidth: number;
};

async function expectTextGeometry(locator: Locator, label: string, requireTextInsideElement = false) {
  const geometry = await locator.evaluate<TextGeometry>((element) => {
    const tolerance = 2;
    const rect = element.getBoundingClientRect();
    const textOutsideElement: string[] = [];
    const textRects: DOMRect[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const textRect of range.getClientRects()) {
        textRects.push(textRect);
        if (
          textRect.left < rect.left - tolerance
          || textRect.right > rect.right + tolerance
          || textRect.top < rect.top - tolerance
          || textRect.bottom > rect.bottom + tolerance
        ) {
          textOutsideElement.push(node.textContent.trim());
        }
      }
    }

    const contentRect = textRects.reduce((bounds, textRect) => ({
      bottom: Math.max(bounds.bottom, textRect.bottom),
      left: Math.min(bounds.left, textRect.left),
      right: Math.max(bounds.right, textRect.right),
      top: Math.min(bounds.top, textRect.top),
    }), { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top });

    const style = getComputedStyle(element);
    const clippingValues = ['auto', 'clip', 'hidden', 'scroll'];
    const ownClips: string[] = [];
    if (clippingValues.includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1) {
      ownClips.push(`x:${style.overflowX}`);
    }
    if (clippingValues.includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1) {
      ownClips.push(`y:${style.overflowY}`);
    }

    const ancestorClips: string[] = [];
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== document.body) {
      const style = getComputedStyle(ancestor);
      const ancestorRect = ancestor.getBoundingClientRect();
      const clipsX = clippingValues.includes(style.overflowX);
      const clipsY = clippingValues.includes(style.overflowY);
      if (
        (clipsX && (
          contentRect.left < ancestorRect.left - tolerance
          || contentRect.right > ancestorRect.right + tolerance
        ))
        || (clipsY && (
          contentRect.top < ancestorRect.top - tolerance
          || contentRect.bottom > ancestorRect.bottom + tolerance
        ))
      ) {
        ancestorClips.push(`${ancestor.tagName.toLowerCase()}.${ancestor.className}`);
      }
      ancestor = ancestor.parentElement;
    }

    return {
      ancestorClips,
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      contentRect,
      ownClips,
      rect: { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top },
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
      textOutsideElement,
      viewportHeight: innerHeight,
      viewportWidth: innerWidth,
    };
  });

  expect(geometry.ownClips, `${label} own clipping`).toEqual([]);
  if (requireTextInsideElement) {
    expect(geometry.textOutsideElement, `${label} label outside element`).toEqual([]);
  }
  expect(geometry.ancestorClips, `${label} clipping ancestors`).toEqual([]);
  expect(geometry.contentRect.left, `${label} viewport left`).toBeGreaterThanOrEqual(-1);
  expect(geometry.contentRect.right, `${label} viewport right`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.contentRect.top, `${label} viewport top`).toBeGreaterThanOrEqual(-1);
  expect(geometry.contentRect.bottom, `${label} viewport bottom`).toBeLessThanOrEqual(geometry.viewportHeight + 1);
}

for (const width of testedWidths) {
  test(`public page keeps its content and application action inside ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    const heroHeading = page.getByRole('heading', { name: '좋은 트레이너가 오래 성장하는 시스템.' });
    await expect(heroHeading).toBeVisible();
    await expectTextGeometry(heroHeading, `${width}px Korean hero heading`);

    const visibleActions = page.locator([
      '.public-header__apply:visible',
      '.hero-evidence__action:visible',
      '.mobile-apply-bar__link:visible',
      '.position-summary__action:visible',
      'button:visible',
    ].join(', '));
    const visibleActionCount = await visibleActions.count();
    expect(visibleActionCount, `${width}px visible CTA/button count`).toBeGreaterThan(0);
    for (let index = 0; index < visibleActionCount; index += 1) {
      const action = visibleActions.nth(index);
      await expectTextGeometry(
        action,
        `${width}px CTA/button ${index + 1}: ${await action.innerText()}`,
        true,
      );
    }

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

test('absolute and relative fragment links resolve without leaving the SPA', async ({ page }) => {
  await page.goto('/');

  const fragmentLinks = page.locator('a[href^="/#"], a[href^="#"]');
  const hrefs = await fragmentLinks.evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href).toBeTruthy();
    const targetUrl = new URL(href!, page.url());
    expect(targetUrl.pathname).toBe('/');
    const id = decodeURIComponent(targetUrl.hash.slice(1));
    expect(id).toBeTruthy();
    await expect(page.locator(`#${id}`), `${href} must resolve to a rendered section`).toHaveCount(1);
  }

  await page.evaluate(() => {
    Object.assign(window, { __fragmentNavigationRoot: document.querySelector('#root') });
  });
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: '본문 바로가기' });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/#main-content$/);
  await expect(page.locator('main#main-content')).toBeFocused();
  expect(await page.evaluate(() => (
    (window as Window & { __fragmentNavigationRoot?: Element }).__fragmentNavigationRoot
    === document.querySelector('#root')
  ))).toBe(true);

  await page.getByRole('link', { name: '지원서 작성하기' }).click();
  await expect(page).toHaveURL(/\/apply$/);
  await expect(page.getByRole('heading', { name: '지원서' })).toBeVisible();

  await page.getByRole('link', { name: '메타무브짐 홈' }).click();
  await expect(page).toHaveURL(/\/#metamove$/);
  await expect(page.locator('#metamove')).toBeVisible();
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
