import { NextResponse } from "next/server";
import { addItem, getItems } from "@/lib/store";

export async function GET() {
  const items = await getItems();
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const item = await addItem(title);
  return NextResponse.json(item, { status: 201 });
}
