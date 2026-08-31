import type { PublishedSiteContent, SiteContent } from './types';

export function getPublishedContent(content: SiteContent): PublishedSiteContent {
  const center = content.center.published
    ? omitPublicationFlag(content.center)
    : undefined;

  return {
    hero: content.hero,
    evidence: content.evidence.filter(({ published }) => published === true),
    center,
    representatives: content.representatives.filter(({ published }) => published === true),
    benefits: content.benefits.filter(({ published }) => published === true),
    rules: content.rules.filter(({ published }) => published === true),
    positions: content.positions.filter(({ published }) => published === true),
  };
}

function omitPublicationFlag<T extends { published: boolean }>(
  section: T,
): Omit<T, 'published'> {
  const details = { ...section } as Omit<T, 'published'> & { published?: boolean };
  delete details.published;
  return details;
}
