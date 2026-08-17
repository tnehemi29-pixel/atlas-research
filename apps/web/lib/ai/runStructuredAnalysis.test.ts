import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { runStructuredAnalysis } from './runStructuredAnalysis';
import * as anthropicClient from './anthropicClient';

const testSchema = z.object({ value: z.string() });
const baseRequest = {
  system: 'system prompt',
  user: 'user prompt',
  toolName: 'test_tool',
  toolDescription: 'A test tool',
  toolSchema: { type: 'object' as const, properties: {}, required: [] },
  zodSchema: testSchema,
};

describe('runStructuredAnalysis', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the validated payload when the first response is valid — no retry needed', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue({
      data: { value: 'hello' },
      model: 'claude-sonnet-4-5',
      inputTokens: 100,
      outputTokens: 50,
    });

    const result = await runStructuredAnalysis(baseRequest);
    expect(result.payload).toEqual({ value: 'hello' });
    expect(result.inputTokens).toBe(100);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('retries once with a corrective message when the first response fails validation, then succeeds', async () => {
    const spy = vi
      .spyOn(anthropicClient, 'requestStructuredCompletion')
      .mockResolvedValueOnce({ data: { wrong_field: 123 }, model: 'claude-sonnet-4-5', inputTokens: 100, outputTokens: 50 })
      .mockResolvedValueOnce({ data: { value: 'corrected' }, model: 'claude-sonnet-4-5', inputTokens: 120, outputTokens: 60 });

    const result = await runStructuredAnalysis(baseRequest);
    expect(result.payload).toEqual({ value: 'corrected' });
    // Token usage across both attempts is summed, not just the last one.
    expect(result.inputTokens).toBe(220);
    expect(result.outputTokens).toBe(110);
    expect(spy).toHaveBeenCalledTimes(2);

    // The retry's prompt includes the validation error, so the model knows what to fix.
    const secondCallArgs = spy.mock.calls[1]?.[0];
    expect(secondCallArgs?.user).toContain('did not match the required schema');
  });

  it('throws AiRequestError when the response fails validation twice — never fabricates a passing result', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue({
      data: { wrong_field: 123 },
      model: 'claude-sonnet-4-5',
      inputTokens: 100,
      outputTokens: 50,
    });

    await expect(runStructuredAnalysis(baseRequest)).rejects.toBeInstanceOf(anthropicClient.AiRequestError);
  });

  it('propagates a request-level failure (e.g. network error) without attempting to retry-validate', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockRejectedValue(
      new anthropicClient.AiRequestError('network failure'),
    );
    await expect(runStructuredAnalysis(baseRequest)).rejects.toBeInstanceOf(anthropicClient.AiRequestError);
  });
});
