import type { TranscriptSegmentResponse } from '@/lib/api/earnings';

/** Resolves an AI citation's excerpt back to the transcript segment it was
 * drawn from, by substring match — the same "citation resolves to source at
 * render time" pattern Milestone 7 uses for filing sections, just at
 * segment granularity since a transcript has many small speaker turns
 * rather than a few large sections. Returns null (never a guessed anchor)
 * when no segment contains the excerpt. */
export function resolveSegmentAnchor(segments: TranscriptSegmentResponse[], excerpt: string): string | null {
  const normalized = excerpt.trim().toLowerCase();
  if (normalized.length === 0) return null;
  const match = segments.find((s) => s.text.toLowerCase().includes(normalized));
  return match?.anchor ?? null;
}
