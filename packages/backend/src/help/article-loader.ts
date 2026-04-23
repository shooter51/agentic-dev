import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';
import matter from 'gray-matter';

export interface HelpArticle {
  title: string;
  category: string;
  tags: string[];
  order: number;
  content: string;
  filePath: string;
}

let cachedArticles: HelpArticle[] | null = null;

function getHelpDir(): string {
  // Resolve relative to this file so it works regardless of cwd
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return join(__dirname, '..', '..', '..', 'frontend', 'docs', 'help');
}

export async function loadArticles(): Promise<HelpArticle[]> {
  if (cachedArticles !== null) return cachedArticles;

  const helpDir = getHelpDir();

  const filePaths: string[] = [];
  try {
    for await (const entry of glob('**/*.md', { cwd: helpDir })) {
      filePaths.push(entry as string);
    }
  } catch {
    // Help directory may not exist yet — return empty list gracefully
    cachedArticles = [];
    return cachedArticles;
  }

  cachedArticles = await Promise.all(
    filePaths.map(async (file) => {
      const raw = await readFile(join(helpDir, file), 'utf-8');
      const { data, content } = matter(raw);
      return {
        title: (data['title'] as string | undefined) ?? file,
        category: (data['category'] as string | undefined) ?? 'general',
        tags: (data['tags'] as string[] | undefined) ?? [],
        order: (data['order'] as number | undefined) ?? 99,
        content,
        filePath: file,
      };
    }),
  );

  // Sort by order field so callers get a consistent listing
  cachedArticles.sort((a, b) => a.order - b.order);

  return cachedArticles;
}

/** Clear the cache — useful in tests or when articles change at runtime. */
export function clearArticleCache(): void {
  cachedArticles = null;
}
