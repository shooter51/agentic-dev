import type { HelpArticle } from './article-loader.js';

// Short terms that are meaningful in dev contexts and should not be filtered out.
const SHORT_TERM_WHITELIST = new Set(['qa', 'ci', 'pr', 'ui', 'api', 'db', 'cd', 'io']);

export interface ScoredArticle extends HelpArticle {
  score: number;
}

/**
 * Score articles by keyword relevance and return them sorted descending.
 * Scoring weights per keyword hit:
 *   - title match:    +10
 *   - tag match:      +8
 *   - category match: +5
 *   - content match:  +1 per occurrence, capped at 20
 *
 * Articles with a score of 0 are excluded from the result.
 */
export function scoreArticles(articles: HelpArticle[], query: string): ScoredArticle[] {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1 || SHORT_TERM_WHITELIST.has(w));

  const scored: ScoredArticle[] = articles.map((article) => {
    let score = 0;
    const titleLower = article.title.toLowerCase();
    const contentLower = article.content.toLowerCase();

    for (const keyword of keywords) {
      if (titleLower.includes(keyword)) score += 10;

      if (article.tags.some((t) => t.toLowerCase().includes(keyword))) score += 8;

      if (article.category.toLowerCase().includes(keyword)) score += 5;

      const occurrences = (contentLower.match(new RegExp(keyword, 'g')) ?? []).length;
      score += Math.min(occurrences, 20);
    }

    return { ...article, score };
  });

  return scored
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score);
}
