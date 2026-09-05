import { type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import type { PublishedSiteContent } from '../../content/types';
import { ResponsiveMediaImage } from './ResponsiveMediaImage';

type GrowthTabsProps = {
  tracks: PublishedSiteContent['growthTracks'];
};

export function GrowthTabs({ tracks }: GrowthTabsProps) {
  const availableTracks = tracks.filter(
    ({ title, outcomes }) => title.trim() && outcomes.length > 0,
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusedTabId, setFocusedTabId] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const idPrefix = useId().replaceAll(':', '');
  const activeIndex = Math.min(selectedIndex, Math.max(availableTracks.length - 1, 0));
  const focusedTabWasRemoved = focusedTabId !== null
    && !availableTracks.some(({ id }) => id === focusedTabId);

  useLayoutEffect(() => {
    if (focusedTabWasRemoved && availableTracks.length > 0) {
      tabRefs.current[activeIndex]?.focus();
    }
  }, [activeIndex, availableTracks.length, focusedTabWasRemoved]);

  if (availableTracks.length === 0) {
    return null;
  }

  const selectAndFocus = (index: number) => {
    const nextIndex = (index + availableTracks.length) % availableTracks.length;
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
      End: () => selectAndFocus(availableTracks.length - 1),
    };
    const action = keyActions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <section className="growth-tabs" id="growth" aria-labelledby="growth-tabs-title">
      <div className="public-section__inner growth-tabs__grid">
        <header className="public-section__header">
          <p className="public-section__eyebrow">POST-HIRE GROWTH</p>
          <h2 id="growth-tabs-title">입사 후 성장 경로</h2>
        </header>
        <div className="growth-tabs__interface">
          <div className="growth-tabs__list" role="tablist" aria-label="입사 후 성장 경로 구분">
            {availableTracks.map((track, index) => {
              const tabId = `${idPrefix}-${track.id}-tab`;
              const panelId = `${idPrefix}-${track.id}-panel`;
              const isSelected = activeIndex === index;
              return (
                <button
                  aria-controls={panelId}
                  aria-selected={isSelected}
                  className="growth-tabs__tab"
                  id={tabId}
                  key={track.id}
                  onBlur={() => setFocusedTabId(null)}
                  onClick={() => setSelectedIndex(index)}
                  onFocus={() => setFocusedTabId(track.id)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  ref={(node) => { tabRefs.current[index] = node; }}
                  role="tab"
                  tabIndex={isSelected ? 0 : -1}
                  type="button"
                >
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  {track.title}
                </button>
              );
            })}
          </div>
          <div className="growth-tabs__panels">
            {availableTracks.map((track, index) => (
              <div
                aria-labelledby={`${idPrefix}-${track.id}-tab`}
                className="growth-tabs__panel"
                hidden={activeIndex !== index}
                id={`${idPrefix}-${track.id}-panel`}
                key={track.id}
                role="tabpanel"
                tabIndex={0}
              >
                <div className="growth-tabs__copy">
                  <h3>입사 후 기대 성장</h3>
                  <ul>{track.outcomes.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                {track.imageSrc && track.imageAlt && (
                  <figure className="growth-tabs__media">
                    <ResponsiveMediaImage media={track} />
                  </figure>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
