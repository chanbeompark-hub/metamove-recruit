export type PublishableSection<T> = T & { published: boolean };

export type Representative = {
  id: string;
  name: string;
  role: string;
  career: string[];
  expertise: string[];
  imageSrc: string;
  imageAlt: string;
  published: boolean;
};

export type Benefit = {
  id: string;
  title: string;
  description: string;
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
  published: boolean;
};

export type EvidenceItem = {
  index: '01' | '02' | '03';
  label: '성장' | '보상' | '확장';
  description?: string;
  href: string;
  published: boolean;
};

export type SiteContent = {
  hero: PublishableSection<{ headline: string; supportingCopy?: string }>;
  evidence: EvidenceItem[];
  center: PublishableSection<{
    title: string;
    body: string;
    imageSrc?: string;
    imageAlt?: string;
  }>;
  representatives: Representative[];
  benefits: Benefit[];
  rules: WorkRule[];
  positions: Position[];
};

export type PublishedSiteContent = Omit<SiteContent, 'center'> & {
  center?: Omit<SiteContent['center'], 'published'>;
};
