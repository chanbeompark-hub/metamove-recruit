import type { PublishedSiteContent } from '../../content/types';

export type PublicSectionId =
  | 'metamove'
  | 'vision'
  | 'growth'
  | 'representatives'
  | 'benefits-rules'
  | 'positions';

type PublishedEvidenceItem = PublishedSiteContent['evidence'][number];

export type ResolvedEvidenceItem = Omit<PublishedEvidenceItem, 'href'> & { href?: string };

const evidenceTargetByLabel: Record<PublishedEvidenceItem['label'], PublicSectionId> = {
  성장: 'growth',
  보상: 'benefits-rules',
  확장: 'vision',
};

export function getRenderedPublicSectionIds(content: PublishedSiteContent) {
  const ids = new Set<PublicSectionId>(['metamove']);
  const renderablePositions = content.positions.filter(({ title }) => title.trim());
  const hasExpansionVision = Boolean(
    content.expansionVision?.title.trim() && content.expansionVision.body.trim(),
  );
  const hasGrowthContent = content.growthTracks.some(
    ({ title, outcomes }) => title.trim() && outcomes.length > 0,
  );
  const hasRepresentatives = content.representatives.some(
    ({ name, role }) => name.trim() && role.trim(),
  );
  const hasBenefits = content.benefits.some(
    ({ title, description }) => title.trim() && description.trim(),
  );
  const hasRules = content.rules.some(({ label, value }) => label.trim() && value.trim());

  if (hasExpansionVision) ids.add('vision');
  if (hasGrowthContent) ids.add('growth');
  if (hasRepresentatives) ids.add('representatives');
  if (hasBenefits || hasRules) ids.add('benefits-rules');
  if (renderablePositions.length > 0) ids.add('positions');

  return ids;
}

export function resolveEvidenceLinks(
  items: PublishedSiteContent['evidence'],
  renderedSectionIds: ReadonlySet<PublicSectionId>,
): ResolvedEvidenceItem[] {
  return items.map((item) => {
    const targetId = evidenceTargetByLabel[item.label];
    const href = renderedSectionIds.has(targetId) ? `#${targetId}` : undefined;
    return { ...item, href };
  });
}
