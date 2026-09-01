import { Link } from 'react-router-dom';
import type { PublishedSiteContent } from '../../content/types';

type PositionSummaryProps = {
  positions: PublishedSiteContent['positions'];
};

export function PositionSummary({ positions }: PositionSummaryProps) {
  const availablePositions = positions.filter(({ title }) => title.trim());

  if (availablePositions.length === 0) {
    return null;
  }

  return (
    <section className="position-summary" id="positions" aria-labelledby="positions-title">
      <div className="public-section__inner">
        <header className="public-section__header public-section__header--inverse">
          <p className="public-section__eyebrow">OPEN POSITIONS</p>
          <h2 id="positions-title">채용 포지션</h2>
        </header>
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
          지원 페이지로 이동
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
