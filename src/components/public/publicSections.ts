import type { EvidenceItem, PublishedSiteContent } from '../../content/types';

export type PublicSectionId =
  | 'metamove'
  | 'vision'
  | 'representatives'
  | 'benefits-rules'
  | 'positions';

export type ResolvedEvidenceItem = Omit<EvidenceItem, 'href'> & { href?: string };

const evidenceTargetByLabel: Record<EvidenceItem['label'], PublicSectionId> = {
  성장: 'vision',
  보상: 'benefits-rules',
  확장: 'vision',
};

export function getRenderedPublicSectionIds(content: PublishedSiteContent) {
  const ids = new Set<PublicSectionId>(['metamove']);
  const renderablePositions = content.positions.filter(({ title }) => title.trim());
  const hasGrowthContent = renderablePositions.some(
    ({ requirements, preferences }) => requirements.length > 0 || preferences.length > 0,
  );
  const hasRepresentatives = content.representatives.some(
    ({ name, role, published }) => published && name.trim() && role.trim(),
  );
  const hasBenefits = content.benefits.some(
    ({ title, description }) => title.trim() && description.trim(),
  );
  const hasRules = content.rules.some(({ label, value }) => label.trim() && value.trim());

  if (hasGrowthContent) ids.add('vision');
  if (hasRepresentatives) ids.add('representatives');
  if (hasBenefits || hasRules) ids.add('benefits-rules');
  if (renderablePositions.length > 0) ids.add('positions');

  return ids;
}

export function resolveEvidenceLinks(
  items: EvidenceItem[],
  renderedSectionIds: ReadonlySet<PublicSectionId>,
): ResolvedEvidenceItem[] {
  return items.map((item) => {
    const targetId = evidenceTargetByLabel[item.label];
    const href = renderedSectionIds.has(targetId) ? `/#${targetId}` : undefined;
    return { ...item, href };
  });
}
