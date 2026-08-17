import { describe, expect, it } from 'vitest';
import { buildWalkForwardWindows } from './walkForward';

describe('buildWalkForwardWindows', () => {
  it('matches the milestone spec\'s own worked example exactly (train 2015-2018 -> test 2019, train 2015-2019 -> test 2020, ...)', () => {
    const windows = buildWalkForwardWindows('2015-01-01', '2021-12-31', 4, 1);

    expect(windows).toEqual([
      { trainStart: '2015-01-01', trainEnd: '2018-12-31', testStart: '2019-01-01', testEnd: '2019-12-31' },
      { trainStart: '2015-01-01', trainEnd: '2019-12-31', testStart: '2020-01-01', testEnd: '2020-12-31' },
      { trainStart: '2015-01-01', trainEnd: '2020-12-31', testStart: '2021-01-01', testEnd: '2021-12-31' },
    ]);
  });

  it('training always starts at the full range start (expanding window), never a rolling training start', () => {
    const windows = buildWalkForwardWindows('2010-01-01', '2015-12-31', 3, 1);
    expect(windows.every((w) => w.trainStart === '2010-01-01')).toBe(true);
  });

  it('supports a multi-year test window', () => {
    const windows = buildWalkForwardWindows('2015-01-01', '2022-12-31', 4, 2);
    expect(windows).toEqual([
      { trainStart: '2015-01-01', trainEnd: '2018-12-31', testStart: '2019-01-01', testEnd: '2020-12-31' },
      { trainStart: '2015-01-01', trainEnd: '2020-12-31', testStart: '2021-01-01', testEnd: '2022-12-31' },
    ]);
  });

  it('never generates a partial final window that would extend past the full range end', () => {
    // 2015-2018 train -> 2019 test fits; a second window (train through
    // 2019 -> test 2020) would need through 2020-12-31, which is beyond
    // the 2019-06-30 end supplied here, so only one window is produced.
    const windows = buildWalkForwardWindows('2015-01-01', '2019-06-30', 4, 1);
    expect(windows).toHaveLength(1);
  });

  it('returns an empty array for a range too short to produce even one window', () => {
    expect(buildWalkForwardWindows('2015-01-01', '2017-12-31', 4, 1)).toEqual([]);
  });

  it('returns an empty array for non-positive train/test year inputs', () => {
    expect(buildWalkForwardWindows('2015-01-01', '2025-12-31', 0, 1)).toEqual([]);
    expect(buildWalkForwardWindows('2015-01-01', '2025-12-31', 4, 0)).toEqual([]);
  });
});
