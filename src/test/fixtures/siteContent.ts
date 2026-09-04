import { getPublishedContent } from '../../content/getPublishedContent';
import type { SiteContent } from '../../content/types';

function fixtureImage(label: string, background: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="${background}"/><path d="M0 650h1200" stroke="#58A6FF" stroke-width="16"/><text x="72" y="120" fill="#FFFFFF" font-family="sans-serif" font-size="44" font-weight="700">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const fixtureSiteContent: SiteContent = {
  hero: {
    headline: '메타무브짐',
    supportingCopy: '테스트 전용 채용 소개',
    imageSrc: fixtureImage('TEST HERO DESKTOP', '#0C315F'),
    imageAlt: '테스트용 센터 와이드 이미지',
    mobileImageSrc: fixtureImage('TEST HERO MOBILE', '#09264D'),
    desktopObjectPosition: '50% 45%',
    mobileObjectPosition: '50% 50%',
    published: true,
  },
  evidence: [
    { index: '01', label: '성장', description: '테스트 성장 근거', href: '/#vision', published: true },
    { index: '02', label: '보상', description: '테스트 보상 근거', href: '/#benefits-rules', published: true },
    { index: '03', label: '확장', description: '테스트 확장 근거', href: '/#vision', published: true },
  ],
  center: {
    title: '움직임을 설계하는 센터',
    paragraphs: ['테스트 전용 센터 소개입니다.'],
    imageSrc: fixtureImage('TEST CENTER', '#1268D8'),
    imageAlt: '테스트용 센터 내부',
    desktopObjectPosition: '55% 45%',
    mobileObjectPosition: '62% 50%',
    published: true,
  },
  expansionVision: {
    title: '테스트용 확장 비전',
    body: '테스트 전용 다지점 확장 방향입니다.',
    published: true,
  },
  representatives: [
    {
      id: 'approved-founder',
      name: '김메타',
      role: '교육 대표',
      career: ['테스트 경력'],
      expertise: ['교육 설계'],
      imageSrc: fixtureImage('TEST PERSON 01', '#0C315F'),
      imageAlt: '테스트용 김메타 프로필',
      published: true,
    },
    {
      id: 'approved-founder-two',
      name: '이무브',
      role: '운영 대표',
      career: ['테스트 운영 경력'],
      expertise: ['운영 설계'],
      imageSrc: fixtureImage('TEST PERSON 02', '#1268D8'),
      imageAlt: '테스트용 이무브 프로필',
      published: true,
    },
    {
      id: 'draft-founder',
      name: '승인되지 않은 대표',
      role: '운영 대표',
      career: ['미공개 경력'],
      expertise: ['미공개 전문성'],
      imageSrc: fixtureImage('DRAFT PERSON', '#52677F'),
      imageAlt: '미공개 대표',
      published: false,
    },
  ],
  growthTracks: [
    {
      id: 'entry-growth',
      title: '신입 트레이너',
      level: 'entry',
      outcomes: ['테스트 고객 경험 성장', '테스트 교육 성장'],
      published: true,
    },
    {
      id: 'experienced-growth',
      title: '경력 트레이너',
      level: 'experienced',
      outcomes: ['테스트 리더십 성장', '테스트 운영 성장'],
      published: true,
    },
    {
      id: 'draft-growth',
      title: '공개되면 안 되는 성장 경로',
      level: 'experienced',
      outcomes: ['공개되면 안 되는 성장 결과'],
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
    { id: 'compensation', label: '보상', value: '테스트 기준', published: true },
    { id: 'day-off', label: '휴무', value: '테스트 일정', published: true },
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
  hiringProcess: {
    title: '테스트용 채용 절차',
    steps: ['테스트 서류 검토', '테스트 면접'],
    published: true,
  },
};

export const publishedFixture = getPublishedContent(fixtureSiteContent);
