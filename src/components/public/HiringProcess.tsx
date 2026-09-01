import type { PublishedSiteContent } from '../../content/types';

type HiringProcessProps = {
  process: NonNullable<PublishedSiteContent['hiringProcess']>;
};

export function HiringProcess({ process }: HiringProcessProps) {
  if (!process.title.trim() || process.steps.length === 0) {
    return null;
  }

  return (
    <section className="hiring-process" id="hiring-process" aria-labelledby="hiring-process-title">
      <div className="public-section__inner hiring-process__grid">
        <header className="public-section__header">
          <p className="public-section__eyebrow">HIRING PROCESS</p>
          <h2 id="hiring-process-title">{process.title}</h2>
        </header>
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
