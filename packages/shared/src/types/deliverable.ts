export type DeliverableType =
  | 'prd'
  | 'adr'
  | 'lld'
  | 'test_report'
  | 'coverage_report'
  | 'security_report'
  | 'review_report'
  | 'defect_report';

export interface Deliverable {
  id: string;
  taskId: string;
  /** The pipeline stage that produced this deliverable */
  stage: string;
  type: DeliverableType;
  title: string;
  content: string;
  createdAt: string;
}
