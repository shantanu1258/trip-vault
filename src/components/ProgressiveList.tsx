import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type ProgressiveListProps<T> = {
  items: T[];
  initialCount: number;
  itemLabel: string;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  className?: string;
  empty?: ReactNode;
};

/**
 * Keeps large collections compact without hiding any data behind pagination.
 * The first items render immediately; the complete list is an explicit choice.
 */
export function ProgressiveList<T>({
  items,
  initialCount,
  itemLabel,
  getKey,
  renderItem,
  className = "space-y-2",
  empty = null
}: ProgressiveListProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > initialCount;

  useEffect(() => {
    if (!hasMore) setExpanded(false);
  }, [hasMore]);

  if (!items.length) return <>{empty}</>;

  const visibleItems = expanded ? items : items.slice(0, initialCount);

  return (
    <>
      <div className={className}>
        {visibleItems.map((item) => (
          <div key={getKey(item)} className="min-w-0">
            {renderItem(item)}
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          className="secondary-button mt-4 w-full justify-center sm:w-auto"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {expanded ? "Show fewer" : `Show all ${items.length} ${itemLabel}`}
        </button>
      )}
    </>
  );
}
