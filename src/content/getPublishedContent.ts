import type { HeroContent, PublishedSiteContent, SiteContent } from './types';

export const APPROVED_HERO_FALLBACK: HeroContent = {
  headline: '움직임을 바꾸는 트레이너, 메타무브짐에서 함께 성장하세요',
};

export function getPublishedContent(content: SiteContent): PublishedSiteContent {
  const center = content.center.published
    ? omitPublicationFlag(content.center)
    : undefined;
  const expansionVision = content.expansionVision.published
    ? omitPublicationFlag(content.expansionVision)
    : undefined;
  const hiringProcess = content.hiringProcess.published
    ? omitPublicationFlag(content.hiringProcess)
    : undefined;

  return {
    hero: content.hero.published
      ? omitPublicationFlag(content.hero)
      : APPROVED_HERO_FALLBACK,
    evidence: publishEntries(content.evidence),
    center,
    expansionVision,
    representatives: publishEntries(content.representatives),
    growthTracks: publishEntries(content.growthTracks),
    benefits: publishEntries(content.benefits),
    rules: publishEntries(content.rules),
    positions: publishEntries(content.positions),
    hiringProcess,
  };
}

function publishEntries<T extends { published: boolean }>(entries: T[]) {
  return entries
    .filter(({ published }) => published === true)
    .map(omitPublicationFlag);
}

function omitPublicationFlag<T extends { published: boolean }>(
  section: T,
): Omit<T, 'published'> {
  const details = { ...section } as Omit<T, 'published'> & { published?: boolean };
  delete details.published;
  return details;
}
