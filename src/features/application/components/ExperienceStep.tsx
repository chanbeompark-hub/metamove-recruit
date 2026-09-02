import { useEffect } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import type { ApplicationInput } from '../types';

export function ExperienceStep() {
  const {
    control,
    getValues,
    register,
    setValue,
    unregister,
    formState: { errors },
  } = useFormContext<ApplicationInput>();
  const level = useWatch({ control, name: 'level' });
  const certifications = useWatch({ control, name: 'certifications' }) ?? [];
  const specialties = useWatch({ control, name: 'specialties' }) ?? [];
  const history = useFieldArray({ control, name: 'careerHistory' });

  useEffect(() => {
    if (level !== 'entry') return;
    unregister('careerHistory');
    setValue('careerHistory', [], { shouldDirty: true });
    setValue('careerMonths', 0, { shouldDirty: true });
  }, [level, setValue, unregister]);

  const addCertification = () => {
    setValue('certifications', [...getValues('certifications'), ''], { shouldDirty: true });
  };
  const removeCertification = (index: number) => {
    const next = getValues('certifications').filter((_, itemIndex) => itemIndex !== index);
    setValue('certifications', next.length ? next : [''], { shouldDirty: true });
  };
  const addSpecialty = () => {
    setValue('specialties', [...getValues('specialties'), ''], { shouldDirty: true });
  };
  const removeSpecialty = (index: number) => {
    const next = getValues('specialties').filter((_, itemIndex) => itemIndex !== index);
    setValue('specialties', next.length ? next : [''], { shouldDirty: true });
  };

  return (
    <div className="form-stack">
      <p className="step-intro">경력은 총 개월 수와 각 근무 이력의 합계가 일치하도록 입력해주세요.</p>
      {level === 'experienced' ? (
        <section className="career-section" aria-labelledby="career-heading">
          <div className="section-heading-row">
            <div>
              <p className="section-index">01</p>
              <h2 id="career-heading">근무 이력</h2>
            </div>
            <button className="button button--quiet" type="button" onClick={() => history.append({ company: '', role: '', months: 1 })}>
              근무 이력 추가
            </button>
          </div>
          <div className="field-group field-group--compact">
            <label htmlFor="career-months">총 경력 기간(개월) <span aria-hidden="true">*</span></label>
            <input id="career-months" aria-label="총 경력 기간(개월)" type="number" min="1" max="600" inputMode="numeric" {...register('careerMonths', { valueAsNumber: true })} aria-invalid={Boolean(errors.careerMonths)} aria-describedby={errors.careerMonths ? 'career-months-error' : undefined} />
            {errors.careerMonths && <p className="field-error" id="career-months-error">{errors.careerMonths.message}</p>}
          </div>
          <div className="history-list">
            {history.fields.map((field, index) => (
              <fieldset className="history-row" key={field.id}>
                <legend>근무 이력 {index + 1}</legend>
                <div className="field-grid field-grid--history">
                  <div className="field-group">
                    <label htmlFor={`company-${index}`}>근무처 {index + 1}</label>
                    <input id={`company-${index}`} {...register(`careerHistory.${index}.company`)} />
                  </div>
                  <div className="field-group">
                    <label htmlFor={`role-${index}`}>담당 역할 {index + 1}</label>
                    <input id={`role-${index}`} {...register(`careerHistory.${index}.role`)} />
                  </div>
                  <div className="field-group">
                    <label htmlFor={`months-${index}`}>근무 개월 {index + 1}</label>
                    <input id={`months-${index}`} type="number" min="1" max="600" inputMode="numeric" {...register(`careerHistory.${index}.months`, { valueAsNumber: true })} />
                  </div>
                </div>
                <button className="text-button" type="button" onClick={() => history.remove(index)}>근무 이력 {index + 1} 삭제</button>
              </fieldset>
            ))}
          </div>
          {errors.careerHistory && <p className="field-error">경력자는 완전한 근무 이력을 한 개 이상 입력해주세요.</p>}
        </section>
      ) : (
        <div className="entry-career-note">
          <span className="entry-career-note__index" aria-hidden="true">00</span>
          <p>신입 지원자는 경력 기간을 0개월로 저장합니다.</p>
        </div>
      )}

      <div className="qualification-grid">
        <section aria-labelledby="certification-heading">
          <p className="section-index">02</p>
          <h2 id="certification-heading">자격증 <span className="optional-mark">선택</span></h2>
          <div className="repeatable-list">
            {certifications.map((_, index) => (
              <div className="repeatable-field" key={`certification-${index}`}>
                <div className="field-group">
                  <label htmlFor={`certification-${index}`}>자격증 {index + 1}</label>
                  <input id={`certification-${index}`} {...register(`certifications.${index}`)} />
                </div>
                {certifications.length > 1 && <button className="text-button" type="button" onClick={() => removeCertification(index)}>자격증 {index + 1} 삭제</button>}
              </div>
            ))}
          </div>
          <button className="text-button text-button--add" type="button" onClick={addCertification}>+ 자격증 추가</button>
          {errors.certifications && <p className="field-error">자격증을 중복 없이 입력해주세요.</p>}
        </section>
        <section aria-labelledby="specialty-heading">
          <p className="section-index">03</p>
          <h2 id="specialty-heading">전문 분야 <span aria-hidden="true">*</span></h2>
          <div className="repeatable-list">
            {specialties.map((_, index) => (
              <div className="repeatable-field" key={`specialty-${index}`}>
                <div className="field-group">
                  <label htmlFor={`specialty-${index}`}>전문 분야 {index + 1}</label>
                  <input id={`specialty-${index}`} {...register(`specialties.${index}`)} />
                </div>
                {specialties.length > 1 && <button className="text-button" type="button" onClick={() => removeSpecialty(index)}>전문 분야 {index + 1} 삭제</button>}
              </div>
            ))}
          </div>
          <button className="text-button text-button--add" type="button" onClick={addSpecialty}>+ 전문 분야 추가</button>
          {errors.specialties && <p className="field-error">전문 분야를 입력해주세요.</p>}
        </section>
      </div>
    </div>
  );
}
