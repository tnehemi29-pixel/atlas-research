import { afterEach, describe, expect, it, vi } from 'vitest';
import { answerWorkspaceQuestion, sanitizeWorkspaceAssistantPayload } from './answerWorkspaceQuestion';
import * as anthropicClient from './anthropicClient';
import type { WorkspaceAssistantPromptInput } from './workspaceAssistantPrompts';
import type { WorkspaceAssistantContext } from '@/lib/workspace/assistantContext';

function makeContext(): WorkspaceAssistantContext {
  return {
    workspaceName: 'Atlas Investment Research',
    callerRole: 'ANALYST',
    coveredCompanies: [{ id: 'company:1', ticker: 'NVDA', name: 'NVIDIA Corp', analystName: 'Nehemiah' }],
    openTasks: [{ id: 'task:1', title: 'Review latest 10-Q', ticker: 'NVDA', assignee: 'Nehemiah', priority: 'HIGH', status: 'TODO', dueDate: null }],
    reportsInReview: [{ id: 'review:1', ticker: 'NVDA', version: 3, submittedAt: '2026-08-01T00:00:00.000Z' }],
    openIntegrityIssues: [{ id: 'issue:1', ticker: 'NVDA', category: 'DCF_MODEL_ERROR', severity: 'HIGH', description: 'WACC could not be calculated.' }],
    recentResearchChanges: [{ id: 'event:1', ticker: 'NVDA', title: 'DCF updated', materiality: 'HIGH', eventDate: '2026-08-02T00:00:00.000Z' }],
    committeeSubmissions: [],
    callerOwnCases: [],
  };
}

function makeInput(): WorkspaceAssistantPromptInput {
  return { context: makeContext(), question: 'Which companies have unresolved research issues?' };
}

function validResponse(citedSourceIds: string[] = ['issue:1']) {
  return { data: { answer: 'NVDA has an open DCF model error.', cited_source_ids: citedSourceIds, caveats: [] }, model: 'claude-sonnet-4-5', inputTokens: 400, outputTokens: 60 };
}

describe('answerWorkspaceQuestion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the full workspace context and returns the validated payload', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validResponse());
    const input = makeInput();
    const validIds = new Set(['company:1', 'task:1', 'review:1', 'issue:1', 'event:1']);

    const result = await answerWorkspaceQuestion(input, validIds);

    expect(result.payload.answer).toContain('NVDA');
    expect(result.payload.cited_source_ids).toEqual(['issue:1']);
    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).toContain('Atlas Investment Research');
    expect(userPrompt).toContain('issue:1');
    expect(userPrompt).toContain('Which companies have unresolved research issues?');
  });

  it('strips a cited id the model invents - the AI cannot fabricate a citation to a nonexistent workspace record', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validResponse(['issue:1', 'issue:made-up']));
    const validIds = new Set(['issue:1']);

    const result = await answerWorkspaceQuestion(makeInput(), validIds);
    expect(result.payload.cited_source_ids).toEqual(['issue:1']);
  });

  it('propagates AiNotConfiguredError untouched', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockRejectedValue(new anthropicClient.AiNotConfiguredError());
    await expect(answerWorkspaceQuestion(makeInput(), new Set())).rejects.toBeInstanceOf(anthropicClient.AiNotConfiguredError);
  });
});

describe('sanitizeWorkspaceAssistantPayload', () => {
  it('removes every id not present in the valid set', () => {
    const sanitized = sanitizeWorkspaceAssistantPayload({ answer: 'x', cited_source_ids: ['real', 'fake'], caveats: [] }, new Set(['real']));
    expect(sanitized.cited_source_ids).toEqual(['real']);
  });
});
