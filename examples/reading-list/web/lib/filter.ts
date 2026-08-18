import type { ReadingListItem, ReadingListStatus } from "./types";

export interface FilterOptions {
  status?: ReadingListStatus;
  query?: string;
}

export function filterItems(
  items: ReadingListItem[],
  options: FilterOptions
): ReadingListItem[] {
  let result = items;

  if (options.status) {
    result = result.filter((item) => item.status === options.status);
  }

  if (options.query) {
    const q = options.query.toLowerCase();
    result = result.filter((item) => item.title.toLowerCase().includes(q));
  }

  return result;
}
