import { ApiError } from './companies';

/**
 * Client-side fetchers for Milestone 15's Institutional Research Workspace &
 * Collaboration Layer. Response shapes mirror the underlying Prisma models
 * exactly, matching lib/api/investmentCases.ts's own convention so the API
 * route handlers stay thin pass-throughs.
 */

export type WorkspaceRoleValue = 'OWNER' | 'ADMIN' | 'ANALYST' | 'VIEWER';
export type ResearchProjectStatusValue = 'PLANNED' | 'ACTIVE' | 'UNDER_REVIEW' | 'COMPLETED' | 'ARCHIVED';
export type TaskPriorityValue = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskStatusValue = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';
export type CommentParentTypeValue = 'RESEARCH_REPORT' | 'INVESTMENT_CASE' | 'RESEARCH_NOTE' | 'RESEARCH_TASK';
export type ReportReviewStatusValue = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'ARCHIVED';
export type ReviewSectionCommentStatusValue = 'OPEN' | 'RESOLVED';
export type CommitteeReviewStatusValue = 'NOT_SUBMITTED' | 'SUBMITTED';
export type CommitteeReactionTypeValue = 'SUPPORT' | 'CONCERN' | 'QUESTION';
export type NoteSourceTypeValue = 'TEN_K' | 'TEN_Q' | 'EIGHT_K' | 'EARNINGS_CALL' | 'RESEARCH_EVENT' | 'RESEARCH_REPORT' | 'INVESTMENT_CASE' | 'FINANCIAL_STATEMENT' | 'DCF_ASSUMPTION' | 'OTHER';

export interface UserSummary {
  id: string;
  name: string | null;
  email: string;
}

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? fallbackMessage, response.status);
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Workspace + members (spec sections 1-2)
// ---------------------------------------------------------------------------

export interface WorkspaceResponse {
  id: string;
  name: string;
  slug: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceListItemResponse extends WorkspaceResponse {
  role: WorkspaceRoleValue;
}

export interface WorkspaceDetailResponse extends WorkspaceResponse {
  myRole: WorkspaceRoleValue;
}

export interface WorkspaceMemberResponse {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRoleValue;
  joinedAt: string;
  user: UserSummary;
}

export async function fetchWorkspaces(signal?: AbortSignal): Promise<WorkspaceListItemResponse[]> {
  const response = await fetch('/api/workspace', { signal });
  return parseOrThrow(response, 'Failed to load workspaces.');
}

export async function createWorkspace(name: string, slug?: string): Promise<WorkspaceResponse> {
  const response = await fetch('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, slug }) });
  return parseOrThrow(response, 'Failed to create the workspace.');
}

export async function fetchWorkspace(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceDetailResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}`, { signal });
  return parseOrThrow(response, 'Failed to load the workspace.');
}

export async function fetchWorkspaceMembers(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceMemberResponse[]> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/members`, { signal });
  return parseOrThrow(response, 'Failed to load workspace members.');
}

export async function addWorkspaceMember(workspaceId: string, email: string, role?: WorkspaceRoleValue): Promise<WorkspaceMemberResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) });
  return parseOrThrow(response, 'Failed to add the member.');
}

export async function changeWorkspaceMemberRole(workspaceId: string, userId: string, role: WorkspaceRoleValue): Promise<WorkspaceMemberResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
  return parseOrThrow(response, 'Failed to change the member role.');
}

export async function removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  await parseOrThrow(response, 'Failed to remove the member.');
}

// ---------------------------------------------------------------------------
// Research projects (spec section 3)
// ---------------------------------------------------------------------------

export interface ResearchProjectResponse {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: ResearchProjectStatusValue;
  ownerUserId: string;
  owner: UserSummary;
  createdAt: string;
  updatedAt: string;
  _count: { companies: number; reports: number; investmentCases: number; tasks: number; members: number };
}

export interface ResearchProjectDetailResponse extends Omit<ResearchProjectResponse, '_count'> {
  members: { userId: string; user: UserSummary }[];
  companies: { companyId: string; company: { id: string; ticker: string; name: string; sector: string | null } }[];
  reports: { id: string; version: number; reviewStatus: ReportReviewStatusValue; companyId: string; createdAt: string }[];
  investmentCases: { id: string; status: string; companyId: string; userId: string; createdAt: string }[];
  tasks: { id: string; title: string; status: TaskStatusValue; priority: TaskPriorityValue; dueDate: string | null }[];
  _count: { notes: number };
}

export interface CreateResearchProjectInput {
  name: string;
  description?: string;
  status?: ResearchProjectStatusValue;
  ownerUserId?: string;
}

export async function fetchResearchProjects(workspaceId: string, status?: ResearchProjectStatusValue, signal?: AbortSignal): Promise<ResearchProjectResponse[]> {
  const query = status ? `?status=${status}` : '';
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/projects${query}`, { signal });
  return parseOrThrow(response, 'Failed to load research projects.');
}

export async function createResearchProject(workspaceId: string, input: CreateResearchProjectInput): Promise<ResearchProjectResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow(response, 'Failed to create the research project.');
}

export async function fetchResearchProject(workspaceId: string, projectId: string, signal?: AbortSignal): Promise<ResearchProjectDetailResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}`, { signal });
  return parseOrThrow(response, 'Failed to load the research project.');
}

export async function updateResearchProject(workspaceId: string, projectId: string, input: Partial<CreateResearchProjectInput>): Promise<ResearchProjectResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow(response, 'Failed to update the research project.');
}

export async function addResearchProjectMember(workspaceId: string, projectId: string, userId: string): Promise<void> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
  await parseOrThrow(response, 'Failed to add the project member.');
}

export async function removeResearchProjectMember(workspaceId: string, projectId: string, userId: string): Promise<void> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  await parseOrThrow(response, 'Failed to remove the project member.');
}

export async function addResearchProjectCompany(workspaceId: string, projectId: string, ticker: string): Promise<void> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/companies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker }) });
  await parseOrThrow(response, 'Failed to add the company to the project.');
}

export async function removeResearchProjectCompany(workspaceId: string, projectId: string, companyId: string): Promise<void> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/companies/${encodeURIComponent(companyId)}`, { method: 'DELETE' });
  await parseOrThrow(response, 'Failed to remove the company from the project.');
}

// ---------------------------------------------------------------------------
// Company coverage (spec sections 4, 16)
// ---------------------------------------------------------------------------

export interface CoverageTableRowResponse {
  ticker: string;
  companyName: string;
  sector: string | null;
  analyst: UserSummary | null;
  lastResearchUpdate: string | null;
  lastReviewApprovedAt: string | null;
  openTasks: number;
  openIntegrityIssues: number;
  investmentCaseStatus: string | null;
}

export interface AnalystCoverageRowResponse {
  analyst: UserSummary;
  companies: number;
  reports: number;
  openTasks: number;
}

export async function fetchCoverageTable(workspaceId: string, signal?: AbortSignal): Promise<CoverageTableRowResponse[]> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/coverage`, { signal });
  return parseOrThrow(response, 'Failed to load coverage.');
}

export async function assignCompanyCoverage(workspaceId: string, ticker: string, analystUserId: string): Promise<void> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/coverage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker, analystUserId }) });
  await parseOrThrow(response, 'Failed to assign coverage.');
}

export async function removeCompanyCoverage(workspaceId: string, ticker: string): Promise<void> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/coverage/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
  await parseOrThrow(response, 'Failed to remove coverage.');
}

export async function fetchAnalystCoverageSummary(workspaceId: string, signal?: AbortSignal): Promise<AnalystCoverageRowResponse[]> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/coverage/analysts`, { signal });
  return parseOrThrow(response, 'Failed to load analyst coverage.');
}

// ---------------------------------------------------------------------------
// Research tasks (spec section 5)
// ---------------------------------------------------------------------------

export interface ResearchTaskResponse {
  id: string;
  workspaceId: string;
  projectId: string | null;
  companyId: string | null;
  title: string;
  description: string | null;
  assignedUserId: string | null;
  priority: TaskPriorityValue;
  status: TaskStatusValue;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  company: { id: string; ticker: string; name: string } | null;
  project: { id: string; name: string } | null;
  assignedUser: UserSummary | null;
}

export interface CreateResearchTaskInput {
  title: string;
  description?: string;
  ticker?: string;
  projectId?: string;
  assignedUserId?: string;
  priority?: TaskPriorityValue;
  status?: TaskStatusValue;
  dueDate?: string;
}

export interface UpdateResearchTaskInput {
  title?: string;
  description?: string | null;
  assignedUserId?: string | null;
  priority?: TaskPriorityValue;
  status?: TaskStatusValue;
  dueDate?: string | null;
}

export interface ResearchTaskFilterParams {
  status?: TaskStatusValue;
  priority?: TaskPriorityValue;
  assignedUserId?: string;
  companyId?: string;
  projectId?: string;
}

export async function fetchResearchTasks(workspaceId: string, filters: ResearchTaskFilterParams = {}, signal?: AbortSignal): Promise<ResearchTaskResponse[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const query = params.toString();
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/tasks${query ? `?${query}` : ''}`, { signal });
  return parseOrThrow(response, 'Failed to load research tasks.');
}

export async function createResearchTask(workspaceId: string, input: CreateResearchTaskInput): Promise<ResearchTaskResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow(response, 'Failed to create the research task.');
}

export async function fetchResearchTask(workspaceId: string, taskId: string, signal?: AbortSignal): Promise<ResearchTaskResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}`, { signal });
  return parseOrThrow(response, 'Failed to load the research task.');
}

export async function updateResearchTask(workspaceId: string, taskId: string, input: UpdateResearchTaskInput): Promise<ResearchTaskResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow(response, 'Failed to update the research task.');
}

// ---------------------------------------------------------------------------
// Research notes (spec sections 6-7)
// ---------------------------------------------------------------------------

export interface NoteSourceResponse {
  id: string;
  sourceType: string;
  sourceId: string | null;
  sourceLabel: string;
  createdAt: string;
}

export interface ResearchNoteResponse {
  id: string;
  workspaceId: string;
  companyId: string | null;
  projectId: string | null;
  authorId: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  company: { id: string; ticker: string; name: string } | null;
  project: { id: string; name: string } | null;
  author: UserSummary;
  _count?: { sources: number };
  sources?: NoteSourceResponse[];
}

export interface NoteSourceInput {
  sourceType: NoteSourceTypeValue;
  sourceId?: string;
  sourceLabel: string;
}

export interface CreateResearchNoteInput {
  title: string;
  content: string;
  ticker?: string;
  projectId?: string;
  tags?: string[];
  sources?: NoteSourceInput[];
}

export interface ResearchNoteFilterParams {
  companyId?: string;
  projectId?: string;
  authorId?: string;
  tag?: string;
}

export async function fetchResearchNotes(workspaceId: string, filters: ResearchNoteFilterParams = {}, signal?: AbortSignal): Promise<ResearchNoteResponse[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const query = params.toString();
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/notes${query ? `?${query}` : ''}`, { signal });
  return parseOrThrow(response, 'Failed to load research notes.');
}

export async function createResearchNote(workspaceId: string, input: CreateResearchNoteInput): Promise<ResearchNoteResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow(response, 'Failed to create the research note.');
}

export async function fetchResearchNote(workspaceId: string, noteId: string, signal?: AbortSignal): Promise<ResearchNoteResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/notes/${encodeURIComponent(noteId)}`, { signal });
  return parseOrThrow(response, 'Failed to load the research note.');
}

export async function updateResearchNote(workspaceId: string, noteId: string, input: { title?: string; content?: string; tags?: string[] }): Promise<ResearchNoteResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/notes/${encodeURIComponent(noteId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow(response, 'Failed to update the research note.');
}

// ---------------------------------------------------------------------------
// Comments (spec section 8)
// ---------------------------------------------------------------------------

export interface ResearchCommentResponse {
  id: string;
  workspaceId: string;
  authorId: string;
  content: string;
  parentType: CommentParentTypeValue;
  parentId: string;
  createdAt: string;
  updatedAt: string;
  author: UserSummary;
}

export async function fetchResearchComments(workspaceId: string, parentType: CommentParentTypeValue, parentId: string, signal?: AbortSignal): Promise<ResearchCommentResponse[]> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/comments?parentType=${parentType}&parentId=${encodeURIComponent(parentId)}`, { signal });
  return parseOrThrow(response, 'Failed to load comments.');
}

export async function createResearchComment(workspaceId: string, parentType: CommentParentTypeValue, parentId: string, content: string): Promise<ResearchCommentResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentType, parentId, content }) });
  return parseOrThrow(response, 'Failed to add the comment.');
}

// ---------------------------------------------------------------------------
// Review workflow (spec sections 9-11)
// ---------------------------------------------------------------------------

export interface ReviewChecklistItemResponse {
  id: string;
  reviewId: string;
  label: string;
  checked: boolean;
  checkedByUserId: string | null;
  checkedAt: string | null;
  createdAt: string;
}

export interface ReviewSectionCommentResponse {
  id: string;
  reviewId: string;
  section: string;
  authorId: string;
  content: string;
  status: ReviewSectionCommentStatusValue;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: UserSummary;
  resolvedBy: UserSummary | null;
}

export interface ResearchReviewResponse {
  id: string;
  workspaceId: string;
  researchReportId: string;
  requestedByUserId: string;
  reviewerUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchReviewListItemResponse extends ResearchReviewResponse {
  researchReport: { id: string; version: number; reviewStatus: ReportReviewStatusValue; company: { ticker: string; name: string } };
  requestedBy: UserSummary;
  reviewer: UserSummary | null;
}

export interface ResearchReviewDetailResponse extends ResearchReviewResponse {
  researchReport: { id: string; companyId: string; version: number; reviewStatus: ReportReviewStatusValue; dataSnapshotAt: string; company: { ticker: string; name: string } };
  requestedBy: UserSummary;
  reviewer: UserSummary | null;
  approvedBy: UserSummary | null;
  checklistItems: ReviewChecklistItemResponse[];
  sectionComments: ReviewSectionCommentResponse[];
}

export async function fetchWorkspaceReviews(workspaceId: string, pendingOnly?: boolean, signal?: AbortSignal): Promise<ResearchReviewListItemResponse[]> {
  const query = pendingOnly ? '?pendingOnly=true' : '';
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/reviews${query}`, { signal });
  return parseOrThrow(response, 'Failed to load reviews.');
}

export async function submitReportForReview(workspaceId: string, reportId: string): Promise<ResearchReviewResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportId }) });
  return parseOrThrow(response, 'Failed to submit the report for review.');
}

export async function fetchReviewDetail(workspaceId: string, reviewId: string, signal?: AbortSignal): Promise<ResearchReviewDetailResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/reviews/${encodeURIComponent(reviewId)}`, { signal });
  return parseOrThrow(response, 'Failed to load the review.');
}

export async function claimReview(workspaceId: string, reviewId: string): Promise<ResearchReviewResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/reviews/${encodeURIComponent(reviewId)}/claim`, { method: 'POST' });
  return parseOrThrow(response, 'Failed to claim the review.');
}

export async function setChecklistItemChecked(workspaceId: string, reviewId: string, itemId: string, checked: boolean): Promise<ReviewChecklistItemResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/reviews/${encodeURIComponent(reviewId)}/checklist/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checked }),
  });
  return parseOrThrow(response, 'Failed to update the checklist item.');
}

export async function addReviewSectionComment(workspaceId: string, reviewId: string, section: string, content: string): Promise<ReviewSectionCommentResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/reviews/${encodeURIComponent(reviewId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section, content }),
  });
  return parseOrThrow(response, 'Failed to add the section comment.');
}

export async function resolveReviewSectionComment(workspaceId: string, reviewId: string, commentId: string): Promise<ReviewSectionCommentResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/reviews/${encodeURIComponent(reviewId)}/comments/${encodeURIComponent(commentId)}/resolve`, { method: 'POST' });
  return parseOrThrow(response, 'Failed to resolve the section comment.');
}

export async function approveReview(workspaceId: string, reviewId: string): Promise<ResearchReviewResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/reviews/${encodeURIComponent(reviewId)}/approve`, { method: 'POST' });
  return parseOrThrow(response, 'Failed to approve the review.');
}

// ---------------------------------------------------------------------------
// Research meetings (spec section 21)
// ---------------------------------------------------------------------------

export interface MeetingActionItemResponse {
  id: string;
  meetingId: string;
  description: string;
  assignedUserId: string | null;
  taskId: string | null;
  createdAt: string;
  assignedUser: UserSummary | null;
  task: { id: string; status: TaskStatusValue } | null;
}

export interface ResearchMeetingResponse {
  id: string;
  workspaceId: string;
  title: string;
  date: string;
  notes: string | null;
  decisions: string[];
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchMeetingListItemResponse extends ResearchMeetingResponse {
  participants: { userId: string; user: UserSummary }[];
  companies: { companyId: string; company: { id: string; ticker: string; name: string } }[];
  _count: { actionItems: number };
}

export interface ResearchMeetingDetailResponse extends ResearchMeetingResponse {
  participants: { userId: string; user: UserSummary }[];
  companies: { companyId: string; company: { id: string; ticker: string; name: string } }[];
  actionItems: MeetingActionItemResponse[];
  createdBy: UserSummary;
}

export interface CreateResearchMeetingInput {
  title: string;
  date: string;
  notes?: string;
  participantUserIds?: string[];
  tickers?: string[];
}

export async function fetchResearchMeetings(workspaceId: string, signal?: AbortSignal): Promise<ResearchMeetingListItemResponse[]> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/meetings`, { signal });
  return parseOrThrow(response, 'Failed to load research meetings.');
}

export async function createResearchMeeting(workspaceId: string, input: CreateResearchMeetingInput): Promise<ResearchMeetingResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/meetings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow(response, 'Failed to create the meeting.');
}

export async function fetchResearchMeeting(workspaceId: string, meetingId: string, signal?: AbortSignal): Promise<ResearchMeetingDetailResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/meetings/${encodeURIComponent(meetingId)}`, { signal });
  return parseOrThrow(response, 'Failed to load the meeting.');
}

export async function addMeetingDecision(workspaceId: string, meetingId: string, decision: string): Promise<ResearchMeetingResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/meetings/${encodeURIComponent(meetingId)}/decisions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
  return parseOrThrow(response, 'Failed to add the decision.');
}

export interface AddMeetingActionItemInput {
  description: string;
  assignedUserId?: string;
  createTask?: boolean;
  ticker?: string;
  priority?: TaskPriorityValue;
  dueDate?: string;
}

export async function addMeetingActionItem(workspaceId: string, meetingId: string, input: AddMeetingActionItemInput): Promise<MeetingActionItemResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/meetings/${encodeURIComponent(meetingId)}/action-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow(response, 'Failed to add the action item.');
}

// ---------------------------------------------------------------------------
// Dashboard, calendar, digest (spec sections 14-15, 23)
// ---------------------------------------------------------------------------

export interface WorkspaceDashboardRecentChangeResponse {
  ticker: string;
  companyName: string;
  title: string;
  materiality: string;
  eventDate: string;
}

export interface WorkspaceDashboardResponse {
  companiesCovered: number;
  activeProjects: number;
  reportsInReview: number;
  openIntegrityIssues: number;
  overdueTasks: number;
  recentResearchChanges: WorkspaceDashboardRecentChangeResponse[];
}

export async function fetchWorkspaceDashboard(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceDashboardResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/dashboard`, { signal });
  return parseOrThrow(response, 'Failed to load the workspace dashboard.');
}

export type CalendarEntryTypeValue = 'TASK_DUE' | 'MEETING' | 'EARNINGS_ESTIMATE';

export interface WorkspaceCalendarEntryResponse {
  type: CalendarEntryTypeValue;
  date: string;
  title: string;
  ticker: string | null;
  isEstimate: boolean;
  detail: string | null;
}

export async function fetchWorkspaceCalendar(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceCalendarEntryResponse[]> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/calendar`, { signal });
  return parseOrThrow(response, 'Failed to load the workspace calendar.');
}

export type DigestPeriodValue = 'DAILY' | 'WEEKLY';

export interface ResearchDigestResponse {
  period: DigestPeriodValue;
  periodStart: string;
  periodEnd: string;
  majorCompanyDevelopments: number;
  investmentCasesChanged: number;
  secFilingsReviewed: number;
  thesisChallenges: number;
  researchReportsUpdated: number;
  highlights: { ticker: string; title: string; materiality: string; eventDate: string }[];
  narrative: string | null;
}

export async function fetchResearchDigest(workspaceId: string, period: DigestPeriodValue = 'WEEKLY', signal?: AbortSignal): Promise<ResearchDigestResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/digest?period=${period}`, { signal });
  return parseOrThrow(response, 'Failed to generate the research digest.');
}

// ---------------------------------------------------------------------------
// AI research assistant (spec section 22)
// ---------------------------------------------------------------------------

export interface WorkspaceAssistantResponse {
  payload: { answer: string; cited_source_ids: string[]; caveats: string[] };
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function askWorkspaceAssistant(workspaceId: string, question: string): Promise<WorkspaceAssistantResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
  return parseOrThrow(response, 'Failed to get an answer from the research assistant.');
}

// ---------------------------------------------------------------------------
// Investment Committee Review (spec section 20)
// ---------------------------------------------------------------------------

export interface CommitteeSubmissionResponse {
  id: string;
  companyId: string;
  status: string;
  horizon: string;
  committeeSubmittedAt: string | null;
  company: { id: string; ticker: string; name: string };
  user: UserSummary;
  _count: { committeeReactions: number };
}

export interface CommitteeReactionResponse {
  id: string;
  investmentCaseId: string;
  userId: string;
  reactionType: CommitteeReactionTypeValue;
  content: string | null;
  createdAt: string;
  user: UserSummary;
}

export interface CommitteeReviewDetailResponse {
  id: string;
  companyId: string;
  userId: string;
  horizon: string;
  coreThesis: string;
  status: string;
  committeeReviewStatus: CommitteeReviewStatusValue;
  committeeSubmittedAt: string | null;
  company: { id: string; ticker: string; name: string };
  assumptions: unknown[];
  evidence: unknown[];
  risks: unknown[];
  catalysts: unknown[];
  invalidationCriteria: unknown[];
  committeeReactions: CommitteeReactionResponse[];
}

export async function fetchCommitteeSubmissions(workspaceId: string, signal?: AbortSignal): Promise<CommitteeSubmissionResponse[]> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/committee`, { signal });
  return parseOrThrow(response, 'Failed to load committee submissions.');
}

export async function submitCaseToCommitteeReview(caseId: string): Promise<{ committeeReviewStatus: CommitteeReviewStatusValue; committeeSubmittedAt: string | null }> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/committee/submit`, { method: 'POST' });
  return parseOrThrow(response, 'Failed to submit the case for committee review.');
}

export async function fetchCommitteeReviewDetail(caseId: string, signal?: AbortSignal): Promise<CommitteeReviewDetailResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/committee`, { signal });
  return parseOrThrow(response, 'Failed to load the committee review.');
}

export async function addCommitteeReaction(caseId: string, reactionType: CommitteeReactionTypeValue, content?: string): Promise<CommitteeReactionResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/committee/reactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reactionType, content }) });
  return parseOrThrow(response, 'Failed to add the reaction.');
}

// ---------------------------------------------------------------------------
// Citation coverage (spec section 18)
// ---------------------------------------------------------------------------

export interface CitationCoverageResponse {
  available: boolean;
  totalClaims: number;
  supportedClaims: number;
  unsupportedClaims: number;
  coveragePercent: number | null;
}

export async function fetchCitationCoverage(reportId: string, signal?: AbortSignal): Promise<CitationCoverageResponse> {
  const response = await fetch(`/api/v1/reports/${encodeURIComponent(reportId)}/citation-coverage`, { signal });
  return parseOrThrow(response, 'Failed to load citation coverage.');
}
