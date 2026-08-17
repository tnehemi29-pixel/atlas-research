import { formatUpdatedAt } from '@/lib/utils/format';

interface SourceFootnoteProps {
  dataAsOf: string | null;
  stale: boolean;
  /** An additional note specific to the tab (e.g. the FCF formula). */
  note?: string;
}

export function SourceFootnote({ dataAsOf, stale, note }: SourceFootnoteProps) {
  return (
    <div className="text-ink/40 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span>
        Source: SEC EDGAR filings · synced {formatUpdatedAt(dataAsOf)}
        {stale && ' (refresh failed — showing last known data)'}
      </span>
      {note && <span className="text-ink/40">· {note}</span>}
    </div>
  );
}
