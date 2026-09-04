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
  await locator.scrollIntoViewIfNeeded();
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

async function expectHorizontalGeometry(locator: Locator, label: string) {
  await locator.scrollIntoViewIfNeeded();
  const geometry = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      clientWidth: element.clientWidth,
      left: rect.left,
      right: rect.right,
      scrollWidth: element.scrollWidth,
      viewportWidth: innerWidth,
    };
  });

  expect(geometry.left, `${label} viewport left`).toBeGreaterThanOrEqual(-1);
  expect(geometry.right, `${label} viewport right`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.scrollWidth, `${label} internal overflow`).toBeLessThanOrEqual(geometry.clientWidth + 1);
}

async function getFocusContrast(target: Locator, surface: Locator) {
  await target.scrollIntoViewIfNeeded();
  await target.focus();
  return target.evaluate((element, surfaceElement) => {
    const parseRgb = (value: string) => {
      const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${value}`);
      return channels;
    };
    const luminance = (channels: number[]) => {
      const linear = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const outlineColor = getComputedStyle(element).outlineColor;
    const surfaceColor = getComputedStyle(surfaceElement as Element).backgroundColor;
    const outlineLuminance = luminance(parseRgb(outlineColor));
    const surfaceLuminance = luminance(parseRgb(surfaceColor));
    return {
      outlineColor,
      ratio: (Math.max(outlineLuminance, surfaceLuminance) + 0.05)
        / (Math.min(outlineLuminance, surfaceLuminance) + 0.05),
      surfaceColor,
    };
  }, await surface.elementHandle());
}

for (const width of testedWidths) {
  test(`public page keeps its content and application action inside ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    const heroHeading = page.getByRole('heading', { name: '움직임을 바꾸는 트레이너, 메타무브짐에서 함께 성장하세요' });
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
      await expect(mobileBar.getByRole('link', { name: '지원서 미리보기' })).toBeVisible();

      const reservedSpace = await page.evaluate(() => {
        const bar = document.querySelector<HTMLElement>('.mobile-apply-bar');
        const layout = document.querySelector<HTMLElement>('.marketing-layout');
        if (!bar || !layout) throw new Error('Marketing layout or mobile application bar is missing');
        return {
          layoutPaddingBottom: Number.parseFloat(getComputedStyle(layout).paddingBottom),
          barHeight: bar.getBoundingClientRect().height,
        };
      });
      expect(reservedSpace.layoutPaddingBottom).toBeGreaterThanOrEqual(reservedSpace.barHeight);

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

for (const width of mobileWidths) {
  test(`published recruitment review content remains readable inside ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    const centerParagraphs = page.locator('.center-story__body p');
    await expect(centerParagraphs).toHaveCount(3);
    for (let index = 0; index < await centerParagraphs.count(); index += 1) {
      await expectTextGeometry(centerParagraphs.nth(index), `${width}px center paragraph ${index + 1}`, true);
    }

    const representatives = page.getByRole('region', { name: '대표 소개' });
    for (const name of ['박찬범', '윤지헌']) {
      await expectTextGeometry(
        representatives.getByRole('heading', { name }),
        `${width}px production representative ${name}`,
        true,
      );
    }

    const benefits = page.getByRole('region', { name: '제공 혜택' });
    const benefitTitles = benefits.getByRole('heading', { level: 4 });
    const benefitDescriptions = benefits.locator('.benefits-rules__benefits p');
    await expect(benefitTitles).toHaveCount(5);
    await expect(benefitDescriptions).toHaveCount(5);
    for (let index = 0; index < 5; index += 1) {
      await expectTextGeometry(benefitTitles.nth(index), `${width}px benefit title ${index + 1}`, true);
      await expectTextGeometry(benefitDescriptions.nth(index), `${width}px benefit description ${index + 1}`, true);
    }

    const draftNotes = page.getByRole('note');
    await expect(draftNotes).toHaveCount(2);
    for (let index = 0; index < await draftNotes.count(); index += 1) {
      await expectTextGeometry(draftNotes.nth(index), `${width}px draft notice ${index + 1}`, true);
    }
    await expectTextGeometry(
      page.getByRole('heading', { name: '1차 채용 절차안' }),
      `${width}px draft hiring process heading`,
    );
    await expectTextGeometry(
      page.getByRole('heading', { name: '1차 채용 검토안' }),
      `${width}px draft positions heading`,
    );
    await expectTextGeometry(
      page.locator('.position-summary__action'),
      `${width}px application preview CTA`,
      true,
    );

    await expectNoDocumentOverflow(page);
  });
}

for (const width of testedWidths) {
  test(`full fixture route exposes every public section inside ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/__fixtures/public');

    await expect(page.getByRole('heading', { name: '메타무브짐' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '움직임을 설계하는 센터' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '테스트용 확장 비전' })).toBeVisible();
    await expect(page.getByRole('region', { name: '대표 소개' }).getByRole('article')).toHaveCount(2);
    await expect(page.getByRole('region', { name: '입사 후 성장 경로' })).toBeVisible();
    await expect(page.getByRole('table', { name: '근무 규정' })).toBeVisible();
    await expect(page.getByRole('region', { name: '채용 포지션' })).toBeVisible();
    await expect(page.getByRole('region', { name: '테스트용 채용 절차' })).toBeVisible();

    const responsiveMedia = await page.evaluate(() => {
      const heroImage = document.querySelector<HTMLImageElement>('.hero-evidence__field--media img');
      const heroMobileSource = document.querySelector<HTMLSourceElement>('.hero-evidence__field--media source');
      const centerImage = document.querySelector<HTMLImageElement>('.center-story__media img');
      if (!heroImage || !heroMobileSource || !centerImage) {
        throw new Error('Fixture responsive media is incomplete');
      }
      return {
        centerObjectPosition: getComputedStyle(centerImage).objectPosition,
        heroCurrentSrc: heroImage.currentSrc,
        heroDesktopSrc: heroImage.src,
        heroMobileSrc: heroMobileSource.srcset,
      };
    });
    expect(responsiveMedia.heroCurrentSrc).toBe(
      width < 768 ? responsiveMedia.heroMobileSrc : responsiveMedia.heroDesktopSrc,
    );
    expect(responsiveMedia.centerObjectPosition).toBe(width < 768 ? '62% 50%' : '55% 45%');

    const sectionSelectors = [
      '.hero-evidence',
      '.evidence-rail',
      '.center-story',
      '.expansion-vision',
      '.founder-pair',
      '.growth-tabs',
      '.benefits-rules',
      '.hiring-process',
      '.position-summary',
    ];
    for (const selector of sectionSelectors) {
      await expectHorizontalGeometry(page.locator(selector), `${width}px ${selector}`);
    }

    const representatives = page.getByRole('region', { name: '대표 소개' });
    for (const name of ['김메타', '이무브']) {
      await expectTextGeometry(
        representatives.getByRole('heading', { name }),
        `${width}px representative ${name}`,
      );
    }

    const growthTabs = page.getByRole('tablist', { name: '입사 후 성장 경로 구분' });
    const tabs = growthTabs.getByRole('tab');
    await expect(tabs).toHaveCount(2);
    for (let index = 0; index < await tabs.count(); index += 1) {
      await expectTextGeometry(tabs.nth(index), `${width}px growth tab ${index + 1}`, true);
    }
    await tabs.nth(1).click();
    const growthPanel = page.getByRole('tabpanel');
    await expect(growthPanel).toContainText('테스트 리더십 성장');
    await expectTextGeometry(
      growthPanel.getByRole('heading', { name: '입사 후 기대 성장' }),
      `${width}px growth outcome heading`,
    );

    const rulesTable = page.getByRole('table', { name: '근무 규정' });
    await expectHorizontalGeometry(rulesTable, `${width}px rules table`);
    const ruleLabels = rulesTable.getByRole('rowheader');
    const ruleValues = rulesTable.getByRole('cell');
    for (const [collection, label] of [[ruleLabels, 'rule label'], [ruleValues, 'rule value']] as const) {
      for (let index = 0; index < await collection.count(); index += 1) {
        await expectTextGeometry(
          collection.nth(index),
          `${width}px ${label} ${index + 1}`,
          true,
        );
      }
    }

    const fragmentHrefs = await page.locator('a[href^="#"]').evaluateAll((links) => (
      [...new Set(links.map((link) => link.getAttribute('href')).filter(Boolean))]
    ));
    expect(fragmentHrefs).toEqual(expect.arrayContaining([
      '#main-content',
      '#metamove',
      '#vision',
      '#growth',
      '#representatives',
      '#benefits-rules',
      '#positions',
    ]));
    for (const href of fragmentHrefs) {
      const target = page.locator(href!);
      await expect(target, `${href} must resolve`).toHaveCount(1);
      await expectHorizontalGeometry(target, `${width}px fragment ${href}`);
    }

    const visibleActions = page.locator([
      '.public-header__apply:visible',
      '.hero-evidence__action:visible',
      '.mobile-apply-bar__link:visible',
      '.position-summary__action:visible',
    ].join(', '));
    expect(await visibleActions.count(), `${width}px fixture CTA count`).toBeGreaterThan(1);
    for (let index = 0; index < await visibleActions.count(); index += 1) {
      await expectTextGeometry(
        visibleActions.nth(index),
        `${width}px fixture CTA ${index + 1}`,
        true,
      );
    }

    await expectNoDocumentOverflow(page);
  });
}

test('mobile application bar reserves an injected bottom safe area', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const initial = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('.mobile-apply-bar');
    const layout = document.querySelector<HTMLElement>('.marketing-layout');
    if (!bar || !layout) throw new Error('Marketing layout or mobile application bar is missing');
    return {
      layoutPaddingBottom: Number.parseFloat(getComputedStyle(layout).paddingBottom),
      barPaddingBottom: Number.parseFloat(getComputedStyle(bar).paddingBottom),
    };
  });

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-area-bottom', '24px');
  });

  const withSafeArea = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('.mobile-apply-bar');
    const layout = document.querySelector<HTMLElement>('.marketing-layout');
    if (!bar || !layout) throw new Error('Marketing layout or mobile application bar is missing');
    return {
      layoutPaddingBottom: Number.parseFloat(getComputedStyle(layout).paddingBottom),
      barPaddingBottom: Number.parseFloat(getComputedStyle(bar).paddingBottom),
    };
  });

  expect(withSafeArea.barPaddingBottom - initial.barPaddingBottom).toBe(24);
  expect(withSafeArea.layoutPaddingBottom - initial.layoutPaddingBottom).toBe(24);
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

  await page.locator('.hero-evidence__action').click();
  await expect(page).toHaveURL(/\/apply$/);
  await expect(page.getByRole('heading', { name: '기본 정보' })).toBeVisible();

  await page.getByRole('link', { name: '메타무브짐 홈' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#metamove')).toBeVisible();
});

test('application and future admin routes stay outside the marketing shell', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/apply');

  await expect(page.getByRole('heading', { name: '기본 정보' })).toBeVisible();
  await expect(page.getByRole('link', { name: '메타무브짐 홈' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toHaveCount(0);
  await expect(page.getByLabel('지원 안내')).toHaveCount(0);
  await expect(page.locator('a[href="/apply"]')).toHaveCount(0);

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '페이지를 찾을 수 없습니다' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toHaveCount(0);
  await expect(page.getByLabel('지원 안내')).toHaveCount(0);
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

test('focus indicators meet 3:1 contrast on inverse and light surfaces', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/__fixtures/public');

  for (const [targetSelector, surfaceSelector] of [
    ['.hero-evidence__action', '.hero-evidence'],
    ['.position-summary__action', '.position-summary'],
  ] as const) {
    const contrast = await getFocusContrast(
      page.locator(targetSelector),
      page.locator(surfaceSelector),
    );
    expect(contrast.outlineColor, `${targetSelector} uses signal blue`).toBe('rgb(88, 166, 255)');
    expect(contrast.ratio, `${targetSelector} focus contrast`).toBeGreaterThanOrEqual(3);
  }

  const lightContrast = await getFocusContrast(
    page.locator('.evidence-rail__link').first(),
    page.locator('.evidence-rail'),
  );
  expect(lightContrast.outlineColor).toBe('rgb(18, 104, 216)');
  expect(lightContrast.ratio).toBeGreaterThanOrEqual(3);
});

test('normal motion rolls evidence indexes from zero while retaining final DOM text', async ({ page }) => {
  await page.goto('/__fixtures/public');

  const finalIndexes = page.locator('.evidence-rail__index-final');
  await expect(finalIndexes).toHaveText(['01', '02', '03']);
  const digitStrips = page.locator('.evidence-rail__index-digit-strip');
  await expect(digitStrips).toHaveCount(3);

  for (let index = 0; index < await digitStrips.count(); index += 1) {
    const states = await digitStrips.nth(index).evaluate((element) => {
      const animation = element.getAnimations().find(({ animationName }) => animationName === 'evidence-index-roll');
      if (!animation) throw new Error('Evidence index roll animation is missing');
      animation.pause();
      animation.currentTime = 0;
      const startTransform = getComputedStyle(element).transform;
      const timing = animation.effect?.getComputedTiming();
      if (!timing || typeof timing.endTime !== 'number') throw new Error('Animation timing is unavailable');
      animation.currentTime = timing.endTime;
      const endTransform = getComputedStyle(element).transform;
      return { endTransform, startTransform };
    });

    expect(states.startTransform, `index ${index + 1} starts at zero`).not.toBe(states.endTransform);
  }
});

test('reduced motion exposes final HeroEvidence state through computed styles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/__fixtures/public');

  await expect(page.getByText('03')).toBeVisible();
  await expect(page.locator('.evidence-rail__index-final')).toHaveText(['01', '02', '03']);
  await expect(page.locator('.evidence-rail__index-final')).toHaveCount(3);
  const reducedMotionIndexes = page.locator('.evidence-rail__index-motion');
  await expect(reducedMotionIndexes).toHaveCount(3);
  for (let index = 0; index < await reducedMotionIndexes.count(); index += 1) {
    await expect(reducedMotionIndexes.nth(index)).toBeHidden();
  }
  const evidenceState = await page.evaluate(() => {
    const selectors = [
      '.hero-evidence__structural-line',
      '.hero-evidence__headline',
      '.hero-evidence__supporting-copy',
      '.hero-evidence__action',
      '.evidence-rail__item',
      '.evidence-rail__index-digit-strip',
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
  await page.goto('/__fixtures/public');
  await page.screenshot({
    path: '.superpowers/sdd/2026-08-31-metamove-public-site/artifacts/public-fixture-1440.png',
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/__fixtures/public');
  await page.screenshot({
    path: '.superpowers/sdd/2026-08-31-metamove-public-site/artifacts/public-fixture-390.png',
    fullPage: true,
  });
});
