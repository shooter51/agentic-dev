import { Badge } from "@/components/ui/badge";

interface QualityGateStatusProps {
  metadata: string | null;
}

interface GateConfig {
  key: string;
  label: string;
  threshold: number;
  format: "percent" | "count" | "boolean";
}

const GATES: GateConfig[] = [
  { key: "unitCoverage", label: "Unit Coverage", threshold: 98, format: "percent" },
  { key: "pactCoverage", label: "Pact Coverage", threshold: 100, format: "percent" },
  { key: "integrationCoverage", label: "Integration Coverage", threshold: 90, format: "percent" },
  { key: "e2eApiCoverage", label: "E2E API Coverage", threshold: 85, format: "percent" },
  { key: "e2eUiCoverage", label: "E2E UI Coverage", threshold: 85, format: "percent" },
  { key: "consecutivePassingRuns", label: "Consecutive Passes", threshold: 3, format: "count" },
  { key: "buildPassed", label: "Build", threshold: 1, format: "boolean" },
  { key: "securityScanPassed", label: "Security Scan", threshold: 1, format: "boolean" },
  { key: "folderStructureClean", label: "Folder Structure", threshold: 1, format: "boolean" },
  { key: "secretsDetected", label: "No Secrets", threshold: 0, format: "count" },
];

function formatValue(value: number | boolean | undefined, format: string): string {
  if (value === undefined || value === null) return "—";
  if (format === "percent") return `${value}%`;
  if (format === "boolean") return value ? "Pass" : "Fail";
  return String(value);
}

function checkPass(value: number | boolean | undefined, gate: GateConfig): boolean | null {
  if (value === undefined || value === null) return null;
  if (gate.key === "secretsDetected") return Number(value) === 0;
  if (gate.format === "boolean") return !!value;
  return Number(value) >= gate.threshold;
}

export function QualityGateStatus({ metadata }: QualityGateStatusProps) {
  if (!metadata) {
    return (
      <p className="text-xs text-gray-400">No quality gate data yet.</p>
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return <p className="text-xs text-gray-400">Invalid metadata.</p>;
  }

  const hasAnyGate = GATES.some((g) => parsed[g.key] !== undefined);
  if (!hasAnyGate) {
    return (
      <p className="text-xs text-gray-400">No quality gate data yet.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {GATES.map((gate) => {
        const value = parsed[gate.key] as number | boolean | undefined;
        if (value === undefined) return null;
        const pass = checkPass(value, gate);

        return (
          <div key={gate.key} className="flex items-center justify-between text-xs">
            <span className="text-gray-600">{gate.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-800 font-medium">
                {formatValue(value, gate.format)}
              </span>
              {pass !== null && (
                <Badge
                  variant={pass ? "default" : "destructive"}
                  className="text-[10px] px-1.5 py-0"
                >
                  {pass ? "Pass" : "Fail"}
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
