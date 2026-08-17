import { describe, expect, it } from 'vitest';
import { classifyFilingImportance } from './importance';
import { classifyFormType, parseItemCodes } from './types';

describe('classifyFilingImportance', () => {
  it('rates 10-K, 10-Q, and 20-F as High — annual/quarterly results always matter', () => {
    expect(classifyFilingImportance('TEN_K')).toBe('High');
    expect(classifyFilingImportance('TEN_Q')).toBe('High');
    expect(classifyFilingImportance('TWENTY_F')).toBe('High');
  });

  it('rates a proxy statement as Medium', () => {
    expect(classifyFilingImportance('DEF_14A')).toBe('Medium');
  });

  it('rates an 8-K by the highest-importance item it discloses', () => {
    expect(classifyFilingImportance('EIGHT_K', ['2.02'])).toBe('High'); // earnings
    expect(classifyFilingImportance('EIGHT_K', ['5.02'])).toBe('Medium'); // executive change
    expect(classifyFilingImportance('EIGHT_K', ['7.01'])).toBe('Low'); // Reg FD, generic
    expect(classifyFilingImportance('EIGHT_K', [])).toBe('Low'); // no items parsed
  });

  it('an 8-K disclosing multiple items takes the highest importance among them', () => {
    expect(classifyFilingImportance('EIGHT_K', ['7.01', '2.01'])).toBe('High'); // acquisition wins over Reg FD
    expect(classifyFilingImportance('EIGHT_K', ['8.01', '5.02'])).toBe('Medium'); // exec change wins over "other"
  });

  it('rates an unsupported/unknown filing type as Low', () => {
    expect(classifyFilingImportance('OTHER')).toBe('Low');
  });
});

describe('classifyFormType', () => {
  it('buckets standard form labels correctly', () => {
    expect(classifyFormType('10-K')).toBe('TEN_K');
    expect(classifyFormType('10-Q')).toBe('TEN_Q');
    expect(classifyFormType('8-K')).toBe('EIGHT_K');
    expect(classifyFormType('DEF 14A')).toBe('DEF_14A');
    expect(classifyFormType('20-F')).toBe('TWENTY_F');
  });

  it('buckets an amended filing ("/A" suffix) with its base form', () => {
    expect(classifyFormType('10-K/A')).toBe('TEN_K');
    expect(classifyFormType('8-K/A')).toBe('EIGHT_K');
  });

  it('is case-insensitive', () => {
    expect(classifyFormType('10-k')).toBe('TEN_K');
  });

  it('buckets an unrecognized form as OTHER rather than throwing', () => {
    expect(classifyFormType('S-1')).toBe('OTHER');
  });
});

describe('parseItemCodes', () => {
  it('splits a comma-separated item-codes string, trimming whitespace', () => {
    expect(parseItemCodes('2.02,9.01')).toEqual(['2.02', '9.01']);
    expect(parseItemCodes('2.02, 9.01')).toEqual(['2.02', '9.01']);
  });

  it('returns an empty array for null or empty input', () => {
    expect(parseItemCodes(null)).toEqual([]);
    expect(parseItemCodes('')).toEqual([]);
  });
});
