import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { getPublishedContent } from '../content/getPublishedContent';
import { siteContent } from '../content/siteContent';
import { FounderPair } from '../components/public/FounderPair';
import { GrowthTabs } from '../components/public/GrowthTabs';
import { PublicFooter } from '../components/public/PublicFooter';
import { PublicHeader } from '../components/public/PublicHeader';
import { publishedFixture } from '../test/fixtures/siteContent';
import { HomePage } from './HomePage';

afterEach(cleanup);

describe('HomePage', () => {
  const expectEveryLocalFragmentToResolve = () => {
    const fragmentLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="#"]'));

    for (const link of fragmentLinks) {
      const fragment = new URL(link.href).hash.slice(1);
      expect(fragment, `${link.getAttribute('href')} must include a fragment`).not.toBe('');
      expect(document.getElementById(fragment), `${link.getAttribute('href')} must resolve`).not.toBeNull();
    }
  };

  it('orders approved proof before conditions and hides unpublished claims', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><HomePage content={publishedFixture} /></MemoryRouter>);

    const headings = screen.getAllByRole('heading').map((node) => node.textContent);
    expect(headings.indexOf('메타무브짐')).toBeLessThan(headings.indexOf('혜택과 근무 규정'));
    expect(screen.getByRole('heading', { name: '움직임을 설계하는 센터' })).toBeInTheDocument();
    expect(screen.queryByText('승인되지 않은 확장 수치')).not.toBeInTheDocument();
    expect(screen.queryByText('승인되지 않은 혜택')).not.toBeInTheDocument();
    expect(screen.queryByText('승인되지 않은 포지션')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '경력 트레이너' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('리더십');
  });

  it('renders the available approved representative without inventing a counterpart', () => {
    render(<MemoryRouter><HomePage content={publishedFixture} /></MemoryRouter>);

    const representatives = screen.getByRole('region', { name: '대표 소개' });
    expect(within(representatives).getByRole('heading', { name: '김메타' })).toBeInTheDocument();
    expect(within(representatives).queryByText('승인되지 않은 대표')).not.toBeInTheDocument();
    expect(representatives.querySelectorAll('article')).toHaveLength(1);
  });

  it('connects tabs to panels and moves selection with arrow keys', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><HomePage content={publishedFixture} /></MemoryRouter>);

    const entryTab = screen.getByRole('tab', { name: '신입 트레이너' });
    const experiencedTab = screen.getByRole('tab', { name: '경력 트레이너' });

    expect(entryTab).toHaveAttribute('aria-selected', 'true');
    expect(entryTab).toHaveAttribute('aria-controls', screen.getByRole('tabpanel').id);
    entryTab.focus();
    await user.keyboard('{ArrowRight}');

    expect(experiencedTab).toHaveFocus();
    expect(experiencedTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', experiencedTab.id);

    await user.keyboard('{ArrowLeft}');
    expect(entryTab).toHaveFocus();
    expect(entryTab).toHaveAttribute('aria-selected', 'true');
  });

  it('leaves no empty section headings when production content is missing', () => {
    render(<MemoryRouter><HomePage content={getPublishedContent(siteContent)} /></MemoryRouter>);

    expect(screen.queryByRole('region', { name: '센터 소개' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '성장과 비전' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '대표 소개' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '혜택과 근무 규정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '채용 포지션' })).not.toBeInTheDocument();
  });

  it('renders only local fragment links that resolve in the production page', () => {
    const productionContent = getPublishedContent(siteContent);
    render(
      <MemoryRouter>
        <PublicHeader content={productionContent} />
        <HomePage content={productionContent} />
        <PublicFooter />
      </MemoryRouter>,
    );

    expectEveryLocalFragmentToResolve();
  });

  it('renders only local fragment links that resolve when optional fixture sections exist', () => {
    render(
      <MemoryRouter>
        <PublicHeader content={publishedFixture} />
        <HomePage content={publishedFixture} />
        <PublicFooter />
      </MemoryRouter>,
    );

    expectEveryLocalFragmentToResolve();
  });

  it('limits the representative composition to the first two approved profiles', () => {
    const firstPerson = publishedFixture.representatives[0];
    const people = [
      firstPerson,
      { ...firstPerson, id: 'second-founder', name: '이무브' },
      { ...firstPerson, id: 'third-founder', name: '박짐' },
    ];

    render(<FounderPair people={people} />);

    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: '김메타' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '이무브' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '박짐' })).not.toBeInTheDocument();
  });

  it('keeps one selected tab and panel when the available positions shrink', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<GrowthTabs positions={publishedFixture.positions} />);

    await user.click(screen.getByRole('tab', { name: '경력 트레이너' }));
    rerender(<GrowthTabs positions={[publishedFixture.positions[0]]} />);

    expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1);
    expect(screen.getByRole('tab', { name: '신입 트레이너' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toBeVisible();
  });

  it('restores focus to the active remaining tab when the focused tab is removed', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<GrowthTabs positions={publishedFixture.positions} />);

    const experiencedTab = screen.getByRole('tab', { name: '경력 트레이너' });
    await user.click(experiencedTab);
    expect(experiencedTab).toHaveFocus();

    rerender(<GrowthTabs positions={[publishedFixture.positions[0]]} />);

    expect(screen.getByRole('tab', { name: '신입 트레이너' })).toHaveFocus();
  });

  it('does not expose a representative fragment for directly supplied unpublished profiles', () => {
    const directContent = {
      ...publishedFixture,
      representatives: publishedFixture.representatives.map((person) => ({
        ...person,
        published: false,
      })),
    };

    render(
      <MemoryRouter>
        <PublicHeader content={directContent} />
        <HomePage content={directContent} />
        <PublicFooter />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: '대표 소개' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '대표 소개' })).not.toBeInTheDocument();
    expectEveryLocalFragmentToResolve();
  });
});
