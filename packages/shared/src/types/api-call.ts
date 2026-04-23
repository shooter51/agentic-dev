export type ApiCallStatus = 'success' | 'error' | 'rate_limited';

/** A single Anthropic API call recorded for cost tracking */
export interface ApiCall {
  id: string;
  agentId: string;
  taskId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number;
  status: ApiCallStatus;
  errorCode: string | null;
  createdAt: string;
}
