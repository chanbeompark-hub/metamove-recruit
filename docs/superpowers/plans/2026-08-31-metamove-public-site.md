# Metamove Gym Public Recruitment Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the responsive public recruitment site that explains Metamove Gym's verified center, growth, benefits, rules, leadership, and open trainer positions, then routes applicants to `/apply`.

**Architecture:** A React 19 single-page app served as static assets by Cloudflare Pages. Public content is isolated in a typed content module so unapproved claims and media can be withheld without changing components. Components consume content props only; no component reads environment variables or external services.

**Tech Stack:** Node 24.19.0, npm 11.17.0, React 19.2.8, React Router 7.18.3, TypeScript 7.0.2, Vite 8.2.2, Vitest 4.1.11, Testing Library 16.3.3, Playwright 1.62.1, CSS Modules/global CSS tokens.

**Spec:** `docs/superpowers/specs/2026-08-31-metamove-gym-recruitment-design.md`

## Global Constraints

- Use only user-approved Metamove Gym logo, center photography, representative photography, careers, benefits, policies, and expansion claims.
- Keep the approved headline `좋은 트레이너가 오래 성장하는 시스템.` and the `01 성장 / 02 보상 / 03 확장` evidence structure.
- Primary palette: `#09264D`, `#1268D8`, `#58A6FF`, `#F4F7FB`, `#FFFFFF`.
- Typography: Pretendard 400/600/700/800 when locally available, with `Malgun Gothic`, `system-ui`, sans-serif fallbacks; verify the computed font before release.
- Radius is 5px for controls and 8px for panels; avoid repeated equal-size rounded cards, decorative gradients, glow, and fake statistics.
- Test 320, 360, 390, 430px and desktop without horizontal scrolling or clipped Korean copy.
- Respect `prefers-reduced-motion`; the reduced-motion state shows final values immediately.
- Do not create an `AGENTS.md` inside the project.

## File Structure

- `package.json`: exact scripts and dependency versions.
- `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`: build and quality configuration.
- `src/app/App.tsx`, `src/app/router.tsx`: shell and route ownership.
- `src/content/types.ts`, `src/content/siteContent.ts`: approved-content contract and publication flags.
- `src/styles/tokens.css`, `src/styles/global.css`: design tokens, reset, typography, focus, responsive helpers.
- `src/components/public/*`: one public section per focused component.
- `src/pages/HomePage.tsx`: section composition only.
- `src/test/*`, `e2e/public-site.spec.ts`: unit/accessibility-facing behavior and viewport smoke tests.

---

### Task 1: Scaffold the tested React application

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `eslint.config.js`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/router.tsx`
- Create: `src/test/setup.ts`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Produces: `router: BrowserRouter` with `/` and a temporary `/apply` route label; `App(): JSX.Element`.
- Consumes: none.

- [ ] **Step 1: Write the failing shell test**

```tsx
// src/app/App.test.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the public home route and application link', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /좋은 트레이너/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '지원서 작성하기' })).toHaveAttribute('href', '/apply');
  });
});
```

- [ ] **Step 2: Run the test and verify the missing app failure**

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL because `package.json`, `App`, and the test environment do not exist.

- [ ] **Step 3: Create the exact package contract and minimal shell**

```json
{
  "name": "metamove-gym-careers",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": "24.19.x", "npm": "11.17.x" },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "react-router-dom": "7.18.3"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@playwright/test": "1.62.1",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.6",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.5",
    "@vitejs/plugin-react": "6.1.1",
    "eslint": "10.9.1",
    "eslint-plugin-react-hooks": "7.1.1",
    "eslint-plugin-react-refresh": "0.5.5",
    "globals": "17.11.0",
    "jsdom": "30.0.1",
    "typescript": "7.0.2",
    "typescript-eslint": "8.68.0",
    "vite": "8.2.2",
    "vitest": "4.1.11"
  }
}
```

```tsx
// src/app/App.tsx
import { Link, Route, Routes } from 'react-router-dom';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<main><h1>좋은 트레이너가 오래 성장하는 시스템.</h1><Link to="/apply">지원서 작성하기</Link></main>} />
      <Route path="/apply" element={<main><h1>지원서</h1></main>} />
    </Routes>
  );
}
```

Configure Vitest with `environment: 'jsdom'`, `setupFiles: './src/test/setup.ts'`, and install dependencies with `npm install`.

- [ ] **Step 4: Run unit, lint, and build checks**

Run: `npm test -- src/app/App.test.tsx && npm run lint && npm run build`

Expected: all commands exit 0 and `dist/index.html` exists.

- [ ] **Step 5: Commit the foundation**

```bash
git add package.json package-lock.json index.html vite.config.ts tsconfig*.json eslint.config.js src
git commit -m "chore: scaffold Metamove careers app"
```

### Task 2: Lock the content contract and publication gate

**Files:**
- Create: `src/content/types.ts`
- Create: `src/content/siteContent.ts`
- Create: `src/content/getPublishedContent.ts`
- Test: `src/content/getPublishedContent.test.ts`

**Interfaces:**
- Produces: `SiteContent`, `PublishableSection<T>`, `getPublishedContent(content): PublishedSiteContent`.
- Consumes: user-approved copy and assets only; missing evidence is represented by `published: false`, never invented copy.

- [ ] **Step 1: Write tests for hiding unapproved claims**

```ts
import { describe, expect, it } from 'vitest';
import { getPublishedContent } from './getPublishedContent';

describe('getPublishedContent', () => {
  it('omits sections without approval and keeps the approved hero', () => {
    const result = getPublishedContent({
      hero: { headline: '좋은 트레이너가 오래 성장하는 시스템.', published: true },
      evidence: [],
      center: { title: '센터', body: '', published: false },
      representatives: [], benefits: [], rules: [], positions: []
    });
    expect(result.hero.headline).toBe('좋은 트레이너가 오래 성장하는 시스템.');
    expect(result.center).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify the test fails because the content contract is absent**

Run: `npm test -- src/content/getPublishedContent.test.ts`

Expected: FAIL with unresolved module exports.

- [ ] **Step 3: Implement explicit content types and filtering**

```ts
export type PublishableSection<T> = T & { published: boolean };
export type Representative = { id: string; name: string; role: string; career: string[]; expertise: string[]; imageSrc: string; imageAlt: string; published: boolean };
export type Benefit = { id: string; title: string; description: string; published: boolean };
export type WorkRule = { id: string; label: string; value: string; published: boolean };
export type Position = { id: string; title: string; level: 'entry' | 'experienced'; requirements: string[]; preferences: string[]; published: boolean };
export type EvidenceItem = { index: '01'|'02'|'03'; label: '성장'|'보상'|'확장'; description?: string; href: string; published: boolean };
export type SiteContent = {
  hero: PublishableSection<{ headline: string; supportingCopy?: string }>;
  evidence: EvidenceItem[];
  center: PublishableSection<{ title: string; body: string; imageSrc?: string; imageAlt?: string }>;
  representatives: Representative[];
  benefits: Benefit[];
  rules: WorkRule[];
  positions: Position[];
};
export type PublishedSiteContent = Omit<SiteContent, 'center'> & { center?: Omit<SiteContent['center'], 'published'> };
```

`getPublishedContent` must filter every array on `published === true` and return `center: undefined` when it is not approved. Production content starts with the approved headline and the three approved labels `성장`, `보상`, `확장`; descriptions remain absent until factual supporting copy is approved. The implementation executor must not invent business facts.

- [ ] **Step 4: Run tests and type checking**

Run: `npm test -- src/content/getPublishedContent.test.ts && npm run build`

Expected: PASS; TypeScript rejects a representative without `imageAlt` or publication status.

- [ ] **Step 5: Commit the content boundary**

```bash
git add src/content
git commit -m "feat: add verified recruitment content contract"
```

### Task 3: Implement the design system and accessible public shell

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `src/components/public/PublicHeader.tsx`
- Create: `src/components/public/PublicFooter.tsx`
- Create: `src/components/public/MobileApplyBar.tsx`
- Modify: `src/main.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/components/public/PublicHeader.test.tsx`

**Interfaces:**
- Produces: `PublicHeader`, `PublicFooter`, `MobileApplyBar` with one canonical `/apply` action.
- Consumes: the token values in Global Constraints.

- [ ] **Step 1: Write the navigation and keyboard test**

```tsx
it('exposes section navigation and one application destination', async () => {
  render(<MemoryRouter><PublicHeader /></MemoryRouter>);
  expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '지원하기' })).toHaveAttribute('href', '/apply');
  await userEvent.tab();
  expect(document.activeElement).toHaveClass('skip-link');
});
```

- [ ] **Step 2: Verify the test fails on missing shell components**

Run: `npm test -- src/components/public/PublicHeader.test.tsx`

Expected: FAIL because `PublicHeader` does not exist.

- [ ] **Step 3: Implement tokens, skip link, header, footer, and mobile CTA**

```css
:root {
  --color-navy: #09264d;
  --color-action: #1268d8;
  --color-signal: #58a6ff;
  --color-mist: #f4f7fb;
  --color-white: #fff;
  --color-body: #52677f;
  --radius-control: 5px;
  --radius-panel: 8px;
  --focus-ring: 0 0 0 3px rgb(18 104 216 / 28%);
}
*:focus-visible { outline: 2px solid var(--color-action); outline-offset: 3px; }
```

The header anchors must target `#metamove`, `#vision`, `#representatives`, `#benefits-rules`, and `#positions`. The mobile CTA appears only below 768px and includes bottom safe-area padding.

- [ ] **Step 4: Run component tests, lint, and build**

Run: `npm test -- src/components/public/PublicHeader.test.tsx && npm run lint && npm run build`

Expected: PASS; no missing accessible navigation name.

- [ ] **Step 5: Commit the shell**

```bash
git add src/styles src/components/public src/main.tsx src/app/App.tsx
git commit -m "feat: add Metamove public design system"
```

### Task 4: Build the signature hero and EvidenceRail

**Files:**
- Create: `src/components/public/HeroEvidence.tsx`
- Create: `src/components/public/EvidenceRail.tsx`
- Create: `src/components/public/evidence.css`
- Test: `src/components/public/EvidenceRail.test.tsx`

**Interfaces:**
- Produces: `EvidenceRail({ items }: { items: EvidenceItem[] })`, where `EvidenceItem = { index: '01'|'02'|'03'; label: '성장'|'보상'|'확장'; description?: string; href: string; published: boolean }`.
- Consumes: approved hero media; when absent, render a navy structural field without stock imagery.

- [ ] **Step 1: Write the content and reduced-motion test**

```tsx
it('renders the three approved evidence labels as links', () => {
  const evidenceItems: EvidenceItem[] = [
    { index: '01', label: '성장', href: '#vision', published: true },
    { index: '02', label: '보상', href: '#benefits-rules', published: true },
    { index: '03', label: '확장', href: '#vision', published: true }
  ];
  render(<EvidenceRail items={evidenceItems} />);
  expect(screen.getAllByRole('link')).toHaveLength(3);
  expect(screen.getByText('01')).toBeVisible();
  expect(screen.getByText('성장')).toBeVisible();
  expect(screen.getByText('보상')).toBeVisible();
  expect(screen.getByText('확장')).toBeVisible();
});
```

- [ ] **Step 2: Run the focused test and confirm missing component failure**

Run: `npm test -- src/components/public/EvidenceRail.test.tsx`

Expected: FAIL with unresolved component.

- [ ] **Step 3: Implement the signature composition**

Render semantic ordered-list markup, use CSS counters only as decoration, and keep the text `01`, `02`, `03` in the DOM. Animate a structural line, then headline, then evidence items with CSS custom delays. Under `@media (prefers-reduced-motion: reduce)`, set `animation: none` and `transform: none`.

```tsx
export function EvidenceRail({ items }: { items: EvidenceItem[] }) {
  return <ol className="evidence-rail">{items.map(item => (
    <li key={item.index}><a href={item.href}><span>{item.index}</span><strong>{item.label}</strong>{item.description && <p>{item.description}</p>}</a></li>
  ))}</ol>;
}
```

- [ ] **Step 4: Run tests and inspect both motion modes**

Run: `npm test -- src/components/public/EvidenceRail.test.tsx && npm run build`

Expected: PASS. In browser devtools, reduced motion shows all content immediately.

- [ ] **Step 5: Commit the signature section**

```bash
git add src/components/public
git commit -m "feat: add recruitment evidence hero"
```

### Task 5: Compose verified center, leadership, growth, benefits, rules, and positions

**Files:**
- Create: `src/components/public/CenterStory.tsx`
- Create: `src/components/public/FounderPair.tsx`
- Create: `src/components/public/GrowthTabs.tsx`
- Create: `src/components/public/BenefitsAndRules.tsx`
- Create: `src/components/public/PositionSummary.tsx`
- Create: `src/pages/HomePage.tsx`
- Modify: `src/app/App.tsx`
- Create: `src/test/fixtures/siteContent.ts`
- Test: `src/pages/HomePage.test.tsx`

**Interfaces:**
- Produces: `HomePage({ content }: { content: PublishedSiteContent })`.
- Consumes: `getPublishedContent(siteContent)`; unpublished arrays or sections render nothing and leave no empty heading.

- [ ] **Step 1: Write tests for content order, tabs, and hidden sections**

```tsx
it('orders proof before conditions and hides unpublished claims', async () => {
  render(<MemoryRouter><HomePage content={fixture} /></MemoryRouter>);
  const headings = screen.getAllByRole('heading').map(node => node.textContent);
  expect(headings.indexOf('메타무브짐')).toBeLessThan(headings.indexOf('혜택과 근무 규정'));
  expect(screen.queryByText('승인되지 않은 확장 수치')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: '경력 트레이너' }));
  expect(screen.getByRole('tabpanel')).toHaveTextContent('리더십');
});
```

- [ ] **Step 2: Confirm the page test fails before sections exist**

Run: `npm test -- src/pages/HomePage.test.tsx`

Expected: FAIL on unresolved section components.

- [ ] **Step 3: Implement each focused section and final page composition**

Use a native table on desktop for work rules with labeled key-value rows; on mobile retain the same semantic table unless actual content proves it unreadable. `GrowthTabs` implements arrow-key navigation, `aria-selected`, and `aria-controls`. `FounderPair` receives exactly two published representatives; otherwise it renders the available approved profile without inventing a counterpart.

```tsx
export function HomePage({ content }: HomePageProps) {
  return <>
    <HeroEvidence hero={content.hero} />
    <EvidenceRail items={content.evidence} />
    {content.center && <CenterStory center={content.center} />}
    {content.representatives.length > 0 && <FounderPair people={content.representatives} />}
    <GrowthTabs />
    {(content.benefits.length > 0 || content.rules.length > 0) && <BenefitsAndRules benefits={content.benefits} rules={content.rules} />}
    {content.positions.length > 0 && <PositionSummary positions={content.positions} />}
  </>;
}
```

- [ ] **Step 4: Run the public page suite**

Run: `npm test -- src/pages/HomePage.test.tsx && npm run lint && npm run build`

Expected: PASS; no empty sections appear when production content is unpublished.

- [ ] **Step 5: Commit the complete public page**

```bash
git add src/components/public src/pages src/app/App.tsx
git commit -m "feat: compose public trainer recruitment page"
```

### Task 6: Prove responsive, motion, and public navigation quality

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/public-site.spec.ts`
- Modify: `src/styles/global.css`
- Modify: `DESIGN_BRIEF.md`

**Interfaces:**
- Produces: repeatable Playwright evidence for desktop, 320, 360, 390, and 430px.
- Consumes: public route `/`, application route `/apply`, section anchors.

- [ ] **Step 1: Write failing viewport and reduced-motion tests**

```ts
import { expect, test } from '@playwright/test';

for (const width of [320, 360, 390, 430, 1440]) {
  test(`public page has no horizontal overflow at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('link', { name: /지원/ }).first()).toBeVisible();
  });
}

test.use({ reducedMotion: 'reduce' });
test('reduced motion exposes final evidence state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('03')).toBeVisible();
});
```

- [ ] **Step 2: Run Playwright and capture the initial failures**

Run: `npx playwright install chromium && npm run e2e -- e2e/public-site.spec.ts`

Expected: at least one failure until the web server configuration and viewport CSS are complete.

- [ ] **Step 3: Add Playwright webServer config and correct overflow/copy issues**

Configure the fixed test server and reuse behavior, then fix only evidenced overflow, text wrapping, crop, and CTA collisions. Record actual capture paths in the acceptance-evidence cells of `DESIGN_BRIEF.md`.

```ts
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false
  }
});
```

- [ ] **Step 4: Run the full public-site quality gate**

Run: `npm test && npm run lint && npm run build && npm run e2e -- e2e/public-site.spec.ts`

Expected: all commands exit 0; screenshots show no clipped Korean headings or hidden CTA.

- [ ] **Step 5: Commit verified public site**

```bash
git add playwright.config.ts e2e src/styles DESIGN_BRIEF.md
git commit -m "test: verify public recruitment experience"
```
