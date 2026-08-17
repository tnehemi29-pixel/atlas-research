import { describe, expect, it } from 'vitest';
import { parseTranscript } from './transcriptParsing';
import { separateQaExchanges, type QaSegmentInput } from './qaSeparation';

function seg(overrides: Partial<QaSegmentInput>): QaSegmentInput {
  return {
    section: 'QA',
    speakerName: null,
    speakerRole: null,
    speakerType: 'OTHER',
    text: '',
    anchor: 'segment-0',
    ...overrides,
  };
}

describe('separateQaExchanges', () => {
  it('ignores non-QA segments entirely', () => {
    const segments: QaSegmentInput[] = [
      seg({ section: 'PREPARED_REMARKS', speakerType: 'EXECUTIVE', speakerName: 'Alex Chen', text: 'intro' }),
      seg({ section: 'QA', speakerType: 'ANALYST', speakerName: 'Sam Patel', text: 'Question?', anchor: 'segment-1' }),
    ];
    const exchanges = separateQaExchanges(segments);
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0]?.analystName).toBe('Sam Patel');
  });

  it('pairs one analyst question with the following executive answer', () => {
    const segments: QaSegmentInput[] = [
      seg({ speakerType: 'ANALYST', speakerName: 'Sam Patel', speakerRole: 'Meridian Securities', text: 'What about pricing?', anchor: 'segment-1' }),
      seg({ speakerType: 'EXECUTIVE', speakerName: 'Alex Chen', text: 'Pricing is stable.', anchor: 'segment-2' }),
    ];
    const exchange = separateQaExchanges(segments)[0];
    expect(exchange?.analystFirm).toBe('Meridian Securities');
    expect(exchange?.questionText).toBe('What about pricing?');
    expect(exchange?.answerText).toBe('Pricing is stable.');
    expect(exchange?.answererNames).toEqual(['Alex Chen']);
    expect(exchange?.answerSegmentAnchors).toEqual(['segment-2']);
  });

  it('concatenates multi-executive answers into the same exchange', () => {
    const segments: QaSegmentInput[] = [
      seg({ speakerType: 'ANALYST', speakerName: 'Sam Patel', text: 'CapEx question?', anchor: 'segment-1' }),
      seg({ speakerType: 'EXECUTIVE', speakerName: 'Alex Chen', text: 'From a strategy view...', anchor: 'segment-2' }),
      seg({ speakerType: 'EXECUTIVE', speakerName: 'Priya Natarajan', text: 'And financially...', anchor: 'segment-3' }),
    ];
    const exchange = separateQaExchanges(segments)[0];
    expect(exchange?.answerText).toBe('From a strategy view...\n\nAnd financially...');
    expect(exchange?.answererNames).toEqual(['Alex Chen', 'Priya Natarajan']);
    expect(exchange?.answerSegmentAnchors).toEqual(['segment-2', 'segment-3']);
  });

  it('skips operator turns without breaking the current exchange', () => {
    const segments: QaSegmentInput[] = [
      seg({ speakerType: 'ANALYST', speakerName: 'Sam Patel', text: 'Question?', anchor: 'segment-1' }),
      seg({ speakerType: 'OPERATOR', speakerName: 'Operator', text: 'One moment please.', anchor: 'segment-2' }),
      seg({ speakerType: 'EXECUTIVE', speakerName: 'Alex Chen', text: 'Answer.', anchor: 'segment-3' }),
    ];
    const exchange = separateQaExchanges(segments)[0];
    expect(exchange?.answerText).toBe('Answer.');
    expect(exchange?.answerSegmentAnchors).toEqual(['segment-3']);
  });

  it('starts a new exchange on every new analyst turn, even from the same analyst', () => {
    const segments: QaSegmentInput[] = [
      seg({ speakerType: 'ANALYST', speakerName: 'Sam Patel', text: 'First question?', anchor: 'segment-1' }),
      seg({ speakerType: 'EXECUTIVE', speakerName: 'Alex Chen', text: 'First answer.', anchor: 'segment-2' }),
      seg({ speakerType: 'ANALYST', speakerName: 'Sam Patel', text: 'Follow-up?', anchor: 'segment-3' }),
      seg({ speakerType: 'EXECUTIVE', speakerName: 'Alex Chen', text: 'Follow-up answer.', anchor: 'segment-4' }),
    ];
    const exchanges = separateQaExchanges(segments);
    expect(exchanges).toHaveLength(2);
    expect(exchanges[0]?.questionText).toBe('First question?');
    expect(exchanges[1]?.questionText).toBe('Follow-up?');
    expect(exchanges[1]?.index).toBe(1);
  });

  it('drops an answer-shaped turn with no preceding question rather than crashing', () => {
    const segments: QaSegmentInput[] = [
      seg({ speakerType: 'EXECUTIVE', speakerName: 'Alex Chen', text: 'Stray remark.', anchor: 'segment-1' }),
    ];
    expect(separateQaExchanges(segments)).toEqual([]);
  });

  it('produces exchanges consistent with a fully-parsed transcript', () => {
    const raw = `Operator: Good day.\n\nJane Rivera: Welcome.\n\nAlex Chen: We had a strong quarter.\n\nOperator: We will now begin the question-and-answer session.\n\nSam Patel - Meridian Securities: How is demand?\n\nAlex Chen: Demand is strong.\n\nMorgan Lee - Bluewater Capital: What about margins?\n\nPriya Natarajan - Chief Financial Officer: Margins expanded.`;
    const segments = parseTranscript(raw);
    const exchanges = separateQaExchanges(segments);
    expect(exchanges).toHaveLength(2);
    expect(exchanges[0]?.analystName).toBe('Sam Patel');
    expect(exchanges[0]?.answerText).toBe('Demand is strong.');
    expect(exchanges[1]?.analystName).toBe('Morgan Lee');
    expect(exchanges[1]?.answerText).toBe('Margins expanded.');
  });
});
