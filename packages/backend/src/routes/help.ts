import type { FastifyInstance } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import { loadArticles } from '../help/article-loader.js';
import { scoreArticles } from '../help/article-scorer.js';
import { NAVIGATION_TARGETS } from '../help/navigation-targets.js';
import type { NavigationHint } from '../help/navigation-targets.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface HelpChatBody {
  message: string;
  history?: ChatMessage[];
}

const NAV_PATTERN = /\[\[nav:(\w+)\]\]/g;

export default async function helpRoute(fastify: FastifyInstance): Promise<void> {
  // Pre-load articles at plugin registration time
  const articles = await loadArticles();

  fastify.post('/api/help/chat', async (request, reply) => {
    const body = request.body as HelpChatBody;
    const { message, history = [] } = body;

    // Score and select top 5 articles
    const scored = scoreArticles(articles, message);
    const topArticles = scored.slice(0, 5);

    const articleContext = topArticles
      .map((a) => `## ${a.title}\n${a.content}`)
      .join('\n\n---\n\n');

    const modelId: string =
      (fastify as any).config?.helpModelId ?? 'claude-3-5-haiku-20241022';

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 1024,
      system: `You are a helpful assistant for the Agentic Dev system.
Answer questions based ONLY on the following documentation.
If the answer isn't in the docs, say so.
When referencing a UI location, embed a navigation marker: [[nav:target_key]].
Be concise. Use numbered steps for instructions.

Documentation:
${articleContext}`,
      messages: [
        ...history.slice(-20).map((h) => ({
          role: h.role,
          content: h.content,
        })),
        { role: 'user', content: message },
      ],
    });

    const rawAnswer =
      response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract [[nav:key]] markers and resolve them to navigation hints
    const navHints: NavigationHint[] = [];
    let match: RegExpExecArray | null;
    const pattern = new RegExp(NAV_PATTERN.source, 'g');
    while ((match = pattern.exec(rawAnswer)) !== null) {
      const key = match[1]!;
      const target = NAVIGATION_TARGETS[key];
      if (target) {
        navHints.push({ key, label: target.label, path: target.path });
      }
    }

    // Strip markers from the answer before returning
    const cleanAnswer = rawAnswer.replace(new RegExp(NAV_PATTERN.source, 'g'), '');

    return {
      answer: cleanAnswer,
      navigationHints: navHints,
      citedArticles: topArticles.map((a) => a.title),
    };
  });
}
