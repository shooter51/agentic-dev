import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { useMessages, useSendOperatorMessage } from "@/api/queries/messages";
import type { Message } from "@/api/types";

type MessageType = "clarification" | "rejection" | "notification" | "response";
const FILTER_TYPES: Array<{ value: MessageType | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "clarification", label: "Clarifications" },
  { value: "rejection", label: "Rejections" },
  { value: "notification", label: "Notifications" },
  { value: "response", label: "Responses" },
];

interface ThreadGroup {
  id: string;
  messages: Message[];
}

function groupIntoThreads(messages: Message[]): ThreadGroup[] {
  const threads: Map<string, Message[]> = new Map();
  const standalone: Message[] = [];

  for (const msg of messages) {
    if (msg.threadId) {
      const existing = threads.get(msg.threadId) ?? [];
      threads.set(msg.threadId, [...existing, msg]);
    } else {
      standalone.push(msg);
    }
  }

  const result: ThreadGroup[] = [];
  for (const [id, msgs] of threads) {
    result.push({ id, messages: msgs });
  }
  for (const msg of standalone) {
    result.push({ id: msg.id, messages: [msg] });
  }

  result.sort((a, b) => {
    const aMin = Math.min(...a.messages.map((m) => new Date(m.createdAt).getTime()));
    const bMin = Math.min(...b.messages.map((m) => new Date(m.createdAt).getTime()));
    return aMin - bMin;
  });

  return result;
}

interface CommunicationFeedProps {
  taskId?: string;
}

export function CommunicationFeed({ taskId }: CommunicationFeedProps) {
  const { data: messages } = useMessages(taskId);
  const sendMessage = useSendOperatorMessage();
  const [filterType, setFilterType] = useState<MessageType | "all">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered =
    filterType === "all"
      ? (messages ?? [])
      : (messages ?? []).filter((m) => m.type === filterType);

  const threads = groupIntoThreads(filtered);
  const allThreads = groupIntoThreads(messages ?? []);
  const threadedMessageIds = new Set(
    allThreads.flatMap((t) => t.messages.map((m) => m.id))
  );

  const unresolvedPending = (messages ?? []).filter(
    (m) => m.status === "pending" && !threadedMessageIds.has(m.id)
  );

  const handleSend = () => {
    if (!taskId || !inputRef.current?.value.trim()) return;
    sendMessage.mutate({
      taskId,
      content: inputRef.current.value.trim(),
    });
    inputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex gap-1 flex-wrap">
        {FILTER_TYPES.map(({ value, label }) => (
          <Button
            key={value}
            variant={filterType === value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 pr-1">
          {threads.map((thread) => (
            <div key={thread.id} className="flex flex-col gap-1">
              {thread.messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </div>
          ))}

          {unresolvedPending.map((m) => (
            <div
              key={m.id}
              className="border-l-4 border-yellow-500 pl-3 bg-yellow-50 rounded p-2"
            >
              <span className="text-xs font-medium text-yellow-700">
                Waiting for response
              </span>
              <MessageBubble message={m} />
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              No messages yet.
            </p>
          )}
        </div>
      </ScrollArea>

      {taskId && (
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            placeholder="Send a message to the agent..."
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={sendMessage.isPending}
          >
            Send
          </Button>
        </div>
      )}
    </div>
  );
}
