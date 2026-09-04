import type { PublishedSiteContent } from '../../content/types';

type HiringProcessProps = {
  process: NonNullable<PublishedSiteContent['hiringProcess']>;
};

const draftNotice = '1차 채용안 · 급여·고용형태·근무조건·일정은 확정 후 안내합니다.';

export function HiringProcess({ process }: HiringProcessProps) {
  if (!process.title.trim() || process.steps.length === 0) {
    return null;
  }

  const isDraft = process.status !== 'confirmed';
  const sectionTitle = isDraft ? '1차 채용 절차안' : process.title;

  return (
    <section className="hiring-process" id="hiring-process" aria-labelledby="hiring-process-title">
      <div className="public-section__inner hiring-process__grid">
        <div className="hiring-process__intro">
          <header className="public-section__header">
            <p className="public-section__eyebrow">{isDraft ? 'RECRUITMENT REVIEW' : 'HIRING PROCESS'}</p>
            <h2 id="hiring-process-title">{sectionTitle}</h2>
          </header>
          {isDraft && <p className="recruitment-draft-notice" role="note">{draftNotice}</p>}
        </div>
        <ol className="hiring-process__steps">
          {process.steps.map((step, index) => (
            <li key={step}>
              <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
