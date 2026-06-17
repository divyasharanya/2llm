"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  // Redirect logged-in users to dashboard
  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard");
    }
  }, [status, router]);

  return (
    <div className="flex-1 flex flex-col bg-[#0D0D0D] min-h-screen font-sans overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #7C3AED 0%, transparent 70%)", animation: "float 8s ease-in-out infinite" }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #06B6D4 0%, transparent 70%)", animation: "float 10s ease-in-out infinite reverse" }} />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #EC4899 0%, transparent 70%)", animation: "float 12s ease-in-out infinite" }} />
      </div>

      <style>{`
        @keyframes float { 0%,100% { transform: translateY(0px) scale(1); } 50% { transform: translateY(-30px) scale(1.05); } }
        @keyframes gradientShift { 0% { background-position: 0% center; } 100% { background-position: 200% center; } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
        .fade-up-1 { animation: fadeUp 0.7s ease forwards; }
        .fade-up-2 { animation: fadeUp 0.7s 0.15s ease both; }
        .fade-up-3 { animation: fadeUp 0.7s 0.3s ease both; }
        .fade-up-4 { animation: fadeUp 0.7s 0.45s ease both; }
        .gradient-text {
          background: linear-gradient(135deg, #A78BFA, #7C3AED, #06B6D4, #A78BFA);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: gradientShift 4s linear infinite;
        }
        .card-glow:hover { box-shadow: 0 0 40px rgba(124,58,237,0.15); transform: translateY(-2px); }
        .card-glow { transition: all 0.3s ease; }
      `}</style>

      {/* Hero Section */}
      <main className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 pt-16 pb-16 text-center">

        {/* Badge */}
        <div className="fade-up-1 inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-8 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          Powered by Gemini 2.5 Flash + LLaMA 3.1
        </div>

        {/* Headline */}
        <h1 className="fade-up-2 text-5xl md:text-7xl font-black mb-6 leading-tight tracking-tight max-w-4xl">
          <span className="gradient-text">AI That Debates.</span>
          <br />
          <span className="text-white">AI That Destroys Code.</span>
        </h1>

        {/* Subheadline */}
        <p className="fade-up-3 text-lg md:text-xl text-gray-400 mb-10 max-w-2xl leading-relaxed">
          Two elite AI models go head-to-head on any topic — then tear apart your code with surgical precision.
          <span className="text-gray-300"> No fluff. Just intelligence.</span>
        </p>

        {/* CTA Buttons */}
        <div className="fade-up-4 flex flex-col sm:flex-row gap-4 mb-20">
          <Link
            href="/signup"
            className="group relative px-8 py-4 rounded-xl font-bold text-white text-base overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] flex items-center gap-2"
            style={{ background: "linear-gradient(135deg, #7C3AED, #6D28D9)" }}
          >
            Get Started Free
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <Link
            href="/login"
            className="px-8 py-4 rounded-xl font-bold text-gray-300 text-base border border-gray-700 hover:border-purple-500/50 hover:text-white hover:bg-white/5 transition-all duration-300"
          >
            Log in
          </Link>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full mb-16">
          <Link href="/signup" className="card-glow group bg-[#141414] border border-purple-500/10 hover:border-purple-500/30 rounded-2xl p-8 text-left block">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-5 text-2xl"
              style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(124,58,237,0.1))", border: "1px solid rgba(124,58,237,0.2)" }}>
              ⚔️
            </div>
            <h2 className="text-xl font-bold text-white mb-2 group-hover:text-purple-300 transition-colors">Debate Arena</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-4">
              Enter any topic. Watch Gemini and LLaMA argue both sides with real arguments, round by round, until a winner emerges.
            </p>
            <div className="flex flex-wrap gap-2">
              {["Multi-round", "Verdict & winner", "PDF export", "History saved"].map(tag => (
                <span key={tag} className="text-[11px] bg-purple-500/10 text-purple-400 px-2.5 py-1 rounded-full border border-purple-500/10">{tag}</span>
              ))}
            </div>
          </Link>

          <Link href="/signup" className="card-glow group bg-[#141414] border border-cyan-500/10 hover:border-cyan-500/30 rounded-2xl p-8 text-left block">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-5 text-2xl"
              style={{ background: "linear-gradient(135deg, rgba(6,182,212,0.3), rgba(6,182,212,0.1))", border: "1px solid rgba(6,182,212,0.2)" }}>
              🔍
            </div>
            <h2 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors">Code Review Duo</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-4">
              Paste your code. Gemini finds every bug. LLaMA fixes it. Get a quality score and fixed code instantly.
            </p>
            <div className="flex flex-wrap gap-2">
              {["Bug detection", "Auto-fix", "Quality score", "7 languages"].map(tag => (
                <span key={tag} className="text-[11px] bg-cyan-500/10 text-cyan-400 px-2.5 py-1 rounded-full border border-cyan-500/10">{tag}</span>
              ))}
            </div>
          </Link>
        </div>

        {/* Social proof */}
        <div className="flex flex-col items-center gap-2 text-gray-600 text-sm">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {["🧑‍💻","👩‍🔬","🧑‍🏫","👨‍💼"].map((emoji, i) => (
                <span key={i} className="w-8 h-8 rounded-full bg-[#1A1A1A] border border-gray-800 flex items-center justify-center text-sm">{emoji}</span>
              ))}
            </div>
            <span>Join developers already using AI Debate Arena</span>
          </div>
          <p className="text-gray-700 text-xs">Sign up with Google — no password, free to use</p>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-900 py-5 px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-gray-700 text-xs">
        <span className="font-semibold text-gray-600">AI Debate Arena</span>
        <span>Built with Gemini 2.5 Flash + LLaMA 3.1 + Next.js 16</span>
        <div className="flex gap-4">
          <Link href="/login" className="hover:text-gray-500 transition-colors">Log in</Link>
          <Link href="/signup" className="hover:text-gray-500 transition-colors">Sign up</Link>
        </div>
      </footer>
    </div>
  );
}