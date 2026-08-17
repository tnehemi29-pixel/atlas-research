import { describe, expect, it } from 'vitest';
import {
  canApproveReport,
  canAssignCoverage,
  canComment,
  canCreateOrEditResearch,
  canManageMeeting,
  canManageMembers,
  canManageProject,
  canManageWorkspace,
  canReviewReport,
} from './permissions';

describe('permissions', () => {
  it('OWNER can do everything', () => {
    expect(canManageWorkspace('OWNER')).toBe(true);
    expect(canManageMembers('OWNER')).toBe(true);
    expect(canManageProject('OWNER')).toBe(true);
    expect(canAssignCoverage('OWNER')).toBe(true);
    expect(canCreateOrEditResearch('OWNER')).toBe(true);
    expect(canReviewReport('OWNER')).toBe(true);
    expect(canApproveReport('OWNER')).toBe(true);
    expect(canManageMeeting('OWNER')).toBe(true);
  });

  it('ADMIN can manage the workspace and members but is otherwise like an analyst', () => {
    expect(canManageWorkspace('ADMIN')).toBe(true);
    expect(canManageMembers('ADMIN')).toBe(true);
    expect(canAssignCoverage('ADMIN')).toBe(true);
    expect(canApproveReport('ADMIN')).toBe(true);
    expect(canCreateOrEditResearch('ADMIN')).toBe(true);
  });

  it('ANALYST can create/edit research and review reports but cannot manage the workspace, members, coverage, or approve', () => {
    expect(canCreateOrEditResearch('ANALYST')).toBe(true);
    expect(canManageProject('ANALYST')).toBe(true);
    expect(canReviewReport('ANALYST')).toBe(true);
    expect(canManageMeeting('ANALYST')).toBe(true);

    expect(canManageWorkspace('ANALYST')).toBe(false);
    expect(canManageMembers('ANALYST')).toBe(false);
    expect(canAssignCoverage('ANALYST')).toBe(false);
    expect(canApproveReport('ANALYST')).toBe(false);
  });

  it('VIEWER can only read and comment - spec section 28s explicit prohibitions', () => {
    expect(canComment('VIEWER')).toBe(true);

    expect(canCreateOrEditResearch('VIEWER')).toBe(false);
    expect(canManageProject('VIEWER')).toBe(false);
    expect(canReviewReport('VIEWER')).toBe(false);
    expect(canApproveReport('VIEWER')).toBe(false);
    expect(canManageWorkspace('VIEWER')).toBe(false);
    expect(canManageMembers('VIEWER')).toBe(false);
    expect(canAssignCoverage('VIEWER')).toBe(false);
    expect(canManageMeeting('VIEWER')).toBe(false);
  });

  it('every role can comment, including VIEWER', () => {
    expect(canComment('OWNER')).toBe(true);
    expect(canComment('ADMIN')).toBe(true);
    expect(canComment('ANALYST')).toBe(true);
    expect(canComment('VIEWER')).toBe(true);
  });
});
