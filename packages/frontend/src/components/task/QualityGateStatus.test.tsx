import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QualityGateStatus } from "./QualityGateStatus";

describe("QualityGateStatus", () => {
  it("shows 'No quality gate data yet.' when metadata is null", () => {
    render(<QualityGateStatus metadata={null} />);
    expect(screen.getByText("No quality gate data yet.")).toBeInTheDocument();
  });

  it("shows 'Invalid metadata.' when metadata is not valid JSON", () => {
    render(<QualityGateStatus metadata="not-json{{{" />);
    expect(screen.getByText("Invalid metadata.")).toBeInTheDocument();
  });

  it("shows 'No quality gate data yet.' when parsed metadata has none of the expected gate keys", () => {
    render(<QualityGateStatus metadata={JSON.stringify({ foo: "bar" })} />);
    expect(screen.getByText("No quality gate data yet.")).toBeInTheDocument();
  });

  it("renders unitCoverage gate row when present", () => {
    render(<QualityGateStatus metadata={JSON.stringify({ unitCoverage: 98 })} />);
    expect(screen.getByText("Unit Coverage")).toBeInTheDocument();
    expect(screen.getByText("98%")).toBeInTheDocument();
  });

  it("shows Pass badge when unitCoverage meets threshold (98)", () => {
    render(<QualityGateStatus metadata={JSON.stringify({ unitCoverage: 98 })} />);
    expect(screen.getByText("Pass")).toBeInTheDocument();
  });

  it("shows Fail badge when unitCoverage is below threshold", () => {
    render(<QualityGateStatus metadata={JSON.stringify({ unitCoverage: 80 })} />);
    expect(screen.getByText("Fail")).toBeInTheDocument();
  });

  it("renders buildPassed as boolean (Pass/Fail)", () => {
    render(<QualityGateStatus metadata={JSON.stringify({ buildPassed: true })} />);
    expect(screen.getByText("Build")).toBeInTheDocument();
    // the formatValue returns "Pass" for boolean true, and the badge also shows "Pass"
    const passElements = screen.getAllByText("Pass");
    expect(passElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Fail for buildPassed=false", () => {
    render(<QualityGateStatus metadata={JSON.stringify({ buildPassed: false })} />);
    const failElements = screen.getAllByText("Fail");
    expect(failElements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders consecutivePassingRuns as count", () => {
    render(<QualityGateStatus metadata={JSON.stringify({ consecutivePassingRuns: 3 })} />);
    expect(screen.getByText("Consecutive Passes")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("secretsDetected=0 shows Pass", () => {
    render(<QualityGateStatus metadata={JSON.stringify({ secretsDetected: 0 })} />);
    expect(screen.getByText("No Secrets")).toBeInTheDocument();
    expect(screen.getByText("Pass")).toBeInTheDocument();
  });

  it("secretsDetected=1 shows Fail", () => {
    render(<QualityGateStatus metadata={JSON.stringify({ secretsDetected: 1 })} />);
    expect(screen.getByText("No Secrets")).toBeInTheDocument();
    expect(screen.getByText("Fail")).toBeInTheDocument();
  });

  it("renders multiple gates when multiple keys are present", () => {
    render(
      <QualityGateStatus
        metadata={JSON.stringify({
          unitCoverage: 99,
          pactCoverage: 100,
          buildPassed: true,
        })}
      />
    );
    expect(screen.getByText("Unit Coverage")).toBeInTheDocument();
    expect(screen.getByText("Pact Coverage")).toBeInTheDocument();
    expect(screen.getByText("Build")).toBeInTheDocument();
  });

  it("skips gate rows where the key is absent from metadata", () => {
    render(<QualityGateStatus metadata={JSON.stringify({ unitCoverage: 99 })} />);
    expect(screen.queryByText("Pact Coverage")).not.toBeInTheDocument();
  });

  it("renders e2eApiCoverage with percent format", () => {
    render(<QualityGateStatus metadata={JSON.stringify({ e2eApiCoverage: 90 })} />);
    expect(screen.getByText("E2E API Coverage")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("renders securityScanPassed with boolean format", () => {
    render(<QualityGateStatus metadata={JSON.stringify({ securityScanPassed: false })} />);
    expect(screen.getByText("Security Scan")).toBeInTheDocument();
  });

  it("renders folderStructureClean gate", () => {
    render(<QualityGateStatus metadata={JSON.stringify({ folderStructureClean: true })} />);
    expect(screen.getByText("Folder Structure")).toBeInTheDocument();
  });
});
