import AppShell from "@/components/AppShell";
import ChatPanel from "./ChatPanel";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <AppShell title="Ask Aurora" subtitle="Conversational AI with streaming responses">
      <ChatPanel />
    </AppShell>
  );
}
