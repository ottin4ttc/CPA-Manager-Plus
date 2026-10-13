import { describe, expect, it } from 'vitest';
import {
  API_KEY_GROUP_NAME_MAX_LENGTH,
  buildApiKeyGroupKeyEntries,
  validateApiKeyGroupName,
} from './apiKeyGroupEditor';

const hA = 'a'.repeat(64);
const hB = 'b'.repeat(64);
const hC = 'c'.repeat(64);

describe('buildApiKeyGroupKeyEntries', () => {
  it('lists configured keys first, then deleted ones, each by label', () => {
    const displayMap = new Map([
      [hA, { label: 'zeta', masked: 'sk-***a', copyValue: 'sk-a' }],
      [hB, { label: 'alias-only', masked: 'sha256:bbb' }],
      [hC.toUpperCase(), { label: 'alpha', masked: 'sk-***c', copyValue: 'sk-c' }],
    ]);
    const orphan = 'd'.repeat(64);

    expect(
      buildApiKeyGroupKeyEntries(displayMap, [{ name: 'g', apiKeyHashes: [hA, orphan] }])
    ).toEqual([
      { hash: hC, label: 'alpha', deleted: false },
      { hash: hA, label: 'zeta', deleted: false },
      { hash: hB, label: 'alias-only', deleted: true },
      { hash: orphan, label: `sha256:${orphan.slice(0, 12)}`, deleted: true },
    ]);
  });
});

describe('validateApiKeyGroupName', () => {
  it('accepts a new unique name', () => {
    expect(validateApiKeyGroupName(' 业务线/小麦 ', ['业务线/clawd'])).toBeNull();
  });

  it('rejects empty, too long, reserved and case-insensitive duplicate names', () => {
    expect(validateApiKeyGroupName('  ', [])).toBe('empty');
    expect(validateApiKeyGroupName('名'.repeat(API_KEY_GROUP_NAME_MAX_LENGTH + 1), [])).toBe(
      'too_long'
    );
    expect(validateApiKeyGroupName('all', [])).toBe('reserved');
    expect(validateApiKeyGroupName('__ungrouped__', [])).toBe('reserved');
    expect(validateApiKeyGroupName('Team/A', ['team/a'])).toBe('duplicate');
  });

  it('counts characters, not UTF-16 units, against the limit', () => {
    expect(validateApiKeyGroupName('😀'.repeat(API_KEY_GROUP_NAME_MAX_LENGTH), [])).toBeNull();
  });
});
