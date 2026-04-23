import { describe, it, expect } from "vitest";
import { SSE_QUERY_MAP } from "./sse-query-contract";

describe("SSE_QUERY_MAP", () => {
  describe("task-updated", () => {
    it("returns task, board (with projectId), and task-history keys", () => {
      const fn = SSE_QUERY_MAP["task-updated"];
      const keys = fn({ taskId: "t1", projectId: "proj-1" });
      expect(keys).toContainEqual(["tasks", "t1"]);
      expect(keys).toContainEqual(["board", "proj-1"]);
      expect(keys).toContainEqual(["task-history", "t1"]);
    });

    it('falls back to "all" for board key when projectId is missing', () => {
      const fn = SSE_QUERY_MAP["task-updated"];
      const keys = fn({ taskId: "t2" });
      expect(keys).toContainEqual(["board", "all"]);
    });
  });

  describe("agent-status", () => {
    it("returns agents list and specific agent key", () => {
      const fn = SSE_QUERY_MAP["agent-status"];
      const keys = fn({ agentId: "agent-42" });
      expect(keys).toContainEqual(["agents"]);
      expect(keys).toContainEqual(["agents", "agent-42"]);
    });
  });

  describe("new-message", () => {
    it("returns messages for taskId and pending messages key", () => {
      const fn = SSE_QUERY_MAP["new-message"];
      const keys = fn({ taskId: "t3" });
      expect(keys).toContainEqual(["messages", "t3"]);
      expect(keys).toContainEqual(["messages", "pending"]);
    });
  });

  describe("message-response", () => {
    it("returns messages for taskId and pending messages key", () => {
      const fn = SSE_QUERY_MAP["message-response"];
      const keys = fn({ taskId: "t4" });
      expect(keys).toContainEqual(["messages", "t4"]);
      expect(keys).toContainEqual(["messages", "pending"]);
    });
  });

  describe("handoff", () => {
    it("returns task, handoffs, and board (with projectId) keys", () => {
      const fn = SSE_QUERY_MAP["handoff"];
      const keys = fn({ taskId: "t5", projectId: "proj-2" });
      expect(keys).toContainEqual(["tasks", "t5"]);
      expect(keys).toContainEqual(["handoffs", "t5"]);
      expect(keys).toContainEqual(["board", "proj-2"]);
    });

    it('falls back to "all" for board key when projectId is missing', () => {
      const fn = SSE_QUERY_MAP["handoff"];
      const keys = fn({ taskId: "t6" });
      expect(keys).toContainEqual(["board", "all"]);
    });
  });

  describe("quality-gate", () => {
    it("returns the task key only", () => {
      const fn = SSE_QUERY_MAP["quality-gate"];
      const keys = fn({ taskId: "t7" });
      expect(keys).toHaveLength(1);
      expect(keys).toContainEqual(["tasks", "t7"]);
    });
  });

  describe("defect-created", () => {
    it("returns board key with projectId", () => {
      const fn = SSE_QUERY_MAP["defect-created"];
      const keys = fn({ projectId: "proj-3" });
      expect(keys).toContainEqual(["board", "proj-3"]);
    });

    it('falls back to "all" when projectId is missing', () => {
      const fn = SSE_QUERY_MAP["defect-created"];
      const keys = fn({});
      expect(keys).toContainEqual(["board", "all"]);
    });
  });

  describe("agent-error", () => {
    it("returns agents list and specific agent key", () => {
      const fn = SSE_QUERY_MAP["agent-error"];
      const keys = fn({ agentId: "agent-99" });
      expect(keys).toContainEqual(["agents"]);
      expect(keys).toContainEqual(["agents", "agent-99"]);
    });
  });

  it("covers all expected event names", () => {
    const expected = [
      "task-updated",
      "agent-status",
      "new-message",
      "message-response",
      "handoff",
      "quality-gate",
      "defect-created",
      "agent-error",
    ];
    expect(Object.keys(SSE_QUERY_MAP).sort()).toEqual(expected.sort());
  });
});
