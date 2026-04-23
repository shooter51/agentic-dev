import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionMatrix, isAllowed, ROLE_TOOLS } from './permissions.js';

describe('PermissionMatrix', () => {
  let matrix: PermissionMatrix;

  beforeEach(() => {
    matrix = new PermissionMatrix();
  });

  describe('isAllowed', () => {
    describe('universal tools available to all roles', () => {
      const universalTools = [
        'read_file',
        'list_files',
        'search_files',
        'send_message',
        'signal_complete',
        'read_memories',
        'create_memory',
        'update_memory',
        'delete_memory',
      ];

      const allRoles = [
        'Product Manager',
        'Architect',
        'Tech Lead',
        'Developer (Senior)',
        'Developer',
        'DevOps Engineer',
        'Manual QA',
        'QA Automation Engineer',
        'Documentation Agent',
      ];

      for (const tool of universalTools) {
        for (const role of allRoles) {
          it(`allows ${role} to use ${tool}`, () => {
            expect(matrix.isAllowed(role, tool)).toBe(true);
          });
        }
      }
    });

    describe('Product Manager', () => {
      it('can use write_file', () => {
        expect(matrix.isAllowed('Product Manager', 'write_file')).toBe(true);
      });

      it('can use beads_create', () => {
        expect(matrix.isAllowed('Product Manager', 'beads_create')).toBe(true);
      });

      it('cannot use run_command', () => {
        expect(matrix.isAllowed('Product Manager', 'run_command')).toBe(false);
      });

      it('cannot use git_commit', () => {
        expect(matrix.isAllowed('Product Manager', 'git_commit')).toBe(false);
      });
    });

    describe('Architect', () => {
      it('can use write_file', () => {
        expect(matrix.isAllowed('Architect', 'write_file')).toBe(true);
      });

      it('can use git_status', () => {
        expect(matrix.isAllowed('Architect', 'git_status')).toBe(true);
      });

      it('cannot use run_command', () => {
        expect(matrix.isAllowed('Architect', 'run_command')).toBe(false);
      });

      it('cannot use git_push', () => {
        expect(matrix.isAllowed('Architect', 'git_push')).toBe(false);
      });
    });

    describe('Tech Lead', () => {
      it('can use run_command', () => {
        expect(matrix.isAllowed('Tech Lead', 'run_command')).toBe(true);
      });

      it('can use run_tests', () => {
        expect(matrix.isAllowed('Tech Lead', 'run_tests')).toBe(true);
      });

      it('can use check_coverage', () => {
        expect(matrix.isAllowed('Tech Lead', 'check_coverage')).toBe(true);
      });

      it('cannot use write_file', () => {
        expect(matrix.isAllowed('Tech Lead', 'write_file')).toBe(false);
      });

      it('cannot use git_commit', () => {
        expect(matrix.isAllowed('Tech Lead', 'git_commit')).toBe(false);
      });

      it('cannot use create_pr', () => {
        expect(matrix.isAllowed('Tech Lead', 'create_pr')).toBe(false);
      });
    });

    describe('Developer', () => {
      it('can use git_commit', () => {
        expect(matrix.isAllowed('Developer', 'git_commit')).toBe(true);
      });

      it('can use git_push', () => {
        expect(matrix.isAllowed('Developer', 'git_push')).toBe(true);
      });

      it('can use create_pr', () => {
        expect(matrix.isAllowed('Developer', 'create_pr')).toBe(true);
      });

      it('can use write_file', () => {
        expect(matrix.isAllowed('Developer', 'write_file')).toBe(true);
      });
    });

    describe('Developer (Senior)', () => {
      it('can use git_commit', () => {
        expect(matrix.isAllowed('Developer (Senior)', 'git_commit')).toBe(true);
      });

      it('can use create_pr', () => {
        expect(matrix.isAllowed('Developer (Senior)', 'create_pr')).toBe(true);
      });
    });

    describe('DevOps Engineer', () => {
      it('can use run_command', () => {
        expect(matrix.isAllowed('DevOps Engineer', 'run_command')).toBe(true);
      });

      it('cannot use check_coverage', () => {
        expect(matrix.isAllowed('DevOps Engineer', 'check_coverage')).toBe(false);
      });
    });

    describe('Manual QA', () => {
      it('can use run_command', () => {
        expect(matrix.isAllowed('Manual QA', 'run_command')).toBe(true);
      });

      it('cannot use write_file', () => {
        expect(matrix.isAllowed('Manual QA', 'write_file')).toBe(false);
      });

      it('cannot use git_push', () => {
        expect(matrix.isAllowed('Manual QA', 'git_push')).toBe(false);
      });
    });

    describe('QA Automation Engineer', () => {
      it('can use write_file', () => {
        expect(matrix.isAllowed('QA Automation Engineer', 'write_file')).toBe(true);
      });

      it('can use git_push', () => {
        expect(matrix.isAllowed('QA Automation Engineer', 'git_push')).toBe(true);
      });
    });

    describe('Documentation Agent', () => {
      it('can use write_file', () => {
        expect(matrix.isAllowed('Documentation Agent', 'write_file')).toBe(true);
      });

      it('can use run_command', () => {
        expect(matrix.isAllowed('Documentation Agent', 'run_command')).toBe(true);
      });

      it('cannot use git_push', () => {
        expect(matrix.isAllowed('Documentation Agent', 'git_push')).toBe(false);
      });

      it('cannot use run_tests', () => {
        expect(matrix.isAllowed('Documentation Agent', 'run_tests')).toBe(false);
      });
    });

    describe('unknown role', () => {
      it('returns false for any tool', () => {
        expect(matrix.isAllowed('Unknown Role', 'read_file')).toBe(false);
        expect(matrix.isAllowed('Unknown Role', 'write_file')).toBe(false);
        expect(matrix.isAllowed('', 'read_file')).toBe(false);
      });
    });
  });

  describe('allowedTools', () => {
    it('returns the tool list for a valid role', () => {
      const tools = matrix.allowedTools('Developer');
      expect(tools).toContain('read_file');
      expect(tools).toContain('git_commit');
      expect(tools).toContain('create_pr');
    });

    it('returns empty array for unknown role', () => {
      expect(matrix.allowedTools('Unknown')).toEqual([]);
    });
  });
});

describe('isAllowed (convenience function)', () => {
  it('allows valid role+tool combo', () => {
    expect(isAllowed('Developer', 'git_commit')).toBe(true);
  });

  it('denies invalid role+tool combo', () => {
    expect(isAllowed('Architect', 'git_commit')).toBe(false);
  });

  it('denies unknown role', () => {
    expect(isAllowed('Ghost', 'read_file')).toBe(false);
  });
});

describe('ROLE_TOOLS export', () => {
  it('is exported and has expected roles', () => {
    expect(ROLE_TOOLS).toHaveProperty('Developer');
    expect(ROLE_TOOLS).toHaveProperty('Architect');
    expect(ROLE_TOOLS).toHaveProperty('Tech Lead');
  });
});
