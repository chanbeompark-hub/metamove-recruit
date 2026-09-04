import type { PublishedSiteContent } from '../../content/types';
import { ResponsiveMediaImage } from './ResponsiveMediaImage';

type CenterStoryProps = {
  center: NonNullable<PublishedSiteContent['center']>;
};

export function CenterStory({ center }: CenterStoryProps) {
  const paragraphs = center.paragraphs.filter((paragraph) => paragraph.trim());

  if (!center.title.trim() || paragraphs.length === 0) {
    return null;
  }

  const hasApprovedMedia = Boolean(center.imageSrc && center.imageAlt);

  return (
    <section className="center-story" aria-label="센터 소개">
      <div className="public-section__inner center-story__grid">
        <div className="center-story__index" aria-hidden="true">CENTER / 01</div>
        <div className="center-story__copy">
          <p className="public-section__eyebrow">메타무브짐</p>
          <h2>{center.title}</h2>
          <div className="center-story__body">
            {paragraphs.map((paragraph) => <p data-testid="center-story-paragraph" key={paragraph}>{paragraph}</p>)}
          </div>
        </div>
        {hasApprovedMedia && (
          <figure className="center-story__media">
            <ResponsiveMediaImage media={center} />
          </figure>
        )}
      </div>
    </section>
  );
}
