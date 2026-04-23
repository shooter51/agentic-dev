import type { Task } from '../db/schema/tasks';
import type { DB } from '../db';
import { TaskRepository } from '../db/repositories/task.repository';

// ---------------------------------------------------------------------------
// DefectReport — the input shape passed by agents that discover a defect
// ---------------------------------------------------------------------------

export interface DefectReport {
  title: string;
  body: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Optional Beads issue ID if one was already created by the discovering agent */
  beadsId?: string | null;
}

// ---------------------------------------------------------------------------
// createDefectTask
//
// Creates a new bug-type task as a child of the parent task.
// Defect tasks enter the pipeline at 'development' — they skip the product
// and architecture stages since the fix scope is already understood.
// ---------------------------------------------------------------------------

export async function createDefectTask(
  parentTask: Task,
  defect: DefectReport,
  db: DB,
): Promise<Task> {
  const taskRepo = new TaskRepository(db);

  const task = await taskRepo.create({
    projectId: parentTask.projectId,
    title: `[BUG] ${defect.title}`,
    description: defect.body,
    stage: 'development', // Defects skip product & architecture
    priority: defect.severity === 'critical' ? 'P0' : 'P1',
    type: 'bug',
    parentTaskId: parentTask.id,
    beadsId: defect.beadsId ?? null,
  });

  return task;
}

// ---------------------------------------------------------------------------
// checkParentUnblock
//
// Returns true when all child defects of the given parent are resolved
// (stage === 'done' or 'cancelled'). The pipeline calls this after a defect
// is cancelled or marked done so it can unblock the parent if appropriate.
// ---------------------------------------------------------------------------

export async function checkParentUnblock(parentTaskId: string, db: DB): Promise<boolean> {
  const taskRepo = new TaskRepository(db);
  const childDefects = await taskRepo.findChildDefects(parentTaskId);
  const blocking = childDefects.filter(
    (d) => d.stage !== 'done' && d.stage !== 'cancelled',
  );
  return blocking.length === 0;
}
