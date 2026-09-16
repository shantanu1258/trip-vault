export function upsertById<T extends { id: string }>(items: T[] | undefined, additions: T[]) {
  if (!items) return items;
  const ids = new Set(additions.map((item) => item.id));
  return [...items.filter((item) => !ids.has(item.id)), ...additions];
}
