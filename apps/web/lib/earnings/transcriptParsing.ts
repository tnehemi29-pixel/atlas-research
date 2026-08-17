/**
 * Deterministic earnings-call transcript parser. FMP (and most transcript
 * providers) return one large block of plain text with speaker turns
 * written as "Name: remarks" or "Name - Role/Firm: remarks" paragraphs —
 * never pre-segmented, speaker-tagged data. This module is the only place
 * that understands that raw shape; everything downstream (guidance
 * extraction, AI analysis, search, the UI) works off the structured
 * TranscriptSegment[] this produces.
 *
 * Section/speaker identification here is heuristic, not guaranteed exact —
 * see the README's Known Limitations for the cases it can misclassify.
 */

export type TranscriptSectionType = 'OPENING_REMARKS' | 'PREPARED_REMARKS' | 'QA' | 'OTHER';
export type TranscriptSpeakerType = 'EXECUTIVE' | 'ANALYST' | 'OPERATOR' | 'OTHER';

export interface ParsedSegment {
  section: TranscriptSectionType;
  orderIndex: number;
  speakerName: string | null;
  speakerRole: string | null;
  speakerType: TranscriptSpeakerType;
  text: string;
  anchor: string;
}

// Standalone header/boilerplate lines transcript providers commonly insert
// between sections — recognized and dropped rather than mis-parsed as a
// zero-content speaker turn.
const IGNORED_HEADER_LINES = new Set([
  'corporate participants',
  'conference call participants',
  'participants',
  'presentation',
  'call participants',
  'question-and-answer session',
  'questions and answers',
  'q&a session',
  'q&a',
]);

// A standalone line matching one of these (or an Operator turn containing
// one of these phrases) marks the start of the Q&A section.
const QA_TRANSITION_PATTERN =
  /question-and-answer session|questions and answers|q&a session|first question|open(?:ing)?(?: it up)? .{0,20}for questions|begin the question/i;

// Role/title keywords that override the "spoke before Q&A" heuristic below —
// catches an executive whose only appearance is answering a question.
const EXECUTIVE_TITLE_PATTERN = /chief|officer|president|chairman|founder|treasurer|head of|director of investor/i;

const OPERATOR_NAME_PATTERN = /^operator$/i;

/** Splits raw transcript text into blank-line-separated paragraph blocks. */
function splitIntoBlocks(raw: string): string[] {
  return raw
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

interface SpeakerHeader {
  speakerRaw: string;
  roleRaw: string | null;
  text: string;
}

/** Detects a "Name: text" or "Name - Role: text" turn at the start of a
 * block. Returns null when the block is a continuation of the previous
 * speaker's turn (no new header detected). */
function parseSpeakerHeader(block: string): SpeakerHeader | null {
  const match = block.match(/^([^:\n]{1,90}?):\s*([\s\S]*)$/);
  if (!match) return null;

  const header = (match[1] ?? '').trim();
  const text = (match[2] ?? '').trim();
  const words = header.split(/\s+/);
  // A real speaker name/title is short and never starts with a digit —
  // guards against false positives like "Note: ..." or a spoken "10:30" being
  // mistaken for a header.
  if (header.length === 0 || words.length > 10 || /^\d/.test(header)) return null;
  if (!/^[A-Z]/.test(header)) return null;

  const dashMatch = header.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dashMatch) {
    const speakerRaw = (dashMatch[1] ?? '').trim();
    const roleRaw = (dashMatch[2] ?? '').trim();
    if (speakerRaw.length === 0) return null;
    return { speakerRaw, roleRaw: roleRaw.length > 0 ? roleRaw : null, text };
  }
  return { speakerRaw: header, roleRaw: null, text };
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function classifySpeaker(
  speakerRaw: string,
  roleRaw: string | null,
  inQaSection: boolean,
  knownExecutives: Set<string>,
): TranscriptSpeakerType {
  if (OPERATOR_NAME_PATTERN.test(speakerRaw)) return 'OPERATOR';
  if (roleRaw && EXECUTIVE_TITLE_PATTERN.test(roleRaw)) return 'EXECUTIVE';
  if (!inQaSection) return 'EXECUTIVE'; // pre-Q&A named speakers are management by construction
  if (knownExecutives.has(normalizeName(speakerRaw))) return 'EXECUTIVE';
  return 'ANALYST';
}

/**
 * Parses a raw transcript into an ordered list of speaker-tagged segments.
 * Opening Remarks = the operator's call-opening/introduction; Prepared
 * Remarks = the scripted CEO/CFO/other-executive commentary that follows;
 * Q&A = everything from the detected question-and-answer transition onward.
 * Never throws — an unparseable block is skipped rather than fabricated
 * into a fake speaker turn.
 */
export function parseTranscript(rawContent: string): ParsedSegment[] {
  const blocks = splitIntoBlocks(rawContent);
  const segments: ParsedSegment[] = [];
  const knownExecutives = new Set<string>();

  let section: TranscriptSectionType = 'OPENING_REMARKS';
  let sawNamedSpeaker = false;
  let inQaSection = false;
  let orderIndex = 0;

  for (const block of blocks) {
    const lower = block.toLowerCase();

    if (QA_TRANSITION_PATTERN.test(block) && !inQaSection) {
      inQaSection = true;
      section = 'QA';
    }

    if (IGNORED_HEADER_LINES.has(lower)) continue;

    const header = parseSpeakerHeader(block);

    if (!header) {
      // Continuation paragraph — append to the previous segment's text if one exists.
      const last = segments[segments.length - 1];
      if (last && block.length > 0) {
        segments[segments.length - 1] = { ...last, text: `${last.text}\n\n${block}` };
      }
      continue;
    }

    if (!inQaSection) {
      if (!sawNamedSpeaker && !OPERATOR_NAME_PATTERN.test(header.speakerRaw)) {
        sawNamedSpeaker = true;
        section = 'PREPARED_REMARKS';
      } else if (!sawNamedSpeaker) {
        section = 'OPENING_REMARKS';
      } else {
        section = 'PREPARED_REMARKS';
      }
    } else {
      section = 'QA';
    }

    const speakerType = classifySpeaker(header.speakerRaw, header.roleRaw, inQaSection, knownExecutives);
    if (speakerType === 'EXECUTIVE') knownExecutives.add(normalizeName(header.speakerRaw));

    if (header.text.length === 0) continue; // header-only block (e.g. a bare "Operator:") with no remarks

    segments.push({
      section,
      orderIndex,
      speakerName: header.speakerRaw,
      speakerRole: header.roleRaw,
      speakerType,
      text: header.text,
      anchor: `segment-${orderIndex}`,
    });
    orderIndex += 1;
  }

  return segments;
}
