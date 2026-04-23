/**
 * Maps each pipeline stage to the list of agent lane identifiers that handle it.
 * Terminal stages (done, cancelled, deferred) and todo have no assigned agents.
 */
export const STAGE_AGENT_MAP: Record<string, string[]> = {
  product: ['product-manager'],
  architecture: ['architect'],
  development: ['dev-1', 'dev-2', 'dev-3'],
  tech_lead_review: ['tech-lead'],
  devops_build: ['devops'],
  manual_qa: ['manual-qa'],
  automation: ['automation'],
  documentation: ['documentation'],
  devops_deploy: ['devops'],
  arch_review: ['architect'],
};
