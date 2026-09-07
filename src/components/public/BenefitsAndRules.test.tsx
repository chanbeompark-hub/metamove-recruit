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

  it('renders concrete benefit details as a scannable named list', () => {
    render(
      <BenefitsAndRules
        benefits={[
          {
            id: 'education',
            title: '트레이닝 교육 지원',
            description: '현장 코칭에 필요한 핵심 이론을 체계적으로 배웁니다.',
            details: ['근골격해부학', '기초 영양학', '상담·세일즈 교육'],
          },
        ]}
        rules={[]}
      />,
    );

    const details = screen.getByRole('list', { name: '트레이닝 교육 지원 세부 내용' });
    expect(details).toHaveTextContent('근골격해부학');
    expect(details).toHaveTextContent('기초 영양학');
    expect(details).toHaveTextContent('상담·세일즈 교육');
  });
});
