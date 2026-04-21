import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  Clapperboard,
  MessageCircle,
  Music,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";
import { isGateVerified } from "@/lib/session";

export const dynamic = "force-dynamic";

const WHATSAPP_URL = "https://wa.me/996500904998";

export default async function LandingPage() {
  if (await isGateVerified()) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div aria-hidden className="absolute inset-0 grid-bg" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-20 pb-24 sm:pt-28">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-white/70">
          <Sparkles className="h-3.5 w-3.5 text-fuchsia-400" />
          Aurora AI · Private Preview
        </div>

        <h1 className="max-w-3xl text-center text-4xl font-semibold tracking-tight text-white sm:text-6xl">
          A faster, smarter AI platform.
          <span className="block bg-gradient-to-r from-violet-400 via-cyan-300 to-pink-400 bg-clip-text text-transparent">
            Production factory built in.
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-center text-base text-white/70 sm:text-lg">
          Voiceovers, scene assembly, music sync — automated end-to-end.
          Verify via WhatsApp to unlock the dashboard.
        </p>

        <section className="mt-10 w-full max-w-xl">
          <div className="panel glow-ring relative overflow-hidden p-6 sm:p-8">
            <div className="flex items-center gap-3 text-sm text-white/70">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Entry Guard · verification required</span>
            </div>

            <h2 className="mt-3 text-2xl font-semibold text-white">
              Verify via WhatsApp to continue
            </h2>
            <p className="mt-2 text-sm text-white/60">
              Tap the button below. It opens WhatsApp to our verification line
              and unlocks the dashboard on this device.
            </p>

            <form action="/api/verify" method="POST" className="mt-6">
              <input type="hidden" name="next" value="/dashboard" />
              <button
                type="submit"
                formTarget="_blank"
                className="btn-primary group flex w-full items-center justify-center gap-3 px-5 py-4 text-base"
              >
                <MessageCircle className="h-5 w-5" />
                Verify via WhatsApp
                <span className="ml-2 rounded-md bg-black/20 px-2 py-0.5 text-[11px] font-normal tracking-wider text-white/90">
                  +996 500 904 998
                </span>
              </button>
            </form>

            <p className="mt-4 text-xs text-white/50">
              By continuing you agree to receive a verification message on
              WhatsApp. We don&apos;t store your number.
            </p>

            <div className="mt-6 flex items-center justify-between text-xs text-white/50">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-4 hover:text-white hover:underline"
              >
                Open WhatsApp manually
              </a>
              <Link href="/admin/login" className="hover:text-white">
                Admin sign-in →
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-20 grid w-full max-w-5xl gap-4 sm:grid-cols-3">
          <Feature
            icon={<Waves className="h-5 w-5 text-cyan-300" />}
            title="Neural TTS"
            body="Studio-grade voiceovers in multiple tones and languages."
          />
          <Feature
            icon={<Clapperboard className="h-5 w-5 text-fuchsia-300" />}
            title="Scene Assembly"
            body="Scripts become timed scenes with transitions, automatically."
          />
          <Feature
            icon={<Music className="h-5 w-5 text-violet-300" />}
            title="Music Sync"
            body="Tempo, cuts and beats locked to every edit."
          />
        </section>

        <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/60">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Sub-second UI
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Automated production line
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Full admin control
          </li>
        </ul>
      </main>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/60">
        {icon}
        {title}
      </div>
      <p className="mt-2 text-sm text-white/80">{body}</p>
    </div>
  );
}
