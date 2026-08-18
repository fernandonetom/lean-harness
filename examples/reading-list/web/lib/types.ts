export type ReadingListStatus = "to-read" | "reading" | "done";

export interface ReadingListItem {
  id: string;
  title: string;
  status: ReadingListStatus;
}
