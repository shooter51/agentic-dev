import type { FastifyInstance } from 'fastify';
import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, relative } from 'path';
import { db } from '../db/index.js';
import { projects } from '../db/schema/projects.js';
import { eq } from 'drizzle-orm';

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
}

// Directories/files to skip
const IGNORED = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.vitest', '.vite', '__pycache__', '.DS_Store',
  'Thumbs.db', '.env', '.env.local', 'TestResults.xcresult',
]);

export default async function fileRoutes(fastify: FastifyInstance): Promise<void> {

  // List directory contents for a project
  fastify.get('/api/projects/:projectId/files', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { path: subPath } = request.query as { path?: string };

    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();

    if (!project?.path) {
      return reply.code(404).send({ error: 'Project not found or has no path' });
    }

    const targetDir = subPath ? join(project.path, subPath) : project.path;

    // Security: prevent path traversal
    const resolved = join(project.path, subPath ?? '');
    if (!resolved.startsWith(project.path)) {
      return reply.code(403).send({ error: 'Path traversal not allowed' });
    }

    try {
      const entries = await readdir(targetDir, { withFileTypes: true });
      const files: FileEntry[] = [];

      for (const entry of entries) {
        if (IGNORED.has(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.github') continue;

        const entryPath = relative(project.path, join(targetDir, entry.name));

        if (entry.isDirectory()) {
          files.push({ name: entry.name, path: entryPath, type: 'directory' });
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          try {
            const stats = await stat(join(targetDir, entry.name));
            files.push({
              name: entry.name,
              path: entryPath,
              type: 'file',
              size: stats.size,
              extension: ext,
            });
          } catch {
            files.push({ name: entry.name, path: entryPath, type: 'file', extension: ext });
          }
        }
      }

      // Sort: directories first, then files, alphabetically
      files.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return files;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return reply.code(404).send({ error: 'Directory not found' });
      }
      throw err;
    }
  });

  // Read a single file's content
  fastify.get('/api/projects/:projectId/file', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { path: filePath } = request.query as { path: string };

    if (!filePath) {
      return reply.code(400).send({ error: 'path query parameter required' });
    }

    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();

    if (!project?.path) {
      return reply.code(404).send({ error: 'Project not found or has no path' });
    }

    const resolved = join(project.path, filePath);
    if (!resolved.startsWith(project.path)) {
      return reply.code(403).send({ error: 'Path traversal not allowed' });
    }

    try {
      const stats = await stat(resolved);

      // Reject files > 1MB
      if (stats.size > 1_048_576) {
        return reply.code(413).send({ error: 'File too large (max 1MB)' });
      }

      const content = await readFile(resolved, 'utf-8');
      const ext = extname(filePath).toLowerCase();

      return {
        path: filePath,
        content,
        size: stats.size,
        extension: ext,
        language: extToLanguage(ext),
      };
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return reply.code(404).send({ error: 'File not found' });
      }
      throw err;
    }
  });

  // Serve raw file content (for images, binary preview, etc.)
  fastify.get('/api/projects/:projectId/file/raw', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { path: filePath } = request.query as { path: string };

    if (!filePath) {
      return reply.code(400).send({ error: 'path query parameter required' });
    }

    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();

    if (!project?.path) {
      return reply.code(404).send({ error: 'Project not found or has no path' });
    }

    const resolved = join(project.path, filePath);
    if (!resolved.startsWith(project.path)) {
      return reply.code(403).send({ error: 'Path traversal not allowed' });
    }

    try {
      const stats = await stat(resolved);
      if (stats.size > 10_485_760) {
        return reply.code(413).send({ error: 'File too large (max 10MB)' });
      }

      const ext = extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
        '.ico': 'image/x-icon', '.bmp': 'image/bmp',
        '.pdf': 'application/pdf',
      };
      const contentType = mimeTypes[ext] ?? 'application/octet-stream';

      const { createReadStream } = await import('fs');
      reply.type(contentType);
      return reply.send(createReadStream(resolved));
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return reply.code(404).send({ error: 'File not found' });
      }
      throw err;
    }
  });
} // end fileRoutes

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
    '.json': 'json', '.md': 'markdown', '.html': 'html', '.css': 'css',
    '.scss': 'scss', '.less': 'less', '.yaml': 'yaml', '.yml': 'yaml',
    '.xml': 'xml', '.sql': 'sql', '.sh': 'shell', '.bash': 'shell',
    '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
    '.java': 'java', '.kt': 'kotlin', '.swift': 'swift', '.c': 'c',
    '.cpp': 'cpp', '.h': 'cpp', '.cs': 'csharp', '.php': 'php',
    '.r': 'r', '.dart': 'dart', '.lua': 'lua', '.toml': 'toml',
    '.ini': 'ini', '.dockerfile': 'dockerfile', '.graphql': 'graphql',
    '.prisma': 'prisma', '.vue': 'html', '.svelte': 'html',
  };
  return map[ext] ?? 'plaintext';
}
