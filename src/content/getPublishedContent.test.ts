import { describe, expect, it } from 'vitest';
import { getPublishedContent } from './getPublishedContent';
import { siteContent } from './siteContent';

describe('getPublishedContent', () => {
  it('replaces an unpublished hero with the permanent approved fallback only', () => {
    const result = getPublishedContent({
      hero: {
        headline: '공개되면 안 되는 히어로 문구',
        supportingCopy: '공개되면 안 되는 보조 문구',
        imageSrc: '/draft-hero.jpg',
        imageAlt: '공개되면 안 되는 이미지',
        published: false,
      },
      evidence: [],
      center: { title: '', body: '', published: false },
      expansionVision: { title: '', body: '', published: false },
      representatives: [], growthTracks: [], benefits: [], rules: [], positions: [],
      hiringProcess: { title: '', steps: [], published: false },
    });

    expect(result.hero).toEqual({
      headline: '움직임을 바꾸는 트레이너, 메타무브짐에서 함께 성장하세요',
    });
    expect(JSON.stringify(result)).not.toContain('공개되면 안 되는');
    expect(JSON.stringify(result)).not.toContain('/draft-hero.jpg');
  });

  it('omits sections without approval and keeps the approved hero', () => {
    const result = getPublishedContent({
      hero: { headline: '좋은 트레이너가 오래 성장하는 시스템.', published: true },
      evidence: [],
      center: { title: '센터', body: '', published: false },
      expansionVision: { title: '', body: '', published: false },
      representatives: [], growthTracks: [], benefits: [], rules: [], positions: [],
      hiringProcess: { title: '', steps: [], published: false },
    });

    expect(result.hero.headline).toBe('좋은 트레이너가 오래 성장하는 시스템.');
    expect(result.center).toBeUndefined();
  });

  it('publishes only approved evidence and collection entries', () => {
    const result = getPublishedContent({
      hero: { headline: '좋은 트레이너가 오래 성장하는 시스템.', published: true },
      evidence: [
        { index: '01', label: '성장', href: '#growth', published: true },
        { index: '02', label: '보상', href: '#reward', published: false },
        { index: '03', label: '확장', href: '#expansion', published: true }
      ],
      center: { title: '센터', body: '', published: false },
      expansionVision: { title: '', body: '', published: false },
      representatives: [
        { id: 'approved', name: '승인된 사람', role: '트레이너', career: [], expertise: [], imageSrc: '/approved.jpg', imageAlt: '승인된 사람', published: true },
        { id: 'draft', name: '미승인 사람', role: '트레이너', career: [], expertise: [], imageSrc: '/draft.jpg', imageAlt: '미승인 사람', published: false }
      ],
      benefits: [
        { id: 'approved', title: '승인된 혜택', description: '', published: true },
        { id: 'draft', title: '미승인 혜택', description: '', published: false }
      ],
      rules: [
        { id: 'approved', label: '승인된 규칙', value: '', published: true },
        { id: 'draft', label: '미승인 규칙', value: '', published: false }
      ],
      positions: [
        { id: 'approved', title: '승인된 포지션', level: 'entry', requirements: [], preferences: [], published: true },
        { id: 'draft', title: '미승인 포지션', level: 'experienced', requirements: [], preferences: [], published: false }
      ],
      growthTracks: [],
      hiringProcess: { title: '', steps: [], published: false },
    });

    expect(result.evidence.map(({ label }) => label)).toEqual(['성장', '확장']);
    expect(result.representatives.map(({ id }) => id)).toEqual(['approved']);
    expect(result.benefits.map(({ id }) => id)).toEqual(['approved']);
    expect(result.rules.map(({ id }) => id)).toEqual(['approved']);
    expect(result.positions.map(({ id }) => id)).toEqual(['approved']);
  });

  it('gates expansion vision, post-hire growth tracks, and hiring process independently', () => {
    const result = getPublishedContent({
      hero: { headline: '승인된 히어로', published: true },
      evidence: [],
      center: { title: '', body: '', published: false },
      expansionVision: {
        title: '테스트 확장 비전',
        body: '테스트 확장 설명',
        published: true,
      },
      representatives: [],
      growthTracks: [
        {
          id: 'approved-growth',
          title: '테스트 성장 경로',
          level: 'entry',
          outcomes: ['테스트 성장 결과'],
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
      benefits: [],
      rules: [],
      positions: [],
      hiringProcess: {
        title: '공개되면 안 되는 채용 절차',
        steps: ['공개되면 안 되는 전형 단계'],
        published: false,
      },
    });

    expect(result.expansionVision).toEqual({
      title: '테스트 확장 비전',
      body: '테스트 확장 설명',
    });
    expect(result.growthTracks).toEqual([
      {
        id: 'approved-growth',
        title: '테스트 성장 경로',
        level: 'entry',
        outcomes: ['테스트 성장 결과'],
      },
    ]);
    expect(result.hiringProcess).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('공개되면 안 되는');
  });

  it('preserves approved responsive hero media metadata and removes unpublished center media', () => {
    const result = getPublishedContent({
      hero: {
        headline: '승인된 히어로',
        imageSrc: '/hero-desktop.jpg',
        imageAlt: '승인된 히어로 이미지',
        mobileImageSrc: '/hero-mobile.jpg',
        published: true,
      },
      evidence: [],
      center: {
        title: '미승인 센터',
        body: '미승인 센터 설명',
        imageSrc: '/center-draft.jpg',
        imageAlt: '미승인 센터 이미지',
        desktopObjectPosition: '60% 40%',
        mobileObjectPosition: '70% 50%',
        published: false,
      },
      expansionVision: { title: '', body: '', published: false },
      representatives: [],
      growthTracks: [],
      benefits: [],
      rules: [],
      positions: [],
      hiringProcess: { title: '', steps: [], published: false },
    });

    expect(result.hero).toMatchObject({
      imageSrc: '/hero-desktop.jpg',
      mobileImageSrc: '/hero-mobile.jpg',
    });
    expect(result.center).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('/center-draft.jpg');
  });

  it('starts production content with only the approved headline and labels', () => {
    const result = getPublishedContent(siteContent);

    expect(result.hero.headline).toBe('움직임을 바꾸는 트레이너, 메타무브짐에서 함께 성장하세요');
    expect(result.evidence.map(({ label }) => label)).toEqual(['성장', '보상', '확장']);
    expect(result.evidence.every(({ description }) => description === undefined)).toBe(true);
    expect(result.center).toBeUndefined();
    expect(result.expansionVision).toBeUndefined();
    expect(result.representatives).toEqual([]);
    expect(result.growthTracks).toEqual([]);
    expect(result.benefits).toEqual([]);
    expect(result.rules).toEqual([]);
    expect(result.positions).toEqual([]);
    expect(result.hiringProcess).toBeUndefined();
  });
});
