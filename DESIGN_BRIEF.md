# Design Brief

## Product job

신입·경력 퍼스널 트레이너가 메타무브짐의 성장 시스템, 보상, 확장 비전과 근무 기준을 확인하고 자신에게 맞는 채용 포지션에 지원하도록 돕는다. 관리자는 접수된 지원서와 이력서를 안전하게 검토하고 상태, 평가, 메모를 관리한다.

## Direction

흰색 바탕과 딥 네이비 구조선 위에 액션 블루를 제한적으로 사용하는 증거 중심 에디토리얼 채용 사이트. 첫 화면에서 성장·보상·확장의 세 기준을 제시하고, 실제 센터와 대표 2인의 증거를 거쳐 별도 단계형 지원서로 전환한다.

## Brand reading

- Immutable identity: 메타무브짐 명칭과 사용자가 제공할 공식 로고, 파란색·흰색 중심의 브랜드 인상, 실제 센터와 대표 2인.
- Repeatable shapes/materials: 얇은 블루 구조선, 큰 숫자 인덱스, 좌우 비대칭 에디토리얼 그리드, 실제 공간 사진, 4–8px 모서리.
- Existing inconsistencies to remove: 프로젝트에 기존 UI가 없으므로 둥근 카드 반복, 장식성 그라데이션, 근거 없는 수치, 스톡 피트니스 사진을 새로 도입하지 않는다.
- Media provenance: 로고, 센터 사진, 대표 사진은 사용자가 소유하거나 사용 권한을 확인한 파일만 사용한다. 현재 파일 자체는 아직 전달되지 않았다.

## Reference evidence

- [Equinox Careers](https://careers.equinox.com/), 2026-08-31 확인: 첫 화면의 채용 행동, 직무 범주, 트레이너 성장 프로그램, 문화·혜택으로 이어지는 정보 순서를 확인했다.
- [On Careers](https://culture.on.com/), 2026-08-31 확인: 움직임이라는 브랜드 신념, 실제 사람·공간 사진, 미션에서 팀 합류로 이어지는 편집형 서사를 확인했다.
- [GOV.UK Check answers](https://design-system.service.gov.uk/patterns/check-answers/), 2026-08-31 확인: 제출 전 섹션별 답변 확인, 변경 링크, 기존 값 보존, 명확한 최종 제출 행동을 확인했다.
- [Magic UI Number Ticker](https://magicui.design/docs/components/number-ticker), 2026-08-31 확인: 숫자가 목표값으로 짧게 전환되는 컴포넌트의 속성과 시작 지연 방식을 확인했다.
- 참고 사이트의 전용 브랜드 마크, 문구, 인물, 이미지, 통계, 전체 레이아웃은 복제하지 않는다.

## Reference synthesis

- Structure comes from: Equinox의 직무 행동 → 성장 증거 → 문화·혜택 순서.
- Interaction comes from: GOV.UK의 단계별 입력과 제출 전 답변 확인 패턴.
- Visual tone comes from: On의 실제 인물·공간 중심 편집형 서사와 메타무브짐의 블루·화이트 정체성.
- Hook/copy energy comes from: 스포츠 채용 사이트의 짧은 신념 문장 뒤에 구체적 성장 증거를 배치하는 리듬.
- Motion/media behavior comes from: Magic UI 숫자 전환 원리를 절제해 성장·보상·확장 인덱스 공개에 적용.
- The final screen will not copy: 외부 브랜드의 로고, 슬로건, 흑백/네온 색 체계, 대형 채용 검색 포털 구조, 전용 이미지나 수치.

## Reference implementation map

| Reference evidence | Extracted principle | Local component | Motion/state | Mobile translation | Acceptance evidence |
|---|---|---|---|---|---|
| Equinox 홈과 Personal Trainer 구간 | 채용 행동 뒤에 교육·성장 근거 제공 | Hero, ValueIndex, GrowthTabs | 가치 01→03 순차 공개 | 세로 스택과 고정 지원 CTA | `.superpowers/sdd/2026-08-31-metamove-public-site/artifacts/public-home-1440.png`, `public-home-390.png`; 320/360/390/430/1440px E2E에서 CTA 노출·비겹침과 문서 overflow 0 확인 |
| On 미션·사람·문화 구간 | 실제 미디어로 브랜드 신념 증명 | CenterStory, FounderPair | 사진 마스크와 캡션 순차 공개 | 인물별 세로 교차 배치 | 승인된 센터·대표 미디어가 아직 없어 해당 섹션은 공개 DOM에서 숨김; 캡처에서 빈 제목·대체 사진 없음 확인 |
| GOV.UK Check answers | 제출 전 요약·수정·확정 | ApplicationReview | 수정 후 리뷰 단계 복귀 | 키·값·수정 링크 세로 배치 | 이번 공개 사이트 범위에서는 `/apply` 이동과 복귀 fragment만 E2E 확인; 단계형 검토 화면은 후속 지원서 계획 범위 |
| Magic UI Number Ticker | 숫자에만 목적 있는 짧은 전환 | ValueIndex | 0→인덱스, 400–650ms | 정적 숫자 또는 단축 전환 | Playwright `page.emulateMedia({ reducedMotion: 'reduce' })`에서 Hero/Evidence 7개 대상의 계산값 `animation-name: none`, `transform: none`, `opacity: 1`, `transition-duration: 0s` 확인 |

## Signature composition and component

- Signature composition: 실제 센터 사진과 큰 `01 / 02 / 03` 인덱스가 한 구조선 안에서 성장·보상·확장으로 연결되는 첫 화면.
- Signature component: `EvidenceRail`—지원자가 근거를 따라가도록 숫자, 짧은 주장, 실제 증거, 관련 섹션 링크를 결합한 세로 레일.

## Motion storyboard

| Beat | Trigger | Elements | From → to | Duration/ease | Purpose | Reduced motion |
|---|---|---|---|---|---|---|
| 기준 조립 | 첫 화면 로드 | 로고선, 헤드라인, CTA | 선 확장 → 문장 → 버튼 | 180/360/520ms, ease-out | 전문적 질서와 첫 행동 제시 | 최종 상태 즉시 표시 |
| 증거 공개 | ValueIndex 진입 | 01·02·03 숫자와 설명 | 숫자 전환 + 설명 40px 이동 | 400–650ms, ease-out | 세 가지 채용 가치를 빠르게 이해 | 숫자와 설명 정적 표시 |
| 두 전문성 연결 | FounderPair 진입 | 대표 사진, 역할선, 설명 | 좌우 사진 → 중앙 연결선 | 450ms, ease-out | 상호 보완적인 대표 역량 설명 | 연결선과 정보 즉시 표시 |
| 지원 피드백 | 버튼·입력 상호작용 | 버튼, 필드, 단계 표시 | 색·테두리·위치 1–2px 변화 | 120–180ms | 행동과 현재 상태 확인 | 위치 이동 없이 색·테두리만 변경 |

## Tokens

- Font: Pretendard 400/600/700/800을 로컬 또는 신뢰 가능한 정적 자산으로 제공하고, `Malgun Gothic`, system-ui를 대체 글꼴로 둔다. Gmarket Sans는 친근하고 기하학적인 인상이 강해 이번 전문적·편집형 방향에는 사용하지 않는다.
- Text colors: `#09264D` 제목, `#52677F` 본문, `#FFFFFF` 역상 텍스트.
- Surface colors: `#FFFFFF` 기본, `#F4F7FB` 보조, `#EAF3FF` 강조 배경.
- Accent and semantic colors: `#1268D8` 주요 행동, `#58A6FF` 신호, 성공·경고·오류는 텍스트와 아이콘을 함께 사용한다.
- Spacing steps: 4, 8, 12, 16, 24, 32, 48, 72, 96px.
- Radius: 필드·버튼 5px, 패널 8px, 캡슐 상태표시는 예외적으로 완전한 원형.
- Border and shadow: 1px 회청색 구조선, 그림자는 큰 레이어 구분에만 낮은 불투명도로 사용.
- Motion: 120–650ms, ease-out 중심. 장식용 무한 반복 모션과 전체 섹션 단순 페이드는 사용하지 않는다.

## Copy ladder

1. Tension: 좋은 트레이너가 오래 성장하기 어려운 환경.
2. Promise: `좋은 트레이너가 오래 성장하는 시스템.`
3. Proof: 실제 센터, 교육·운영을 담당하는 대표 2인, 확정된 교육·보상·규정.
4. Choice: 신입과 경력 트레이너에게 각각 제공되는 성장 경로와 모집 조건.
5. Action: `채용 포지션 보기` → `지원서 작성하기`.

근거가 확보되지 않은 `최고`, `업계 1위`, 수익 수치, 지점 수, 교육 성과는 사용하지 않는다.

## Screen priorities

1. 공개 채용 사이트에서 성장·보상·확장과 지원 행동을 명확히 전달.
2. 별도 5단계 지원서에서 중도 이탈과 입력 오류를 줄임.
3. 관리자 목록·상세 분할 화면에서 검토 상태와 평가를 빠르게 관리.

## Behavior that must remain unchanged

- 공개 사용자는 지원서를 제출할 수 있지만 제출된 지원자 목록과 파일은 조회할 수 없다.
- 관리자는 인증과 권한 검사를 통과해야 지원자 정보, 자소서, 이력서, 평가에 접근할 수 있다.
- 신입 선택 시 불필요한 경력 필드를 숨기고, 경력 선택 시 필요한 경력 정보를 표시한다.
- 제출 전 모든 답변을 검토하고 각 섹션으로 돌아가 수정할 수 있다.
- 개인정보 수집 동의문과 보관기간이 확정되지 않으면 공개 배포하지 않는다.

## Anti-template decisions

- Generic pattern being rejected: 동일 크기 둥근 카드의 반복, 근거 없는 통계 대시보드, 스톡 운동 사진, 과도한 그라데이션과 글로우.
- Project-specific replacement: 실제 센터 사진을 관통하는 `01/02/03 EvidenceRail`, 대표 2인의 상호 보완 전문성 구성, 신입·경력 성장 탭, 투명한 혜택·규정 표.

## Responsive and motion contract

- Viewports: 320 / 360 / 390 / 430 / desktop.
- Desktop media behavior: 실제 센터 사진의 초점 영역을 유지하며 텍스트 안전 영역과 2열로 배치한다.
- Mobile media behavior: 사진과 텍스트를 순서대로 쌓고, 대표 사진은 인물 얼굴이 잘리지 않는 별도 모바일 크롭을 사용한다.
- Scroll reveal grammar: 구조선 → 인덱스 → 증거의 한 가지 순서를 반복한다.
- Reduced-motion final state: 모든 정보가 즉시 최종 위치와 값으로 표시되고 자동 스크롤·카운트업을 사용하지 않는다.
- Text-clipping viewports: 320/360/390/430px에서 한국어 헤드라인, 상태표시, 버튼 라벨의 잘림과 가로 스크롤을 허용하지 않는다.

## Verification captures

- 공개 홈 전체 화면: `.superpowers/sdd/2026-08-31-metamove-public-site/artifacts/public-home-1440.png`, `.superpowers/sdd/2026-08-31-metamove-public-site/artifacts/public-home-390.png`.
- 320/360/390/430/1440px: `e2e/public-site.spec.ts`에서 문서 가로 overflow, CTA 가시성, 모바일 footer 비겹침, safe-area 예약 공간 확인.
- 키보드·경로: skip-link 즉시 노출과 2px focus outline, 렌더된 `/#...` fragment 대상, `/apply` 이동 확인.
- reduced-motion: HeroEvidence 구조선·헤드라인·축·마커와 EvidenceRail 항목·라벨·화살표의 브라우저 계산 스타일이 모두 최종 상태임을 확인.
- 지원서: 빈 상태, 정상 작성, 오류, 제출 전 검토, 제출 완료.
- 관리자: 신규 지원자 목록, 상세 검토, 상태 변경, 접근 거부.
- 시그니처 모션: 첫 화면 조립과 EvidenceRail 진행을 5–10초로 기록.
