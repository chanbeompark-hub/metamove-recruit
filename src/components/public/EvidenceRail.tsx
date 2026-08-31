import type { CSSProperties } from 'react';
import type { ResolvedEvidenceItem } from './publicSections';
import './evidence.css';

type EvidenceRailProps = {
  items: ResolvedEvidenceItem[];
};

export function EvidenceRail({ items }: EvidenceRailProps) {
  return (
    <ol className="evidence-rail" aria-label="채용 핵심 기준">
      {items.map((item, position) => {
        const details = (
          <>
            <span className="evidence-rail__index">{item.index}</span>
            <strong className="evidence-rail__label">{item.label}</strong>
            {item.description && (
              <p className="evidence-rail__description">{item.description}</p>
            )}
            <span className="evidence-rail__arrow" aria-hidden="true">↘</span>
          </>
        );

        return (
          <li
            className="evidence-rail__item"
            key={item.index}
            style={{ '--evidence-delay': `${360 + position * 90}ms` } as CSSProperties}
          >
            {item.href ? (
              <a className="evidence-rail__link" href={item.href}>{details}</a>
            ) : (
              <div className="evidence-rail__link evidence-rail__link--static">{details}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
