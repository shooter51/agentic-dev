import { useState, useEffect } from "react";
import { useUIStore } from "@/stores/ui-store";
import { useProjects } from "@/api/queries/projects";
import { useDirectoryListing, useFileContent, type FileEntry } from "@/api/queries/files";
import { MarkdownContent } from "@/components/common/MarkdownContent";
import { useSearchParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { Folder, File, ChevronRight, ChevronDown, ArrowLeft } from "lucide-react";

const MARKDOWN_EXTS = new Set([".md", ".mdx", ".markdown"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"]);

export function FilesPage() {
  const selectedProject = useUIStore((s) => s.selectedProject);
  const { data: projects } = useProjects();
  const [searchParams] = useSearchParams();
  const [currentPath, setCurrentPath] = useState(searchParams.get("dir") ?? "");
  const [selectedFile, setSelectedFile] = useState<string | null>(searchParams.get("file"));
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // React to URL query param changes (from markdown file path clicks)
  useEffect(() => {
    const dir = searchParams.get("dir");
    const file = searchParams.get("file");
    if (dir !== null) setCurrentPath(dir);
    if (file !== null) setSelectedFile(file);
  }, [searchParams]);

  const project = projects?.find((p) => p.id === selectedProject);

  const { data: files, isLoading } = useDirectoryListing(selectedProject, currentPath);
  const { data: fileContent, isLoading: fileLoading } = useFileContent(selectedProject, selectedFile);

  const isMarkdown = selectedFile && MARKDOWN_EXTS.has(fileContent?.extension ?? "");
  const isImage = selectedFile && IMAGE_EXTS.has(
    selectedFile.substring(selectedFile.lastIndexOf(".")).toLowerCase()
  );
  const imageUrl = isImage && selectedProject
    ? `/api/projects/${selectedProject}/file/raw?path=${encodeURIComponent(selectedFile)}`
    : null;

  const pathParts = currentPath ? currentPath.split("/") : [];

  function navigateTo(path: string) {
    setCurrentPath(path);
    setSelectedFile(null);
  }

  function toggleDir(dirPath: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Select a project to browse files
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: File tree */}
      <div className="w-72 border-r bg-gray-50 flex flex-col flex-shrink-0">
        <div className="px-3 py-2 border-b bg-white">
          <h2 className="text-sm font-semibold text-gray-900 truncate">
            {project?.name ?? "Files"}
          </h2>
          {project?.path && (
            <p className="text-xs text-gray-500 truncate font-mono" title={project.path}>
              {project.path}
            </p>
          )}
        </div>

        {/* Breadcrumb */}
        {currentPath && (
          <div className="px-2 py-1.5 border-b flex items-center gap-1 text-xs flex-wrap">
            <button
              className="text-blue-600 hover:underline"
              onClick={() => navigateTo("")}
            >
              root
            </button>
            {pathParts.map((part, i) => {
              const partPath = pathParts.slice(0, i + 1).join("/");
              return (
                <span key={partPath} className="flex items-center gap-1">
                  <span className="text-gray-400">/</span>
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => navigateTo(partPath)}
                  >
                    {part}
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {currentPath && (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
              onClick={() => {
                const parent = currentPath.includes("/")
                  ? currentPath.substring(0, currentPath.lastIndexOf("/"))
                  : "";
                navigateTo(parent);
              }}
            >
              <ArrowLeft className="w-3 h-3" />
              ..
            </button>
          )}
          {isLoading && (
            <p className="px-3 py-4 text-xs text-gray-400">Loading...</p>
          )}
          {files?.map((entry) => (
            <FileTreeRow
              key={entry.path}
              entry={entry}
              selectedFile={selectedFile}
              expandedDirs={expandedDirs}
              onSelectFile={setSelectedFile}
              onNavigate={navigateTo}
              onToggleDir={toggleDir}
            />
          ))}
          {!isLoading && files?.length === 0 && (
            <p className="px-3 py-4 text-xs text-gray-400">Empty directory</p>
          )}
        </div>
      </div>

      {/* Right: File viewer */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {selectedFile ? (
          <>
            <div className="px-4 py-2 border-b bg-white flex items-center gap-2 flex-shrink-0">
              <File className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-mono text-gray-700 truncate">{selectedFile}</span>
              {fileContent && (
                <span className="text-xs text-gray-400 ml-auto">
                  {formatSize(fileContent.size)} · {fileContent.language}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              {isImage && imageUrl ? (
                <div className="flex items-center justify-center h-full bg-gray-900 p-4 overflow-auto">
                  <img
                    src={imageUrl}
                    alt={selectedFile}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : fileLoading ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Loading file...
                </div>
              ) : fileContent ? (
                isMarkdown ? (
                  <div className="p-6 overflow-y-auto h-full prose prose-sm max-w-none">
                    <MarkdownContent content={fileContent.content} />
                  </div>
                ) : (
                  <Editor
                    height="100%"
                    language={fileContent.language}
                    value={fileContent.content}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: true },
                      fontSize: 13,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      renderWhitespace: "selection",
                      bracketPairColorization: { enabled: true },
                    }}
                  />
                )
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Select a file to view
          </div>
        )}
      </div>
    </div>
  );
}

function FileTreeRow({
  entry,
  selectedFile,
  expandedDirs,
  onSelectFile,
  onNavigate,
  onToggleDir,
}: {
  entry: FileEntry;
  selectedFile: string | null;
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onNavigate: (path: string) => void;
  onToggleDir: (path: string) => void;
}) {
  const isDir = entry.type === "directory";
  const isSelected = selectedFile === entry.path;
  const isExpanded = expandedDirs.has(entry.path);

  return (
    <button
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 transition-colors text-left ${
        isSelected ? "bg-blue-50 text-blue-700" : "text-gray-700"
      }`}
      onClick={() => {
        if (isDir) {
          onNavigate(entry.path);
        } else {
          onSelectFile(entry.path);
        }
      }}
      onDoubleClick={() => {
        if (isDir) onToggleDir(entry.path);
      }}
    >
      {isDir ? (
        <>
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
          )}
          <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
        </>
      ) : (
        <>
          <span className="w-3" />
          <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
        </>
      )}
      <span className="truncate">{entry.name}</span>
      {entry.size !== undefined && !isDir && (
        <span className="ml-auto text-gray-400 flex-shrink-0">{formatSize(entry.size)}</span>
      )}
    </button>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}
