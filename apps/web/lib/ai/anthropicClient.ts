import Anthropic from '@anthropic-ai/sdk';

/**
 * The only file that knows Anthropic's API shape — every other AI module
 * calls `requestStructuredCompletion`, never the Anthropic SDK directly.
 * Mirrors lib/providers/fmp.ts's adapter pattern: a dedicated
 * not-configured error so callers can degrade gracefully (filing retrieval/
 * processing/search all work without an API key; only AI analysis is
 * unavailable), and a request error for anything that fails after that.
 */

export class AiNotConfiguredError extends Error {
  constructor(message = 'ANTHROPIC_API_KEY is not configured') {
    super(message);
    this.name = 'AiNotConfiguredError';
  }
}

export class AiRequestError extends Error {
  constructor(
    message: string,
    public readonly sourceError?: unknown,
  ) {
    super(message);
    this.name = 'AiRequestError';
  }
}

const DEFAULT_MODEL = 'claude-sonnet-4-5';

/** Tracked per-analysis in the database (FilingAnalysis.model /
 * FilingComparison.model) — reading this from an env var rather than
 * hardcoding it means a model upgrade is a config change, and every
 * existing analysis still records exactly which model produced it. */
export function getModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

/** Server-side-only check for whether AI generation is available at all —
 * lets Server Components decide whether to render a "Generate" action
 * before a user ever clicks it and hits AiNotConfiguredError, rather than
 * showing (and then hiding) a button that was always going to fail. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiNotConfiguredError();
  if (!cachedClient) cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export interface StructuredCompletionParams {
  system: string;
  user: string;
  /** Forces the model to call exactly this tool — the mechanism behind "do
   * not allow the LLM to return arbitrary free-form data." */
  toolName: string;
  toolDescription: string;
  toolSchema: Anthropic.Tool.InputSchema;
  maxTokens?: number;
}

export interface StructuredCompletionResult {
  /** The raw tool-call input — always zod-validated by the caller before
   * being trusted (see lib/ai/schema.ts); `strict: true` below asks
   * Anthropic to guarantee schema conformance, but a second, independent
   * validation layer is kept regardless — "if validation fails, retry or
   * gracefully report the failure" applies even to a provider that claims
   * to guarantee its own output. */
  data: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function requestStructuredCompletion(
  params: StructuredCompletionParams,
): Promise<StructuredCompletionResult> {
  const anthropic = getClient();
  const model = getModel();

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: params.maxTokens ?? 4096,
      system: params.system,
      messages: [{ role: 'user', content: params.user }],
      tools: [
        {
          name: params.toolName,
          description: params.toolDescription,
          input_schema: params.toolSchema,
          strict: true,
        },
      ],
      tool_choice: { type: 'tool', name: params.toolName },
    });
  } catch (sourceError) {
    throw new AiRequestError(
      sourceError instanceof Error ? sourceError.message : 'Anthropic API request failed',
      sourceError,
    );
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );
  if (!toolUse) {
    throw new AiRequestError('The model did not return a structured tool call.');
  }

  return {
    data: toolUse.input,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
