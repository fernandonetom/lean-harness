import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ReadingListItem } from "./types";

const DATA_FILE = path.join(process.cwd(), "data", "reading-list.json");

export async function getItems(): Promise<ReadingListItem[]> {
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  return JSON.parse(raw) as ReadingListItem[];
}

export async function addItem(title: string): Promise<ReadingListItem> {
  const items = await getItems();
  const item: ReadingListItem = {
    id: randomUUID(),
    title,
    status: "to-read",
  };
  items.push(item);
  await fs.writeFile(DATA_FILE, `${JSON.stringify(items, null, 2)}\n`, "utf-8");
  return item;
}
