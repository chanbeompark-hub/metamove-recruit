import { expect, test, type Locator, type Page } from '@playwright/test';

const mobileWidths = [320, 360, 390, 430] as const;
const longAnswer = '가상 지원자가 회원의 움직임을 관찰하고 안전한 성장 경험을 함께 만들어가고 싶은 이유와 계획입니다. '.repeat(4);

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - window.innerWidth,
    document: document.documentElement.scrollWidth - window.innerWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(0);
  expect(overflow.document).toBeLessThanOrEqual(0);
}

async function expectTextFits(locator: Locator) {
  for (let index = 0; index < await locator.count(); index += 1) {
    const element = locator.nth(index);
    await element.scrollIntoViewIfNeeded();
    const geometry = await element.evaluate((node) => {
      const tolerance = 2;
      const rect = node.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(node);
      const textRects = [...range.getClientRects()];
      return {
        clientHeight: node.clientHeight,
        clientWidth: node.clientWidth,
        outside: textRects.some((textRect) => (
          textRect.left < rect.left - tolerance
          || textRect.right > rect.right + tolerance
          || textRect.top < rect.top - tolerance
          || textRect.bottom > rect.bottom + tolerance
        )),
        scrollHeight: node.scrollHeight,
        scrollWidth: node.scrollWidth,
        text: node.textContent?.trim(),
      };
    });
    expect(geometry.outside, geometry.text).toBe(false);
    expect(geometry.scrollWidth, geometry.text).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.scrollHeight, geometry.text).toBeLessThanOrEqual(geometry.clientHeight + 1);
  }
}

async function expectNoActionOverlap(page: Page) {
  const actions = page.locator('.application-form__actions:visible');
  if (await actions.count() === 0) return;
  await actions.scrollIntoViewIfNeeded();
  const overlaps = await page.evaluate(() => {
    const action = document.querySelector<HTMLElement>('.application-form__actions');
    if (!action) return [];
    const actionRect = action.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('section:not([hidden]) input, section:not([hidden]) textarea, section:not([hidden]) button')]
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
  });
  expect(overlaps).toEqual([]);
}

async function expectStepLayout(page: Page, stepName: string) {
  await expect(page.getByRole('heading', { name: stepName, level: 1 })).toBeVisible();
  const currentStep = page.locator('.application-stepper__item[aria-current="step"]');
  await expect(currentStep).toContainText(stepName);
  await expect(currentStep.locator('.application-stepper__number')).toBeVisible();
  await expect(page.locator('.application-stepper__mobile-label')).toContainText(stepName);
  await expect(page.locator('.mobile-apply-bar')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expectTextFits(page.locator('.application-stepper__mobile-label:visible, main label[for]:visible, main button:visible'));
  await expectNoActionOverlap(page);
}

async function completeExperiencedPreview(page: Page) {
  await expectStepLayout(page, '기본 정보');
  await page.getByLabel('이름').fill('가상지원자');
  await page.getByLabel('연락처').fill('010-1234-5678');
  await page.getByLabel('이메일').fill('fictional-applicant@example.test');
  await page.getByRole('radio', { name: '경력', exact: true }).check();
  await page.getByLabel('희망 시작일').fill('2026-10-01');
  await page.getByRole('button', { name: '다음' }).click();

  await expectStepLayout(page, '경력·자격');
  await page.getByLabel('총 경력 기간(개월)').fill('12');
  await page.getByRole('button', { name: '근무 이력 추가' }).click();
  await page.getByRole('button', { name: '근무 이력 추가' }).click();
  await page.getByLabel('근무처 1').fill('가상 1호점');
  await page.getByLabel('담당 역할 1').fill('PT 트레이너');
  await page.getByLabel('근무 개월 1').fill('6');
  await page.getByLabel('근무처 2').fill('가상 2호점');
  await page.getByLabel('담당 역할 2').fill('팀 트레이너');
  await page.getByLabel('근무 개월 2').fill('6');
  await page.getByLabel('자격증 1').fill('생활스포츠지도사');
  await page.getByLabel('전문 분야 1').fill('웨이트 트레이닝');
  await expectStepLayout(page, '경력·자격');
  await page.getByRole('button', { name: '다음' }).click();

  await expectStepLayout(page, '자기소개서');
  await page.getByRole('textbox', { name: '지원 동기', exact: true }).fill(longAnswer);
  await page.getByRole('textbox', { name: '트레이너로서의 강점', exact: true }).fill(longAnswer);
  await page.getByRole('textbox', { name: '메타무브짐에서 이루고 싶은 목표', exact: true }).fill(longAnswer);
  await expect(page.getByText(`${longAnswer.length} / 2,000자`)).toHaveCount(3);
  await expectStepLayout(page, '자기소개서');
  await page.getByRole('button', { name: '다음' }).click();

  await expectStepLayout(page, '서류 첨부');
  await page.getByLabel('이력서').setInputFiles({ name: 'fictional-resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fictional resume') });
  await page.getByLabel('포트폴리오').setInputFiles({ name: 'fictional-portfolio.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('fictional portfolio') });
  await expect(page.getByText('선택됨 · fictional-resume.pdf')).toBeVisible();
  await expect(page.getByText('선택됨 · fictional-portfolio.docx')).toBeVisible();
  await expectStepLayout(page, '서류 첨부');
  await page.getByRole('button', { name: '다음' }).click();

  await expectStepLayout(page, '검토·제출');
  await expect(page.getByText('가상 1호점 · PT 트레이너 · 6개월 / 가상 2호점 · 팀 트레이너 · 6개월')).toBeVisible();
  await expect(page.getByText('fictional-resume.pdf', { exact: true })).toBeVisible();
  await expect(page.getByText('fictional-portfolio.docx', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '지원서 제출하기' })).toBeDisabled();
}

for (const width of mobileWidths) {
  test(`${width}px experienced preview reaches review without clipping or overlap`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/apply');
    await completeExperiencedPreview(page);

    if (width === 320) {
      const headingStart = await page.getByRole('heading', { name: '검토·제출', level: 1 }).evaluate((heading) => {
        const animation = heading.getAnimations()[0];
        if (!animation) throw new Error('Step heading motion is missing');
        animation.pause();
        animation.currentTime = 0;
        return getComputedStyle(heading).opacity;
      });
      expect(headingStart).toBe('1');
    }
  });
}
