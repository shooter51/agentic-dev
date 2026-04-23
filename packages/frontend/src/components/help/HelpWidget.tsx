import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { HelpCircle, X, Send } from "lucide-react";

interface NavigationHint {
  key: string;
  label: string;
  path: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  navigationHints?: NavigationHint[];
  citedArticles?: string[];
}

export function HelpWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const sendMessage = async (text: string) => {
    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/help/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-20),
        }),
      });

      if (!res.ok) {
        throw new Error(`Help request failed (${res.status})`);
      }

      const response = (await res.json()) as {
        answer: string;
        navigationHints: NavigationHint[];
        citedArticles: string[];
      };

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.answer,
          navigationHints: response.navigationHints,
          citedArticles: response.citedArticles,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    const val = inputRef.current?.value.trim();
    if (!val) return;
    inputRef.current!.value = "";
    sendMessage(val);
  };

  return (
    <>
      {/* Floating help button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center hover:bg-blue-700 transition-colors z-50"
        aria-label="Help"
      >
        <HelpCircle className="w-6 h-6" />
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-6 w-[400px] max-h-[520px] bg-white border border-gray-200 rounded-xl shadow-2xl flex flex-col z-50"
          role="dialog"
          aria-label="Help chat"
        >
          <div className="p-3 border-b flex items-center justify-between bg-blue-600 text-white rounded-t-xl">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              <span className="font-medium text-sm">Agentic Dev Help</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close help"
              className="hover:bg-blue-700 rounded p-0.5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <ScrollArea className="flex-1 p-3">
            <div className="flex flex-col gap-3">
              {messages.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  Ask me anything about Agentic Dev!
                </p>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex flex-col gap-1"}>
                  {msg.role === "user" ? (
                    <div className="bg-blue-600 text-white rounded-lg rounded-br-none px-3 py-2 text-sm max-w-[85%]">
                      {msg.content}
                    </div>
                  ) : (
                    <>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg rounded-bl-none px-3 py-2 text-sm text-gray-800 max-w-[90%]">
                        {msg.content}
                      </div>
                      {msg.navigationHints && msg.navigationHints.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {msg.navigationHints.map((hint) => (
                            <button
                              key={hint.key}
                              onClick={() => {
                                navigate(hint.path);
                                setOpen(false);
                              }}
                              className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 hover:bg-blue-100 transition-colors"
                            >
                              Take me to: {hint.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {msg.citedArticles && msg.citedArticles.length > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          Sources: {msg.citedArticles.join(", ")}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-1 items-center py-1">
                  <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              )}

              {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                  {error}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-3 border-t flex gap-2">
            <input
              ref={inputRef}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Type your question..."
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
                if (e.key === "Escape") setOpen(false);
              }}
            />
            <Button size="sm" onClick={handleSend} disabled={loading}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
