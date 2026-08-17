-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "ResearchProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'UNDER_REVIEW', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CommentParentType" AS ENUM ('RESEARCH_REPORT', 'INVESTMENT_CASE', 'RESEARCH_NOTE', 'RESEARCH_TASK');

-- CreateEnum
CREATE TYPE "ReportReviewStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReviewSectionCommentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "CommitteeReviewStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "CommitteeReactionType" AS ENUM ('SUPPORT', 'CONCERN', 'QUESTION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditLogAction" ADD VALUE 'WORKSPACE_CREATED';
ALTER TYPE "AuditLogAction" ADD VALUE 'MEMBER_ADDED';
ALTER TYPE "AuditLogAction" ADD VALUE 'MEMBER_REMOVED';
ALTER TYPE "AuditLogAction" ADD VALUE 'MEMBER_ROLE_CHANGED';
ALTER TYPE "AuditLogAction" ADD VALUE 'PROJECT_CREATED';
ALTER TYPE "AuditLogAction" ADD VALUE 'PROJECT_UPDATED';
ALTER TYPE "AuditLogAction" ADD VALUE 'COVERAGE_ASSIGNED';
ALTER TYPE "AuditLogAction" ADD VALUE 'TASK_CREATED';
ALTER TYPE "AuditLogAction" ADD VALUE 'TASK_ASSIGNED';
ALTER TYPE "AuditLogAction" ADD VALUE 'TASK_COMPLETED';
ALTER TYPE "AuditLogAction" ADD VALUE 'NOTE_CREATED';
ALTER TYPE "AuditLogAction" ADD VALUE 'COMMENT_ADDED';
ALTER TYPE "AuditLogAction" ADD VALUE 'REPORT_SUBMITTED_FOR_REVIEW';
ALTER TYPE "AuditLogAction" ADD VALUE 'REVIEW_COMMENT_ADDED';
ALTER TYPE "AuditLogAction" ADD VALUE 'REPORT_APPROVED';
ALTER TYPE "AuditLogAction" ADD VALUE 'MEETING_CREATED';
ALTER TYPE "AuditLogAction" ADD VALUE 'MEETING_ACTION_ITEM_CREATED';
ALTER TYPE "AuditLogAction" ADD VALUE 'CASE_SUBMITTED_TO_COMMITTEE';
ALTER TYPE "AuditLogAction" ADD VALUE 'COMMITTEE_REACTION_ADDED';

-- AlterTable
ALTER TABLE "audit_log_entries" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "investment_cases" ADD COLUMN     "committeeReviewStatus" "CommitteeReviewStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
ADD COLUMN     "committeeSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "research_claims" ADD COLUMN     "researchReportId" TEXT;

-- AlterTable
ALTER TABLE "research_reports" ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "reviewStatus" "ReportReviewStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'ANALYST',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_coverage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "analystUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_coverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_projects" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ResearchProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "ownerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_project_companies" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_project_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_tasks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "companyId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_notes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT,
    "projectId" TEXT,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_sources" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_comments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentType" "CommentParentType" NOT NULL,
    "parentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_reviews" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "researchReportId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "reviewerUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_checklist_items" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedByUserId" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_section_comments" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ReviewSectionCommentStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_section_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_meetings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "decisions" TEXT[],
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_companies" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_action_items" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_review_reactions" (
    "id" TEXT NOT NULL,
    "investmentCaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reactionType" "CommitteeReactionType" NOT NULL,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "committee_review_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspace_members_userId_idx" ON "workspace_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "company_coverage_workspaceId_analystUserId_idx" ON "company_coverage"("workspaceId", "analystUserId");

-- CreateIndex
CREATE UNIQUE INDEX "company_coverage_workspaceId_companyId_key" ON "company_coverage"("workspaceId", "companyId");

-- CreateIndex
CREATE INDEX "research_projects_workspaceId_status_idx" ON "research_projects"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "research_project_members_projectId_userId_key" ON "research_project_members"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "research_project_companies_projectId_companyId_key" ON "research_project_companies"("projectId", "companyId");

-- CreateIndex
CREATE INDEX "research_tasks_workspaceId_status_idx" ON "research_tasks"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "research_tasks_assignedUserId_status_idx" ON "research_tasks"("assignedUserId", "status");

-- CreateIndex
CREATE INDEX "research_tasks_companyId_idx" ON "research_tasks"("companyId");

-- CreateIndex
CREATE INDEX "research_tasks_projectId_idx" ON "research_tasks"("projectId");

-- CreateIndex
CREATE INDEX "research_notes_workspaceId_companyId_idx" ON "research_notes"("workspaceId", "companyId");

-- CreateIndex
CREATE INDEX "research_notes_workspaceId_createdAt_idx" ON "research_notes"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "note_sources_noteId_idx" ON "note_sources"("noteId");

-- CreateIndex
CREATE INDEX "research_comments_workspaceId_parentType_parentId_idx" ON "research_comments"("workspaceId", "parentType", "parentId");

-- CreateIndex
CREATE INDEX "research_reviews_workspaceId_researchReportId_idx" ON "research_reviews"("workspaceId", "researchReportId");

-- CreateIndex
CREATE INDEX "research_reviews_reviewerUserId_idx" ON "research_reviews"("reviewerUserId");

-- CreateIndex
CREATE INDEX "review_checklist_items_reviewId_idx" ON "review_checklist_items"("reviewId");

-- CreateIndex
CREATE INDEX "review_section_comments_reviewId_status_idx" ON "review_section_comments"("reviewId", "status");

-- CreateIndex
CREATE INDEX "research_meetings_workspaceId_date_idx" ON "research_meetings"("workspaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_participants_meetingId_userId_key" ON "meeting_participants"("meetingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_companies_meetingId_companyId_key" ON "meeting_companies"("meetingId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_action_items_taskId_key" ON "meeting_action_items"("taskId");

-- CreateIndex
CREATE INDEX "meeting_action_items_meetingId_idx" ON "meeting_action_items"("meetingId");

-- CreateIndex
CREATE INDEX "committee_review_reactions_investmentCaseId_reactionType_idx" ON "committee_review_reactions"("investmentCaseId", "reactionType");

-- CreateIndex
CREATE INDEX "audit_log_entries_workspaceId_createdAt_idx" ON "audit_log_entries"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "investment_cases_projectId_idx" ON "investment_cases"("projectId");

-- CreateIndex
CREATE INDEX "research_claims_researchReportId_idx" ON "research_claims"("researchReportId");

-- CreateIndex
CREATE INDEX "research_reports_projectId_idx" ON "research_reports"("projectId");

-- CreateIndex
CREATE INDEX "research_reports_reviewStatus_idx" ON "research_reports"("reviewStatus");

-- AddForeignKey
ALTER TABLE "research_reports" ADD CONSTRAINT "research_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "research_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_cases" ADD CONSTRAINT "investment_cases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "research_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_claims" ADD CONSTRAINT "research_claims_researchReportId_fkey" FOREIGN KEY ("researchReportId") REFERENCES "research_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_coverage" ADD CONSTRAINT "company_coverage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_coverage" ADD CONSTRAINT "company_coverage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_coverage" ADD CONSTRAINT "company_coverage_analystUserId_fkey" FOREIGN KEY ("analystUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_projects" ADD CONSTRAINT "research_projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_projects" ADD CONSTRAINT "research_projects_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_project_members" ADD CONSTRAINT "research_project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_project_members" ADD CONSTRAINT "research_project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_project_companies" ADD CONSTRAINT "research_project_companies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_project_companies" ADD CONSTRAINT "research_project_companies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_tasks" ADD CONSTRAINT "research_tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_tasks" ADD CONSTRAINT "research_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "research_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_tasks" ADD CONSTRAINT "research_tasks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_tasks" ADD CONSTRAINT "research_tasks_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_tasks" ADD CONSTRAINT "research_tasks_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_notes" ADD CONSTRAINT "research_notes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_notes" ADD CONSTRAINT "research_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_notes" ADD CONSTRAINT "research_notes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "research_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_notes" ADD CONSTRAINT "research_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_sources" ADD CONSTRAINT "note_sources_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "research_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_comments" ADD CONSTRAINT "research_comments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_comments" ADD CONSTRAINT "research_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_reviews" ADD CONSTRAINT "research_reviews_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_reviews" ADD CONSTRAINT "research_reviews_researchReportId_fkey" FOREIGN KEY ("researchReportId") REFERENCES "research_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_reviews" ADD CONSTRAINT "research_reviews_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_reviews" ADD CONSTRAINT "research_reviews_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_reviews" ADD CONSTRAINT "research_reviews_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_checklist_items" ADD CONSTRAINT "review_checklist_items_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "research_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_checklist_items" ADD CONSTRAINT "review_checklist_items_checkedByUserId_fkey" FOREIGN KEY ("checkedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_section_comments" ADD CONSTRAINT "review_section_comments_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "research_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_section_comments" ADD CONSTRAINT "review_section_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_section_comments" ADD CONSTRAINT "review_section_comments_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_meetings" ADD CONSTRAINT "research_meetings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_meetings" ADD CONSTRAINT "research_meetings_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "research_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_companies" ADD CONSTRAINT "meeting_companies_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "research_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_companies" ADD CONSTRAINT "meeting_companies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_action_items" ADD CONSTRAINT "meeting_action_items_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "research_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_action_items" ADD CONSTRAINT "meeting_action_items_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_action_items" ADD CONSTRAINT "meeting_action_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "research_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_review_reactions" ADD CONSTRAINT "committee_review_reactions_investmentCaseId_fkey" FOREIGN KEY ("investmentCaseId") REFERENCES "investment_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_review_reactions" ADD CONSTRAINT "committee_review_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

