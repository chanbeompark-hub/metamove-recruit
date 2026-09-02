import { APPLICATION_STEPS } from '../steps';

type ApplicationStepperProps = {
  activeStep: number;
};

export function ApplicationStepper({ activeStep }: ApplicationStepperProps) {
  return (
    <nav className="application-stepper" aria-label="지원서 진행 상황">
      <p className="application-stepper__eyebrow">지원서 미리보기</p>
      <p className="application-stepper__mobile-label" aria-hidden="true">
        {activeStep + 1} / {APPLICATION_STEPS.length} · {APPLICATION_STEPS[activeStep]}
      </p>
      <ol className="application-stepper__list" aria-label="지원 단계">
        {APPLICATION_STEPS.map((step, index) => {
          const state = index < activeStep ? 'complete' : index === activeStep ? 'active' : 'upcoming';
          return (
            <li
              key={step}
              className="application-stepper__item"
              data-state={state}
              aria-current={index === activeStep ? 'step' : undefined}
            >
              <span className="application-stepper__number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="application-stepper__label">{step}</span>
              <span className="application-stepper__state sr-only">
                {state === 'complete' ? '완료' : state === 'active' ? '현재 단계' : '예정'}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="application-stepper__note">
        입력 내용은 이 브라우저 탭의 임시 저장에만 보관됩니다.
      </p>
    </nav>
  );
}
