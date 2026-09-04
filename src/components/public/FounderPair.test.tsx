import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublishedSiteContent } from '../../content/types';
import { FounderPair } from './FounderPair';

describe('FounderPair', () => {
  it('renders an approved representative profile without requiring a placeholder image', () => {
    const people: PublishedSiteContent['representatives'] = [{
      id: 'text-only',
      name: '박찬범',
      role: '대표 트레이너',
      career: ['트레이너 경력 12년'],
      expertise: ['웨이트 트레이닝'],
    }];

    render(<FounderPair people={people} />);

    expect(screen.getByRole('heading', { name: '박찬범' })).toBeInTheDocument();
    expect(screen.getByText('트레이너 경력 12년')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
