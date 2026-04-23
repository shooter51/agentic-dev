import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function StatsPage() {
  return (
    <div className="p-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900">Cost &amp; Pipeline Metrics</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Tasks Completed", value: "—", sub: "all time" },
          { title: "Avg Cycle Time", value: "—", sub: "hours per task" },
          { title: "Total AI Cost", value: "—", sub: "USD this month" },
          { title: "Defect Rate", value: "—", sub: "% returned from QA" },
        ].map(({ title, value, sub }) => (
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

      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">
          Pipeline metrics charts will appear here.
        </p>
      </div>
    </div>
  );
}
