import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DRAFT_KEY, DRAFT_WARNING } from '../features/application/store';
import { ApplicationPage } from './ApplicationPage';

const longAnswer = '지원자의 성장과 회원의 변화를 함께 만드는 트레이너가 되고 싶습니다. '.repeat(4);
const nativeSessionStorage = window.sessionStorage;

afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: nativeSessionStorage,
  });
  nativeSessionStorage.clear();
});

function renderPage() {
  return render(<MemoryRouter><ApplicationPage /></MemoryRouter>);
}

async function completeBasicInfo(user: ReturnType<typeof userEvent.setup>, level: 'entry' | 'experienced' = 'entry') {
  await user.type(screen.getByLabelText('이름'), '홍길동');
  await user.type(screen.getByLabelText('연락처'), '010-1234-5678');
  await user.type(screen.getByLabelText('이메일'), 'applicant@example.test');
  await user.click(screen.getByLabelText(level === 'entry' ? '신입' : '경력'));
  await user.type(screen.getByLabelText('희망 시작일'), '2026-09-15');
}

async function completeEntryExperience(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('자격증 1'), '생활스포츠지도사');
  await user.type(screen.getByLabelText('전문 분야 1'), '웨이트 트레이닝');
}

async function completeEssays(user: ReturnType<typeof userEvent.setup>) {
  for (const label of ['지원 동기', '트레이너로서의 강점', '메타무브짐에서 이루고 싶은 목표']) {
    await user.click(screen.getByLabelText(label));
    await user.paste(longAnswer);
  }
}

describe('ApplicationPage', () => {
  it('renders an ordered five-step flow and completes the preview without wiring submission', async () => {
    const user = userEvent.setup();
    renderPage();

    const stepper = screen.getByRole('list', { name: '지원 단계' });
    expect(within(stepper).getAllByRole('listitem')).toHaveLength(5);
    expect(within(stepper).getByText('기본 정보').closest('li')).toHaveAttribute('aria-current', 'step');

    await completeBasicInfo(user);
    const next = screen.getByRole('button', { name: '다음' });
    next.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('heading', { name: '경력·자격' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: '근무 이력 추가' })).not.toBeInTheDocument();
    expect(screen.getByText('신입 지원자는 경력 기간을 0개월로 저장합니다.')).toBeInTheDocument();

    await completeEntryExperience(user);
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading', { name: '자기소개서' })).toHaveFocus();
    expect(screen.getAllByText(/100자 이상 · 2,000자 이하/)).toHaveLength(3);

    await completeEssays(user);
    expect(screen.getAllByText(new RegExp(`${longAnswer.length} / 2,000자`))).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByRole('heading', { name: '서류 첨부' })).toHaveFocus();
    expect(screen.getByText(/PDF, DOC, DOCX/).closest('.file-guidance')).toHaveTextContent('10MB');
    const resume = new File(['resume'], '지원서.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('이력서'), resume);
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByRole('heading', { name: '검토·제출' })).toHaveFocus();
    expect(screen.getByText('지원서.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '기본 정보 수정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원서 제출하기' })).toBeDisabled();
    expect(screen.getByText(/회사에서 승인한 개인정보/)).toBeInTheDocument();
    expect(nativeSessionStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it('restores text values but never restores or persists files', async () => {
    nativeSessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      name: '김지원',
      phone: '010-9876-5432',
      email: 'draft@example.test',
      level: 'entry',
      availableFrom: '2026-10-01',
      careerMonths: 0,
      careerHistory: [],
      certifications: ['자격증'],
      specialties: ['전문 분야'],
      motivation: longAnswer,
      strengths: longAnswer,
      goals: longAnswer,
      resume: { name: 'stored.pdf' },
    }));
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByLabelText('이름')).toHaveValue('김지원');
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByLabelText('이력서')).toHaveValue('');
    expect(nativeSessionStorage.getItem(DRAFT_KEY)).not.toContain('stored.pdf');
  });

  it('validates only the active step and focuses the error summary before advancing', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: '다음' }));

    const summary = screen.getByRole('alert');
    expect(summary).toHaveFocus();
    expect(summary).toHaveTextContent('기본 정보를 확인해주세요.');
    expect(screen.getByText('이름을 2자 이상 입력해주세요.')).toBeInTheDocument();
    expect(screen.queryByText('전문 분야를 입력해주세요.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '기본 정보' })).toBeInTheDocument();
  });

  it('adds coherent experienced history rows and unregisters them when level changes to entry', async () => {
    const user = userEvent.setup();
    renderPage();
    await completeBasicInfo(user, 'experienced');
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByRole('button', { name: '근무 이력 추가' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('총 경력 기간(개월)'), '12');
    await user.click(screen.getByRole('button', { name: '근무 이력 추가' }));
    await user.type(screen.getByLabelText('근무처 1'), '테스트 센터');
    await user.type(screen.getByLabelText('담당 역할 1'), 'PT 트레이너');
    await user.type(screen.getByLabelText('근무 개월 1'), '6');
    await completeEntryExperience(user);
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('경력 기간과 근무 이력의 합계가 일치해야 합니다.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('근무 개월 1'));
    await user.type(screen.getByLabelText('근무 개월 1'), '12');
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '이전' }));
    await user.click(screen.getByRole('button', { name: '이전' }));
    await user.click(screen.getByLabelText('신입'));
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.queryByLabelText('총 경력 기간(개월)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('근무처 1')).not.toBeInTheDocument();
  });

  it('keeps working and shows the exact warning when session storage writes fail', async () => {
    const failingStorage = {
      getItem: () => null,
      setItem: () => { throw new DOMException('quota'); },
      removeItem: () => { throw new DOMException('blocked'); },
    };
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: failingStorage,
    });
    const user = userEvent.setup();
    renderPage();

    await completeBasicInfo(user);
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByRole('heading', { name: '경력·자격' })).toBeInTheDocument();
    expect(screen.getByText(DRAFT_WARNING)).toBeInTheDocument();
  });

  it('returns from review to edit a section and preserves prior answers', async () => {
    const draft = {
      name: '리뷰지원', phone: '010-1234-5678', email: 'review@example.test',
      level: 'entry', availableFrom: '2026-09-15', careerMonths: 0, careerHistory: [],
      certifications: ['생활스포츠지도사'], specialties: ['웨이트'],
      motivation: longAnswer, strengths: longAnswer, goals: longAnswer,
    };
    nativeSessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.upload(screen.getByLabelText('이력서'), new File(['r'], 'resume.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: '다음' }));

    await user.click(screen.getByRole('button', { name: '기본 정보 수정' }));
    expect(screen.getByRole('heading', { name: '기본 정보' })).toHaveFocus();
    expect(screen.getByLabelText('이름')).toHaveValue('리뷰지원');
    expect(screen.getByRole('button', { name: '다음: 경력·자격' })).toBeInTheDocument();
  });

  it('routes a reviewed level change through experience validation before review', async () => {
    const draft = {
      name: '지원자', phone: '010-1234-5678', email: 'level-change@example.test',
      level: 'entry', availableFrom: '2026-09-15', careerMonths: 0, careerHistory: [],
      certifications: ['생활스포츠지도사'], specialties: ['웨이트'],
      motivation: longAnswer, strengths: longAnswer, goals: longAnswer,
    };
    nativeSessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.upload(screen.getByLabelText('이력서'), new File(['r'], 'resume.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: '다음' }));

    await user.click(screen.getByRole('button', { name: '기본 정보 수정' }));
    await user.click(screen.getByLabelText('경력'));
    await user.click(screen.getByRole('button', { name: /검토로 돌아가기|다음: 경력·자격/ }));

    expect(screen.getByRole('heading', { name: '경력·자격' })).toHaveFocus();
    expect(screen.queryByRole('heading', { name: '검토·제출' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '검토로 돌아가기' }));
    expect(screen.getByRole('heading', { name: '경력·자격' })).toBeInTheDocument();
    expect(screen.getByText('경력자는 근무 이력을 한 개 이상 입력해주세요.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('총 경력 기간(개월)'), '12');
    await user.click(screen.getByRole('button', { name: '근무 이력 추가' }));
    await user.type(screen.getByLabelText('근무처 1'), '가상 트레이닝 센터');
    await user.type(screen.getByLabelText('담당 역할 1'), 'PT 트레이너');
    await user.clear(screen.getByLabelText('근무 개월 1'));
    await user.type(screen.getByLabelText('근무 개월 1'), '12');
    await user.click(screen.getByRole('button', { name: '검토로 돌아가기' }));

    expect(screen.getByRole('heading', { name: '검토·제출' })).toHaveFocus();
    expect(screen.getByText('가상 트레이닝 센터 · PT 트레이너 · 12개월')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '기본 정보 수정' }));
    await user.click(screen.getByLabelText('신입'));
    await user.click(screen.getByRole('button', { name: /검토로 돌아가기|다음: 경력·자격/ }));
    expect(screen.queryByRole('button', { name: '근무 이력 추가' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '검토로 돌아가기' }));
    expect(screen.getByRole('heading', { name: '검토·제출' })).toBeInTheDocument();
    expect(screen.getByText('0개월')).toBeInTheDocument();
    expect(screen.getByText('해당 없음')).toBeInTheDocument();
  });

  it('associates every invalid career row control with its own error message', async () => {
    const user = userEvent.setup();
    renderPage();
    await completeBasicInfo(user, 'experienced');
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.type(screen.getByLabelText('총 경력 기간(개월)'), '12');
    await user.click(screen.getByRole('button', { name: '근무 이력 추가' }));
    await user.clear(screen.getByLabelText('근무 개월 1'));
    await user.type(screen.getByLabelText('전문 분야 1'), '웨이트');
    await user.click(screen.getByRole('button', { name: '다음' }));

    const expectations = [
      ['근무처 1', 'company-0-error'],
      ['담당 역할 1', 'role-0-error'],
      ['근무 개월 1', 'months-0-error'],
    ] as const;
    for (const [label, errorId] of expectations) {
      const control = screen.getByLabelText(label);
      expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(control).toHaveAttribute('aria-describedby', errorId);
      expect(document.getElementById(errorId)).toBeVisible();
    }
  });

  it('does not invent a certification error for an empty optional list and clears a real duplicate error', async () => {
    const user = userEvent.setup();
    renderPage();
    await completeBasicInfo(user, 'experienced');
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.type(screen.getByLabelText('총 경력 기간(개월)'), '12');
    await user.type(screen.getByLabelText('전문 분야 1'), '웨이트');
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByRole('alert')).toHaveTextContent('경력·자격 정보를 확인해주세요.');
    expect(screen.queryByText('자격증을 중복 없이 입력해주세요.')).not.toBeInTheDocument();
    expect(screen.queryByText('자격증은 중복해서 입력할 수 없습니다.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /자격증/ }).closest('section')).not.toHaveAttribute('aria-describedby');
    expect(document.getElementById('certifications-error')).not.toBeInTheDocument();

    cleanup();
    nativeSessionStorage.clear();
    renderPage();
    await completeBasicInfo(user, 'experienced');
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.type(screen.getByLabelText('총 경력 기간(개월)'), '12');
    await user.type(screen.getByLabelText('전문 분야 1'), '웨이트');
    await user.click(screen.getByRole('button', { name: /자격증 추가/ }));
    await user.type(screen.getByLabelText('자격증 1'), '생활스포츠지도사');
    await user.type(screen.getByLabelText('자격증 2'), ' 생활스포츠지도사 ');
    await user.click(screen.getByRole('button', { name: '다음' }));

    const certificationSection = screen.getByRole('heading', { name: /자격증/ }).closest('section');
    expect(certificationSection).toHaveAttribute('aria-describedby', 'certifications-error');
    expect(document.getElementById('certifications-error')).toHaveTextContent('자격증은 중복해서 입력할 수 없습니다.');

    await user.clear(screen.getByLabelText('자격증 2'));
    await user.type(screen.getByLabelText('자격증 2'), 'NSCA-CPT');
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByRole('heading', { name: '경력·자격' })).toBeInTheDocument();
    expect(screen.queryByText('자격증은 중복해서 입력할 수 없습니다.')).not.toBeInTheDocument();
    expect(certificationSection).not.toHaveAttribute('aria-describedby');
  });

  it('renders and clears the actual specialty array root error', async () => {
    const user = userEvent.setup();
    renderPage();
    await completeBasicInfo(user, 'experienced');
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.type(screen.getByLabelText('총 경력 기간(개월)'), '12');
    await user.type(screen.getByLabelText('자격증 1'), '생활스포츠지도사');
    await user.type(screen.getByLabelText('전문 분야 1'), '웨이트');
    await user.click(screen.getByRole('button', { name: /전문 분야 추가/ }));
    await user.type(screen.getByLabelText('전문 분야 2'), ' 웨이트 ');
    await user.click(screen.getByRole('button', { name: '다음' }));

    const specialtySection = screen.getByRole('heading', { name: /전문 분야/ }).closest('section');
    expect(specialtySection).toHaveAttribute('aria-describedby', 'specialties-error');
    expect(document.getElementById('specialties-error')).toHaveTextContent('전문 분야는 중복해서 입력할 수 없습니다.');

    await user.clear(screen.getByLabelText('전문 분야 2'));
    await user.type(screen.getByLabelText('전문 분야 2'), '재활 운동');
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByRole('heading', { name: '경력·자격' })).toBeInTheDocument();
    expect(screen.queryByText('전문 분야는 중복해서 입력할 수 없습니다.')).not.toBeInTheDocument();
    expect(specialtySection).not.toHaveAttribute('aria-describedby');
  });
});
