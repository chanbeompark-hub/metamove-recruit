import type { SiteContent } from './types';

export const siteContent: SiteContent = {
  hero: {
    headline: '움직임을 바꾸는 트레이너, 메타무브짐에서 함께 성장하세요',
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
  expansionVision: {
    title: '',
    body: '',
    published: false,
  },
  representatives: [],
  growthTracks: [],
  benefits: [],
  rules: [],
  positions: [],
  hiringProcess: {
    title: '',
    steps: [],
    published: false,
  },
};

export default siteContent;
