import { describe, expect, it } from 'vitest';
import { max, mean, median, min, summarize } from './statistics';

describe('median', () => {
  it('is the middle value for an odd-length set', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('is the average of the two middle values for an even-length set', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('is null for an empty set', () => {
    expect(median([])).toBeNull();
  });

  it('does not mutate the input array', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('mean', () => {
  it('is the arithmetic average', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it('is null for an empty set', () => {
    expect(mean([])).toBeNull();
  });
});

describe('min / max', () => {
  it('return the smallest/largest value', () => {
    expect(min([5, 1, 3])).toBe(1);
    expect(max([5, 1, 3])).toBe(5);
  });

  it('are null for an empty set', () => {
    expect(min([])).toBeNull();
    expect(max([])).toBeNull();
  });
});

describe('summarize', () => {
  it('filters out nulls before computing every statistic', () => {
    const result = summarize([10, null, 20, null, 30]);
    expect(result.count).toBe(3);
    expect(result.min).toBe(10);
    expect(result.max).toBe(30);
    expect(result.mean).toBe(20);
    expect(result.median).toBe(20);
  });

  it('every field is null (count 0) when nothing is present', () => {
    const result = summarize([null, null]);
    expect(result).toEqual({ count: 0, min: null, max: null, mean: null, median: null });
  });
});
