export type AgentModel = 'opus' | 'sonnet';

export type AgentStatus =
  | 'idle'
  | 'working'
  | 'waiting'
  | 'interrupted'
  | 'paused'
  | 'error';

export type AgentRole =
  | 'Product Manager'
  | 'Architect'
  | 'Tech Lead'
  | 'Developer (Senior)'
  | 'Developer'
  | 'DevOps Engineer'
  | 'Manual QA'
  | 'QA Automation Engineer'
  | 'Documentation Agent';

/** Persisted agent record from the database */
export interface Agent {
  id: string;
  role: string;
  model: AgentModel;
  status: AgentStatus;
  currentTask: string | null;
  specialization: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * In-memory agent identity used by the orchestrator and tool executor.
 * Derived from AGENT_DEFINITIONS in the agent registry — not persisted directly.
 */
export interface AgentIdentity {
  id: string;
  role: string;
  /** Which pipeline stages this agent can be dispatched to */
  lane: string[];
  model: AgentModel;
  /** Coding/practice guidelines injected into the system prompt */
  practices: string;
  /** Tool names the agent is permitted to invoke */
  allowedTools: string[];
  systemPrompt: string;
}

/** Runtime in-memory state tracked by the orchestrator for a live agent */
export interface AgentState {
  id: string;
  status: AgentStatus;
  currentTaskId: string | null;
  model: AgentModel;
  /** Serialised conversation messages for interrupt/resume support */
  conversationMessages: unknown[];
  systemPrompt: string;
}
