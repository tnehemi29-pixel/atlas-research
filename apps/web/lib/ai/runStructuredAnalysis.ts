import type { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { AiRequestError, requestStructuredCompletion } from './anthropicClient';

/**
 * The shared "call the model, validate, retry once, give up honestly"
 * mechanics behind both analyzeFiling.ts and compareFilings.ts —
 * "validate the response before storing it; if validation fails, retry or
 * gracefully report the failure." `strict: true` on the Anthropic tool call
 * already asks the model to guarantee schema conformance, but this is a
 * second, independent validation layer that never trusts the provider's
 * claim alone.
 */

export interface StructuredAnalysisRequest<T> {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  toolSchema: Anthropic.Tool.InputSchema;
  zodSchema: z.ZodType<T>;
  maxTokens?: number;
}

export interface StructuredAnalysisResult<T> {
  payload: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function runStructuredAnalysis<T>(
  request: StructuredAnalysisRequest<T>,
): Promise<StructuredAnalysisResult<T>> {
  const first = await requestStructuredCompletion({
    system: request.system,
    user: request.user,
    toolName: request.toolName,
    toolDescription: request.toolDescription,
    toolSchema: request.toolSchema,
    maxTokens: request.maxTokens,
  });

  const firstParsed = request.zodSchema.safeParse(first.data);
  if (firstParsed.success) {
    return { payload: firstParsed.data, model: first.model, inputTokens: first.inputTokens, outputTokens: first.outputTokens };
  }

  // One corrective retry, telling the model exactly what was invalid — a
  // model that ignores `strict: true` and returns a malformed shape gets
  // one clear chance to self-correct before this is treated as a failure.
  const correctiveUser = `${request.user}\n\n---\nYour previous response did not match the required schema. Validation errors:\n${firstParsed.error.message}\n\nCall the tool again with a response that satisfies the schema exactly.`;

  const second = await requestStructuredCompletion({
    system: request.system,
    user: correctiveUser,
    toolName: request.toolName,
    toolDescription: request.toolDescription,
    toolSchema: request.toolSchema,
    maxTokens: request.maxTokens,
  });

  const secondParsed = request.zodSchema.safeParse(second.data);
  if (!secondParsed.success) {
    throw new AiRequestError(`AI response failed schema validation twice: ${secondParsed.error.message}`);
  }

  return {
    payload: secondParsed.data,
    model: second.model,
    inputTokens: first.inputTokens + second.inputTokens,
    outputTokens: first.outputTokens + second.outputTokens,
  };
}
