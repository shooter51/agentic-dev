import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useCostStats, usePipelineStats } from "@/api/queries/stats";
import { StageBadge } from "@/components/common/StageBadge";

function formatCost(usd: number): string {
  if (usd < 0.01) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function StatsPage() {
  const { data: costStats, isLoading: costLoading } = useCostStats();
  const { data: pipelineStats, isLoading: pipelineLoading } = usePipelineStats();

  const tasksByStage = pipelineStats?.tasksByStage ?? {};
  const completedCount = tasksByStage["done"] ?? 0;
  const totalTasks = Object.values(tasksByStage).reduce((a, b) => a + b, 0);
  const defectStages = ["manual_qa", "automation"];
  const defectReturns = defectStages.reduce((sum, s) => sum + (tasksByStage[s] ?? 0), 0);
  const defectRate = totalTasks > 0 ? ((defectReturns / totalTasks) * 100).toFixed(1) : "0";

  const metrics = [
    {
      title: "Tasks Completed",
      value: pipelineLoading ? "..." : String(completedCount),
      sub: "all time",
    },
    {
      title: "Total API Calls",
      value: pipelineLoading ? "..." : formatNumber(pipelineStats?.totalApiCalls ?? 0),
      sub: `avg ${pipelineStats?.avgLatencyMs ?? 0}ms latency`,
    },
    {
      title: "Total AI Cost",
      value: costLoading ? "..." : formatCost(costStats?.totals.estimatedCostUsd ?? 0),
      sub: "USD all time",
    },
    {
      title: "Defect Rate",
      value: pipelineLoading ? "..." : `${defectRate}%`,
      sub: "tasks in QA stages",
    },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 overflow-y-auto h-full">
      <h1 className="text-xl font-semibold text-gray-900">Cost &amp; Pipeline Metrics</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(({ title, value, sub }) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500 font-normal">
                {title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-400 mt-1">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline stage distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-gray-500 font-normal">
            Tasks by Stage
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pipelineLoading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : totalTasks === 0 ? (
            <p className="text-sm text-gray-400">No tasks yet.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(tasksByStage)
                .sort(([, a], [, b]) => b - a)
                .map(([stage, count]) => {
                  const pct = Math.round((count / totalTasks) * 100);
                  return (
                    <div key={stage} className="flex items-center gap-3">
                      <StageBadge stage={stage} />
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-12 text-right">
                        {count} ({pct}%)
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-agent cost breakdown */}
      {costStats && costStats.perAgent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-500 font-normal">
              Cost by Agent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 font-medium">Agent</th>
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium text-right">Input Tokens</th>
                    <th className="pb-2 font-medium text-right">Output Tokens</th>
                    <th className="pb-2 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {costStats.perAgent
                    .filter((a) => a.estimatedCostUsd > 0)
                    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
                    .map((agent) => (
                      <tr key={agent.agentId} className="border-b border-gray-100">
                        <td className="py-2 text-gray-900">{agent.agentId}</td>
                        <td className="py-2 text-gray-500">{agent.role}</td>
                        <td className="py-2 text-right text-gray-700">
                          {formatNumber(agent.inputTokens)}
                        </td>
                        <td className="py-2 text-right text-gray-700">
                          {formatNumber(agent.outputTokens)}
                        </td>
                        <td className="py-2 text-right font-medium text-gray-900">
                          {formatCost(agent.estimatedCostUsd)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
