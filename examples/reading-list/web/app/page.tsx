import Link from "next/link";
import { getItems } from "@/lib/store";
import { filterItems } from "@/lib/filter";
import type { ReadingListStatus } from "@/lib/types";

const STATUSES: ReadingListStatus[] = ["to-read", "reading", "done"];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const items = await getItems();
  const params = await searchParams;

  const status = (
    typeof params.status === "string" ? params.status : undefined
  ) as ReadingListStatus | undefined;
  const query = typeof params.q === "string" ? params.q : undefined;

  const filteredItems = filterItems(items, { status, query });

  const statusHref = (s?: string) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (query) p.set("q", query);
    const qs = p.toString();
    return qs ? `/?${qs}` : "/";
  };

  const clearSearchHref = () => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    const qs = p.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Reading List</h1>
      <p>
        <Link href="/add">Add a new item</Link>
      </p>

      {/* Status filter links */}
      <div style={{ marginBottom: "0.5rem" }}>
        <Link
          href={statusHref()}
          style={{ fontWeight: !status ? "bold" : "normal" }}
        >
          All
        </Link>
        {STATUSES.map((s) => (
          <span key={s}>
            {" "}
            <Link
              href={statusHref(s)}
              style={{ fontWeight: status === s ? "bold" : "normal" }}
            >
              {s}
            </Link>
          </span>
        ))}
      </div>

      {/* Search form */}
      <form method="GET" style={{ marginBottom: "1rem" }}>
        {status && <input type="hidden" name="status" value={status} />}
        <input
          type="text"
          name="q"
          defaultValue={query ?? ""}
          placeholder="Search by title..."
          style={{ padding: "0.25rem 0.5rem" }}
        />
        <button type="submit" style={{ marginLeft: "0.25rem" }}>
          Search
        </button>
        {query && (
          <Link href={clearSearchHref()} style={{ marginLeft: "0.5rem" }}>
            Clear search
          </Link>
        )}
      </form>

      {filteredItems.length === 0 ? (
        <p>
          {query || status
            ? "No items match your filter."
            : "No items yet."}
        </p>
      ) : (
        <ul>
          {filteredItems.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong> — {item.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
