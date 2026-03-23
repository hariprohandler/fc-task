import { readOffset } from './airtable-pagination.util';

describe('readOffset', () => {
  it('returns undefined for non-objects', () => {
    expect(readOffset(null)).toBeUndefined();
    expect(readOffset('x')).toBeUndefined();
  });

  it('reads string offset', () => {
    expect(readOffset({ offset: 'abc' })).toBe('abc');
  });

  it('ignores empty offset', () => {
    expect(readOffset({ offset: '' })).toBeUndefined();
  });
});
