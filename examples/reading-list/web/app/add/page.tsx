"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function AddItemPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });

      if (!response.ok) {
        throw new Error("Failed to add item.");
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Failed to add item. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Add Item</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="title">Title</label>
          <br />
          <input
            id="title"
            name="title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={submitting}
          />
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? "Adding…" : "Add"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
