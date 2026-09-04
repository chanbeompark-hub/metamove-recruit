import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { publishedFixture } from '../../test/fixtures/siteContent';
import { PublicHeader } from './PublicHeader';

afterEach(cleanup);

describe('PublicHeader', () => {
  it('exposes section navigation and one application destination', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <PublicHeader content={publishedFixture} />
      </MemoryRouter>,
    );

    const navigation = screen.getByRole('navigation', { name: '주요 메뉴' });
    expect(navigation).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '지원하기' })).toHaveAttribute('href', '/apply');

    const sectionTargets = [
      '#metamove',
      '#vision',
      '#representatives',
      '#benefits-rules',
      '#positions',
    ];
    const sectionLinks = within(navigation).getAllByRole('link').filter((link) =>
      link.getAttribute('href')?.startsWith('#'),
    );
    expect(sectionLinks.map((link) => link.getAttribute('href'))).toEqual(sectionTargets);

    await user.tab();
    expect(document.activeElement).toHaveClass('skip-link');
  });

  it('labels a benefits-only navigation target without implying work rules', () => {
    const contentWithoutRules = { ...publishedFixture, rules: [] };

    render(
      <MemoryRouter>
        <PublicHeader content={contentWithoutRules} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '제공 혜택' })).toHaveAttribute('href', '#benefits-rules');
    expect(screen.queryByRole('link', { name: '혜택·규정' })).not.toBeInTheDocument();
  });
});
