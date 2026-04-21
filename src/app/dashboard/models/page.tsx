import AppShell from "@/components/AppShell";
import { Cpu, Waves, Clapperboard, Music } from "lucide-react";

export const dynamic = "force-dynamic";

type Model = {
  id: string;
  name: string;
  kind: "llm" | "tts" | "video" | "music";
  provider: string;
  latencyMs: number;
  ctxK?: number;
};

const MODELS: Model[] = [
  { id: "aurora-chat-1", name: "Aurora Chat 1", kind: "llm", provider: "Aurora", latencyMs: 120, ctxK: 128 },
  { id: "aurora-chat-1-pro", name: "Aurora Chat 1 Pro", kind: "llm", provider: "Aurora", latencyMs: 320, ctxK: 256 },
  { id: "aria-neural", name: "Aria Neural", kind: "tts", provider: "Aurora Voice", latencyMs: 220 },
  { id: "orion-tts", name: "Orion TTS", kind: "tts", provider: "Aurora Voice", latencyMs: 260 },
  { id: "scene-x", name: "Scene-X Assembler", kind: "video", provider: "Aurora Factory", latencyMs: 1800 },
  { id: "beatsync-2", name: "BeatSync 2", kind: "music", provider: "Aurora Factory", latencyMs: 450 },
];

export default function ModelsPage() {
  return (
    <AppShell title="Models" subtitle="All pipeline modules and their latency">
      <div className="grid gap-3 md:grid-cols-2">
        {MODELS.map((m) => (
          <div key={m.id} className="panel p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Icon kind={m.kind} />
                <span className="font-medium">{m.name}</span>
              </div>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/60">
                {m.kind}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-white/60">
              <span>{m.provider}</span>
              <span>·</span>
              <span>{m.latencyMs}ms avg</span>
              {m.ctxK && (
                <>
                  <span>·</span>
                  <span>{m.ctxK}K ctx</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function Icon({ kind }: { kind: Model["kind"] }) {
  if (kind === "llm") return <Cpu className="h-4 w-4 text-violet-300" />;
  if (kind === "tts") return <Waves className="h-4 w-4 text-cyan-300" />;
  if (kind === "video") return <Clapperboard className="h-4 w-4 text-fuchsia-300" />;
  return <Music className="h-4 w-4 text-amber-300" />;
}
