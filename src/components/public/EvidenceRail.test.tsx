import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { getPublishedContent } from '../../content/getPublishedContent';
import type { EvidenceItem, SiteContent } from '../../content/types';
import { EvidenceRail } from './EvidenceRail';
import { HeroEvidence } from './HeroEvidence';

afterEach(cleanup);

describe('EvidenceRail', () => {
  it('renders the three approved evidence labels as links in an ordered list', () => {
    const evidenceItems: EvidenceItem[] = [
      { index: '01', label: '성장', href: '#vision', published: true },
      { index: '02', label: '보상', href: '#benefits-rules', published: true },
      { index: '03', label: '확장', href: '#vision', published: true },
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
      '#vision',
      '#benefits-rules',
      '#vision',
    ]);
  });

  it('keeps the approved hero actionable without inventing missing media', () => {
    render(
      <MemoryRouter>
        <HeroEvidence
          hero={{
            headline: '좋은 트레이너가 오래 성장하는 시스템.',
            published: true,
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '좋은 트레이너가 오래 성장하는 시스템.' }))
      .toBeVisible();
    expect(screen.getByRole('link', { name: '지원서 작성하기' }))
      .toHaveAttribute('href', '/apply');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders approved hero media from the production content contract', () => {
    const content: SiteContent = {
      hero: {
        headline: '좋은 트레이너가 오래 성장하는 시스템.',
        imageSrc: '/approved-center.jpg',
        imageAlt: '메타무브짐 센터 내부',
        published: true,
      },
      evidence: [],
      center: { title: '', body: '', published: false },
      representatives: [],
      benefits: [],
      rules: [],
      positions: [],
    };
    const publishedContent = getPublishedContent(content);

    render(
      <MemoryRouter>
        <HeroEvidence hero={publishedContent.hero} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: '메타무브짐 센터 내부' }))
      .toHaveAttribute('src', '/approved-center.jpg');
  });
});
