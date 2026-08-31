import { describe, expect, it } from 'vitest';
import { getPublishedContent } from './getPublishedContent';
import { siteContent } from './siteContent';

describe('getPublishedContent', () => {
  it('omits sections without approval and keeps the approved hero', () => {
    const result = getPublishedContent({
      hero: { headline: '좋은 트레이너가 오래 성장하는 시스템.', published: true },
      evidence: [],
      center: { title: '센터', body: '', published: false },
      representatives: [], benefits: [], rules: [], positions: []
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
      ]
    });

    expect(result.evidence.map(({ label }) => label)).toEqual(['성장', '확장']);
    expect(result.representatives.map(({ id }) => id)).toEqual(['approved']);
    expect(result.benefits.map(({ id }) => id)).toEqual(['approved']);
    expect(result.rules.map(({ id }) => id)).toEqual(['approved']);
    expect(result.positions.map(({ id }) => id)).toEqual(['approved']);
  });

  it('starts production content with only the approved headline and labels', () => {
    const result = getPublishedContent(siteContent);

    expect(result.hero.headline).toBe('좋은 트레이너가 오래 성장하는 시스템.');
    expect(result.evidence.map(({ label }) => label)).toEqual(['성장', '보상', '확장']);
    expect(result.evidence.every(({ description }) => description === undefined)).toBe(true);
    expect(result.center).toBeUndefined();
    expect(result.representatives).toEqual([]);
    expect(result.benefits).toEqual([]);
    expect(result.rules).toEqual([]);
    expect(result.positions).toEqual([]);
  });
});
