import type { SecCompanyFacts, SecXbrlFact } from '@/lib/providers/secEdgar';

/**
 * Structurally shaped after real Apple XBRL filings (same tag choices,
 * same instant-vs-duration/annual-vs-quarterly shape, a genuine restatement
 * scenario), but every dollar value is a made-up round number — not Apple's
 * actual reported figures. Used only to exercise the normalization engine's
 * tag-priority and restatement-dedup logic in tests.
 */

function fact(
  partial: Partial<SecXbrlFact> & Pick<SecXbrlFact, 'end' | 'val' | 'accn' | 'form' | 'filed'>,
): SecXbrlFact {
  return partial;
}

export const appleShapedFacts: SecCompanyFacts = {
  cik: 1,
  entityName: 'Fixture Fruit Co.',
  facts: {
    'us-gaap': {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            // FY2022 (annual)
            fact({
              start: '2021-09-26',
              end: '2022-09-24',
              val: 100_000_000_000,
              accn: 'FIX-22-01',
              form: '10-K',
              filed: '2022-10-28',
            }),
            // FY2023 (annual) — original filing
            fact({
              start: '2022-09-25',
              end: '2023-09-30',
              val: 110_000_000_000,
              accn: 'FIX-23-01',
              form: '10-K',
              filed: '2023-11-03',
            }),
            // FY2023 restated in a later 10-K/A — this is the value that should win.
            fact({
              start: '2022-09-25',
              end: '2023-09-30',
              val: 111_000_000_000,
              accn: 'FIX-24-05',
              form: '10-K/A',
              filed: '2024-01-15',
            }),
            // Q1 FY2024 (quarterly)
            fact({
              start: '2023-10-01',
              end: '2023-12-30',
              val: 30_000_000_000,
              accn: 'FIX-24-02',
              form: '10-Q',
              filed: '2024-02-01',
            }),
          ],
        },
      },
      CostOfGoodsAndServicesSold: {
        units: {
          USD: [
            fact({
              start: '2021-09-26',
              end: '2022-09-24',
              val: 60_000_000_000,
              accn: 'FIX-22-01',
              form: '10-K',
              filed: '2022-10-28',
            }),
            fact({
              start: '2022-09-25',
              end: '2023-09-30',
              val: 65_000_000_000,
              accn: 'FIX-23-01',
              form: '10-K',
              filed: '2023-11-03',
            }),
          ],
        },
      },
      NetIncomeLoss: {
        units: {
          USD: [
            fact({
              start: '2021-09-26',
              end: '2022-09-24',
              val: 25_000_000_000,
              accn: 'FIX-22-01',
              form: '10-K',
              filed: '2022-10-28',
            }),
            fact({
              start: '2022-09-25',
              end: '2023-09-30',
              val: 27_000_000_000,
              accn: 'FIX-23-01',
              form: '10-K',
              filed: '2023-11-03',
            }),
            fact({
              start: '2023-10-01',
              end: '2023-12-30',
              val: 8_000_000_000,
              accn: 'FIX-24-02',
              form: '10-Q',
              filed: '2024-02-01',
            }),
          ],
        },
      },
      EarningsPerShareDiluted: {
        units: {
          'USD/shares': [
            fact({
              start: '2021-09-26',
              end: '2022-09-24',
              val: 1.5,
              accn: 'FIX-22-01',
              form: '10-K',
              filed: '2022-10-28',
            }),
            fact({
              start: '2022-09-25',
              end: '2023-09-30',
              val: 1.7,
              accn: 'FIX-23-01',
              form: '10-K',
              filed: '2023-11-03',
            }),
            fact({
              start: '2023-10-01',
              end: '2023-12-30',
              val: 0.5,
              accn: 'FIX-24-02',
              form: '10-Q',
              filed: '2024-02-01',
            }),
          ],
        },
      },
      WeightedAverageNumberOfSharesOutstandingBasic: {
        units: {
          shares: [
            fact({
              start: '2022-09-25',
              end: '2023-09-30',
              val: 15_700_000_000,
              accn: 'FIX-23-01',
              form: '10-K',
              filed: '2023-11-03',
            }),
          ],
        },
      },
      WeightedAverageNumberOfDilutedSharesOutstanding: {
        units: {
          shares: [
            fact({
              start: '2022-09-25',
              end: '2023-09-30',
              val: 15_900_000_000,
              accn: 'FIX-23-01',
              form: '10-K',
              filed: '2023-11-03',
            }),
          ],
        },
      },
      Assets: {
        units: {
          USD: [
            fact({
              end: '2022-09-24',
              val: 300_000_000_000,
              accn: 'FIX-22-01',
              form: '10-K',
              filed: '2022-10-28',
            }),
            fact({
              end: '2023-09-30',
              val: 320_000_000_000,
              accn: 'FIX-23-01',
              form: '10-K',
              filed: '2023-11-03',
            }),
            fact({
              end: '2023-12-30',
              val: 330_000_000_000,
              accn: 'FIX-24-02',
              form: '10-Q',
              filed: '2024-02-01',
            }),
          ],
        },
      },
      Liabilities: {
        units: {
          USD: [
            fact({
              end: '2022-09-24',
              val: 200_000_000_000,
              accn: 'FIX-22-01',
              form: '10-K',
              filed: '2022-10-28',
            }),
            fact({
              end: '2023-09-30',
              val: 210_000_000_000,
              accn: 'FIX-23-01',
              form: '10-K',
              filed: '2023-11-03',
            }),
          ],
        },
      },
      StockholdersEquity: {
        units: {
          USD: [
            fact({
              end: '2022-09-24',
              val: 100_000_000_000,
              accn: 'FIX-22-01',
              form: '10-K',
              filed: '2022-10-28',
            }),
            fact({
              end: '2023-09-30',
              val: 110_000_000_000,
              accn: 'FIX-23-01',
              form: '10-K',
              filed: '2023-11-03',
            }),
          ],
        },
      },
      MarketableSecuritiesCurrent: {
        units: {
          USD: [
            fact({
              end: '2023-09-30',
              val: 20_000_000_000,
              accn: 'FIX-23-01',
              form: '10-K',
              filed: '2023-11-03',
            }),
          ],
        },
      },
      NetCashProvidedByUsedInOperatingActivities: {
        units: {
          USD: [
            fact({
              start: '2022-09-25',
              end: '2023-09-30',
              val: 40_000_000_000,
              accn: 'FIX-23-01',
              form: '10-K',
              filed: '2023-11-03',
            }),
          ],
        },
      },
      PaymentsToAcquirePropertyPlantAndEquipment: {
        units: {
          USD: [
            fact({
              start: '2022-09-25',
              end: '2023-09-30',
              val: 10_000_000_000,
              accn: 'FIX-23-01',
              form: '10-K',
              filed: '2023-11-03',
            }),
          ],
        },
      },
      // Deliberately no GrossProfit tag — exercises "genuinely unavailable
      // field resolves to null" the same way it does for real Apple filings.
    },
  },
};
