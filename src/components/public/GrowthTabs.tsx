import { type KeyboardEvent, useId, useRef, useState } from 'react';
import type { Position } from '../../content/types';

type GrowthTabsProps = {
  positions: Position[];
};

export function GrowthTabs({ positions }: GrowthTabsProps) {
  const availablePositions = positions.filter(
    ({ title, requirements, preferences }) => title.trim() && (requirements.length > 0 || preferences.length > 0),
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const idPrefix = useId().replaceAll(':', '');

  if (availablePositions.length === 0) {
    return null;
  }

  const activeIndex = Math.min(selectedIndex, availablePositions.length - 1);

  const selectAndFocus = (index: number) => {
    const nextIndex = (index + availablePositions.length) % availablePositions.length;
    setSelectedIndex(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keyActions: Partial<Record<string, () => void>> = {
      ArrowRight: () => selectAndFocus(index + 1),
      ArrowDown: () => selectAndFocus(index + 1),
      ArrowLeft: () => selectAndFocus(index - 1),
      ArrowUp: () => selectAndFocus(index - 1),
      Home: () => selectAndFocus(0),
      End: () => selectAndFocus(availablePositions.length - 1),
    };
    const action = keyActions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <section className="growth-tabs" id="vision" aria-labelledby="growth-tabs-title">
      <div className="public-section__inner growth-tabs__grid">
        <header className="public-section__header">
          <p className="public-section__eyebrow">GROWTH / VISION</p>
          <h2 id="growth-tabs-title">성장과 비전</h2>
        </header>
        <div className="growth-tabs__interface">
          <div className="growth-tabs__list" role="tablist" aria-label="지원 경력 구분">
            {availablePositions.map((position, index) => {
              const tabId = `${idPrefix}-${position.id}-tab`;
              const panelId = `${idPrefix}-${position.id}-panel`;
              const isSelected = activeIndex === index;
              return (
                <button
                  aria-controls={panelId}
                  aria-selected={isSelected}
                  className="growth-tabs__tab"
                  id={tabId}
                  key={position.id}
                  onClick={() => setSelectedIndex(index)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  ref={(node) => { tabRefs.current[index] = node; }}
                  role="tab"
                  tabIndex={isSelected ? 0 : -1}
                  type="button"
                >
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  {position.title}
                </button>
              );
            })}
          </div>
          <div className="growth-tabs__panels">
            {availablePositions.map((position, index) => (
              <div
                aria-labelledby={`${idPrefix}-${position.id}-tab`}
                className="growth-tabs__panel"
                hidden={activeIndex !== index}
                id={`${idPrefix}-${position.id}-panel`}
                key={position.id}
                role="tabpanel"
                tabIndex={0}
              >
                {position.requirements.length > 0 && (
                  <div>
                    <h3>자격 조건</h3>
                    <ul>{position.requirements.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                )}
                {position.preferences.length > 0 && (
                  <div>
                    <h3>우대 사항</h3>
                    <ul>{position.preferences.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
