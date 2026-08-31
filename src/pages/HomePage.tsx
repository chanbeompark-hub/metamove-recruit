import { BenefitsAndRules } from '../components/public/BenefitsAndRules';
import { CenterStory } from '../components/public/CenterStory';
import { EvidenceRail } from '../components/public/EvidenceRail';
import { FounderPair } from '../components/public/FounderPair';
import { GrowthTabs } from '../components/public/GrowthTabs';
import { HeroEvidence } from '../components/public/HeroEvidence';
import { PositionSummary } from '../components/public/PositionSummary';
import { getRenderedPublicSectionIds, resolveEvidenceLinks } from '../components/public/publicSections';
import type { PublishedSiteContent } from '../content/types';
import '../components/public/public-sections.css';

type HomePageProps = {
  content: PublishedSiteContent;
};

export function HomePage({ content }: HomePageProps) {
  const renderedSectionIds = getRenderedPublicSectionIds(content);
  const evidenceItems = resolveEvidenceLinks(content.evidence, renderedSectionIds);

  return (
    <main id="main-content" tabIndex={-1}>
      <HeroEvidence hero={content.hero} />
      <EvidenceRail items={evidenceItems} />
      {content.center && <CenterStory center={content.center} />}
      {renderedSectionIds.has('representatives') && <FounderPair people={content.representatives} />}
      {renderedSectionIds.has('vision') && <GrowthTabs positions={content.positions} />}
      {renderedSectionIds.has('benefits-rules') && (
        <BenefitsAndRules benefits={content.benefits} rules={content.rules} />
      )}
      {renderedSectionIds.has('positions') && <PositionSummary positions={content.positions} />}
    </main>
  );
}
