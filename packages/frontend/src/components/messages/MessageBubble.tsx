import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/common/AgentAvatar";
import type { Message } from "@/api/types";

interface MessageBubbleProps {
  message: Message;
  className?: string;
}

const TYPE_STYLES: Record<string, string> = {
  clarification: "bg-blue-50 border-blue-200",
  rejection: "bg-red-50 border-red-200",
  notification: "bg-gray-50 border-gray-200",
  response: "bg-green-50 border-green-200",
};

export function MessageBubble({ message, className }: MessageBubbleProps) {
  const typeStyle = TYPE_STYLES[message.type] ?? TYPE_STYLES.notification;

  return (
    <div className={cn("rounded border p-3", typeStyle, className)}>
      <div className="flex items-center gap-2 mb-1">
        {message.fromAgent && (
          <AgentAvatar agentId={message.fromAgent} size="sm" />
        )}
        <span className="text-xs font-medium text-gray-600">
          {message.fromAgent ?? "Operator"}
        </span>
        {message.toAgent && (
          <>
            <span className="text-xs text-gray-400">→</span>
            <span className="text-xs font-medium text-gray-600">
              {message.toAgent}
            </span>
          </>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {new Date(message.createdAt).toLocaleTimeString()}
        </span>
      </div>
      <p className="text-sm text-gray-800">{message.content}</p>
    </div>
  );
}
