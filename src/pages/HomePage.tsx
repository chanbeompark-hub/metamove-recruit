import { BenefitsAndRules } from '../components/public/BenefitsAndRules';
import { CenterStory } from '../components/public/CenterStory';
import { EvidenceRail } from '../components/public/EvidenceRail';
import { FounderPair } from '../components/public/FounderPair';
import { GrowthTabs } from '../components/public/GrowthTabs';
import { HeroEvidence } from '../components/public/HeroEvidence';
import { PositionSummary } from '../components/public/PositionSummary';
import type { PublishedSiteContent } from '../content/types';
import '../components/public/public-sections.css';

type HomePageProps = {
  content: PublishedSiteContent;
};

export function HomePage({ content }: HomePageProps) {
  return (
    <main id="main-content" tabIndex={-1}>
      <HeroEvidence hero={content.hero} />
      <EvidenceRail items={content.evidence} />
      {content.center && <CenterStory center={content.center} />}
      {content.representatives.length > 0 && <FounderPair people={content.representatives} />}
      {content.positions.length > 0 && <GrowthTabs positions={content.positions} />}
      {(content.benefits.length > 0 || content.rules.length > 0) && (
        <BenefitsAndRules benefits={content.benefits} rules={content.rules} />
      )}
      {content.positions.length > 0 && <PositionSummary positions={content.positions} />}
    </main>
  );
}
