import test from 'node:test';
import assert from 'node:assert/strict';
import { checkQueryQuota, hasPermission, PLAN_CATALOG } from './rbac.ts';
import { PlanTier, UserRole } from './types.ts';

test('RBAC accorde les bonnes permissions selon les rôles', () => {
  assert.equal(hasPermission(UserRole.OWNER, 'billing:manage'), true);
  assert.equal(hasPermission(UserRole.ADMIN, 'billing:manage'), false);
  assert.equal(hasPermission(UserRole.ADMIN, 'datasources:write'), true);
  assert.equal(hasPermission(UserRole.ANALYST, 'assistant:query'), true);
  assert.equal(hasPermission(UserRole.ANALYST, 'datasources:write'), false);
  assert.equal(hasPermission(UserRole.VIEWER, 'assistant:query'), false);
  assert.equal(hasPermission(UserRole.VIEWER, 'dashboard:read'), true);
  assert.equal(hasPermission(UserRole.OWNER, 'admin:platform', false), false);
  assert.equal(hasPermission(UserRole.OWNER, 'admin:platform', true), true);
});

test('checkQueryQuota calcule les quotas restants et bloque au plafond', () => {
  const ok = checkQueryQuota(120, 500);
  assert.equal(ok.allowed, true);
  assert.equal(ok.remaining, 380);
  assert.equal(ok.percentUsed, 24);

  const blocked = checkQueryQuota(500, 500);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.reason?.includes('Quota mensuel atteint'));
});

test('PLAN_CATALOG définit les trois offres commerciales cohérentes', () => {
  assert.ok(PLAN_CATALOG[PlanTier.STARTER].monthlyQueryLimit < PLAN_CATALOG[PlanTier.PRO].monthlyQueryLimit);
  assert.ok(PLAN_CATALOG[PlanTier.PRO].monthlyQueryLimit < PLAN_CATALOG[PlanTier.ENTERPRISE].monthlyQueryLimit);
});
