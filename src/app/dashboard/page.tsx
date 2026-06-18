"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface HistoryStats {
  debates: number;
  codeReviews: number;
  total: number;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<HistoryStats>({ debates: 0, codeReviews: 0, total: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    console.log("RAW SESSION OBJECT:", JSON.stringify(session, null, 2));
    console.log("SESSION STATUS:", status);
  }, [session, status]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const fetchStats = async () => {
      try {
        setStatsLoading(true);
        const res = await fetch("/api/history/list");
        if (!res.ok) {
          console.error("History list failed:", await res.text());
          return;
        }
        const data = await res.json();
        const items: any[] = data.items ?? [];
        const debates = items.filter((i) => i.type === "debate").length;
        const codeReviews = items.filter((i) => i.type === "code-review").length;
        setStats({ debates, codeReviews, total: items.length });
      } catch (err) {
        console.error("Failed to fetch history stats:", err);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [status, session?.user?.email]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0D0D0D] min-h-screen">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0D0D0D] min-h-screen font-sans">
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .fade-up-1 { animation: fadeUp 0.5s ease forwards; }
        .fade-up-2 { animation: fadeUp 0.5s 0.1s ease both; }
        .fade-up-3 { animation: fadeUp 0.5s 0.2s ease both; }
        .card-hover { transition: all 0.3s ease; }
        .card-hover:hover { transform: translateY(-4px); }
      `}</style>

      {/* Background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-[-10%] w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #7C3AED 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 right-[-10%] w-[400px] h-[400px] rounded-full opacity-8"
          style={{ background: "radial-gradient(circle, #06B6D4 0%, transparent 70%)" }} />
      </div>

      <main className="relative z-10 flex flex-col items-center px-6 pt-12 pb-20">

        {/* Welcome banner */}
        <div className="fade-up-1 w-full max-w-5xl mb-8">
          <div className="bg-[#141414] border border-purple-500/10 rounded-2xl px-8 py-6 flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm mb-1">Welcome back 👋</p>
              <h1 className="text-2xl font-black text-white">
                {session?.user?.name?.split(" ")[0] ?? "Friend"},&nbsp;
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                  what are we doing today?
                </span>
              </h1>
            </div>
            {session?.user?.image && (
              <img
                src={session.user.image}
                alt={session.user.name ?? "User"}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full border-2 border-purple-500/30 shadow-[0_0_20px_rgba(124,58,237,0.3)]"
              />
            )}
          </div>
        </div>

        {/* Feature cards */}
        <div className="fade-up-2 w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">

          {/* Debate Arena */}
          <Link href="/debate" className="card-hover group block">
            <div className="h-full bg-[#141414] border border-purple-500/10 group-hover:border-purple-500/40 rounded-2xl p-8 shadow-[0_0_0_0_rgba(124,58,237,0)] group-hover:shadow-[0_0_40px_rgba(124,58,237,0.15)] transition-all">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-5 text-2xl"
                style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.25), rgba(124,58,237,0.08))", border: "1px solid rgba(124,58,237,0.2)" }}>
                ⚔️
              </div>
              <h2 className="text-xl font-bold text-white mb-2 group-hover:text-purple-300 transition-colors">Debate Arena</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-5">
                Enter any topic and watch Gemini vs LLaMA argue both sides. A judge picks the winner.
              </p>
              <div className="flex flex-wrap gap-2 mb-5">
                {["Multi-round", "Auto verdict", "PDF export", "Saved history"].map(t => (
                  <span key={t} className="text-[11px] bg-purple-500/10 text-purple-400 px-2.5 py-1 rounded-full border border-purple-500/10">{t}</span>
                ))}
              </div>
              <div className="flex items-center gap-2 text-purple-400 text-sm font-semibold group-hover:gap-3 transition-all">
                Launch Debate
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Code Review */}
          <Link href="/code-review" className="card-hover group block">
            <div className="h-full bg-[#141414] border border-cyan-500/10 group-hover:border-cyan-500/40 rounded-2xl p-8 shadow-[0_0_0_0_rgba(6,182,212,0)] group-hover:shadow-[0_0_40px_rgba(6,182,212,0.12)] transition-all">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-5 text-2xl"
                style={{ background: "linear-gradient(135deg, rgba(6,182,212,0.25), rgba(6,182,212,0.08))", border: "1px solid rgba(6,182,212,0.2)" }}>
                🔍
              </div>
              <h2 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors">Code Review Duo</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-5">
                Paste your code. Gemini finds bugs. LLaMA fixes them. Get a quality score instantly.
              </p>
              <div className="flex flex-wrap gap-2 mb-5">
                {["Bug detection", "Auto-fix", "Quality score", "7 languages"].map(t => (
                  <span key={t} className="text-[11px] bg-cyan-500/10 text-cyan-400 px-2.5 py-1 rounded-full border border-cyan-500/10">{t}</span>
                ))}
              </div>
              <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold group-hover:gap-3 transition-all">
                Launch Review
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </Link>
        </div>

        {/* Stats strip */}
        <div className="fade-up-3 w-full max-w-5xl grid grid-cols-3 gap-4">
          {[
            {
              icon: "⚔️",
              label: "Debates run",
              value: statsLoading ? "…" : stats.debates.toString(),
              color: "text-purple-400",
            },
            {
              icon: "🔍",
              label: "Code reviews",
              value: statsLoading ? "…" : stats.codeReviews.toString(),
              color: "text-cyan-400",
            },
            {
              icon: "💾",
              label: "Total saved",
              value: statsLoading ? "…" : stats.total.toString(),
              color: "text-green-400",
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-[#141414] border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-3">
              <span className="text-xl">{stat.icon}</span>
              <div>
                <p className={`font-bold text-sm ${stat.color}`}>
                  {stat.value}
                </p>
                <p className="text-gray-600 text-xs">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
