import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useNavigate } from "react-router-dom";
import { FolderOpen } from "lucide-react";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

const FILE_EXT_PATTERN = /\.(ts|tsx|js|jsx|json|md|mdx|html|css|scss|yaml|yml|xml|sql|sh|py|rb|go|rs|java|kt|swift|c|cpp|h|cs|toml|ini|graphql|prisma|vue|svelte|txt|cfg|conf|lock|env|gitignore|dockerfile)$/i;
const PATH_PATTERN = /^[~.]?\/[\w./-]+$|^[\w-]+\/[\w./-]+\.\w+$/;

function isFilePath(text: string): boolean {
  const cleaned = text.replace(/^~\//, "").replace(/^\.\//, "");
  return (PATH_PATTERN.test(text) || FILE_EXT_PATTERN.test(text)) && cleaned.length > 2;
}

function normalizeFilePath(text: string): string {
  // Strip leading ~/ or ./ or absolute paths to make relative
  return text
    .replace(/^~\/Source\/[^/]+\//, "") // ~/Source/ProjectName/ -> relative
    .replace(/^~\//, "")
    .replace(/^\.\//, "")
    .replace(/^\/[^/]+\/[^/]+\/[^/]+\//, ""); // /Users/x/Source/Proj/ -> relative
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const navigate = useNavigate();
  const selectedProject = useUIStore((s) => s.selectedProject);

  function handleFileClick(filePath: string) {
    const normalized = normalizeFilePath(filePath);
    const dir = normalized.includes("/")
      ? normalized.substring(0, normalized.lastIndexOf("/"))
      : "";
    navigate(`/files?dir=${encodeURIComponent(dir)}&file=${encodeURIComponent(normalized)}`);
  }

  return (
    <div className={cn("text-sm text-gray-800", className)}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-xl font-bold text-gray-900 mt-4 mb-2">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-semibold text-gray-900 mt-3 mb-2">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold text-gray-800 mt-2 mb-1">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="text-sm text-gray-700 mb-2 leading-relaxed">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside space-y-1 mb-2 text-sm text-gray-700 pl-2">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside space-y-1 mb-2 text-sm text-gray-700 pl-2">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-sm text-gray-700">{children}</li>
        ),
        code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode }) => {
          const text = String(children ?? "").trim();

          // Make file paths clickable
          if (inline && isFilePath(text) && selectedProject) {
            return (
              <button
                className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 text-xs font-mono hover:bg-blue-100 hover:text-blue-900 transition-colors cursor-pointer border border-blue-200"
                onClick={() => handleFileClick(text)}
                title={`Open in file browser: ${text}`}
              >
                <FolderOpen className="w-3 h-3" />
                {text}
              </button>
            );
          }

          return inline ? (
            <code
              className="bg-gray-100 text-gray-800 rounded px-1 py-0.5 text-xs font-mono"
              {...props}
            >
              {children}
            </code>
          ) : (
            <code className="block bg-gray-900 text-gray-100 rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre" {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="mb-2 overflow-x-auto rounded">{children}</pre>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="w-full text-sm border-collapse border border-gray-200">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-gray-50">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="border border-gray-200 px-3 py-1.5 text-left text-xs font-semibold text-gray-700">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border border-gray-200 px-3 py-1.5 text-xs text-gray-700">{children}</td>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-gray-300 pl-3 italic text-gray-600 mb-2">{children}</blockquote>
        ),
        hr: () => <hr className="border-gray-200 my-3" />,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            {children}
          </a>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-900">{children}</strong>
        ),
        img: ({ src, alt }) => {
          // If it's a relative path and we have a project, serve via API
          if (src && selectedProject && !src.startsWith("http")) {
            const apiSrc = `/api/projects/${selectedProject}/file/raw?path=${encodeURIComponent(src)}`;
            return (
              <img
                src={apiSrc}
                alt={alt ?? ""}
                className="max-w-full rounded border border-gray-200 my-2"
              />
            );
          }
          return (
            <img src={src} alt={alt ?? ""} className="max-w-full rounded my-2" />
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
