import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PublicHeader } from './PublicHeader';

describe('PublicHeader', () => {
  it('exposes section navigation and one application destination', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <PublicHeader />
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
      sectionTargets.includes(link.getAttribute('href') ?? ''),
    );
    expect(sectionLinks.map((link) => link.getAttribute('href'))).toEqual(sectionTargets);

    await user.tab();
    expect(document.activeElement).toHaveClass('skip-link');
  });
});
