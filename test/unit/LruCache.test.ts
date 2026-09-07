import { describe, expect, it } from 'vitest';
import { LruCache } from '../../src/git/LruCache';

describe('LruCache', () => {
  it('evicts the least recently used entry when capacity is exceeded', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('refreshes an existing entry on set and supports targeted deletion', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 3);
    cache.set('c', 4);
    expect(cache.get('a')).toBe(3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.delete('c')).toBe(true);
    expect(cache.delete('c')).toBe(false);
  });

  it('rejects non-positive capacities', () => {
    expect(() => new LruCache<string, number>(0)).toThrow('Invalid LRU cache capacity');
    expect(() => new LruCache<string, number>(1.5)).toThrow('Invalid LRU cache capacity');
  });
});
