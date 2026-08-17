/**
 * Walk-forward window generation (spec section 14). An expanding-window
 * split: training always starts at the full range's own start and grows by
 * `testYears` each step; the test window is always the slice immediately
 * after training. Pure date-string arithmetic, no I/O — lib/services/
 * backtestService.ts runs the same underlying analysis once per generated
 * window and reports each test window's results separately (never blended
 * with a training window's).
 *
 * Note on what this actually protects against: this milestone has no
 * tunable parameter that gets *fit* to data (every materiality/threshold
 * config value is fixed, per spec section 18's "no strategy optimization")
 * — so walk-forward here validates the temporal STABILITY of a fixed
 * methodology across different market periods, not protection against
 * parameter overfitting in the classical sense. Documented in
 * docs/backtesting.md.
 */

export interface WalkForwardWindow {
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
}

function yearOf(dateStr: string): number {
  return Number.parseInt(dateStr.slice(0, 4), 10);
}

/**
 * `fullStart`/`fullEnd` are `YYYY-MM-DD`. `initialTrainYears` is how many
 * years the first training window spans (e.g. 2015-2018 inclusive = 4);
 * `testYears` is both the size of each test slice and how much the
 * training window grows by on each subsequent step. Stops once a test
 * window would extend past `fullEnd` — never generates a partial,
 * misleadingly-short final window.
 */
export function buildWalkForwardWindows(fullStart: string, fullEnd: string, initialTrainYears: number, testYears: number): WalkForwardWindow[] {
  if (initialTrainYears <= 0 || testYears <= 0) return [];

  const windows: WalkForwardWindow[] = [];
  const startYear = yearOf(fullStart);
  const fullEndYear = yearOf(fullEnd);
  let trainEndYear = startYear + initialTrainYears - 1;

  while (true) {
    const testStartYear = trainEndYear + 1;
    const testEndYear = testStartYear + testYears - 1;
    if (testEndYear > fullEndYear) break;

    windows.push({
      trainStart: fullStart,
      trainEnd: `${trainEndYear}-12-31`,
      testStart: `${testStartYear}-01-01`,
      testEnd: `${testEndYear}-12-31`,
    });

    trainEndYear += testYears;
  }

  return windows;
}
