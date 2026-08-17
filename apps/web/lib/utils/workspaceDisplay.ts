import type { TaskPriorityValue, TaskStatusValue, WorkspaceRoleValue, ReportReviewStatusValue, ResearchProjectStatusValue } from '@/lib/api/workspace';

/** Shared badge styling for Milestone 15, mirroring lib/utils/integrityDisplay.ts's own convention. */

export const ROLE_LABELS: Record<WorkspaceRoleValue, string> = { OWNER: 'Owner', ADMIN: 'Admin', ANALYST: 'Analyst', VIEWER: 'Viewer' };
export const ROLE_STYLE: Record<WorkspaceRoleValue, string> = {
  OWNER: 'border-accent bg-accent-soft text-accent',
  ADMIN: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  ANALYST: 'border-ink/15 bg-ink/5 text-ink/60',
  VIEWER: 'border-ink/15 bg-ink/5 text-ink/40',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriorityValue, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };
export const TASK_PRIORITY_STYLE: Record<TaskPriorityValue, string> = {
  LOW: 'border-ink/15 bg-ink/5 text-ink/50',
  MEDIUM: 'border-amber-300 bg-amber-50 text-amber-800',
  HIGH: 'border-orange-300 bg-orange-50 text-orange-800',
  CRITICAL: 'border-red-300 bg-red-50 text-red-700',
};

export const TASK_STATUS_LABELS: Record<TaskStatusValue, string> = { TODO: 'To Do', IN_PROGRESS: 'In Progress', BLOCKED: 'Blocked', COMPLETED: 'Completed' };
export const TASK_STATUS_STYLE: Record<TaskStatusValue, string> = {
  TODO: 'border-ink/15 bg-ink/5 text-ink/60',
  IN_PROGRESS: 'border-accent bg-accent-soft text-accent',
  BLOCKED: 'border-red-300 bg-red-50 text-red-700',
  COMPLETED: 'border-emerald-300 bg-emerald-50 text-emerald-800',
};

export const PROJECT_STATUS_LABELS: Record<ResearchProjectStatusValue, string> = { PLANNED: 'Planned', ACTIVE: 'Active', UNDER_REVIEW: 'Under Review', COMPLETED: 'Completed', ARCHIVED: 'Archived' };
export const PROJECT_STATUS_STYLE: Record<ResearchProjectStatusValue, string> = {
  PLANNED: 'border-ink/15 bg-ink/5 text-ink/60',
  ACTIVE: 'border-accent bg-accent-soft text-accent',
  UNDER_REVIEW: 'border-amber-300 bg-amber-50 text-amber-800',
  COMPLETED: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  ARCHIVED: 'border-ink/15 bg-ink/5 text-ink/40',
};

export const REVIEW_STATUS_LABELS: Record<ReportReviewStatusValue, string> = { DRAFT: 'Draft', IN_REVIEW: 'In Review', APPROVED: 'Approved', ARCHIVED: 'Archived' };
export const REVIEW_STATUS_STYLE: Record<ReportReviewStatusValue, string> = {
  DRAFT: 'border-ink/15 bg-ink/5 text-ink/60',
  IN_REVIEW: 'border-amber-300 bg-amber-50 text-amber-800',
  APPROVED: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  ARCHIVED: 'border-ink/15 bg-ink/5 text-ink/40',
};
