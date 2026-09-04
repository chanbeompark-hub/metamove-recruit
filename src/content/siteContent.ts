import type { SiteContent } from './types';

export const siteContent: SiteContent = {
  hero: {
    headline: '움직임을 바꾸는 트레이너, 메타무브짐에서 함께 성장하세요',
    supportingCopy: '두 대표가 직접 코칭하며, 웨이트와 기능성 움직임을 바탕으로 PT를 제대로 배울 수 있는 환경을 만듭니다.',
    published: true,
  },
  evidence: [
    {
      index: '01',
      label: '성장',
      description: '1:1 맞춤 PT와 웨이트·기능성 트레이닝을 통해 코칭의 기본을 함께 쌓습니다.',
      href: '/#growth',
      published: true,
    },
    {
      index: '02',
      label: '보상',
      description: '트레이닝 교육, 마케팅 교육, 유니폼, 운동 공간 사용, 세미나 참여 기회를 제공합니다.',
      href: '/#benefits-rules',
      published: true,
    },
    {
      index: '03',
      label: '확장',
      description: '현재 센터의 기준을 다지고 교육·리더십·운영 역량을 키우는 확장 가능한 팀을 목표로 합니다.',
      href: '/#vision',
      published: true,
    },
  ],
  center: {
    title: '상동에서 PT를 제대로 배우는 공간',
    paragraphs: [
      '상동역에서 도보 3~4분, 2시간 무료 주차가 가능한 메타무브짐입니다. 평일 09:00–23:00, 토요일 10:00–15:00 운영하며 일요일과 신정·설날·추석에는 쉽니다. 공휴일과 대체공휴일은 10:00–15:00 단축 운영합니다.',
      '두 대표가 직접 1:1 맞춤 PT, 웨이트 트레이닝, 케틀벨·클럽벨·TRX·애니멀 플로우 등 기능성 트레이닝, 패시브 스트레칭 기반 컨디셔닝을 안내합니다.',
      '운동 초보도 수업 방식과 식단 관리를 함께 배우고, PT 회원은 헬스장 이용과 운동복·수건·샤워용품·개인 락커를 이용할 수 있습니다. 반려견 동반도 가능합니다.',
    ],
    published: true,
  },
  expansionVision: {
    title: '현재의 기준을 단단하게, 다음의 가능성까지',
    body: '현재 센터의 코칭 기준을 더 단단히 하고, 트레이너가 교육·리더십·운영 역량으로 성장할 수 있는 팀을 준비하는 것이 메타무브짐의 목표입니다. 이 방향에 공감하는 분에게는 미래의 확장 과정에 참여할 가능성이 열릴 수 있습니다.',
    published: true,
  },
  representatives: [
    {
      id: 'park-chan-beom',
      name: '박찬범',
      role: '대표 트레이너',
      career: ['트레이너 경력 12년', '생활스포츠지도사 2급', '보디빌딩 체급별 대회 입상 경력'],
      expertise: ['웨이트 트레이닝', '케틀벨 트레이닝', '패시브 스트레칭 기반 컨디셔닝 케어'],
      published: true,
    },
    {
      id: 'yoon-ji-heon',
      name: '윤지헌',
      role: '대표 트레이너',
      career: [
        '트레이너 경력 10년',
        '생활스포츠지도사 2급 · Animal Flow Instructor L2',
        'NASM-CPT · KFKL Kettlebell Lifting Coach · FMS L1',
        '유소년·노인 스포츠지도사',
        'F45·슬릭부스트 그룹 코치 및 러닝 페이서 경력',
        '클래식 피지크 대회 및 하이록스·마라톤 참가',
      ],
      expertise: ['웨이트 트레이닝', '애니멀 플로우', '기능성 움직임'],
      published: true,
    },
  ],
  growthTracks: [
    {
      id: 'entry-growth',
      title: '신입 트레이너 성장 경로',
      level: 'entry',
      outcomes: [
        '1:1 PT의 기본 흐름과 회원 기록 방식을 익힙니다.',
        '웨이트·기능성 움직임을 바탕으로 수업 준비와 피드백 역량을 쌓습니다.',
        '팀 교육과 현장 경험을 통해 자신만의 코칭 기준을 다듬습니다.',
      ],
      published: true,
    },
    {
      id: 'experienced-growth',
      title: '경력 트레이너 성장 경로',
      level: 'experienced',
      outcomes: [
        '기존 PT 경험을 바탕으로 수업 설계와 회원 목표 관리 역량을 확장합니다.',
        '대표 트레이너와 코칭 기준을 나누고 기능성 트레이닝 경험을 넓힙니다.',
        '교육·리더십·운영 역량으로 성장하며, 팀 확장 목표에 참여할 가능성을 만들어갑니다.',
      ],
      published: true,
    },
  ],
  benefits: [
    { id: 'training-education', title: '트레이닝 교육 지원', description: '트레이닝 교육을 지원합니다.', published: true },
    { id: 'marketing-education', title: '마케팅 교육 지원', description: '마케팅 교육을 지원합니다.', published: true },
    { id: 'uniform', title: '유니폼 제공', description: '유니폼을 제공합니다.', published: true },
    { id: 'exercise-space', title: '운동 공간 사용', description: '센터 운동 공간을 사용할 수 있습니다.', published: true },
    { id: 'seminar', title: '세미나 참여 기회', description: '세미나 참여 기회를 제공합니다.', published: true },
  ],
  rules: [],
  positions: [
    {
      id: 'entry-personal-trainer',
      title: '신입 퍼스널 트레이너',
      level: 'entry',
      requirements: ['고객을 책임감 있게 대하고 배우려는 태도', '회원 상담과 수업 내용을 성실하게 기록하려는 태도'],
      preferences: ['생활스포츠지도사 등 관련 자격증 보유', '웨이트·기능성 트레이닝 경험'],
      status: 'draft',
      published: true,
    },
    {
      id: 'experienced-personal-trainer',
      title: '경력 퍼스널 트레이너',
      level: 'experienced',
      requirements: ['1:1 PT 진행 경험', '회원 목표에 맞춘 수업 설계와 기록 관리 역량'],
      preferences: ['생활스포츠지도사 등 관련 자격증 보유', '웨이트·애니멀 플로우 등 기능성 트레이닝 경험'],
      status: 'draft',
      published: true,
    },
  ],
  hiringProcess: {
    title: '채용 절차',
    steps: ['지원서 제출', '서류 검토', '대표 인터뷰', '수업·코칭 역량 확인', '최종 안내'],
    status: 'draft',
    published: true,
  },
};

export default siteContent;
