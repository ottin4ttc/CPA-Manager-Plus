import { describe, expect, it } from 'vitest';
import { stripNumberGrouping } from './format';

describe('stripNumberGrouping', () => {
  it('removes locale grouping separators from integers', () => {
    expect(stripNumberGrouping('1,234,567')).toBe('1234567');
    expect(stripNumberGrouping('1 234 567')).toBe('1234567');
    expect(stripNumberGrouping('1 234')).toBe('1234');
    expect(stripNumberGrouping('-12,345')).toBe('-12345');
  });

  it('keeps non-integer text unchanged', () => {
    expect(stripNumberGrouping('999')).toBe('999');
    expect(stripNumberGrouping('1.5')).toBe('1.5');
    expect(stripNumberGrouping('$1,234.56')).toBe('$1,234.56');
    expect(stripNumberGrouping('3 / 1,200')).toBe('3 / 1,200');
    expect(stripNumberGrouping('12,34')).toBe('12,34');
  });
});
