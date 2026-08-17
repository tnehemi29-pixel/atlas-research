'use client';

import { useState } from 'react';
import { CompanySearch } from '@/components/company-search/CompanySearch';
import { Card } from './shared';
import { ValuationTab } from './tabs/ValuationTab';
import { DcfForecastTab } from './tabs/DcfForecastTab';
import { FinancialSignalsTab } from './tabs/FinancialSignalsTab';
import { EventsTab } from './tabs/EventsTab';
import { ResearchEventsTab } from './tabs/ResearchEventsTab';
import { ValuationSpreadTab } from './tabs/ValuationSpreadTab';

type TabKey = 'valuation' | 'valuationSpread' | 'dcfForecast' | 'financialSignals' | 'events' | 'researchEvents';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'valuation', label: 'Valuation' },
  { key: 'valuationSpread', label: 'Valuation Spread' },
  { key: 'dcfForecast', label: 'DCF Forecasts' },
  { key: 'financialSignals', label: 'Financial Signals' },
  { key: 'events', label: 'Events' },
  { key: 'researchEvents', label: 'Research Events' },
];

const GLOBAL_LIMITATIONS = [
  'This is a RESEARCH AND VALIDATION system, not an automated trading system. Nothing here recommends a trade, and no historical relationship shown is a guarantee of future performance.',
  'Every point-in-time figure is gated by filing date, never fiscal period-end date — a period is only visible here once it would actually have been filed. A financial period\'s stored VALUE, however, reflects Atlas\'s latest-known filing for that period; if it was later restated, this system cannot detect or exclude that restatement (Atlas does not persist an append-only filing history).',
  'DCF WACC uses the company\'s CURRENT beta — no historical beta time series exists.',
  'Results may contain survivorship bias — Atlas has no data source for companies that have since been delisted or gone private.',
  'Forward returns are net of a disclosed default round-trip transaction cost (10bps commission + 10bps slippage) unless noted otherwise — never assumed frictionless.',
  'Comparable-company data used in the Valuation Spread tab is CURRENT, not point-in-time — Atlas does not maintain a point-in-time peer-group fundamentals engine.',
  'No result in this workspace is optimized, tuned, or cherry-picked — every threshold is fixed, disclosed configuration (spec section 18), never fit to make a result look better.',
];

/** The Milestone 12 Historical Backtesting & Research Validation workspace.
 * A single company is selected once, then every analysis tab operates on it
 * — matching the single-ticker "as of" mental model the whole milestone is
 * built around (spec section 19's mockup: one company selector, several
 * analysis tabs). */
export function BacktestWorkspace() {
  const [ticker, setTicker] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('valuation');

  return (
    <section>
      <Card>
        {ticker ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-ink/50 text-xs font-medium uppercase tracking-wide">Company</div>
              <div className="text-ink font-serif text-lg font-semibold">{ticker}</div>
            </div>
            <button type="button" onClick={() => setTicker(null)} className="text-accent text-sm hover:underline">
              Change company
            </button>
          </div>
        ) : (
          <div>
            <div className="text-ink/50 mb-2 text-xs font-medium uppercase tracking-wide">Select a company to backtest</div>
            <CompanySearch placeholder="Search by company name or ticker…" onSelect={(result) => setTicker(result.ticker)} />
          </div>
        )}
      </Card>

      {ticker && (
        <>
          <div role="tablist" aria-label="Backtest analysis type" className="border-ink/10 mt-6 flex flex-wrap gap-1 border-b">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                id={`backtest-tab-${tab.key}`}
                aria-selected={activeTab === tab.key}
                aria-controls={`backtest-panel-${tab.key}`}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key ? 'border-accent text-ink' : 'text-ink/50 hover:text-ink/70 border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`backtest-panel-${activeTab}`} aria-labelledby={`backtest-tab-${activeTab}`} className="mt-6">
            {activeTab === 'valuation' && <ValuationTab ticker={ticker} />}
            {activeTab === 'valuationSpread' && <ValuationSpreadTab ticker={ticker} />}
            {activeTab === 'dcfForecast' && <DcfForecastTab ticker={ticker} />}
            {activeTab === 'financialSignals' && <FinancialSignalsTab ticker={ticker} />}
            {activeTab === 'events' && <EventsTab ticker={ticker} />}
            {activeTab === 'researchEvents' && <ResearchEventsTab ticker={ticker} />}
          </div>

          <Card title="Limitations" className="mt-6">
            <ul className="text-ink/60 list-inside list-disc space-y-1 text-xs leading-relaxed">
              {GLOBAL_LIMITATIONS.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </section>
  );
}
