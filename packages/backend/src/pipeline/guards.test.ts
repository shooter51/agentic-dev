import { describe, it, expect, beforeEach } from 'vitest';
import {
  createProductGuard,
  createArchitectureGuard,
  createDevelopmentGuard,
  createTechLeadGuard,
  createDevopsBuildGuard,
  createManualQaGuard,
  createAutomationGuard,
  createDocumentationGuard,
  createDevopsDeployGuard,
  createArchReviewGuard,
} from './guards.js';
import { createTestDb, seedBasicEntities, type TestDB } from '../db/test-helpers.js';
import { TaskRepository } from '../db/repositories/task.repository.js';
import type { Task } from '../db/schema/tasks.js';
import type { Project } from '../db/schema/projects.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: 'task-1',
    projectId: 'proj-1',
    title: 'Test Task',
    description: 'A task description',
    stage: 'product',
    priority: 'P2',
    type: 'feature',
    assignedAgent: null,
    parentTaskId: null,
    beadsId: null,
    branchName: null,
    prUrl: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  const now = new Date().toISOString();
  return {
    id: 'proj-1',
    name: 'Test Project',
    path: '/repo',
    config: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Pipeline Guards', () => {
  let db: TestDB;

  beforeEach(async () => {
    db = createTestDb();
    await seedBasicEntities(db);
  });

  describe('createProductGuard', () => {
    const guard = () => createProductGuard({} as any);

    it('passes when description and acceptanceCriteria are present', async () => {
      const task = makeTask({
        description: 'Full PRD content',
        metadata: JSON.stringify({ acceptanceCriteria: 'User can log in' }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.pass).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('fails when description is empty', async () => {
      const task = makeTask({
        description: '',
        metadata: JSON.stringify({ acceptanceCriteria: 'criteria' }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.pass).toBe(false);
      expect(result.failures.some((f) => f.gate === 'prd_written')).toBe(true);
    });

    it('fails when description is null', async () => {
      const task = makeTask({
        description: null,
        metadata: JSON.stringify({ acceptanceCriteria: 'criteria' }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'prd_written')).toBe(true);
    });

    it('fails when acceptanceCriteria is missing', async () => {
      const task = makeTask({ description: 'PRD content', metadata: null });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'acceptance_criteria')).toBe(true);
    });

    it('fails with both failures when both are missing', async () => {
      const task = makeTask({ description: null, metadata: null });
      const result = await guard().check(task, makeProject());
      expect(result.failures).toHaveLength(2);
    });

    it('failures are mandatory severity', async () => {
      const task = makeTask({ description: null, metadata: null });
      const result = await guard().check(task, makeProject());
      expect(result.failures.every((f) => f.severity === 'mandatory')).toBe(true);
    });
  });

  describe('createArchitectureGuard', () => {
    const guard = () => createArchitectureGuard({} as any);

    it('passes when adrWritten and branchName are set', async () => {
      const task = makeTask({
        metadata: JSON.stringify({ adrWritten: true }),
        branchName: 'feature/my-feature',
      });
      const result = await guard().check(task, makeProject());
      expect(result.pass).toBe(true);
    });

    it('fails when adrWritten is missing', async () => {
      const task = makeTask({ branchName: 'feature/x', metadata: null });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'adr_written')).toBe(true);
    });

    it('fails when branchName is null', async () => {
      const task = makeTask({
        branchName: null,
        metadata: JSON.stringify({ adrWritten: true }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'branch_created')).toBe(true);
    });
  });

  describe('createDevelopmentGuard', () => {
    it('passes when all quality gates are met', async () => {
      const guard = createDevelopmentGuard(db as any);
      const task = makeTask({
        metadata: JSON.stringify({
          unitCoverage: 98,
          pactCoverage: 100,
          allTestsPassing: true,
          lintErrors: 0,
          stubsFound: 0,
        }),
      });
      const result = await guard.check(task, makeProject());
      expect(result.pass).toBe(true);
    });

    it('fails when unitCoverage is below 98', async () => {
      const guard = createDevelopmentGuard(db as any);
      const task = makeTask({
        metadata: JSON.stringify({
          unitCoverage: 95,
          pactCoverage: 100,
          allTestsPassing: true,
          lintErrors: 0,
          stubsFound: 0,
        }),
      });
      const result = await guard.check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'unit_coverage')).toBe(true);
    });

    it('fails when pactCoverage is below 100', async () => {
      const guard = createDevelopmentGuard(db as any);
      const task = makeTask({
        metadata: JSON.stringify({
          unitCoverage: 98,
          pactCoverage: 99,
          allTestsPassing: true,
          lintErrors: 0,
          stubsFound: 0,
        }),
      });
      const result = await guard.check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'pact_coverage')).toBe(true);
    });

    it('fails when not all tests are passing', async () => {
      const guard = createDevelopmentGuard(db as any);
      const task = makeTask({
        metadata: JSON.stringify({
          unitCoverage: 98,
          pactCoverage: 100,
          allTestsPassing: false,
          lintErrors: 0,
          stubsFound: 0,
        }),
      });
      const result = await guard.check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'tests_passing')).toBe(true);
    });

    it('fails when lintErrors > 0', async () => {
      const guard = createDevelopmentGuard(db as any);
      const task = makeTask({
        metadata: JSON.stringify({
          unitCoverage: 98,
          pactCoverage: 100,
          allTestsPassing: true,
          lintErrors: 3,
          stubsFound: 0,
        }),
      });
      const result = await guard.check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'lint_clean')).toBe(true);
    });

    it('fails when stubsFound > 0', async () => {
      const guard = createDevelopmentGuard(db as any);
      const task = makeTask({
        metadata: JSON.stringify({
          unitCoverage: 98,
          pactCoverage: 100,
          allTestsPassing: true,
          lintErrors: 0,
          stubsFound: 2,
        }),
      });
      const result = await guard.check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'no_stubs')).toBe(true);
    });

    it('fails with zero metadata (all defaults missing)', async () => {
      const guard = createDevelopmentGuard(db as any);
      const task = makeTask({ metadata: null });
      const result = await guard.check(task, makeProject());
      // unitCoverage=0, pactCoverage=0, allTestsPassing=false => multiple failures
      expect(result.failures.length).toBeGreaterThanOrEqual(3);
    });

    it('includes value and threshold in coverage failures', async () => {
      const guard = createDevelopmentGuard(db as any);
      const task = makeTask({
        metadata: JSON.stringify({
          unitCoverage: 90,
          pactCoverage: 90,
          allTestsPassing: true,
          lintErrors: 0,
          stubsFound: 0,
        }),
      });
      const result = await guard.check(task, makeProject());
      const unitFailure = result.failures.find((f) => f.gate === 'unit_coverage');
      expect(unitFailure?.value).toBe('90%');
      expect(unitFailure?.threshold).toBe('98%');
    });
  });

  describe('createTechLeadGuard', () => {
    const guard = () => createTechLeadGuard({} as any);

    it('passes when techLeadApproved and prUrl are set', async () => {
      const task = makeTask({
        metadata: JSON.stringify({ techLeadApproved: true }),
        prUrl: 'https://github.com/repo/pull/1',
      });
      const result = await guard().check(task, makeProject());
      expect(result.pass).toBe(true);
    });

    it('fails when techLeadApproved is missing', async () => {
      const task = makeTask({
        metadata: null,
        prUrl: 'https://github.com/repo/pull/1',
      });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'tech_lead_approved')).toBe(true);
    });

    it('fails when prUrl is null', async () => {
      const task = makeTask({
        metadata: JSON.stringify({ techLeadApproved: true }),
        prUrl: null,
      });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'pr_open')).toBe(true);
    });
  });

  describe('createDevopsBuildGuard', () => {
    const guard = () => createDevopsBuildGuard({} as any);

    it('passes when ciBuildPassed is true', async () => {
      const task = makeTask({
        metadata: JSON.stringify({ ciBuildPassed: true }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.pass).toBe(true);
    });

    it('fails when ciBuildPassed is missing', async () => {
      const task = makeTask({ metadata: null });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'ci_build_passed')).toBe(true);
    });

    it('generates advisory failure when docker image required but not published', async () => {
      const task = makeTask({
        metadata: JSON.stringify({
          ciBuildPassed: true,
          requiresDockerImage: true,
          dockerImagePublished: false,
        }),
      });
      const result = await guard().check(task, makeProject());
      const dockerFailure = result.failures.find((f) => f.gate === 'docker_image_published');
      expect(dockerFailure).toBeDefined();
      expect(dockerFailure?.severity).toBe('advisory');
    });

    it('does not fail docker gate when requiresDockerImage is false', async () => {
      const task = makeTask({
        metadata: JSON.stringify({
          ciBuildPassed: true,
          requiresDockerImage: false,
        }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'docker_image_published')).toBe(false);
    });
  });

  describe('createManualQaGuard', () => {
    const guard = () => createManualQaGuard({} as any);

    it('passes when manualQaSignOff is true and no blockers', async () => {
      const task = makeTask({
        metadata: JSON.stringify({ manualQaSignOff: true, blockerBugsFound: 0 }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.pass).toBe(true);
    });

    it('fails when manualQaSignOff is missing', async () => {
      const task = makeTask({ metadata: null });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'manual_qa_sign_off')).toBe(true);
    });

    it('fails when blockerBugsFound > 0', async () => {
      const task = makeTask({
        metadata: JSON.stringify({ manualQaSignOff: true, blockerBugsFound: 2 }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'no_blocker_bugs')).toBe(true);
    });
  });

  describe('createAutomationGuard', () => {
    const guard = () => createAutomationGuard({} as any);

    it('passes when all coverage thresholds are met', async () => {
      const task = makeTask({
        metadata: JSON.stringify({
          integrationCoverage: 90,
          e2eApiCoverage: 85,
          e2eUiCoverage: 85,
          consecutivePassingRuns: 3,
        }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.pass).toBe(true);
    });

    it('fails when integrationCoverage is below 90', async () => {
      const task = makeTask({
        metadata: JSON.stringify({
          integrationCoverage: 89,
          e2eApiCoverage: 85,
          e2eUiCoverage: 85,
          consecutivePassingRuns: 3,
        }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'integration_coverage')).toBe(true);
    });

    it('fails when e2eApiCoverage is below 85', async () => {
      const task = makeTask({
        metadata: JSON.stringify({
          integrationCoverage: 90,
          e2eApiCoverage: 84,
          e2eUiCoverage: 85,
          consecutivePassingRuns: 3,
        }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'e2e_api_coverage')).toBe(true);
    });

    it('fails when e2eUiCoverage is below 85', async () => {
      const task = makeTask({
        metadata: JSON.stringify({
          integrationCoverage: 90,
          e2eApiCoverage: 85,
          e2eUiCoverage: 84,
          consecutivePassingRuns: 3,
        }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'e2e_ui_coverage')).toBe(true);
    });

    it('fails when consecutivePassingRuns is below 3', async () => {
      const task = makeTask({
        metadata: JSON.stringify({
          integrationCoverage: 90,
          e2eApiCoverage: 85,
          e2eUiCoverage: 85,
          consecutivePassingRuns: 2,
        }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'test_stability')).toBe(true);
    });
  });

  describe('createDocumentationGuard', () => {
    const guard = () => createDocumentationGuard({} as any);

    it('passes when docsWritten is true (docsReviewed advisory)', async () => {
      const task = makeTask({
        metadata: JSON.stringify({ docsWritten: true, docsReviewed: true }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.pass).toBe(true);
    });

    it('fails (mandatory) when docsWritten is missing', async () => {
      const task = makeTask({ metadata: null });
      const result = await guard().check(task, makeProject());
      const failure = result.failures.find((f) => f.gate === 'docs_written');
      expect(failure?.severity).toBe('mandatory');
    });

    it('adds advisory failure when docsReviewed is missing', async () => {
      const task = makeTask({
        metadata: JSON.stringify({ docsWritten: true }),
      });
      const result = await guard().check(task, makeProject());
      const advisory = result.failures.find((f) => f.gate === 'docs_reviewed');
      expect(advisory?.severity).toBe('advisory');
    });
  });

  describe('createDevopsDeployGuard', () => {
    const guard = () => createDevopsDeployGuard({} as any);

    it('passes when staging deployment and smoke tests pass', async () => {
      const task = makeTask({
        metadata: JSON.stringify({ stagingDeploymentPassed: true, smokeTestsPassed: true }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.pass).toBe(true);
    });

    it('fails when stagingDeploymentPassed is missing', async () => {
      const task = makeTask({
        metadata: JSON.stringify({ smokeTestsPassed: true }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'staging_deployment_passed')).toBe(true);
    });

    it('fails when smokeTestsPassed is missing', async () => {
      const task = makeTask({
        metadata: JSON.stringify({ stagingDeploymentPassed: true }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'smoke_tests_passed')).toBe(true);
    });
  });

  describe('createArchReviewGuard', () => {
    const guard = () => createArchReviewGuard({} as any);

    it('passes when archSignOff is true', async () => {
      const task = makeTask({
        metadata: JSON.stringify({ archSignOff: true }),
      });
      const result = await guard().check(task, makeProject());
      expect(result.pass).toBe(true);
    });

    it('fails when archSignOff is missing', async () => {
      const task = makeTask({ metadata: null });
      const result = await guard().check(task, makeProject());
      expect(result.failures.some((f) => f.gate === 'arch_sign_off')).toBe(true);
    });
  });
});
