import { useFormContext, useWatch } from 'react-hook-form';
import type { ApplicationInput } from '../types';

const ESSAYS = [
  { name: 'motivation', label: '지원 동기', prompt: '메타무브짐에 지원한 이유와 기대하는 성장을 적어주세요.' },
  { name: 'strengths', label: '트레이너로서의 강점', prompt: '회원의 변화를 만드는 본인만의 태도와 강점을 적어주세요.' },
  { name: 'goals', label: '메타무브짐에서 이루고 싶은 목표', prompt: '함께 일하며 만들고 싶은 경험과 목표를 구체적으로 적어주세요.' },
] as const;

export function EssayStep() {
  const { control, register, formState: { errors } } = useFormContext<ApplicationInput>();
  const answers = useWatch({ control });

  return (
    <div className="form-stack essay-stack">
      <p className="step-intro">각 문항은 공백을 포함해 100자 이상 2,000자 이하로 작성해주세요.</p>
      {ESSAYS.map((essay, index) => {
        const value = answers[essay.name] ?? '';
        const error = errors[essay.name];
        const criteriaId = `${essay.name}-criteria`;
        const errorId = `${essay.name}-error`;
        return (
          <section className="essay-question" key={essay.name} aria-labelledby={`${essay.name}-label`}>
            <div className="essay-question__heading">
              <span className="section-index">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <label id={`${essay.name}-label`} htmlFor={essay.name}>{essay.label} <span aria-hidden="true">*</span></label>
                <p>{essay.prompt}</p>
              </div>
            </div>
            <textarea
              id={essay.name}
              aria-label={essay.label}
              rows={8}
              maxLength={2000}
              {...register(essay.name)}
              aria-invalid={Boolean(error)}
              aria-describedby={`${criteriaId}${error ? ` ${errorId}` : ''}`}
            />
            <div className="essay-question__meta">
              <p id={criteriaId}>100자 이상 · 2,000자 이하</p>
              <p aria-live="polite">{value.length.toLocaleString('ko-KR')} / 2,000자</p>
            </div>
            {error && <p className="field-error" id={errorId}>100자 이상 2,000자 이하로 입력해주세요.</p>}
          </section>
        );
      })}
    </div>
  );
}
