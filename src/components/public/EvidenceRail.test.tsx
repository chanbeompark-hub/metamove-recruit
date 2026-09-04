import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { getPublishedContent } from '../../content/getPublishedContent';
import type { PublishedSiteContent, SiteContent } from '../../content/types';
import { CenterStory } from './CenterStory';
import { EvidenceRail } from './EvidenceRail';
import { HeroEvidence } from './HeroEvidence';

afterEach(cleanup);

describe('EvidenceRail', () => {
  it('renders the three approved evidence labels as links in an ordered list', () => {
    const evidenceItems: PublishedSiteContent['evidence'] = [
      { index: '01', label: '성장', href: '#growth' },
      { index: '02', label: '보상', href: '#benefits-rules' },
      { index: '03', label: '확장', href: '#vision' },
    ];

    render(<EvidenceRail items={evidenceItems} />);

    const list = screen.getByRole('list', { name: '채용 핵심 기준' });
    const links = within(list).getAllByRole('link');

    expect(links).toHaveLength(3);
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('01')).toBeVisible();
    expect(screen.getByText('성장')).toBeVisible();
    expect(screen.getByText('보상')).toBeVisible();
    expect(screen.getByText('확장')).toBeVisible();
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#growth',
      '#benefits-rules',
      '#vision',
    ]);
  });

  it('keeps the approved hero actionable without inventing missing media', () => {
    render(
      <MemoryRouter>
        <HeroEvidence
          hero={{
            headline: '움직임을 바꾸는 트레이너, 메타무브짐에서 함께 성장하세요',
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '움직임을 바꾸는 트레이너, 메타무브짐에서 함께 성장하세요' }))
      .toBeVisible();
    expect(screen.getByRole('link', { name: '지원서 미리보기' }))
      .toHaveAttribute('href', '/apply');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders approved hero media from the production content contract', () => {
    const content: SiteContent = {
      hero: {
        headline: '좋은 트레이너가 오래 성장하는 시스템.',
        imageSrc: '/approved-center.jpg',
        imageAlt: '메타무브짐 센터 내부',
        mobileImageSrc: '/approved-center-mobile.jpg',
        published: true,
      },
      evidence: [],
      center: { title: '', paragraphs: [], published: false },
      expansionVision: { title: '', body: '', published: false },
      representatives: [],
      growthTracks: [],
      benefits: [],
      rules: [],
      positions: [],
      hiringProcess: { title: '', steps: [], published: false },
    };
    const publishedContent = getPublishedContent(content);

    render(
      <MemoryRouter>
        <HeroEvidence hero={publishedContent.hero} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: '메타무브짐 센터 내부' }))
      .toHaveAttribute('src', '/approved-center.jpg');
    expect(document.querySelector('source[media="(max-width: 767px)"]'))
      .toHaveAttribute('srcset', '/approved-center-mobile.jpg');
  });

  it('renders focal-position metadata for approved center media', () => {
    render(
      <CenterStory
        center={{
          title: '테스트 센터',
          paragraphs: ['테스트 센터 설명'],
          imageSrc: '/center.jpg',
          imageAlt: '테스트 센터 내부',
          desktopObjectPosition: '60% 40%',
          mobileObjectPosition: '70% 50%',
        }}
      />,
    );

    const image = screen.getByRole('img', { name: '테스트 센터 내부' });
    expect(image.style.getPropertyValue('--media-desktop-position')).toBe('60% 40%');
    expect(image.style.getPropertyValue('--media-mobile-position')).toBe('70% 50%');
  });
});
