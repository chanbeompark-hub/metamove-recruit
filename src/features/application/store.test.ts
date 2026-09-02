import { afterEach, describe, expect, it } from 'vitest';
import {
  DRAFT_KEY,
  DRAFT_WARNING,
  clearDraft,
  loadDraft,
  saveDraft,
} from './store';

const nativeSessionStorage = window.sessionStorage;

afterEach(() => {
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: nativeSessionStorage,
  });
  nativeSessionStorage.clear();
});

describe('application draft store', () => {
  it('round-trips a versioned non-file draft and strips file-like values', () => {
    const draftWithUnexpectedFiles = {
      name: '홍길동',
      level: 'entry' as const,
      resume: new File(['resume'], 'resume.pdf', { type: 'application/pdf' }),
      portfolio: { 0: new File(['work'], 'portfolio.pdf') },
    };

    expect(saveDraft(draftWithUnexpectedFiles)).toBe(true);

    const raw = nativeSessionStorage.getItem(DRAFT_KEY) ?? '';
    expect(raw).toContain('"version":1');
    expect(raw).not.toContain('resume.pdf');
    expect(raw).not.toContain('portfolio.pdf');
    expect(loadDraft()).toEqual({ name: '홍길동', level: 'entry' });
  });

  it('accepts the legacy v1 shape and ignores invalid, unknown-version, or non-object payloads', () => {
    nativeSessionStorage.setItem(DRAFT_KEY, JSON.stringify({ name: '김지원', level: 'entry' }));
    expect(loadDraft()).toEqual({ name: '김지원', level: 'entry' });

    nativeSessionStorage.setItem(DRAFT_KEY, '{broken');
    expect(loadDraft()).toEqual({});

    nativeSessionStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 999, data: { name: '무시' } }));
    expect(loadDraft()).toEqual({});

    nativeSessionStorage.setItem(DRAFT_KEY, JSON.stringify(['not', 'a', 'draft']));
    expect(loadDraft()).toEqual({});
  });

  it('catches read, write, and remove failures without blocking the caller', () => {
    const failingStorage = {
      getItem: () => { throw new DOMException('blocked'); },
      setItem: () => { throw new DOMException('quota'); },
      removeItem: () => { throw new DOMException('blocked'); },
    };
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: failingStorage,
    });

    expect(loadDraft()).toEqual({});
    expect(saveDraft({ name: '홍길동' })).toBe(false);
    expect(clearDraft()).toBe(false);
    expect(DRAFT_WARNING).toBe('임시 저장을 사용할 수 없습니다. 작성은 계속할 수 있습니다.');
  });
});
