# LLD-009: Help Widget

**References:** PRD Section 9.6

## Overview

Floating "?" chat widget following the DiveStreams/GradeSnap pattern. RAG-powered help backed by Markdown articles with YAML frontmatter. "Take me there" navigation pills.

## File Structure

```
packages/frontend/src/
  components/help/
    HelpWidget.tsx            # Floating button + panel container
    HelpButton.tsx            # Circular "?" FAB
    HelpPanel.tsx             # Chat panel
    HelpMessage.tsx           # Message bubble with markdown
    NavigationPill.tsx         # "Take me there" button
packages/backend/src/
  routes/help.ts              # Help chat endpoint
  help/
    article-loader.ts         # Load and cache markdown articles
    article-scorer.ts         # Keyword relevance scoring
    navigation-targets.ts     # UI navigation target definitions
packages/frontend/docs/help/  # Help article markdown files
```

## Help Articles

```markdown
<!-- docs/help/getting-started.md -->
---
title: Getting Started with Agentic Dev
category: getting-started
tags: [setup, onboarding, first-task, project]
order: 1
---

# Getting Started

1. Register a target project by clicking **Add Project** on the header bar.
2. Provide the absolute path to your project's git repository.
3. Create your first task by clicking **+ New Task** in the Todo column.
4. Watch as the agent team picks up the task and moves it through the pipeline.

**Tip:** Check the Agent Panel on the right sidebar to see which agents are active and what they're working on.
```

## Backend: Help Route

```typescript
// routes/help.ts

export default async function helpRoute(fastify: FastifyInstance) {
  const articles = await loadArticles();

  fastify.post('/api/help/chat', async (request, reply) => {
    const { message, history } = request.body as {
      message: string;
      history: { role: string; content: string }[];
    };

    // Score articles by relevance
    const scored = scoreArticles(articles, message);
    const topArticles = scored.slice(0, 5);

    // Build context
    const articleContext = topArticles
      .map(a => `## ${a.title}\n${a.content}`)
      .join('\n\n---\n\n');

    // Call Claude
    // TODO: Add rate limiting — e.g., 20 requests/hour per session
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: fastify.config.helpModelId, // Configured via env, not hardcoded
      max_tokens: 1024,
      system: `You are a helpful assistant for the Agentic Dev system.
Answer questions based ONLY on the following documentation.
If the answer isn't in the docs, say so.
When referencing a UI location, embed a navigation marker: [[nav:target_key]].
Be concise. Use numbered steps for instructions.

Documentation:
${articleContext}`,
      messages: [
        ...history.slice(-20).map(h => ({
          role: h.role as 'user' | 'assistant',
          content: h.content,
        })),
        { role: 'user', content: message },
      ],
    });

    const rawAnswer = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    // Extract navigation markers
    const navPattern = /\[\[nav:(\w+)\]\]/g;
    const navHints: NavigationHint[] = [];
    let match;
    while ((match = navPattern.exec(rawAnswer)) !== null) {
      const target = NAVIGATION_TARGETS[match[1]];
      if (target) {
        navHints.push({ key: match[1], label: target.label, path: target.path });
      }
    }

    // Clean answer
    const cleanAnswer = rawAnswer.replace(navPattern, '');

    return {
      answer: cleanAnswer,
      navigationHints: navHints,
      citedArticles: topArticles.map(a => a.title),
    };
  });
}
```

## Article Loader

```typescript
// help/article-loader.ts

import matter from 'gray-matter';

interface HelpArticle {
  title: string;
  category: string;
  tags: string[];
  order: number;
  content: string;
  filePath: string;
}

let cachedArticles: HelpArticle[] | null = null;

export async function loadArticles(): Promise<HelpArticle[]> {
  if (cachedArticles) return cachedArticles;

  const helpDir = path.join(__dirname, '../../docs/help');
  const files = await glob('**/*.md', { cwd: helpDir });

  cachedArticles = await Promise.all(files.map(async (file) => {
    const raw = await fs.readFile(path.join(helpDir, file), 'utf-8');
    const { data, content } = matter(raw);
    return {
      title: data.title ?? file,
      category: data.category ?? 'general',
      tags: data.tags ?? [],
      order: data.order ?? 99,
      content,
      filePath: file,
    };
  }));

  return cachedArticles;
}
```

## Article Scorer

```typescript
// help/article-scorer.ts

function scoreArticles(articles: HelpArticle[], query: string): HelpArticle[] {
  // Use 1-char minimum instead of 2-char to preserve common dev terms
  // like QA, CI, PR, UI, API that would otherwise be stripped
  const SHORT_TERM_WHITELIST = new Set(['qa', 'ci', 'pr', 'ui', 'api', 'db', 'cd', 'io']);
  const keywords = query.toLowerCase().split(/\s+/).filter(
    w => w.length > 1 || SHORT_TERM_WHITELIST.has(w)
  );

  const scored = articles.map(article => {
    let score = 0;
    const titleLower = article.title.toLowerCase();
    const contentLower = article.content.toLowerCase();

    for (const keyword of keywords) {
      // Title match: +10
      if (titleLower.includes(keyword)) score += 10;

      // Tag match: +8
      if (article.tags.some(t => t.toLowerCase().includes(keyword))) score += 8;

      // Category match: +5
      if (article.category.toLowerCase().includes(keyword)) score += 5;

      // Content match: +1 per occurrence, capped at 20
      const occurrences = (contentLower.match(new RegExp(keyword, 'g')) ?? []).length;
      score += Math.min(occurrences, 20);
    }

    return { ...article, score };
  });

  return scored
    .filter(a => a.score > 0)
    .sort((a, b) => b.score - a.score);
}
```

## Navigation Targets

```typescript
// help/navigation-targets.ts

export const NAVIGATION_TARGETS: Record<string, { label: string; path: string }> = {
  board: { label: 'Kanban Board', path: '/' },
  add_project: { label: 'Add Project', path: '/projects/new' },
  agent_panel: { label: 'Agent Panel', path: '/?sidebar=agents' },
  stats: { label: 'Cost & Metrics', path: '/stats' },
  // For parameterized paths like /tasks/:id, navigate to the board with
  // the task detail panel open instead of an unresolvable route
  task_detail: { label: 'Task Detail', path: '/?selectedTask=:id' },
  settings: { label: 'Settings', path: '/settings' },
  // Add more as features are built
};
```

## Frontend: Help Widget

```typescript
// components/help/HelpWidget.tsx

function HelpWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sendMessage = async (text: string) => {
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/help/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-20),
        }),
      });

      if (!res.ok) {
        throw new Error(`Help request failed (${res.status})`);
      }

      const response = await res.json();

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.answer,
        navigationHints: response.navigationHints,
        citedArticles: response.citedArticles,
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-primary
                   text-primary-foreground shadow-lg flex items-center justify-center
                   hover:bg-primary/90 transition-colors z-50"
        aria-label="Help"
      >
        <QuestionMarkIcon className="w-6 h-6" />
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-6 w-[400px] max-h-[500px]
                     bg-card border rounded-lg shadow-xl flex flex-col z-50"
          role="dialog"
          aria-label="Help chat"
        >
          <div className="p-3 border-b flex items-center justify-between bg-primary text-primary-foreground rounded-t-lg">
            <span className="font-medium">Agentic Dev Help</span>
            <button onClick={() => setOpen(false)} aria-label="Close help">
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          <ScrollArea className="flex-1 p-3">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ask me anything about Agentic Dev!
              </p>
            )}
            {messages.map((msg, i) => (
              <HelpMessage key={i} message={msg} />
            ))}
            {loading && <ThreeDotsLoader />}
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded p-2 mt-1">
                {error}
              </div>
            )}
          </ScrollArea>

          <div className="p-3 border-t flex gap-2">
            <input
              ref={inputRef}
              className="flex-1 border rounded px-3 py-2 text-sm"
              placeholder="Type your question..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputRef.current?.value) {
                  sendMessage(inputRef.current.value);
                  inputRef.current.value = '';
                }
                if (e.key === 'Escape') setOpen(false);
              }}
            />
            <Button size="sm" onClick={() => {
              if (inputRef.current?.value) {
                sendMessage(inputRef.current.value);
                inputRef.current.value = '';
              }
            }}>Send</Button>
          </div>
        </div>
      )}
    </>
  );
}
```
