import { describe, expect, it } from 'vitest';
import { parseTranscript } from './transcriptParsing';

// A synthetic, original fixture modeled on the general shape of a typical
// earnings-call transcript (operator intro -> IR/CEO/CFO prepared remarks ->
// Q&A) — not a real company's transcript.
const FIXTURE_TRANSCRIPT = `
Operator: Good day, and welcome to the Acme Corporation Third Quarter 2025 Earnings Conference Call. All participants will be in listen-only mode. After today's presentation, there will be an opportunity to ask questions.

Jane Rivera: Thank you, operator, and good afternoon everyone. Before we begin, I'd like to remind you that today's call includes forward-looking statements.

Alex Chen: Thanks, Jane, and good afternoon everyone. We delivered a strong third quarter, with revenue growth accelerating across all three of our operating segments.

Our cloud segment continued to see robust demand, and we are seeing early signs of increased enterprise spending on our AI platform.

Priya Natarajan - Chief Financial Officer: Thank you, Alex. Turning to the financials, third quarter revenue was $4.2 billion, up 14% year over year. Gross margin was 62%, up from 60% a year ago.

For the fourth quarter, we expect revenue in the range of $4.4 billion to $4.6 billion, and we expect full-year capital expenditures of approximately $900 million.

Operator: Thank you. We will now begin the question-and-answer session. Our first question comes from the line of Sam Patel with Meridian Securities.

Sam Patel - Meridian Securities: Thanks for taking my question. Can you talk about the pricing environment in the cloud segment, and whether you're seeing any pushback from customers given the macro backdrop?

Alex Chen: Sure, Sam. We haven't seen meaningful pricing pushback so far. Customers are still prioritizing our platform given the efficiency gains it provides.

Operator: Our next question comes from Morgan Lee with Bluewater Capital.

Morgan Lee - Bluewater Capital: On the CapEx guidance, that's a step up from prior guidance. What's driving the increase?

Priya Natarajan: The increase is primarily to support additional data center capacity for our AI workloads, which we expect to be a multi-year investment.
`;

describe('parseTranscript', () => {
  it('splits the transcript into ordered, speaker-tagged segments', () => {
    const segments = parseTranscript(FIXTURE_TRANSCRIPT);
    expect(segments.length).toBeGreaterThan(5);
    expect(segments.every((s, i) => s.orderIndex === i)).toBe(true);
    expect(segments.every((s) => s.anchor === `segment-${s.orderIndex}`)).toBe(true);
  });

  it('tags the opening operator turn as OPENING_REMARKS / OPERATOR', () => {
    const first = parseTranscript(FIXTURE_TRANSCRIPT)[0];
    expect(first?.section).toBe('OPENING_REMARKS');
    expect(first?.speakerType).toBe('OPERATOR');
    expect(first?.speakerName).toBe('Operator');
  });

  it('tags the IR/CEO/CFO scripted remarks as PREPARED_REMARKS / EXECUTIVE', () => {
    const segments = parseTranscript(FIXTURE_TRANSCRIPT);
    const ceo = segments.find((s) => s.speakerName === 'Alex Chen' && s.section === 'PREPARED_REMARKS');
    expect(ceo).toBeDefined();
    expect(ceo?.speakerType).toBe('EXECUTIVE');

    const cfo = segments.find((s) => s.speakerName === 'Priya Natarajan');
    expect(cfo?.speakerType).toBe('EXECUTIVE');
    expect(cfo?.speakerRole).toBe('Chief Financial Officer');
  });

  it('extracts CFO guidance language into a PREPARED_REMARKS segment', () => {
    const segments = parseTranscript(FIXTURE_TRANSCRIPT);
    const guidance = segments.find((s) => s.text.includes('$4.4 billion to $4.6 billion'));
    expect(guidance?.section).toBe('PREPARED_REMARKS');
    expect(guidance?.speakerType).toBe('EXECUTIVE');
  });

  it('switches to QA at the question-and-answer transition', () => {
    const segments = parseTranscript(FIXTURE_TRANSCRIPT);
    const transitionIndex = segments.findIndex((s) => s.text.includes('question-and-answer session'));
    expect(transitionIndex).toBeGreaterThan(-1);
    expect(segments[transitionIndex]?.section).toBe('QA');
    expect(segments.slice(transitionIndex).every((s) => s.section === 'QA')).toBe(true);
  });

  it('classifies an analyst asking a question in Q&A as ANALYST, with firm captured as role', () => {
    const segments = parseTranscript(FIXTURE_TRANSCRIPT);
    const question = segments.find((s) => s.speakerName === 'Sam Patel');
    expect(question?.speakerType).toBe('ANALYST');
    expect(question?.speakerRole).toBe('Meridian Securities');
    expect(question?.section).toBe('QA');
  });

  it('classifies a management answer in Q&A as EXECUTIVE using the prepared-remarks roster', () => {
    const segments = parseTranscript(FIXTURE_TRANSCRIPT);
    const answers = segments.filter((s) => s.speakerName === 'Alex Chen' && s.section === 'QA');
    expect(answers.length).toBeGreaterThan(0);
    expect(answers[0]?.speakerType).toBe('EXECUTIVE');

    const cfoAnswer = segments.find(
      (s) => s.speakerName === 'Priya Natarajan' && s.section === 'QA',
    );
    expect(cfoAnswer?.speakerType).toBe('EXECUTIVE');
  });

  it('drops standalone boilerplate header lines rather than emitting an empty segment', () => {
    const withHeaders = `Corporate Participants\n\nJane Rivera: Hello everyone.\n\nQuestion-and-Answer Session\n\nOperator: Our first question comes from the line of Sam Patel.`;
    const segments = parseTranscript(withHeaders);
    expect(segments.some((s) => s.text.toLowerCase() === 'corporate participants')).toBe(false);
    expect(segments.some((s) => s.speakerName === null)).toBe(false);
  });

  it('merges a continuation paragraph into the same speaker turn rather than dropping it', () => {
    const segments = parseTranscript(FIXTURE_TRANSCRIPT);
    const ceoOpening = segments.find((s) => s.text.includes('strong third quarter'));
    expect(ceoOpening?.text).toContain('cloud segment continued to see robust demand');
  });

  it('never throws on malformed or empty input', () => {
    expect(() => parseTranscript('')).not.toThrow();
    expect(parseTranscript('')).toEqual([]);
    expect(() => parseTranscript('just some text with no colons at all')).not.toThrow();
  });
});
