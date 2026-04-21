import { NextRequest, NextResponse } from "next/server";

type Message = { role: "user" | "assistant"; content: string };

// Simple deterministic mock. Swap with a real LLM by wiring an API call here.
function generateReply(messages: Message[]): string {
  const last = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  const lower = last.toLowerCase();

  if (lower.includes("video") || lower.includes("production") || lower.includes("factory")) {
    return "I can dispatch this to the Production Factory. Open /factory, paste your script, pick a voice and music mood, and I'll run TTS → Scene Assembly → Music Sync → Render.";
  }
  if (lower.includes("hello") || lower.includes("hi ") || lower.startsWith("hi") || lower.startsWith("hey")) {
    return "Hey — what do you want to build today? I can plan a video, draft a script, or run a full production.";
  }
  if (!last) {
    return "Type something and I'll respond.";
  }
  return `Noted: "${last}". (Aurora is running in demo mode — connect an LLM in /api/chat/route.ts to enable real responses.)`;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { messages?: Message[] };
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const reply = generateReply(messages);
  return NextResponse.json({ reply });
}
