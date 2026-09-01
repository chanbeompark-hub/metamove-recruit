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
        const finalDigit = Number.parseInt(item.index, 10);
        const indexStyle = {
          '--evidence-index-offset': `-${finalDigit}em`,
        } as CSSProperties;
        const details = (
          <>
            <span className="evidence-rail__index">
              <span className="evidence-rail__index-final">{item.index}</span>
              <span className="evidence-rail__index-motion" aria-hidden="true">
                <span>0</span>
                <span className="evidence-rail__index-digit-window">
                  <span className="evidence-rail__index-digit-strip" style={indexStyle}>
                    {Array.from({ length: finalDigit + 1 }, (_, digit) => (
                      <span key={digit}>{digit}</span>
                    ))}
                  </span>
                </span>
              </span>
            </span>
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
