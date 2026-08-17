'use client';

import { useState } from 'react';
import { fetchAuditLog, fetchResearchClaims, type AuditLogEntryResponse, type ResearchClaimResponse } from '@/lib/api/integrity';
import { CLAIM_VALIDATION_STATUS_STYLE } from '@/lib/utils/integrityDisplay';
import { formatUpdatedAt } from '@/lib/utils/format';

/** Spec section 14's research claim registry and spec section 23's audit
 * log, both scoped to this company. Collapsed by default and fetched lazily
 * on first expand — most companies have no claims yet (nothing in this
 * milestone auto-scans a generated report's prose against source data; see
 * docs/research-integrity.md's known limitations), so loading them
 * unconditionally on every company page view would be wasted work. */
export function IntegrityDetailPanels({ ticker }: { ticker: string }) {
  return (
    <div className="mt-4 space-y-3">
      <ClaimsSection ticker={ticker} />
      <AuditLogSection ticker={ticker} />
    </div>
  );
}

function ClaimsSection({ ticker }: { ticker: string }) {
  const [expanded, setExpanded] = useState(false);
  const [claims, setClaims] = useState<ResearchClaimResponse[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && claims === null) {
      setLoading(true);
      try {
        setClaims(await fetchResearchClaims(ticker));
      } catch {
        setClaims([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="border-ink/10 rounded-lg border">
      <button type="button" onClick={handleToggle} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left">
        <span className="text-ink text-sm font-medium">Research Claim Registry</span>
        <span className="text-ink/30 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="border-ink/10 border-t px-3 py-2.5">
          {loading && <p className="text-ink/40 text-xs">Loading claims…</p>}
          {!loading && claims && claims.length === 0 && (
            <p className="text-ink/40 text-sm">
              No research claims recorded for this company yet. Every research claim Atlas tracks — a stated number, tied to a source and a data snapshot — is validated against that source before
              it can be marked VERIFIED (spec section 13: the AI is never treated as the source of truth).
            </p>
          )}
          {!loading && claims && claims.length > 0 && (
            <ul className="space-y-2">
              {claims.map((claim) => (
                <li key={claim.id} className="border-ink/10 rounded-lg border p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CLAIM_VALIDATION_STATUS_STYLE[claim.validationStatus]}`}>
                      {claim.validationStatus}
                    </span>
                    <span className="text-ink/40 text-xs">{formatUpdatedAt(claim.createdAt)}</span>
                  </div>
                  <p className="text-ink mt-1 text-sm">{claim.claim}</p>
                  {claim.statedValue !== null && claim.sourceValue !== null && (
                    <p className="text-ink/50 mt-0.5 text-xs">
                      Stated: {claim.statedValue} · Source: {claim.sourceValue} ({claim.claimSourceType})
                    </p>
                  )}
                  {claim.validationDetail && <p className="text-ink/50 mt-0.5 text-xs">{claim.validationDetail}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AuditLogSection({ ticker }: { ticker: string }) {
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<AuditLogEntryResponse[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && entries === null) {
      setLoading(true);
      try {
        setEntries(await fetchAuditLog(ticker));
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="border-ink/10 rounded-lg border">
      <button type="button" onClick={handleToggle} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left">
        <span className="text-ink text-sm font-medium">Audit Log</span>
        <span className="text-ink/30 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="border-ink/10 border-t px-3 py-2.5">
          <p className="text-ink/40 mb-2 text-xs">What Atlas knew, when it knew it, and why it produced each conclusion — every check run, issue created or resolved, claim validated, and snapshot computed.</p>
          {loading && <p className="text-ink/40 text-xs">Loading audit log…</p>}
          {!loading && entries && entries.length === 0 && <p className="text-ink/40 text-sm">No audit log entries yet.</p>}
          {!loading && entries && entries.length > 0 && (
            <ul className="divide-y divide-black/5">
              {entries.slice(0, 25).map((entry) => (
                <li key={entry.id} className="py-1.5 text-xs">
                  <span className="text-ink/40">{formatUpdatedAt(entry.createdAt)}</span> <span className="text-ink font-medium">{entry.action}</span>{' '}
                  <span className="text-ink/50">{entry.entityType}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
