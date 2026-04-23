interface TimeInStageProps {
  updatedAt: string;
  className?: string;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return "just now";
}

export function TimeInStage({ updatedAt, className }: TimeInStageProps) {
  const elapsed = Date.now() - new Date(updatedAt).getTime();
  const isStale = elapsed > 24 * 60 * 60 * 1000; // > 1 day

  return (
    <span
      className={
        className ??
        `text-xs ${isStale ? "text-orange-500" : "text-gray-400"}`
      }
      title={new Date(updatedAt).toLocaleString()}
    >
      {formatDuration(elapsed)}
    </span>
  );
}
