import { describe, it, expect, beforeEach } from 'vitest';
import { LoopDetector, LoopDetectedError } from './loop-detector.js';
import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';

function makeToolUse(name: string, input: Record<string, unknown> = {}): ToolUseBlock {
  return {
    id: `tool_${Math.random()}`,
    type: 'tool_use',
    name,
    input,
  };
}

describe('LoopDetector', () => {
  let detector: LoopDetector;

  beforeEach(() => {
    detector = new LoopDetector(3); // threshold=3 for easy testing
  });

  describe('LoopDetectedError', () => {
    it('has correct name and code', () => {
      const err = new LoopDetectedError('test');
      expect(err.name).toBe('LoopDetectedError');
      expect(err.code).toBe('LOOP_DETECTED');
      expect(err.message).toBe('test');
    });
  });

  describe('record', () => {
    it('records tool calls without throwing for different calls', () => {
      const agent = 'agent-1';
      expect(() => {
        detector.record(agent, makeToolUse('read_file', { path: 'a.ts' }));
        detector.record(agent, makeToolUse('read_file', { path: 'b.ts' }));
        detector.record(agent, makeToolUse('write_file', { path: 'c.ts' }));
      }).not.toThrow();
    });

    it('bounds memory to threshold*2 entries', () => {
      const agent = 'agent-1';
      // Add more than threshold*2 = 6 calls with different names so no loop is triggered
      for (let i = 0; i < 10; i++) {
        detector.record(agent, makeToolUse(`tool_${i}`));
        detector.recordResult(agent, makeToolUse(`tool_${i}`), `result_${i}`);
      }
      // Just verifying no errors thrown — history bounded internally
    });
  });

  describe('recordResult', () => {
    it('throws LoopDetectedError when threshold consecutive identical call+result pairs occur', () => {
      const agent = 'agent-1';
      const toolUse = makeToolUse('read_file', { path: '/same/file.ts' });
      const result = 'file contents here';

      for (let i = 0; i < 2; i++) {
        detector.record(agent, toolUse);
        detector.recordResult(agent, toolUse, result);
      }

      // Third identical call+result should throw
      detector.record(agent, toolUse);
      expect(() => detector.recordResult(agent, toolUse, result)).toThrow(LoopDetectedError);
    });

    it('does not throw when results differ', () => {
      const agent = 'agent-1';
      const toolUse = makeToolUse('read_file', { path: '/same/file.ts' });

      expect(() => {
        detector.record(agent, toolUse);
        detector.recordResult(agent, toolUse, 'result 1');
        detector.record(agent, toolUse);
        detector.recordResult(agent, toolUse, 'result 2');
        detector.record(agent, toolUse);
        detector.recordResult(agent, toolUse, 'result 3');
      }).not.toThrow();
    });

    it('does not throw when tool names differ', () => {
      const agent = 'agent-1';
      const result = 'same result';

      expect(() => {
        for (let i = 0; i < 5; i++) {
          const toolUse = makeToolUse(`tool_${i % 2}`, { path: 'file.ts' });
          detector.record(agent, toolUse);
          detector.recordResult(agent, toolUse, result);
        }
      }).not.toThrow();
    });

    it('does not throw when inputs differ', () => {
      const agent = 'agent-1';
      const result = 'same result';

      expect(() => {
        for (let i = 0; i < 5; i++) {
          const toolUse = makeToolUse('read_file', { path: `/file_${i}.ts` });
          detector.record(agent, toolUse);
          detector.recordResult(agent, toolUse, result);
        }
      }).not.toThrow();
    });

    it('tracks history per agent independently', () => {
      const toolUse = makeToolUse('read_file', { path: '/file.ts' });
      const result = 'contents';

      // Fill up threshold for agent-1 to just before the limit
      for (let i = 0; i < 2; i++) {
        detector.record('agent-1', toolUse);
        detector.recordResult('agent-1', toolUse, result);
      }

      // agent-2 starts fresh — should not cause loop
      expect(() => {
        detector.record('agent-2', toolUse);
        detector.recordResult('agent-2', toolUse, result);
      }).not.toThrow();
    });

    it('throws with a message containing the tool name and agent id', () => {
      const agent = 'agent-loop';
      const toolUse = makeToolUse('run_tests', { suite: 'all' });
      const result = 'all tests passed';

      for (let i = 0; i < 2; i++) {
        detector.record(agent, toolUse);
        detector.recordResult(agent, toolUse, result);
      }
      detector.record(agent, toolUse);
      expect(() => detector.recordResult(agent, toolUse, result)).toThrow(
        /agent-loop.*run_tests/,
      );
    });
  });

  describe('clear', () => {
    it('clears history for an agent, resetting loop detection', () => {
      const agent = 'agent-1';
      const toolUse = makeToolUse('read_file', { path: '/file.ts' });
      const result = 'contents';

      for (let i = 0; i < 2; i++) {
        detector.record(agent, toolUse);
        detector.recordResult(agent, toolUse, result);
      }

      detector.clear(agent);

      // After clear, threshold restarts — no throw even with same call
      expect(() => {
        detector.record(agent, toolUse);
        detector.recordResult(agent, toolUse, result);
        detector.record(agent, toolUse);
        detector.recordResult(agent, toolUse, result);
      }).not.toThrow();
    });

    it('does not throw when clearing a non-existent agent', () => {
      expect(() => detector.clear('nonexistent')).not.toThrow();
    });
  });

  describe('default threshold', () => {
    it('uses threshold of 5 by default', () => {
      const defaultDetector = new LoopDetector(); // default threshold=5
      const agent = 'agent-1';
      const toolUse = makeToolUse('read_file', { path: '/file.ts' });
      const result = 'contents';

      // 4 identical calls should not throw
      for (let i = 0; i < 4; i++) {
        defaultDetector.record(agent, toolUse);
        defaultDetector.recordResult(agent, toolUse, result);
      }

      // 5th should throw
      defaultDetector.record(agent, toolUse);
      expect(() => defaultDetector.recordResult(agent, toolUse, result)).toThrow(LoopDetectedError);
    });
  });
});
