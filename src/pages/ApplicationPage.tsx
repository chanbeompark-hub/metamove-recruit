import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { FormProvider, useForm, type DefaultValues, type FieldPath } from 'react-hook-form';
import { ApplicationStepper } from '../features/application/components/ApplicationStepper';
import { BasicInfoStep } from '../features/application/components/BasicInfoStep';
import { EssayStep } from '../features/application/components/EssayStep';
import { ExperienceStep } from '../features/application/components/ExperienceStep';
import { FileStep } from '../features/application/components/FileStep';
import { ReviewStep } from '../features/application/components/ReviewStep';
import { applicationSchema, type ApplicationInput } from '../features/application/schema';
import { APPLICATION_STEPS } from '../features/application/steps';
import { DRAFT_WARNING, loadDraft, saveDraft } from '../features/application/store';
import '../styles/application.css';

const ACTIVE_FIELDS: FieldPath<ApplicationInput>[][] = [
  ['name', 'phone', 'email', 'level', 'availableFrom'],
  ['careerMonths', 'careerHistory', 'certifications', 'specialties'],
  ['motivation', 'strengths', 'goals'],
  [],
  [],
];

const STEP_ERROR_COPY = [
  '기본 정보를 확인해주세요.',
  '경력·자격 정보를 확인해주세요.',
  '자기소개서 입력 기준을 확인해주세요.',
  '필수 서류를 첨부해주세요.',
  '',
];

function initialValues() {
  let loadFailed = false;
  const draft = loadDraft(() => { loadFailed = true; });
  const defaults: DefaultValues<ApplicationInput> = {
    name: draft.name ?? '',
    phone: draft.phone ?? '',
    email: draft.email ?? '',
    level: draft.level ?? 'entry',
    availableFrom: draft.availableFrom ?? '',
    careerMonths: draft.level === 'experienced' ? draft.careerMonths ?? 0 : 0,
    careerHistory: draft.level === 'experienced' ? draft.careerHistory ?? [] : [],
    certifications: draft.certifications?.length ? draft.certifications : [''],
    specialties: draft.specialties?.length ? draft.specialties : [''],
    motivation: draft.motivation ?? '',
    strengths: draft.strengths ?? '',
    goals: draft.goals ?? '',
  };
  return { defaults, loadFailed };
}

export function ApplicationPage() {
  const [initial] = useState(initialValues);
  const [activeStep, setActiveStep] = useState(0);
  const [editingFromReview, setEditingFromReview] = useState(false);
  const [showErrorSummary, setShowErrorSummary] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(initial.loadFailed ? DRAFT_WARNING : null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [portfolioFile, setPortfolioFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const form = useForm<ApplicationInput>({
    defaultValues: initial.defaults,
    resolver: zodResolver(applicationSchema),
    shouldUnregister: true,
  });

  useEffect(() => {
    headingRef.current?.focus();
  }, [activeStep]);

  useEffect(() => {
    if (showErrorSummary) errorSummaryRef.current?.focus();
  }, [showErrorSummary]);

  const normalizeExperience = () => {
    const certifications = form.getValues('certifications') ?? [];
    const specialties = form.getValues('specialties') ?? [];
    form.setValue('certifications', certifications.map((item) => item.trim()).filter(Boolean));
    form.setValue('specialties', specialties.map((item) => item.trim()).filter(Boolean));
    if (form.getValues('level') === 'entry') {
      form.unregister('careerHistory');
      form.setValue('careerHistory', []);
      form.setValue('careerMonths', 0);
    }
  };

  const persist = () => {
    const saved = saveDraft(form.getValues(), () => setStorageWarning(DRAFT_WARNING));
    if (!saved) setStorageWarning(DRAFT_WARNING);
  };

  const moveTo = (step: number) => {
    setShowErrorSummary(false);
    setFileError(null);
    setActiveStep(step);
  };

  const validateActiveSchemaIssues = () => {
    if (activeStep > 2) return true;
    const activeRoots = new Set(ACTIVE_FIELDS[activeStep].map((field) => field.split('.')[0]));
    const result = applicationSchema.safeParse({ ...form.getValues(), privacyConsent: true });
    if (result.success) return true;

    const activeIssues = result.error.issues.filter((issue) => activeRoots.has(String(issue.path[0])));
    for (const issue of activeIssues) {
      const path = issue.path.join('.') as FieldPath<ApplicationInput>;
      form.setError(path, { type: 'schema', message: issue.message });
    }
    return activeIssues.length === 0;
  };

  const advance = async () => {
    if (activeStep === 1) normalizeExperience();
    if (activeStep === 3 && !resumeFile) {
      setFileError('이력서를 첨부해주세요.');
      setShowErrorSummary(true);
      return;
    }

    const fieldsValid = await form.trigger(ACTIVE_FIELDS[activeStep], { shouldFocus: false });
    const schemaValid = validateActiveSchemaIssues();
    if (!fieldsValid || !schemaValid) {
      setShowErrorSummary(true);
      return;
    }

    persist();
    if (editingFromReview && activeStep === 0) {
      moveTo(1);
      return;
    }
    moveTo(editingFromReview ? 4 : Math.min(activeStep + 1, 4));
    setEditingFromReview(false);
  };

  const goBack = () => {
    if (activeStep === 0) return;
    moveTo(activeStep - 1);
    setEditingFromReview(false);
  };

  const editStep = (step: number) => {
    setEditingFromReview(true);
    moveTo(step);
  };

  return (
    <main id="main-content" className="application-page">
      <div className="application-page__grid">
        <ApplicationStepper activeStep={activeStep} />
        <FormProvider {...form}>
          <form className="application-form" noValidate onSubmit={(event) => event.preventDefault()}>
            <header className="application-form__header">
              <p className="application-form__kicker">단계 {String(activeStep + 1).padStart(2, '0')}</p>
              <h1 ref={headingRef} tabIndex={-1}>{APPLICATION_STEPS[activeStep]}</h1>
              <p>{activeStep === 4 ? '제출 전에 섹션별 정보와 첨부 파일을 확인해주세요.' : '필수 항목을 입력한 뒤 다음 단계로 이동하세요.'}</p>
            </header>

            {storageWarning && <p className="storage-warning" role="status">{storageWarning}</p>}
            {showErrorSummary && (
              <div className="error-summary" role="alert" tabIndex={-1} ref={errorSummaryRef}>
                <strong>{STEP_ERROR_COPY[activeStep]}</strong>
                <p>표시된 항목을 수정하면 작성 내용을 유지한 채 계속할 수 있습니다.</p>
              </div>
            )}

            <div className="application-form__body">
              <section hidden={activeStep !== 0} aria-label="기본 정보 입력"><BasicInfoStep /></section>
              <section hidden={activeStep !== 1} aria-label="경력·자격 입력"><ExperienceStep /></section>
              <section hidden={activeStep !== 2} aria-label="자기소개서 입력"><EssayStep /></section>
              <section hidden={activeStep !== 3} aria-label="서류 첨부">
                <FileStep
                  resumeFile={resumeFile}
                  portfolioFile={portfolioFile}
                  fileError={fileError}
                  onResumeChange={(file) => { setResumeFile(file); setFileError(null); setShowErrorSummary(false); }}
                  onPortfolioChange={setPortfolioFile}
                />
              </section>
              <section hidden={activeStep !== 4} aria-label="검토·제출">
                <ReviewStep values={form.getValues()} resumeFile={resumeFile} portfolioFile={portfolioFile} onEdit={editStep} />
              </section>
            </div>

            {activeStep < 4 && (
              <footer className="application-form__actions">
                {activeStep > 0 && <button className="button button--secondary" type="button" onClick={goBack}>이전</button>}
                <button className="button button--primary" type="button" onClick={advance}>
                  {editingFromReview && activeStep === 0
                    ? '다음: 경력·자격'
                    : editingFromReview ? '검토로 돌아가기' : '다음'}
                </button>
              </footer>
            )}
            {activeStep === 4 && (
              <footer className="application-form__actions application-form__actions--review">
                <button className="button button--secondary" type="button" onClick={goBack}>이전</button>
              </footer>
            )}
          </form>
        </FormProvider>
      </div>
    </main>
  );
}
