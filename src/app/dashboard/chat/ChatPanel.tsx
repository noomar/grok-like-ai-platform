"use client";

import { Send, Sparkles, User } from "lucide-react";
import { useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi — I'm Aurora. Ask me anything, or tell me to plan a video production and I'll dispatch it to the Factory.",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    setPending(true);
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: next }),
    });
    const data = (await res.json()) as { reply: string };
    setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    setPending(false);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 10);
  }

  return (
    <div className="panel flex h-[calc(100vh-160px)] flex-col overflow-hidden">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-cyan-400">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
            )}
            <div
              className={`max-w-[75ch] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 text-white"
                  : "bg-white/5 text-white/85"
              }`}
            >
              {m.content}
            </div>
            {m.role === "user" && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10">
                <User className="h-3.5 w-3.5 text-white/80" />
              </div>
            )}
          </div>
        ))}
        {pending && (
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-cyan-400">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="rounded-2xl bg-white/5 px-4 py-2.5 text-sm text-white/60">
              <span className="pulse-soft">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="border-t border-white/5 p-3">
        <div className="panel-tight flex items-center gap-2 px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Aurora…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="btn-primary inline-flex items-center gap-2 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" /> Send
          </button>
        </div>
      </form>
    </div>
  );
}
