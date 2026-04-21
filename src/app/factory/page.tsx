import AppShell from "@/components/AppShell";
import FactoryConsole from "./FactoryConsole";
import { listJobs } from "@/lib/factory";

export const dynamic = "force-dynamic";

export default function FactoryPage() {
  const jobs = listJobs();
  return (
    <AppShell
      title="Production Factory"
      subtitle="TTS voiceover · Scene assembly · Music synchronization"
    >
      <FactoryConsole initialJobs={jobs} />
    </AppShell>
  );
}
