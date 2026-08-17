import { describe, expect, it } from 'vitest';
import { detectOutliersIQR } from './outliers';

function entries(values: number[]): Array<{ ticker: string; value: number }> {
  return values.map((value, i) => ({ ticker: `T${i}`, value }));
}

describe('detectOutliersIQR', () => {
  it('hand-verified: flags a high outlier — [10,11,12,13,14,15,16,100]', () => {
    // Sorted (already sorted): split at n/2=4 -> lower [10,11,12,13], upper [14,15,16,100]
    // Q1 = median(10,11,12,13) = 11.5
    // Q3 = median(14,15,16,100) = 15.5
    // IQR = 4; bounds = [11.5 - 6, 15.5 + 6] = [5.5, 21.5]
    // 100 > 21.5 -> flagged; everything else (10-16) is within bounds.
    const result = detectOutliersIQR(entries([10, 11, 12, 13, 14, 15, 16, 100]));
    expect(result.q1).toBeCloseTo(11.5);
    expect(result.q3).toBeCloseTo(15.5);
    expect(result.iqr).toBeCloseTo(4);
    expect(result.lowerBound).toBeCloseTo(5.5);
    expect(result.upperBound).toBeCloseTo(21.5);
    expect(result.outlierTickers).toEqual(['T7']); // the value 100
  });

  it('hand-verified: flags a low outlier — [1,20,21,22,23,24,25,26]', () => {
    // lower [1,20,21,22], upper [23,24,25,26]
    // Q1 = median(1,20,21,22) = 20.5; Q3 = median(23,24,25,26) = 24.5
    // IQR = 4; bounds = [14.5, 30.5]; 1 < 14.5 -> flagged
    const result = detectOutliersIQR(entries([1, 20, 21, 22, 23, 24, 25, 26]));
    expect(result.lowerBound).toBeCloseTo(14.5);
    expect(result.upperBound).toBeCloseTo(30.5);
    expect(result.outlierTickers).toEqual(['T0']); // the value 1
  });

  it('flags nothing when every value is close together', () => {
    const result = detectOutliersIQR(entries([10, 10.5, 11, 11.5, 12, 12.5]));
    expect(result.outlierTickers).toHaveLength(0);
  });

  it('returns empty (degenerate) bounds with fewer than 4 data points', () => {
    const result = detectOutliersIQR(entries([1, 2, 1000]));
    expect(result.q1).toBeNull();
    expect(result.outlierTickers).toHaveLength(0);
  });

  it('identifies the correct ticker, not just the value, for a flagged outlier', () => {
    // Same shape as the first hand-verified case (bounds [5.5, 21.5]), just with named tickers.
    const result = detectOutliersIQR([
      { ticker: 'AAA', value: 10 },
      { ticker: 'BBB', value: 11 },
      { ticker: 'CCC', value: 12 },
      { ticker: 'DDD', value: 13 },
      { ticker: 'EEE', value: 14 },
      { ticker: 'FFF', value: 15 },
      { ticker: 'GGG', value: 16 },
      { ticker: 'OUTLIER', value: 100 },
    ]);
    expect(result.outlierTickers).toEqual(['OUTLIER']);
  });
});
