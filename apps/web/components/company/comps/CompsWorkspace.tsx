'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { runComps } from '@/lib/comps/engine';
import type { CompanyValuationMetrics, PeerCandidate, PeerSelection } from '@/lib/comps/types';
import { fetchCompsData } from '@/lib/api/comps';
import { CompanyNav } from '@/components/company/CompanyNav';
import { TargetCompanyHeader } from './TargetCompanyHeader';
import { PeerCandidatesPanel } from './PeerCandidatesPanel';
import { CompsTable } from './CompsTable';
import { OutlierPanel } from './OutlierPanel';
import { ValuationSummaryTable } from './ValuationSummaryTable';
import { PeerQualityPanel } from './PeerQualityPanel';
import { HistoricalMultiplesPanel } from './HistoricalMultiplesPanel';
import { CompsCharts } from './charts/CompsCharts';

const DEFAULT_PEER_COUNT = 6;

function defaultSelection(candidates: PeerCandidate[]): PeerSelection[] {
  return candidates.slice(0, DEFAULT_PEER_COUNT).map((candidate) => ({
    metrics: candidate.metrics,
    score: candidate.score,
    source: 'calculated' as const,
    excluded: false,
  }));
}

interface CompsWorkspaceProps {
  ticker: string;
  target: CompanyValuationMetrics;
  initialCandidates: PeerCandidate[];
}

export function CompsWorkspace({ ticker, target, initialCandidates }: CompsWorkspaceProps) {
  const [candidates] = useState<PeerCandidate[]>(initialCandidates);
  const [selectedPeers, setSelectedPeers] = useState<PeerSelection[]>(() => defaultSelection(initialCandidates));
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const selectedTickers = useMemo(() => new Set(selectedPeers.map((p) => p.metrics.ticker)), [selectedPeers]);

  const result = useMemo(() => runComps({ target, peers: selectedPeers }), [target, selectedPeers]);

  function acceptCandidate(candidate: PeerCandidate) {
    setSelectedPeers((prev) => {
      if (prev.some((p) => p.metrics.ticker === candidate.metrics.ticker)) return prev;
      return [...prev, { metrics: candidate.metrics, score: candidate.score, source: 'calculated', excluded: false }];
    });
  }

  function removePeer(peerTicker: string) {
    setSelectedPeers((prev) => prev.filter((p) => p.metrics.ticker !== peerTicker));
  }

  function toggleExcludePeer(peerTicker: string) {
    setSelectedPeers((prev) =>
      prev.map((p) => (p.metrics.ticker === peerTicker ? { ...p, excluded: !p.excluded } : p)),
    );
  }

  function resetToSuggested() {
    setSelectedPeers(defaultSelection(candidates));
    setAddError(null);
  }

  async function addManualPeer(tickerToAdd: string) {
    if (selectedTickers.has(tickerToAdd) || tickerToAdd === ticker) return;
    setIsAddingManual(true);
    setAddError(null);
    try {
      const data = await fetchCompsData(ticker, [tickerToAdd]);
      const metrics = data.peers[0];
      if (!metrics) {
        setAddError(`Couldn't load data for "${tickerToAdd}".`);
        return;
      }
      const score = candidates.find((c) => c.metrics.ticker === metrics.ticker)?.score ?? null;
      setSelectedPeers((prev) => [...prev, { metrics, score, source: 'user', excluded: false }]);
    } catch {
      setAddError(`Couldn't load data for "${tickerToAdd}".`);
    } finally {
      setIsAddingManual(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-2 flex items-center justify-between">
        <CompanyNav ticker={ticker} active="comps" />
        <Link href={`/company/${ticker}/comps/methodology`} className="text-accent text-sm hover:underline">
          Methodology →
        </Link>
      </div>

      <TargetCompanyHeader target={target} targetMultiples={result.targetMultiples} />

      <PeerCandidatesPanel
        candidates={candidates}
        selectedTickers={selectedTickers}
        onAccept={acceptCandidate}
        onAddManual={addManualPeer}
        isAddingManual={isAddingManual}
        onReset={resetToSuggested}
        isLoading={false}
      />
      {addError && (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {addError}
        </p>
      )}

      <CompsTable
        target={result.target}
        targetMultiples={result.targetMultiples}
        peers={result.peers}
        statistics={result.statistics}
        onToggleExclude={toggleExcludePeer}
        onRemove={removePeer}
      />

      <OutlierPanel statistics={result.statistics} peers={result.peers} onToggleExclude={toggleExcludePeer} />

      <ValuationSummaryTable
        impliedValuation={result.impliedValuation}
        medianImpliedSharePrice={result.medianImpliedSharePrice}
        currentSharePrice={result.target.price}
      />

      <PeerQualityPanel peerQuality={result.peerQuality} target={result.target} />

      <CompsCharts
        targetMultiples={result.targetMultiples}
        statistics={result.statistics}
        impliedValuation={result.impliedValuation}
        currentSharePrice={result.target.price}
      />

      <HistoricalMultiplesPanel />
    </main>
  );
}
