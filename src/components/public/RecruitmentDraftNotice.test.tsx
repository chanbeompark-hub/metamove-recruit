import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { HiringProcess } from './HiringProcess';
import { PositionSummary } from './PositionSummary';

const draftNotice = '1차 채용안 · 급여·고용형태·근무조건·일정은 확정 후 안내합니다.';

afterEach(cleanup);

describe('recommended recruitment content', () => {
  it('labels draft positions and links only to an application preview', () => {
    render(
      <MemoryRouter>
        <PositionSummary positions={[{
          id: 'entry',
          title: '신입 퍼스널 트레이너',
          level: 'entry',
          requirements: ['책임감'],
          preferences: [],
          status: 'draft',
        }]} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('note')).toHaveTextContent(draftNotice);
    expect(screen.getByRole('region', { name: '1차 채용 검토안' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '지원서 미리보기' })).toHaveAttribute('href', '/apply');
  });

  it('labels a draft hiring process as pending confirmation', () => {
    render(<HiringProcess process={{ title: '채용 절차', steps: ['지원서 제출'], status: 'draft' }} />);

    expect(screen.getByRole('note')).toHaveTextContent(draftNotice);
    expect(screen.getByRole('region', { name: '1차 채용 절차안' })).toBeInTheDocument();
    expect(screen.getByRole('note').parentElement).toHaveClass('hiring-process__intro');
  });

  it('fails safe to a recruitment review when runtime status is not confirmed', () => {
    render(
      <MemoryRouter>
        <PositionSummary positions={[{
          id: 'unconfirmed',
          title: '확인 전 퍼스널 트레이너',
          level: 'entry',
          requirements: [],
          preferences: [],
          status: undefined as unknown as 'draft' | 'confirmed',
        }]} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('region', { name: '1차 채용 검토안' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(draftNotice);
  });
});
