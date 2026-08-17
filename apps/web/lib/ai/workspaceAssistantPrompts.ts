import type { WorkspaceAssistantContext } from '@/lib/workspace/assistantContext';

/**
 * Milestone 15 spec section 22's exact worked questions ("What changed
 * across our semiconductor coverage this week?", "Which companies have
 * unresolved research issues?", etc.) shape this prompt directly. The
 * assistant answers ONLY from the context it's given — which is already
 * scoped to the caller's own workspace and their own private data by
 * lib/workspace/assistantContext.ts, so the prompt's job is to keep the
 * model from inventing anything beyond that, not to re-enforce
 * authorization itself.
 */

export const WORKSPACE_ASSISTANT_SYSTEM_PROMPT = `You are a research assistant for Atlas Research's institutional research workspace. You help a workspace member understand the state of their team's research: coverage, open tasks, reports in review, integrity issues, recent research changes, and committee-submitted investment cases.

Rules you must follow without exception:
- Use ONLY the workspace context provided below. Never invent a company, ticker, task, issue, report, or figure not present in that context.
- Every claim that references a specific item MUST cite its exact "id" in cited_source_ids. Only cite an id that literally appears in the context below — never invent one.
- You never rank analysts, never comment on investment performance or stock-picking skill, and never suggest anyone is a "best" or "worst" analyst — this workspace tracks workflow, not performance.
- You never give personalized financial advice or a buy/sell recommendation for any company mentioned.
- You never claim to have changed, or offer to change, any task, note, report, or model — you only describe and summarize what already exists.
- Note in "caveats" anything relevant that could not be determined from the given context.
- Write for a professional research analyst: concise, factual, neutral tone, no marketing language.`;

function renderList<T>(label: string, rows: T[], render: (row: T) => string): string {
  if (rows.length === 0) return `## ${label}\n(none)`;
  return `## ${label}\n${rows.map((row) => `- ${render(row)}`).join('\n')}`;
}

export function renderWorkspaceAssistantContext(context: WorkspaceAssistantContext): string {
  return [
    `# Workspace: ${context.workspaceName}`,
    `Your role: ${context.callerRole}`,
    '',
    renderList('Covered companies', context.coveredCompanies, (c) => `[${c.id}] ${c.ticker} (${c.name}) — analyst: ${c.analystName ?? 'unassigned'}`),
    '',
    renderList('Open tasks', context.openTasks, (t) => `[${t.id}] "${t.title}"${t.ticker ? ` (${t.ticker})` : ''} — priority ${t.priority}, status ${t.status}, assignee: ${t.assignee ?? 'unassigned'}${t.dueDate ? `, due ${t.dueDate.slice(0, 10)}` : ''}`),
    '',
    renderList('Reports currently in review', context.reportsInReview, (r) => `[${r.id}] ${r.ticker} v${r.version} — submitted ${r.submittedAt.slice(0, 10)}`),
    '',
    renderList('Open research integrity issues (covered companies)', context.openIntegrityIssues, (i) => `[${i.id}] ${i.ticker} — ${i.category} (${i.severity}): ${i.description}`),
    '',
    renderList('Recent research changes (covered companies)', context.recentResearchChanges, (e) => `[${e.id}] ${e.ticker} — ${e.title} (${e.materiality}, ${e.eventDate.slice(0, 10)})`),
    '',
    renderList('Investment cases submitted for committee review', context.committeeSubmissions, (c) => `[${c.id}] ${c.ticker} — owner: ${c.ownerName ?? 'unknown'}, horizon: ${c.horizon}`),
    '',
    renderList('Your own investment cases in this workspace', context.callerOwnCases, (c) => `[${c.id}] ${c.ticker} — status ${c.status}: ${c.coreThesis}`),
  ].join('\n');
}

export interface WorkspaceAssistantPromptInput {
  context: WorkspaceAssistantContext;
  question: string;
}

export function buildWorkspaceAssistantUserPrompt(input: WorkspaceAssistantPromptInput): string {
  return [renderWorkspaceAssistantContext(input.context), '', '# Question', input.question, '', 'Answer the question using only the context above, and call the tool with your findings.'].join('\n');
}
