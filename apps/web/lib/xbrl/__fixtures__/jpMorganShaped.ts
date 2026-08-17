import type { SecCompanyFacts, SecXbrlFact } from '@/lib/providers/secEdgar';

/**
 * Structurally shaped after real JPMorgan Chase XBRL filings: a bank
 * holding company that reports under `Revenues` (not the ASC-606 contract-
 * revenue tags Apple uses) and has no CostOfGoodsAndServicesSold/Inventory
 * concepts at all — banks don't report cost of goods sold or inventory.
 * Also mirrors a real, verified behavior: JPMorgan only tags `Revenues` as
 * an annual-duration fact (no quarterly-duration `Revenues` fact appears in
 * their real filings after 2014), so the quarterly period below has EPS but
 * no revenue — exactly what should come back as null, not a guess.
 * All dollar values are made-up round numbers, not JPMorgan's actual figures.
 */

function fact(
  partial: Partial<SecXbrlFact> & Pick<SecXbrlFact, 'end' | 'val' | 'accn' | 'form' | 'filed'>,
): SecXbrlFact {
  return partial;
}

export const jpMorganShapedFacts: SecCompanyFacts = {
  cik: 2,
  entityName: 'Fixture Bank Holding Co.',
  facts: {
    'us-gaap': {
      Revenues: {
        units: {
          USD: [
            fact({
              start: '2022-01-01',
              end: '2022-12-31',
              val: 120_000_000_000,
              accn: 'FIX-JPM-22-01',
              form: '10-K',
              filed: '2023-02-24',
            }),
            fact({
              start: '2023-01-01',
              end: '2023-12-31',
              val: 130_000_000_000,
              accn: 'FIX-JPM-23-01',
              form: '10-K',
              filed: '2024-02-27',
            }),
            // No quarterly-duration Revenues fact — matches verified real behavior.
          ],
        },
      },
      NetIncomeLoss: {
        units: {
          USD: [
            fact({
              start: '2022-01-01',
              end: '2022-12-31',
              val: 35_000_000_000,
              accn: 'FIX-JPM-22-01',
              form: '10-K',
              filed: '2023-02-24',
            }),
            fact({
              start: '2023-01-01',
              end: '2023-12-31',
              val: 40_000_000_000,
              accn: 'FIX-JPM-23-01',
              form: '10-K',
              filed: '2024-02-27',
            }),
          ],
        },
      },
      EarningsPerShareDiluted: {
        units: {
          'USD/shares': [
            fact({
              start: '2023-01-01',
              end: '2023-12-31',
              val: 10.2,
              accn: 'FIX-JPM-23-01',
              form: '10-K',
              filed: '2024-02-27',
            }),
            // A quarterly EPS fact with no corresponding quarterly Revenues fact.
            fact({
              start: '2024-01-01',
              end: '2024-03-31',
              val: 2.5,
              accn: 'FIX-JPM-24-01',
              form: '10-Q',
              filed: '2024-04-20',
            }),
          ],
        },
      },
      Assets: {
        units: {
          USD: [
            fact({
              end: '2022-12-31',
              val: 3_000_000_000_000,
              accn: 'FIX-JPM-22-01',
              form: '10-K',
              filed: '2023-02-24',
            }),
            fact({
              end: '2023-12-31',
              val: 3_200_000_000_000,
              accn: 'FIX-JPM-23-01',
              form: '10-K',
              filed: '2024-02-27',
            }),
          ],
        },
      },
      Liabilities: {
        units: {
          USD: [
            fact({
              end: '2022-12-31',
              val: 2_700_000_000_000,
              accn: 'FIX-JPM-22-01',
              form: '10-K',
              filed: '2023-02-24',
            }),
            fact({
              end: '2023-12-31',
              val: 2_880_000_000_000,
              accn: 'FIX-JPM-23-01',
              form: '10-K',
              filed: '2024-02-27',
            }),
          ],
        },
      },
      StockholdersEquity: {
        units: {
          USD: [
            fact({
              end: '2022-12-31',
              val: 300_000_000_000,
              accn: 'FIX-JPM-22-01',
              form: '10-K',
              filed: '2023-02-24',
            }),
            fact({
              end: '2023-12-31',
              val: 320_000_000_000,
              accn: 'FIX-JPM-23-01',
              form: '10-K',
              filed: '2024-02-27',
            }),
          ],
        },
      },
      LongTermDebt: {
        units: {
          USD: [
            fact({
              end: '2023-12-31',
              val: 350_000_000_000,
              accn: 'FIX-JPM-23-01',
              form: '10-K',
              filed: '2024-02-27',
            }),
          ],
        },
      },
      // Deliberately no CostOfGoodsAndServicesSold / CostOfRevenue / InventoryNet
      // — banks genuinely don't report these; must resolve to null, not zero.
    },
  },
};
