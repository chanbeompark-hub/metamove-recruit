export type PublishableSection<T> = T & { published: boolean };
export type Published<T extends { published: boolean }> = Omit<T, 'published'>;

export type ResponsiveMedia = {
  imageSrc?: string;
  imageAlt?: string;
  mobileImageSrc?: string;
  desktopObjectPosition?: string;
  mobileObjectPosition?: string;
};

export type HeroContent = ResponsiveMedia & {
  headline: string;
  supportingCopy?: string;
};

export type Representative = ResponsiveMedia & {
  id: string;
  name: string;
  role: string;
  career: string[];
  expertise: string[];
  published: boolean;
};

export type Benefit = ResponsiveMedia & {
  id: string;
  title: string;
  description: string;
  details?: string[];
  published: boolean;
};

export type WorkRule = {
  id: string;
  label: string;
  value: string;
  published: boolean;
};

export type Position = {
  id: string;
  title: string;
  level: 'entry' | 'experienced';
  requirements: string[];
  preferences: string[];
  status: 'draft' | 'confirmed';
  published: boolean;
};

export type ExpansionVision = PublishableSection<ResponsiveMedia & {
  title: string;
  body: string;
}>;

export type GrowthTrack = ResponsiveMedia & {
  id: string;
  title: string;
  level: 'entry' | 'experienced';
  outcomes: string[];
  published: boolean;
};

export type HiringProcess = PublishableSection<{
  title: string;
  steps: string[];
  status: 'draft' | 'confirmed';
}>;

export type EvidenceItem = {
  index: '01' | '02' | '03';
  label: '성장' | '보상' | '확장';
  description?: string;
  href: string;
  published: boolean;
};

export type SiteContent = {
  hero: PublishableSection<HeroContent>;
  evidence: EvidenceItem[];
  center: PublishableSection<ResponsiveMedia & {
    title: string;
    paragraphs: string[];
  }>;
  expansionVision: ExpansionVision;
  representatives: Representative[];
  growthTracks: GrowthTrack[];
  benefits: Benefit[];
  rules: WorkRule[];
  positions: Position[];
  hiringProcess: HiringProcess;
};

export type PublishedSiteContent = {
  hero: HeroContent;
  evidence: Published<EvidenceItem>[];
  center?: Published<SiteContent['center']>;
  expansionVision?: Published<ExpansionVision>;
  representatives: Published<Representative>[];
  growthTracks: Published<GrowthTrack>[];
  benefits: Published<Benefit>[];
  rules: Published<WorkRule>[];
  positions: Published<Position>[];
  hiringProcess?: Published<HiringProcess>;
};
