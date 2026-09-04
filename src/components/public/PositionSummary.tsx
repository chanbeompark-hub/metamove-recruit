import { Link } from 'react-router-dom';
import type { PublishedSiteContent } from '../../content/types';

type PositionSummaryProps = {
  positions: PublishedSiteContent['positions'];
};

const draftNotice = '1차 채용안 · 급여·고용형태·근무조건·일정은 확정 후 안내합니다.';

export function PositionSummary({ positions }: PositionSummaryProps) {
  const availablePositions = positions.filter(({ title }) => title.trim());

  if (availablePositions.length === 0) {
    return null;
  }

  const hasDraftPosition = availablePositions.some(({ status }) => status === 'draft');
  const sectionTitle = hasDraftPosition ? '1차 채용 검토안' : '채용 포지션';

  return (
    <section className="position-summary" id="positions" aria-labelledby="positions-title">
      <div className="public-section__inner">
        <header className="public-section__header public-section__header--inverse">
          <p className="public-section__eyebrow">{hasDraftPosition ? 'RECRUITMENT REVIEW' : 'OPEN POSITIONS'}</p>
          <h2 id="positions-title">{sectionTitle}</h2>
        </header>
        {hasDraftPosition && <p className="recruitment-draft-notice recruitment-draft-notice--inverse" role="note">{draftNotice}</p>}
        <div className="position-summary__list">
          {availablePositions.map((position, index) => (
            <article className="position-summary__item" key={position.id}>
              <span className="position-summary__number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <p className="position-summary__level">
                  {position.level === 'entry' ? 'ENTRY' : 'EXPERIENCED'}
                </p>
                <h3>{position.title}</h3>
              </div>
              <div className="position-summary__requirements">
                {position.requirements.length > 0 && (
                  <div>
                    <h4>자격 조건</h4>
                    <ul>{position.requirements.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                )}
                {position.preferences.length > 0 && (
                  <div>
                    <h4>우대 사항</h4>
                    <ul>{position.preferences.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
        <Link className="position-summary__action" to="/apply">
          지원서 미리보기
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
