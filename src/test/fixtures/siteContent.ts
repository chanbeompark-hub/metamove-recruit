import { getPublishedContent } from '../../content/getPublishedContent';
import type { SiteContent } from '../../content/types';

export const fixtureSiteContent: SiteContent = {
  hero: {
    headline: '메타무브짐',
    supportingCopy: '테스트 전용 채용 소개',
    published: true,
  },
  evidence: [
    { index: '01', label: '성장', description: '테스트 성장 근거', href: '/#vision', published: true },
    { index: '02', label: '보상', description: '테스트 보상 근거', href: '/#benefits-rules', published: true },
    { index: '03', label: '확장', description: '승인되지 않은 확장 수치', href: '/#vision', published: false },
  ],
  center: {
    title: '움직임을 설계하는 센터',
    body: '테스트 전용 센터 소개입니다.',
    imageSrc: '/fixtures/center.jpg',
    imageAlt: '테스트용 센터 내부',
    published: true,
  },
  representatives: [
    {
      id: 'approved-founder',
      name: '김메타',
      role: '교육 대표',
      career: ['테스트 경력'],
      expertise: ['교육 설계'],
      imageSrc: '/fixtures/founder.jpg',
      imageAlt: '테스트용 김메타 프로필',
      published: true,
    },
    {
      id: 'draft-founder',
      name: '승인되지 않은 대표',
      role: '운영 대표',
      career: ['미공개 경력'],
      expertise: ['미공개 전문성'],
      imageSrc: '/fixtures/draft-founder.jpg',
      imageAlt: '미공개 대표',
      published: false,
    },
  ],
  benefits: [
    {
      id: 'learning-support',
      title: '교육 지원',
      description: '테스트 전용 혜택 설명입니다.',
      published: true,
    },
    {
      id: 'draft-benefit',
      title: '승인되지 않은 혜택',
      description: '공개되면 안 됩니다.',
      published: false,
    },
  ],
  rules: [
    { id: 'work-hours', label: '근무 시간', value: '테스트 협의', published: true },
  ],
  positions: [
    {
      id: 'entry-trainer',
      title: '신입 트레이너',
      level: 'entry',
      requirements: ['테스트 기본 교육'],
      preferences: ['고객 경험 학습'],
      published: true,
    },
    {
      id: 'experienced-trainer',
      title: '경력 트레이너',
      level: 'experienced',
      requirements: ['테스트 현장 경험'],
      preferences: ['리더십'],
      published: true,
    },
    {
      id: 'draft-position',
      title: '승인되지 않은 포지션',
      level: 'experienced',
      requirements: ['미공개 조건'],
      preferences: [],
      published: false,
    },
  ],
};

export const publishedFixture = getPublishedContent(fixtureSiteContent);
