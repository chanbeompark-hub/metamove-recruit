import type { PublishedSiteContent } from '../../content/types';

type ExpansionVisionProps = {
  vision: NonNullable<PublishedSiteContent['expansionVision']>;
};

export function ExpansionVision({ vision }: ExpansionVisionProps) {
  if (!vision.title.trim() || !vision.body.trim()) {
    return null;
  }

  return (
    <section className="expansion-vision" id="vision" aria-labelledby="expansion-vision-title">
      <div className="public-section__inner expansion-vision__grid">
        <header className="public-section__header">
          <p className="public-section__eyebrow">EXPANSION / VISION</p>
          <h2 id="expansion-vision-title">{vision.title}</h2>
        </header>
        <p className="expansion-vision__body">{vision.body}</p>
      </div>
    </section>
  );
}
