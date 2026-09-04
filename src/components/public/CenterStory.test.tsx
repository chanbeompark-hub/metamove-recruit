import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CenterStory } from './CenterStory';

describe('CenterStory', () => {
  it('renders confirmed center facts as separate readable paragraphs', () => {
    render(
      <CenterStory center={{
        title: '상동의 PT 공간',
        paragraphs: ['상동역에서 도보 3~4분, 2시간 무료 주차가 가능합니다.', '평일 09:00–23:00 운영합니다.'],
      }} />,
    );

    expect(screen.getAllByTestId('center-story-paragraph')).toHaveLength(2);
    expect(screen.getByText('상동역에서 도보 3~4분, 2시간 무료 주차가 가능합니다.')).toBeInTheDocument();
    expect(screen.getByText('평일 09:00–23:00 운영합니다.')).toBeInTheDocument();
  });
});
