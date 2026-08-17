# Institutional Research Workspace & Collaboration Layer (Milestone 15)

Atlas Research began as a single-user research application. This milestone adds a workspace layer on
top of everything that came before it — Companies, Reports, Investment Cases, Financial Models, SEC and
Earnings research, Historical Validation, Research Events, Evidence, Assumptions, Data-Quality Issues,
Analyst Notes, and Research Tasks — organized into the kind of coherent, accountable workflow a real
investment-research team runs. It is deliberately **not** a social network, **not** a general
project-management tool, **not** a chat application, and **not** a brokerage. The focus throughout is
structured research collaboration, review, accountability, and auditability.

## 1. Workspace architecture

A **Workspace** is the top-level container — a research team's own environment (e.g. "Atlas Investment
Research"). A user can belong to more than one workspace, and workspaces never share data with each
other: every workspace-scoped query is filtered by `workspaceId`, and a resource id that belongs to a
*different* workspace behaves exactly like an id that doesn't exist at all — it never confirms or
denies existence to a caller who isn't a member.

Inside a workspace, a **Research Project** groups the things a team is actually working on: it has a
name, description, status (`PLANNED` → `ACTIVE` → `UNDER_REVIEW` → `COMPLETED` → `ARCHIVED`), an owner,
members, and links to companies, reports, cases, tasks, and notes. **Company Coverage** assigns an
analyst to a company within the workspace — this is purely an organizational join (`CompanyCoverage`
points AT the existing global `Company` row); it never creates a second copy of company or financial
data. The same principle holds for `ResearchProjectCompany` (a project's companies) and
`MeetingCompany` (a meeting's companies) — company and financial data stay exactly as global and shared
across Atlas as they always have been.

Two data types deliberately keep their pre-Milestone-15 visibility rules rather than becoming
workspace-private:

- **`ResearchReport`** (Milestone 9) stays globally readable. It only gains an optional `projectId` (for
  organization) and a `reviewStatus` field (for the review workflow below) — never a read restriction.
- **`InvestmentCase`** (Milestone 13) stays private, per-user data. An optional `projectId` is purely
  organizational. The one deliberate, narrow exception is **Investment Committee Review** (section 3
  below), where the case's own owner explicitly opts a single case into limited, read-only visibility
  for workspace peers.

## 2. Permissions

Every workspace member holds exactly one role, and the roles form a single ordered hierarchy rather
than a permission matrix — kept intentionally simple so it stays easy to reason about and easy to
extend later:

| Role | Can do |
|---|---|
| **VIEWER** | Read everything in the workspace; comment on reports, notes, and tasks. |
| **ANALYST** | Everything a Viewer can, plus create/edit projects, tasks, notes, and coverage; review a submitted report (work the checklist, leave section comments) without being able to give final approval. |
| **ADMIN** | Everything an Analyst can, plus approve a report under review; manage workspace members and their roles. |
| **OWNER** | Full control, including the workspace itself. |

Each role includes everything the role below it can do. The rank lives in one place —
`lib/workspace/permissions.ts`'s `ROLE_RANK` — and every permission function is `atLeast(role, X)`
against it, so adding a finer-grained permission later means adding one function, not restructuring a
matrix.

The one deliberate split worth calling out: **`canReviewReport`** (ANALYST and above) is a *different*
permission from **`canApproveReport`** (ADMIN and above). A peer analyst can read a colleague's report
in depth, check off checklist items, and leave section-flagged comments — but cannot give the report
final approval. This mirrors how a real research desk separates "a peer looked at this" from "this is
now the desk's official position."

Every workspace-scoped service function funnels through one authorization choke point —
`requireWorkspaceMember(userId, workspaceId)` or `requireWorkspaceRole(userId, workspaceId, checkFn)`
in `lib/services/workspaceService.ts` — rather than each service re-querying membership independently.
"This workspace doesn't exist" and "you're not a member of this workspace" collapse into the identical
404 (`WorkspaceNotFoundError`); a 403 (`WorkspaceForbiddenError`) is reserved for the case where the
caller *is* a member but their role doesn't permit the specific action, since at that point the caller
already knows the resource exists. The same "owned or 404" discipline extends to every workspace
sub-resource (`getOwnedWorkspaceProject`, `getOwnedWorkspaceTask`, `getOwnedWorkspaceNote`,
`getOwnedWorkspaceReview`, `getOwnedWorkspaceMeeting`) — a resource id from a different workspace 404s,
never leaking that it exists elsewhere.

## 3. Research lifecycle

A typical piece of research moves through the workspace roughly as follows:

1. A company is added to **coverage**, assigned to an analyst.
2. A **research project** may be created to group related work (a name, a status, member analysts,
   linked companies).
3. **Research tasks** get created (title, description, company/project link, assignee, priority
   `LOW`–`CRITICAL`, status `TODO`–`COMPLETED`, due date) — a deliberately lightweight tracker scoped to
   research work, not a general project-management app.
4. **Research notes** capture analysis (title, content, company/project link, author, tags) and can cite
   real Atlas records as sources — filings, earnings calls, research events, reports, DCF/comps
   artifacts, or investment cases. A source must resolve to a genuine, existing Atlas record; a
   fabricated source id is rejected outright (section 6 of `lib/workspace/noteSourceValidation.ts`).
5. **Comments** can be left on a report, a case, a note, or a task — every member including a Viewer can
   comment. This stays intentionally simple: there is no threading UI, no reactions beyond the
   Investment Committee's own Support/Concern/Question, and no read receipts — Milestone 15 is explicit
   that this is not a chat system.
6. A completed report can be **submitted for review** (section 4).
7. An analyst can **submit an investment case to Investment Committee Review** — a deliberate, narrow,
   owner-initiated exception to the case's normal privacy (section 1). Once submitted
   (`committeeReviewStatus: SUBMITTED`), workspace peers whose project links resolve to the same
   workspace can read the case (read-only) and leave a reaction: Support, Concern, or Question. Reactions
   are never aggregated into an automatic recommendation, a score, or a decision — there is no
   "decision" field anywhere on a `CommitteeReviewReaction` or on the case itself, and the owner remains
   the only one who ever changes the case's real status.
8. **Research meetings** record a date, title, participants, companies discussed, notes, decisions, and
   action items. An action item can optionally spin off a real `ResearchTask` (`createTask: true`) — this
   only happens when a meeting participant explicitly asks for it, never automatically.

## 4. Review process

The review workflow is a formal gate, deliberately separate from whether report *generation* succeeded.
`ResearchReport.status` (`SUCCESS`/`FAILED`, from Milestone 9) is untouched; a new
`ResearchReport.reviewStatus` field tracks `DRAFT → IN_REVIEW → APPROVED → ARCHIVED` independently.

1. Any Analyst or above submits a **successfully generated** report for review
   (`submitReportForReview`) — this creates a `ResearchReview` row (one per review cycle; a report can
   accumulate several over its lifetime, and past cycles are never overwritten) and flips the report to
   `IN_REVIEW`.
2. The new review is seeded with a fixed, ten-item checklist
   (`lib/workspace/reviewChecklist.ts`'s `REVIEW_CHECKLIST_TEMPLATE`) covering the report's data
   currency, methodology disclosure, source citation, and — item 8 — a direct link back to the real
   Milestone 14 integrity status for that company, never a re-derived one.
3. Any reviewer with permission (ANALYST+) can check off checklist items and leave **section
   comments** flagged to a specific part of the report, each starting `OPEN`.
4. Resolving a comment only ever flips its status to `RESOLVED` — comments are never deleted, so the
   full history of what was raised and how it was addressed stays intact for audit.
5. **Approval** (`approveReview`, ADMIN+ only) is blocked server-side — regardless of what the client UI
   shows — unless every checklist item is checked *and* there are zero remaining `OPEN` section
   comments. Approval sets `approvedAt`/`approvedByUserId` on the review and moves the report to
   `APPROVED`.

## 5. Versioning

Milestone 15 does not introduce a new versioning engine — it plugs the workspace layer into the
versioning each earlier milestone already built, rather than duplicating it:

- **Research reports** already version themselves (Milestone 9's `version` field, incrementing on
  regeneration) — the review workflow layers on top of an existing version, it doesn't create a new one.
- **Investment case history** already exists via Milestone 13's `InvestmentCaseVersion` snapshot/diff
  system — Investment Committee Review reads the case's live current state, it doesn't fork a separate
  workspace copy.
- **`ModelAudit`** rows (Milestone 14) remain the append-only record of a specific DCF/comps evaluation,
  untouched by this milestone.

What Milestone 15 adds that is genuinely new and itself append-only is the **`ResearchReview`** history
on a report (each submission-to-decision cycle is its own row, never overwritten) and the
**`ReviewSectionComment`** trail within each cycle (status-flipped, never deleted).

## 6. Audit trail

Every consequential workspace action writes an `AuditLogEntry` — the same model and writer
(`lib/services/auditLogService.ts`) Milestone 14 already established, extended with an optional
`workspaceId` column so entries can be scoped and listed per workspace
(`listWorkspaceAuditLog(workspaceId)`). Actions logged include: workspace creation, membership changes,
project creation, coverage assignment, task creation, note creation, review submission and approval,
and committee-case submission. Entries are never edited or deleted after the fact — the same immutable,
append-only discipline as every other audit-logged action in Atlas.

Live-verified directly against the database during this milestone's final verification pass: creating a
workspace, assigning coverage, creating a project, creating a task, and creating notes each produced the
expected `AuditLogEntry` row, correctly scoped to the workspace and correctly attributed to the acting
user's id — and the one note-creation attempt that was rejected for citing a fabricated source produced
**no** audit entry at all, since the write never happened.

## 7. AI access controls

The workspace AI assistant (`lib/ai/answerWorkspaceQuestion.ts`) and the research digest narrative
(`lib/services/researchDigestService.ts`) both mirror Milestone 13's AI Thesis Assistant discipline
exactly:

- **Context is assembled in one place** — `lib/workspace/assistantContext.ts`'s
  `buildWorkspaceAssistantContext(userId, workspaceId)` — which requires the caller to already be a
  workspace member and gives every fact a stable, citable id (`task:<id>`, `issue:<id>`, `case:<id>`,
  …).
- **Investment-case privacy is preserved inside the AI layer, not bolted on after.** The assistant's
  context includes only the calling user's *own* investment cases plus any case *any* user has already
  submitted to Investment Committee Review — never another analyst's private, unsubmitted case. This is
  proven directly by a dedicated test, not just implied by the UI.
- **The model's own claims about its sources are never trusted.** Every `cited_source_ids` value the
  model returns is checked against the backend-verified set of ids that were actually included in its
  context; anything it invents is stripped before the answer reaches the user.
- **The assistant respects the same workspace/role membership check as every other workspace read** — a
  non-member asking a question about a workspace gets the same 404 any other unauthorized read would.
- **AI unavailability degrades gracefully, never silently.** With no `ANTHROPIC_API_KEY` configured
  (verified live during this milestone's testing), the assistant returns a clear
  `503 "ANTHROPIC_API_KEY is not configured"` rather than crashing, and the research digest's
  deterministic counts are computed independently of the AI call, so a digest is still useful (with a
  `null` narrative) even when the AI summary fails.

## 8. Known limitations

- **No live-verified full second-analyst browser session in this milestone's manual testing pass.**
  Role enforcement (a VIEWER cannot approve a review; an ANALYST can review but not approve) is proven
  end-to-end through the automated real-Postgres integration test suite and the dedicated
  cross-workspace/role security tests in `app/api/crossUserAccess.test.ts`, exercised through the real
  route handlers — not through a second interactive login in the same manual session.
- **No dedicated `/workspace/[id]/audit-log` viewing page.** Workspace actions are correctly written to
  the shared `AuditLogEntry` table (verified directly against the database), but this milestone does not
  add a page to browse them — a scoping decision, not a missing write path.
- **The AI assistant and digest narrative require `ANTHROPIC_API_KEY`.** Without it, both fail
  gracefully (a reported error / a `null` narrative) rather than degrading to a lower-quality
  non-AI answer — the same tradeoff every earlier milestone's AI integration makes.
- **Meeting action items become tasks only when explicitly requested** (`createTask: true` on the
  action item) — there is no automatic classification of which action items warrant a task.
- **Research quality metrics (coverage dashboard, citation coverage) intentionally never compute or
  display anything performance- or return-based.** Per the spec, this workspace layer measures research
  *activity* (coverage, reports in review, open tasks, citation support) — never an analyst's investment
  track record.
