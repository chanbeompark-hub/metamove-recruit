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
