import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
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
        code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode }) =>
          inline ? (
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
          ),
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
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
