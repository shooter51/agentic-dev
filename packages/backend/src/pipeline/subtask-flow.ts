import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Task } from '../db/schema/tasks';
import type { DB } from '../db';
import type { TaskPipeline } from './fsm';
import { TaskRepository } from '../db/repositories/task.repository';
import { ProjectRepository } from '../db/repositories/project.repository';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface SubTaskMergeResult {
  subTaskId: string;
  success: boolean;
  error?: string;
}

export interface MergeResult {
  success: boolean;
  error?: string;
  merged?: number;
  conflicted?: number;
  details?: SubTaskMergeResult[];
}

// ---------------------------------------------------------------------------
// mergeSubTaskBranches
//
// Convergence logic for parallel sub-task branches:
//
// 1. Verify all sub-tasks have reached tech_lead_review or done.
// 2. For each sub-task that is at tech_lead_review (not yet merged):
//    a. Checkout the parent feature branch.
//    b. Merge the sub-task branch with --no-ff to preserve history.
//    c. On merge conflict: abort, reject the sub-task back to development.
// 3. Return a summary of merged / conflicted counts.
// ---------------------------------------------------------------------------

export async function mergeSubTaskBranches(
  parentTask: Task,
  db: DB,
  pipeline: TaskPipeline,
): Promise<MergeResult> {
  const taskRepo = new TaskRepository(db);
  const projectRepo = new ProjectRepository(db);

  const subTasks = await taskRepo.findSubTasks(parentTask.id);

  // Gate: all sub-tasks must be at tech_lead_review or done before we merge
  const notReady = subTasks.filter(
    (st) => st.stage !== 'tech_lead_review' && st.stage !== 'done',
  );
  if (notReady.length > 0) {
    return {
      success: false,
      error: `${notReady.length} sub-task(s) not yet ready (must be at tech_lead_review or done)`,
    };
  }

  const parentBranch = parentTask.branchName;
  if (!parentBranch) {
    return { success: false, error: `Parent task ${parentTask.id} has no branch name set` };
  }

  const project = await projectRepo.findById(parentTask.projectId);
  if (!project) {
    return { success: false, error: `Project not found: ${parentTask.projectId}` };
  }

  const repoPath = project.path;
  const results: SubTaskMergeResult[] = [];

  for (const subTask of subTasks) {
    // Already merged — skip
    if (subTask.stage === 'done') {
      continue;
    }

    if (!subTask.branchName) {
      results.push({
        subTaskId: subTask.id,
        success: false,
        error: `Sub-task ${subTask.id} has no branch name set`,
      });
      continue;
    }

    try {
      // Checkout the parent feature branch
      await execFileAsync('git', ['checkout', parentBranch], { cwd: repoPath });

      // Merge the sub-task branch (--no-ff preserves history)
      await execFileAsync(
        'git',
        [
          'merge',
          '--no-ff',
          subTask.branchName,
          '-m',
          `Merge sub-task ${subTask.id}: ${subTask.title}`,
        ],
        { cwd: repoPath },
      );

      results.push({ subTaskId: subTask.id, success: true });
    } catch (error: unknown) {
      // Merge conflict — abort the in-progress merge
      await execFileAsync('git', ['merge', '--abort'], { cwd: repoPath }).catch(() => {
        // Ignore abort errors (e.g. if no merge was in progress)
      });

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Reject the sub-task back to development so the agent can resolve the conflict
      await pipeline.reject(
        subTask.id,
        'development',
        `Merge conflict with parent branch "${parentBranch}": ${errorMessage}`,
        'system',
      );

      results.push({
        subTaskId: subTask.id,
        success: false,
        error: `Merge conflict: ${errorMessage}`,
      });
    }
  }

  const failed = results.filter((r) => !r.success);
  return {
    success: failed.length === 0,
    merged: results.filter((r) => r.success).length,
    conflicted: failed.length,
    details: results,
  };
}
