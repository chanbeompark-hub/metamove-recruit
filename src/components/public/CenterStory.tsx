import type { PublishedSiteContent } from '../../content/types';

type CenterStoryProps = {
  center: NonNullable<PublishedSiteContent['center']>;
};

export function CenterStory({ center }: CenterStoryProps) {
  if (!center.title.trim() || !center.body.trim()) {
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
          <p className="center-story__body">{center.body}</p>
        </div>
        {hasApprovedMedia && (
          <figure className="center-story__media">
            <img src={center.imageSrc} alt={center.imageAlt} />
          </figure>
        )}
      </div>
    </section>
  );
}
