import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-static';

export const metadata: Metadata = { title: 'Research Workspace Methodology · Atlas Research' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-ink font-serif text-base font-semibold">{title}</h2>
      <div className="text-ink/70 mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function WorkspaceMethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/workspace" className="text-accent text-sm hover:underline">
        ← Back to Workspace
      </Link>
      <h1 className="text-ink mt-3 font-serif text-2xl font-semibold">How the Research Workspace Works</h1>
      <p className="text-ink/60 mt-2 text-sm">
        The Research Workspace is a structured collaboration layer for organizing coverage, projects, tasks, notes, and
        review across a team of analysts. It is not a social network, not a general project-management tool, not a chat
        application, and not a brokerage — it exists to make research organization, review, and accountability
        auditable.
      </p>

      <Section title="Workspaces are private, member-only containers">
        <p>
          Every workspace has its own membership list. You can only see a workspace&apos;s projects, coverage, tasks,
          notes, reviews, meetings, and dashboard if you are a member of it. Two workspaces never share data with each
          other, and an id belonging to a resource in a workspace you don&apos;t belong to behaves exactly like an id
          that doesn&apos;t exist at all — it never confirms or denies the resource&apos;s existence.
        </p>
      </Section>

      <Section title="Four roles, one simple hierarchy">
        <p>
          Every member holds exactly one role: <strong>Owner</strong>, <strong>Admin</strong>, <strong>Analyst</strong>,
          or <strong>Viewer</strong>. Each role includes everything the role below it can do, plus more:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Viewer</strong> — read everything in the workspace and leave comments. Cannot create or edit
            research, cannot manage members.
          </li>
          <li>
            <strong>Analyst</strong> — everything a Viewer can do, plus create and edit projects, tasks, notes, and
            company coverage, and review reports submitted by others (checking checklist items, leaving section
            comments) without being able to give final approval.
          </li>
          <li>
            <strong>Admin</strong> — everything an Analyst can do, plus approve reports under review and manage
            workspace members and their roles.
          </li>
          <li>
            <strong>Owner</strong> — full control, including the workspace itself.
          </li>
        </ul>
        <p>
          This is a deliberately simple, single ordered ranking rather than a permission matrix, so it stays easy to
          reason about as the workspace grows.
        </p>
      </Section>

      <Section title="Company coverage is organizational, not a separate copy of company data">
        <p>
          Assigning a company to an analyst, or to a research project, never duplicates that company&apos;s financial
          data — coverage assignments and project-company links simply point at Atlas&apos;s single, shared company
          record. Company and financial data always remain global across the whole platform, exactly as in every other
          part of Atlas.
        </p>
      </Section>

      <Section title="Research notes must cite a real Atlas source">
        <p>
          When you attach a source to a research note — a filing, an earnings call, a research event, a report, or an
          investment case — Atlas verifies that the source actually exists and belongs to the note&apos;s company
          before allowing the link. There is no way to attach a fabricated or unverifiable source id.
        </p>
      </Section>

      <Section title="The review workflow: Draft → In Review → Approved">
        <p>
          A research report moves through a formal review status separate from whether it generated successfully. Any
          Analyst or above can submit a report for review, which moves it to <strong>In Review</strong>. Any workspace
          member with review permission can then work through a fixed 10-item checklist and leave comments flagged to
          specific sections of the report. Comments are never deleted, even once resolved — resolving one only marks
          it Resolved, preserving a full audit trail of what was raised and how it was addressed.
        </p>
        <p>
          A report can only move to <strong>Approved</strong> once every checklist item is checked and there are no
          remaining open section comments — and only an Admin or Owner can give that final approval. An Analyst can
          review a peer&apos;s work in depth without being able to approve it, matching how a real research desk
          separates review from sign-off.
        </p>
      </Section>

      <Section title="Investment Committee Review — reactions only, never an automatic call">
        <p>
          An investment case stays private to the analyst who owns it unless that analyst explicitly submits it for
          committee review. Once submitted, workspace peers can read the case and react to it (Support, Concern,
          Question) — but reactions are never aggregated into a recommendation, a score, or a decision. The decision
          to act on a case always remains the owning analyst&apos;s own.
        </p>
      </Section>

      <Section title="Research quality metrics never rank analysts by performance">
        <p>
          The coverage dashboard and citation-coverage figures describe research activity — companies covered, reports
          in review, open tasks, claims supported by a citation — never investment returns. Atlas does not compute or
          display any measure of an analyst&apos;s investment performance, and citation coverage is shown as
          &ldquo;Not available&rdquo; rather than a manufactured percentage whenever there isn&apos;t enough data to
          calculate it reliably.
        </p>
      </Section>

      <Section title="The AI research assistant only sees what you're authorized to see">
        <p>
          The workspace AI assistant answers questions using only data from workspaces you belong to, your own
          investment cases, and any case a peer has explicitly submitted for committee review — never another
          analyst&apos;s private, unsubmitted work. Every fact it cites is checked against the real underlying Atlas
          record; anything it can&apos;t point to a verified source for is removed before you see it.
        </p>
      </Section>

      <Section title="Every consequential action is logged">
        <p>
          Creating a project, assigning coverage, submitting or approving a review, submitting a case to committee,
          and other significant workspace actions are recorded in Atlas&apos;s audit log, scoped to the workspace they
          happened in — the same audit trail used across the rest of the platform.
        </p>
      </Section>
    </main>
  );
}
