import type { GuardResult, GateFailure } from '@agentic-dev/shared';
import type { Task } from '../db/schema/tasks';
import type { Project } from '../db/schema/projects';
import type { DB } from '../db';
import { TaskRepository } from '../db/repositories/task.repository';

// ---------------------------------------------------------------------------
// Internal guard interface — uses DB-native Task/Project types (string stages)
// rather than the shared TransitionGuard which uses the TaskStage enum.
// ---------------------------------------------------------------------------

export interface PipelineGuard {
  check: (task: Task, project: Project) => Promise<GuardResult>;
}

export type { GuardResult, GateFailure };

// ---------------------------------------------------------------------------
// Guard factory functions — each receives `db` and returns a PipelineGuard
// ---------------------------------------------------------------------------

export function createProductGuard(_db: DB): PipelineGuard {
  return {
    async check(task: Task, _project: Project): Promise<GuardResult> {
      const failures: GateFailure[] = [];
      const meta: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');

      // Product stage gate: PRD must be written (description must be non-empty)
      if (!task.description || task.description.trim().length === 0) {
        failures.push({
          gate: 'prd_written',
          severity: 'mandatory',
          message: 'Task description (PRD) must be completed before leaving product stage',
        });
      }

      // Acceptance criteria must be present in metadata
      if (!meta['acceptanceCriteria']) {
        failures.push({
          gate: 'acceptance_criteria',
          severity: 'mandatory',
          message: 'Acceptance criteria must be defined before leaving product stage',
        });
      }

      return { pass: failures.length === 0, failures };
    },
  };
}

export function createArchitectureGuard(_db: DB): PipelineGuard {
  return {
    async check(task: Task, _project: Project): Promise<GuardResult> {
      const failures: GateFailure[] = [];
      const meta: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');

      // Architecture decision record must be present
      if (!meta['adrWritten']) {
        failures.push({
          gate: 'adr_written',
          severity: 'mandatory',
          message: 'Architecture decision record (ADR) must be written before development begins',
        });
      }

      // Branch must be created
      if (!task.branchName) {
        failures.push({
          gate: 'branch_created',
          severity: 'mandatory',
          message: 'Feature branch must be created before development begins',
        });
      }

      return { pass: failures.length === 0, failures };
    },
  };
}

export function createDevelopmentGuard(db: DB): PipelineGuard {
  return {
    async check(task: Task, _project: Project): Promise<GuardResult> {
      const failures: GateFailure[] = [];
      const meta: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');

      // Unit test coverage — value written by run_tests tool (see LLD-005)
      if (((meta['unitCoverage'] as number) ?? 0) < 98) {
        failures.push({
          gate: 'unit_coverage',
          severity: 'mandatory',
          message: 'Unit test coverage below 98%',
          value: `${meta['unitCoverage'] ?? 0}%`,
          threshold: '98%',
        });
      }

      // Pact coverage — value written by run_tests tool (see LLD-005)
      if (((meta['pactCoverage'] as number) ?? 0) < 100) {
        failures.push({
          gate: 'pact_coverage',
          severity: 'mandatory',
          message: 'Pact contract coverage below 100%',
          value: `${meta['pactCoverage'] ?? 0}%`,
          threshold: '100%',
        });
      }

      // All tests passing — value written by run_tests tool (see LLD-005)
      if (!meta['allTestsPassing']) {
        failures.push({
          gate: 'tests_passing',
          severity: 'mandatory',
          message: 'Not all tests are passing',
        });
      }

      // No lint errors
      const lintErrors = (meta['lintErrors'] as number) ?? 0;
      if (lintErrors > 0) {
        failures.push({
          gate: 'lint_clean',
          severity: 'mandatory',
          message: `${lintErrors} lint errors found`,
        });
      }

      // Check for stubs (search codebase)
      const stubsFound = (meta['stubsFound'] as number) ?? 0;
      if (stubsFound > 0) {
        failures.push({
          gate: 'no_stubs',
          severity: 'mandatory',
          message: `${stubsFound} stub implementations found`,
        });
      }

      // Sub-task convergence check
      const taskRepo = new TaskRepository(db);
      const subTasks = await taskRepo.findSubTasks(task.id);
      if (subTasks.length > 0) {
        const incomplete = subTasks.filter(
          (st) => st.stage !== 'tech_lead_review' && st.stage !== 'done',
        );
        if (incomplete.length > 0) {
          failures.push({
            gate: 'subtasks_complete',
            severity: 'mandatory',
            message: `${incomplete.length} sub-tasks not yet complete`,
          });
        }
      }

      return { pass: failures.length === 0, failures };
    },
  };
}

export function createTechLeadGuard(_db: DB): PipelineGuard {
  return {
    async check(task: Task, _project: Project): Promise<GuardResult> {
      const failures: GateFailure[] = [];
      const meta: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');

      // Tech lead must have approved the PR
      if (!meta['techLeadApproved']) {
        failures.push({
          gate: 'tech_lead_approved',
          severity: 'mandatory',
          message: 'Tech lead approval is required before triggering the build',
        });
      }

      // PR must exist before moving to build
      if (!task.prUrl) {
        failures.push({
          gate: 'pr_open',
          severity: 'mandatory',
          message: 'A pull request must be open before tech lead review completes',
        });
      }

      return { pass: failures.length === 0, failures };
    },
  };
}

export function createDevopsBuildGuard(_db: DB): PipelineGuard {
  return {
    async check(task: Task, _project: Project): Promise<GuardResult> {
      const failures: GateFailure[] = [];
      const meta: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');

      // CI build must have passed
      if (!meta['ciBuildPassed']) {
        failures.push({
          gate: 'ci_build_passed',
          severity: 'mandatory',
          message: 'CI build must pass before moving to manual QA',
        });
      }

      // Docker image must have been published (if applicable)
      if (meta['requiresDockerImage'] && !meta['dockerImagePublished']) {
        failures.push({
          gate: 'docker_image_published',
          severity: 'advisory',
          message: 'Docker image has not been published to the registry',
        });
      }

      return { pass: failures.length === 0, failures };
    },
  };
}

export function createManualQaGuard(_db: DB): PipelineGuard {
  return {
    async check(task: Task, _project: Project): Promise<GuardResult> {
      const failures: GateFailure[] = [];
      const meta: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');

      // Manual QA sign-off required
      if (!meta['manualQaSignOff']) {
        failures.push({
          gate: 'manual_qa_sign_off',
          severity: 'mandatory',
          message: 'Manual QA sign-off is required before moving to automation',
        });
      }

      // No open blocker bugs found during manual QA
      const blockerCount = (meta['blockerBugsFound'] as number) ?? 0;
      if (blockerCount > 0) {
        failures.push({
          gate: 'no_blocker_bugs',
          severity: 'mandatory',
          message: `${blockerCount} blocker bug(s) found during manual QA`,
        });
      }

      return { pass: failures.length === 0, failures };
    },
  };
}

export function createAutomationGuard(_db: DB): PipelineGuard {
  return {
    async check(task: Task, _project: Project): Promise<GuardResult> {
      const failures: GateFailure[] = [];
      const meta: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');

      if (((meta['integrationCoverage'] as number) ?? 0) < 90) {
        failures.push({
          gate: 'integration_coverage',
          severity: 'mandatory',
          message: 'Integration test coverage below 90%',
          value: `${meta['integrationCoverage'] ?? 0}%`,
          threshold: '90%',
        });
      }

      if (((meta['e2eApiCoverage'] as number) ?? 0) < 85) {
        failures.push({
          gate: 'e2e_api_coverage',
          severity: 'mandatory',
          message: 'E2E API test coverage below 85%',
          value: `${meta['e2eApiCoverage'] ?? 0}%`,
          threshold: '85%',
        });
      }

      if (((meta['e2eUiCoverage'] as number) ?? 0) < 85) {
        failures.push({
          gate: 'e2e_ui_coverage',
          severity: 'mandatory',
          message: 'E2E UI test coverage below 85%',
          value: `${meta['e2eUiCoverage'] ?? 0}%`,
          threshold: '85%',
        });
      }

      // 3 consecutive passing runs
      const consecutiveRuns = (meta['consecutivePassingRuns'] as number) ?? 0;
      if (consecutiveRuns < 3) {
        failures.push({
          gate: 'test_stability',
          severity: 'mandatory',
          message: `Only ${consecutiveRuns}/3 consecutive passing runs`,
        });
      }

      return { pass: failures.length === 0, failures };
    },
  };
}

export function createDocumentationGuard(_db: DB): PipelineGuard {
  return {
    async check(task: Task, _project: Project): Promise<GuardResult> {
      const failures: GateFailure[] = [];
      const meta: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');

      // Documentation must be written and reviewed
      if (!meta['docsWritten']) {
        failures.push({
          gate: 'docs_written',
          severity: 'mandatory',
          message: 'Documentation must be written before deployment',
        });
      }

      if (!meta['docsReviewed']) {
        failures.push({
          gate: 'docs_reviewed',
          severity: 'advisory',
          message: 'Documentation has not been peer-reviewed',
        });
      }

      return { pass: failures.length === 0, failures };
    },
  };
}

export function createDevopsDeployGuard(_db: DB): PipelineGuard {
  return {
    async check(task: Task, _project: Project): Promise<GuardResult> {
      const failures: GateFailure[] = [];
      const meta: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');

      // Staging deployment must have succeeded
      if (!meta['stagingDeploymentPassed']) {
        failures.push({
          gate: 'staging_deployment_passed',
          severity: 'mandatory',
          message: 'Staging deployment must succeed before architecture review',
        });
      }

      // Smoke tests against staging must have passed
      if (!meta['smokeTestsPassed']) {
        failures.push({
          gate: 'smoke_tests_passed',
          severity: 'mandatory',
          message: 'Smoke tests against staging environment must pass',
        });
      }

      return { pass: failures.length === 0, failures };
    },
  };
}

export function createArchReviewGuard(_db: DB): PipelineGuard {
  return {
    async check(task: Task, _project: Project): Promise<GuardResult> {
      const failures: GateFailure[] = [];
      const meta: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');

      // Architect sign-off required
      if (!meta['archSignOff']) {
        failures.push({
          gate: 'arch_sign_off',
          severity: 'mandatory',
          message: 'Architect sign-off is required before marking a task as done',
        });
      }

      return { pass: failures.length === 0, failures };
    },
  };
}
