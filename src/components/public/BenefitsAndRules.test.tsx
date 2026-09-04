import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BenefitsAndRules } from './BenefitsAndRules';

describe('BenefitsAndRules', () => {
  it('names a benefits-only section without implying unpublished work rules', () => {
    render(
      <BenefitsAndRules
        benefits={[{ id: 'education', title: '트레이닝 교육 지원', description: '코칭 역량 학습을 지원합니다.' }]}
        rules={[]}
      />,
    );

    expect(screen.getByRole('region', { name: '제공 혜택' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '제공 혜택' })).toBeInTheDocument();
    expect(screen.queryByText('근무 규정')).not.toBeInTheDocument();
  });
});
