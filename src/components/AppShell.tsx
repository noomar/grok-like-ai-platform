import Link from "next/link";
import {
  Cpu,
  Factory,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { ReactNode } from "react";

type NavItem = { href: string; label: string; icon: ReactNode };

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: "/factory", label: "Production Factory", icon: <Factory className="h-4 w-4" /> },
  { href: "/dashboard/chat", label: "Ask Aurora", icon: <MessageSquare className="h-4 w-4" /> },
  { href: "/dashboard/models", label: "Models", icon: <Cpu className="h-4 w-4" /> },
];

export default function AppShell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-1">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-white/5 bg-black/30 backdrop-blur-xl md:flex md:flex-col">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-[0_0_24px_-4px_rgba(124,58,237,0.8)]">
            <Sparkles className="absolute inset-0 m-auto h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide text-white">Aurora AI</div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">Factory Mode</div>
          </div>
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-3 py-4">
          <form action="/api/verify/logout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              End session
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-black/40 px-6 py-4 backdrop-blur-xl">
          <div>
            <h1 className="text-lg font-semibold text-white">{title}</h1>
            {subtitle && <p className="text-xs text-white/60">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
