import { useFormContext } from 'react-hook-form';
import type { ApplicationInput } from '../types';

export function BasicInfoStep() {
  const { register, formState: { errors } } = useFormContext<ApplicationInput>();

  return (
    <div className="form-stack">
      <p className="step-intro">연락 가능한 정보와 지원 구분을 입력해주세요. 모든 라벨은 화면에 계속 표시됩니다.</p>
      <div className="field-grid field-grid--two">
        <div className="field-group">
          <label htmlFor="applicant-name">이름 <span aria-hidden="true">*</span></label>
          <input id="applicant-name" aria-label="이름" autoComplete="name" {...register('name')} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} />
          {errors.name && <p className="field-error" id="name-error">이름을 2자 이상 입력해주세요.</p>}
        </div>
        <div className="field-group">
          <label htmlFor="applicant-phone">연락처 <span aria-hidden="true">*</span></label>
          <input id="applicant-phone" aria-label="연락처" type="tel" autoComplete="tel" placeholder="010-1234-5678" {...register('phone')} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'phone-error' : undefined} />
          {errors.phone && <p className="field-error" id="phone-error">010-1234-5678 형식으로 입력해주세요.</p>}
        </div>
      </div>
      <div className="field-group">
        <label htmlFor="applicant-email">이메일 <span aria-hidden="true">*</span></label>
        <input id="applicant-email" aria-label="이메일" type="email" autoComplete="email" {...register('email')} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} />
        {errors.email && <p className="field-error" id="email-error">올바른 이메일을 입력해주세요.</p>}
      </div>
      <fieldset className="field-group choice-group">
        <legend>지원 구분 <span aria-hidden="true">*</span></legend>
        <div className="segmented-choice">
          <label><input type="radio" value="entry" {...register('level')} /><span>신입</span></label>
          <label><input type="radio" value="experienced" {...register('level')} /><span>경력</span></label>
        </div>
        {errors.level && <p className="field-error">신입 또는 경력을 선택해주세요.</p>}
      </fieldset>
      <div className="field-group field-group--date">
        <label htmlFor="available-from">희망 시작일 <span aria-hidden="true">*</span></label>
        <input id="available-from" aria-label="희망 시작일" type="date" {...register('availableFrom')} aria-invalid={Boolean(errors.availableFrom)} aria-describedby={errors.availableFrom ? 'available-error' : undefined} />
        {errors.availableFrom && <p className="field-error" id="available-error">희망 시작일을 선택해주세요.</p>}
      </div>
    </div>
  );
}
