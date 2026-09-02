import type { ApplicationInput } from '../types';

type ReviewStepProps = {
  values: ApplicationInput;
  resumeFile: File | null;
  portfolioFile: File | null;
  onEdit: (step: number) => void;
};

type ReviewSectionProps = {
  title: string;
  step: number;
  children: React.ReactNode;
  onEdit: (step: number) => void;
};

function ReviewSection({ title, step, children, onEdit }: ReviewSectionProps) {
  return (
    <section className="review-section" aria-labelledby={`review-${step}`}>
      <div className="review-section__heading">
        <h2 id={`review-${step}`}>{title}</h2>
        <button className="text-button" type="button" onClick={() => onEdit(step)}>{title} 수정</button>
      </div>
      {children}
    </section>
  );
}

function Answer({ term, children }: { term: string; children: React.ReactNode }) {
  return <div className="review-answer"><dt>{term}</dt><dd>{children || '—'}</dd></div>;
}

export function ReviewStep({ values, resumeFile, portfolioFile, onEdit }: ReviewStepProps) {
  return (
    <div className="review-flow">
      <p className="step-intro">입력한 내용을 확인하고 수정할 섹션으로 돌아갈 수 있습니다. 이 화면에서는 실제 접수가 일어나지 않습니다.</p>
      <ReviewSection title="기본 정보" step={0} onEdit={onEdit}>
        <dl><Answer term="이름">{values.name}</Answer><Answer term="연락처">{values.phone}</Answer><Answer term="이메일">{values.email}</Answer><Answer term="지원 구분">{values.level === 'experienced' ? '경력' : '신입'}</Answer><Answer term="희망 시작일">{values.availableFrom}</Answer></dl>
      </ReviewSection>
      <ReviewSection title="경력·자격" step={1} onEdit={onEdit}>
        <dl>
          <Answer term="총 경력">{values.level === 'entry' ? '0개월' : `${values.careerMonths}개월`}</Answer>
          <Answer term="근무 이력">{values.careerHistory?.length ? values.careerHistory.map((item) => `${item.company} · ${item.role} · ${item.months}개월`).join(' / ') : '해당 없음'}</Answer>
          <Answer term="자격증">{values.certifications?.filter(Boolean).join(', ') || '해당 없음'}</Answer>
          <Answer term="전문 분야">{values.specialties?.filter(Boolean).join(', ')}</Answer>
        </dl>
      </ReviewSection>
      <ReviewSection title="자기소개서" step={2} onEdit={onEdit}>
        <dl><Answer term="지원 동기">{values.motivation}</Answer><Answer term="트레이너로서의 강점">{values.strengths}</Answer><Answer term="메타무브짐에서 이루고 싶은 목표">{values.goals}</Answer></dl>
      </ReviewSection>
      <ReviewSection title="서류 첨부" step={3} onEdit={onEdit}>
        <dl><Answer term="이력서">{resumeFile?.name ?? ''}</Answer><Answer term="포트폴리오">{portfolioFile?.name ?? '첨부 안 함'}</Answer></dl>
      </ReviewSection>
      <section className="policy-lock" aria-labelledby="policy-lock-title">
        <span className="policy-lock__mark" aria-hidden="true">준비 중</span>
        <div>
          <h2 id="policy-lock-title">개인정보 동의 및 제출</h2>
          <p>회사에서 승인한 개인정보 수집·이용 동의문과 보관 기간이 확정된 후 동의 및 제출 기능이 열립니다.</p>
        </div>
      </section>
      <button className="button button--primary button--submit" type="button" disabled aria-describedby="submission-lock-reason">지원서 제출하기</button>
      <p className="submission-lock-reason" id="submission-lock-reason">현재는 작성과 검토만 가능한 미리보기입니다. 입력한 지원서는 서버로 전송되지 않습니다.</p>
    </div>
  );
}
