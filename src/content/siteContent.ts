import type { SiteContent } from './types';

export const siteContent: SiteContent = {
  hero: {
    headline: '좋은 트레이너가 오래 성장하는 시스템.',
    published: true,
  },
  evidence: [
    { index: '01', label: '성장', href: '/#vision', published: true },
    { index: '02', label: '보상', href: '/#benefits-rules', published: true },
    { index: '03', label: '확장', href: '/#vision', published: true },
  ],
  center: {
    title: '',
    body: '',
    published: false,
  },
  representatives: [],
  benefits: [],
  rules: [],
  positions: [],
};

export default siteContent;
