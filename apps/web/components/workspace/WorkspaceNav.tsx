import Link from 'next/link';

type WorkspaceTab = 'dashboard' | 'coverage' | 'projects' | 'tasks' | 'notes' | 'reviews' | 'committee' | 'meetings' | 'calendar' | 'members';

interface WorkspaceNavProps {
  workspaceId: string;
  active: WorkspaceTab;
}

/** The per-workspace section nav — mirrors CompanyNav.tsx's own pattern
 * (imported into each page directly, not a shared layout.tsx wrapper). */
export function WorkspaceNav({ workspaceId, active }: WorkspaceNavProps) {
  const tabs: Array<{ key: WorkspaceTab; label: string; href: string }> = [
    { key: 'dashboard', label: 'Dashboard', href: `/workspace/${workspaceId}` },
    { key: 'coverage', label: 'Coverage', href: `/workspace/${workspaceId}/coverage` },
    { key: 'projects', label: 'Projects', href: `/workspace/${workspaceId}/projects` },
    { key: 'tasks', label: 'Tasks', href: `/workspace/${workspaceId}/tasks` },
    { key: 'notes', label: 'Notes', href: `/workspace/${workspaceId}/notes` },
    { key: 'reviews', label: 'Reviews', href: `/workspace/${workspaceId}/reviews` },
    { key: 'committee', label: 'Committee', href: `/workspace/${workspaceId}/committee` },
    { key: 'meetings', label: 'Meetings', href: `/workspace/${workspaceId}/meetings` },
    { key: 'calendar', label: 'Calendar', href: `/workspace/${workspaceId}/calendar` },
    { key: 'members', label: 'Members', href: `/workspace/${workspaceId}/members` },
  ];

  return (
    <nav aria-label="Workspace sections" className="mb-6 flex gap-1 overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? 'page' : undefined}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            active === tab.key ? 'bg-accent-soft text-accent' : 'text-ink/50 hover:bg-accent-soft/50 hover:text-ink/70'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
