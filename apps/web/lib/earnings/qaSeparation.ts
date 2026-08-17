/**
 * Deterministically pairs analyst questions with management answers, using
 * the section/speakerType tags transcriptParsing.ts already assigned. No AI
 * involved here — an ANALYST turn starts a new exchange, any EXECUTIVE/OTHER
 * turns that follow are the answer, and OPERATOR turns (transition chatter)
 * are skipped without breaking the current exchange.
 */

export interface QaSegmentInput {
  section: string;
  speakerName: string | null;
  speakerRole: string | null;
  speakerType: string;
  text: string;
  anchor: string;
}

export interface QaExchange {
  index: number;
  analystName: string;
  analystFirm: string | null;
  questionText: string;
  questionSegmentAnchors: string[];
  answerText: string;
  answerSegmentAnchors: string[];
  answererNames: string[];
}

/** Filters to the Q&A section and groups it into question/answer exchanges,
 * one per analyst turn. Answer text from consecutive management turns (e.g.
 * CEO then CFO both responding) is concatenated into the same exchange. */
export function separateQaExchanges(segments: QaSegmentInput[]): QaExchange[] {
  const qaSegments = segments.filter((s) => s.section === 'QA');
  const exchanges: QaExchange[] = [];
  let current: QaExchange | null = null;

  for (const seg of qaSegments) {
    if (seg.speakerType === 'OPERATOR') continue;

    if (seg.speakerType === 'ANALYST') {
      current = {
        index: exchanges.length,
        analystName: seg.speakerName ?? 'Unknown Analyst',
        analystFirm: seg.speakerRole,
        questionText: seg.text,
        questionSegmentAnchors: [seg.anchor],
        answerText: '',
        answerSegmentAnchors: [],
        answererNames: [],
      };
      exchanges.push(current);
      continue;
    }

    // EXECUTIVE or OTHER turns are the answer to whichever exchange is open.
    // A management turn with no preceding question (shouldn't normally
    // happen once the QA section has started) has nothing to attach to.
    if (!current) continue;

    current.answerText = current.answerText.length > 0 ? `${current.answerText}\n\n${seg.text}` : seg.text;
    current.answerSegmentAnchors.push(seg.anchor);
    if (seg.speakerName && !current.answererNames.includes(seg.speakerName)) {
      current.answererNames.push(seg.speakerName);
    }
  }

  return exchanges;
}
