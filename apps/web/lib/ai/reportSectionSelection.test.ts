import { describe, expect, it } from 'vitest';
import { MAX_CHARS_PER_ITEM, MAX_LIST_ITEMS, truncateDescriptionList, truncateStringList, truncateText } from './reportSectionSelection';

describe('truncateText', () => {
  it('leaves short text untouched', () => {
    const result = truncateText('short text', 100);
    expect(result).toEqual({ text: 'short text', truncated: false });
  });

  it('truncates long text to the exact character cap', () => {
    const long = 'x'.repeat(50);
    const result = truncateText(long, 10);
    expect(result.text).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });
});

describe('truncateStringList', () => {
  it('caps the number of items', () => {
    const items = Array.from({ length: 20 }, (_, i) => `item ${i}`);
    const result = truncateStringList(items, 5);
    expect(result).toHaveLength(5);
  });

  it('caps each item length', () => {
    const items = ['x'.repeat(1000)];
    const result = truncateStringList(items, MAX_LIST_ITEMS, 50);
    expect(result[0]).toHaveLength(50);
  });

  it('uses the documented defaults when not overridden', () => {
    const items = Array.from({ length: MAX_LIST_ITEMS + 5 }, () => 'x'.repeat(MAX_CHARS_PER_ITEM + 100));
    const result = truncateStringList(items);
    expect(result).toHaveLength(MAX_LIST_ITEMS);
    expect(result[0]).toHaveLength(MAX_CHARS_PER_ITEM);
  });
});

describe('truncateDescriptionList', () => {
  it('truncates the description field while preserving other fields', () => {
    const items = [{ description: 'x'.repeat(1000), category: 'operational' }];
    const result = truncateDescriptionList(items, 10, 50);
    expect(result[0]?.description).toHaveLength(50);
    expect(result[0]?.category).toBe('operational');
  });

  it('caps the number of items', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ description: `d${i}`, category: 'x' }));
    const result = truncateDescriptionList(items, 4);
    expect(result).toHaveLength(4);
  });
});
