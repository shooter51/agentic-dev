import type { DB } from '../db/index';
import { HandoffRepository } from '../db/repositories/handoff.repository';
import type { Handoff } from '../db/schema/handoffs';

export class HandoffService {
  private readonly repo: HandoffRepository;

  constructor(db: DB) {
    this.repo = new HandoffRepository(db);
  }

  /**
   * Persists a handoff document written by `fromAgent` as it transitions the
   * task from `fromStage` to `toStage`.
   */
  async createHandoff(
    taskId: string,
    fromStage: string,
    toStage: string,
    fromAgent: string,
    content: string,
  ): Promise<Handoff> {
    return this.repo.create({ taskId, fromStage, toStage, fromAgent, content });
  }

  /**
   * Returns the most recently created handoff for the given task, or null if
   * none exist yet.
   */
  async getLatestHandoff(taskId: string): Promise<Handoff | null> {
    return this.repo.findLatestByTask(taskId);
  }

  /**
   * Returns all handoffs for the given task in chronological order (oldest
   * first), forming the complete handoff chain.
   */
  async getHandoffChain(taskId: string): Promise<Handoff[]> {
    return this.repo.findByTask(taskId);
  }
}
