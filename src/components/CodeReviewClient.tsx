"use client";

import { useState, useEffect } from "react";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Issue {
  file: string;
  line: number;
  severity: "CRITICAL" | "WARNING" | "SUGGESTION";
  description: string;
}

interface ReviewHistoryItem {
  id: string;
  language: string;
  code: string;       // first 80 chars
  fullCode: string;   // full original code
  issueCount: number;
  score: number;
  date: string;
}

interface LiveStats {
  reviews: number;
  bugs: number;
  lines: number;
  langCounts: Record<string, number>;
}

const getLangIcon = (lang: string) => {
  const icons: Record<string, string> = {
    python: "🐍", javascript: "⚡", typescript: "⚡",
    java: "☕", cpp: "⚙️", go: "🐹", rust: "🦀",
  };
  return icons[lang] || "📄";
};

const detectLanguage = (code: string): string => {
  if (/def |import |print\(|\bself\b/.test(code)) return "python";
  if (/const |let |var |=>|console\.log/.test(code)) return "javascript";
  if (/interface |: string|: number|<T>/.test(code)) return "typescript";
  if (/public static void|System\.out/.test(code)) return "java";
  if (/#include|std::/.test(code)) return "cpp";
  if (/\bfmt\.Print|\bfunc /.test(code)) return "go";
  if (/\bfn \w+\(|\blet mut\b/.test(code)) return "rust";
  return "javascript";
};

export default function CodeReviewClient() {
  const [language, setLanguage] = useState("python");
  const [input, setInput] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [geminiInfo, setGeminiInfo] = useState("");
  const [llamaFixedCode, setLlamaFixedCode] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [score, setScore] = useState(0);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState(0); // 0=idle,1=gemini,2=llama,3=report

  const [reviewHistory, setReviewHistory] = useState<ReviewHistoryItem[]>([]);

  const [liveStats, setLiveStats] = useState<LiveStats>({ reviews: 0, bugs: 0, lines: 0, langCounts: {} });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch("/api/history/list");
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      const history = data.items
        .filter((item: any) => item.type === "code-review")
        .map((item: any) => ({
          id: item.chatId,
          ...item.content
        }));
      setReviewHistory(history);

      // Compute live stats dynamically from DynamoDB history items
      let reviews = history.length;
      let bugs = 0;
      let lines = 0;
      let langCounts: Record<string, number> = {};

      history.forEach((h: any) => {
        bugs += h.issueCount || 0;
        lines += h.linesReviewed || 0;
        if (h.language) {
          langCounts[h.language] = (langCounts[h.language] || 0) + 1;
        }
      });
      setLiveStats({ reviews, bugs, lines, langCounts });
    } catch {
      showToast("Could not sync history. Retrying...");
      setTimeout(fetchHistory, 5000);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const callGemini = async (prompt: string, retries = 3): Promise<string> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "API error");
        return data.text;
      } catch (error: unknown) {
        if (attempt === retries - 1) throw error;
        await sleep(1000 * (attempt + 1));
      }
    }
    throw new Error("Max retries exceeded");
  };

  const callGroq = async (prompt: string): Promise<string> => {
    const response = await fetch("/api/groq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, max_tokens: 8000 }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "API error");
    return data.text;
  };

  const startReview = async () => {
    if (!input.trim()) return;
    const detectedLang = detectLanguage(input);
    setLanguage(detectedLang);
    setIsReviewing(true);
    setGeminiInfo("");
    setLlamaFixedCode("");
    setIssues([]);
    setScore(0);
    setStep(1);

    // Step 1: Gemini analysis
    const geminiResp = await callGemini(
      `Return ONLY a JSON array of issues. Each item: {"file":"filename","line":1,"severity":"CRITICAL|WARNING|SUGGESTION","description":"clear description"}. If no issues return []. Code:\n${input}`
    ).catch(() => "");
    setGeminiInfo(geminiResp);
    setStep(2);

    // Parse issues
    let parsedIssues: Issue[] = [];
    try {
      const clean = geminiResp.replace(/```json|```/g, "").trim();
      const jsonStart = clean.indexOf("[");
      if (jsonStart !== -1) {
        const arr = JSON.parse(clean.slice(jsonStart));
        if (Array.isArray(arr)) {
          parsedIssues = arr.map((t: Record<string, unknown>) => ({
            file: (t.file as string) || "unknown",
            line: parseInt(t.line as string) || 1,
            severity: (["CRITICAL","WARNING","SUGGESTION"].includes((t.severity as string)?.toUpperCase())
              ? (t.severity as string).toUpperCase()
              : "WARNING") as Issue["severity"],
            description: (t.description as string) || "Issue"
          }));
        }
      }
    } catch { /* ignore */ }
    setIssues(parsedIssues);

    // Step 2: LLaMA fix
    let llamaResp = "";
    try {
      llamaResp = await callGroq(
        `You are a code fixer. Fix ALL bugs in the code below. Return ONLY the fixed code in a markdown code block. Do not add docstrings or restructure working code. Only fix actual bugs.\n\n${input}`
      );
    } catch { /* ignore */ }
    const fixedMatch = llamaResp.match(/```[\w]*\n([\s\S]*?)\n```/);
    setLlamaFixedCode(fixedMatch ? fixedMatch[1] : llamaResp);
    setStep(3);

    // Step 3: Score
    const scoreResp = await callGroq(
      `Rate this code quality from 1-10. Respond with ONLY a number like "7/10".\n${input}`
    ).catch(() => "7/10");
    const m = scoreResp.match(/(\d+)\s*\/\s*10/);
    const finalScore = m ? Math.min(10, Math.max(1, Number(m[1]))) : 7;
    setScore(finalScore);
    setIsReviewing(false);
    setStep(0);

    // Save to Review History
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const content = {
      language: detectedLang,
      code: input.slice(0, 80) + (input.length > 80 ? "..." : ""),
      fullCode: input,
      issueCount: parsedIssues.length,
      score: finalScore,
      date: dateStr,
      linesReviewed: input.split("\n").length,
    };

    const saveToDb = async (attempt = 1) => {
      try {
        const res = await fetch("/api/history/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "code-review", content }),
        });
        if (!res.ok) throw new Error("Failed to save");
        const data = await res.json();
        
        // Update history and stats locally
        setReviewHistory(prev => {
          const updated = [{ id: data.chatId, ...content }, ...prev];
          
          // Compute new stats
          let reviews = updated.length;
          let bugs = 0;
          let lines = 0;
          let langCounts: Record<string, number> = {};

          updated.forEach((h: any) => {
            bugs += h.issueCount || 0;
            lines += h.linesReviewed || 0;
            if (h.language) {
              langCounts[h.language] = (langCounts[h.language] || 0) + 1;
            }
          });
          setLiveStats({ reviews, bugs, lines, langCounts });
          
          return updated;
        });
      } catch {
        showToast("Could not sync history. Retrying...");
        setTimeout(() => saveToDb(attempt + 1), 5000);
      }
    };
    await saveToDb();
  };

  const loadReview = (item: ReviewHistoryItem) => {
    setInput(item.fullCode);
    setLanguage(item.language);
  };

  const clearHistory = async () => {
    const itemsToDelete = [...reviewHistory];
    setReviewHistory([]);
    setLiveStats({ reviews: 0, bugs: 0, lines: 0, langCounts: {} });

    for (const item of itemsToDelete) {
      const deleteItem = async (attempt = 1) => {
        try {
          const res = await fetch(`/api/history/${item.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Failed to delete");
        } catch {
          showToast("Could not sync history. Retrying...");
          setTimeout(() => deleteItem(attempt + 1), 5000);
        }
      };
      await deleteItem();
    }
  };

  const copyCode = async () => {
    if (!llamaFixedCode) return;
    await navigator.clipboard.writeText(llamaFixedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const topLang = Object.entries(liveStats.langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

  const severityColor: Record<string, string> = {
    CRITICAL: "border-red-500 bg-red-900/20 text-red-400",
    WARNING: "border-yellow-500 bg-yellow-900/20 text-yellow-400",
    SUGGESTION: "border-blue-500 bg-blue-900/20 text-blue-400",
  };

  const scoreColor = score >= 8 ? "text-green-400" : score >= 5 ? "text-yellow-400" : "text-red-400";
  const scoreRing = score >= 8 ? "#22c55e" : score >= 5 ? "#eab308" : "#ef4444";

  return (
    <div
      className="flex-1 flex flex-col items-center p-6 bg-[#0D0D0D] min-h-screen font-sans"
      style={{ position: "relative" }}
    >
      {/* Animated top gradient line */}
      <div
        className="fixed top-0 left-0 right-0 h-[3px] z-50"
        style={{
          background: "linear-gradient(90deg, #7C3AED, #06B6D4, #7C3AED)",
          backgroundSize: "200% auto",
          animation: "gradientShift 3s linear infinite",
        }}
      />
      <style>{`
        @keyframes gradientShift { 0% { background-position: 0% center; } 100% { background-position: 200% center; } }
        @keyframes slideIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .slide-in { animation: slideIn 0.35s ease forwards; }
        @keyframes pulseBorder {
          0%,100% { border-color: rgba(124,58,237,0.2); box-shadow: 0 0 0 0 transparent; }
          50% { border-color: rgba(124,58,237,0.7); box-shadow: 0 0 14px rgba(124,58,237,0.25); }
        }
        .pulse-border-active { animation: pulseBorder 1.6s ease-in-out infinite; }
      `}</style>

      <div className="w-full max-w-7xl flex flex-col md:flex-row gap-8 mt-6">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="w-full md:w-[260px] shrink-0 flex flex-col gap-5 bg-[#141414] border border-purple-500/10 rounded-2xl p-5 shadow-[0_0_30px_rgba(124,58,237,0.04)] self-start">

          {/* Review History */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-white font-bold text-sm flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Review History
              </h4>
              {reviewHistory.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
                  title="Clear all history"
                >
                  Clear
                </button>
              )}
            </div>

            {isLoadingHistory ? (
              <div className="flex flex-col items-center gap-2 py-6 bg-[#0D0D0D]/50 rounded-xl border border-dashed border-purple-500/10">
                <span className="text-xl animate-spin text-purple-400">🌀</span>
                <p className="text-gray-600 text-[11px] italic text-center">Syncing history...</p>
              </div>
            ) : reviewHistory.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 bg-[#0D0D0D]/50 rounded-xl border border-dashed border-purple-500/10">
                <span className="text-2xl opacity-30">📋</span>
                <p className="text-gray-600 text-[11px] italic text-center">No reviews yet.<br/>Start reviewing code!</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 scrollbar-thin">
                {reviewHistory.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadReview(item)}
                    className="w-full text-left bg-[#0D0D0D] border border-purple-500/5 hover:border-purple-500/30 hover:bg-[#1A1A1A] p-3 rounded-xl transition-all flex flex-col gap-1.5 group"
                  >
                    {/* Top row: lang badge + date */}
                    <div className="flex items-center justify-between">
                      <span className="bg-purple-500/15 text-purple-300 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                        {getLangIcon(item.language)} {item.language}
                      </span>
                      <span className="text-[10px] text-gray-600">{item.date}</span>
                    </div>
                    {/* Code preview */}
                    <p className="text-[#A1A1AA] text-[11px] font-mono leading-snug line-clamp-2 group-hover:text-gray-300 transition-colors">
                      {item.code}
                    </p>
                    {/* Stats */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-600">{item.issueCount} issues found</span>
                      <span className={`text-[10px] font-bold ${
                        item.score >= 8 ? "text-green-400" : item.score >= 5 ? "text-yellow-400" : "text-red-400"
                      }`}>Score: {item.score}/10</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-purple-500/10" />

          {/* Live Stats */}
          <div>
            <h4 className="text-white font-bold text-sm flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Live Stats
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: "🔍", value: liveStats.reviews, label: "Reviews Done", color: "text-purple-400" },
                { icon: "🐛", value: liveStats.bugs, label: "Bugs Found", color: "text-red-400" },
                { icon: "📄", value: liveStats.lines, label: "Lines Reviewed", color: "text-cyan-400" },
                { icon: "🏆", value: topLang, label: "Most Used", color: "text-yellow-400" },
              ].map((stat) => (
                <div key={stat.label} className="bg-[#0D0D0D] rounded-xl p-3 text-center border border-purple-500/5 hover:border-purple-500/15 transition-colors">
                  <span className="text-base block mb-0.5">{stat.icon}</span>
                  <p className={`font-bold text-sm ${stat.color}`}>{stat.value}</p>
                  <p className="text-gray-600 text-[10px] leading-tight">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── MAIN AREA ── */}
        <main className="flex-1 flex flex-col gap-6 min-w-0">

          {/* Title + badges */}
          <div>
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] via-purple-400 to-[#06B6D4] mb-3">
              Code Review Duo
            </h1>
            <div className="flex flex-wrap gap-2">
              {[
                { text: "⚡ Powered by Gemini + LLaMA", color: "border-purple-500/20 text-purple-300" },
                { text: "🔍 Detects 50+ bug types", color: "border-cyan-500/20 text-cyan-300" },
                { text: "🌐 10 languages supported", color: "border-blue-500/20 text-blue-300" },
              ].map((b) => (
                <span key={b.text} className={`text-[11px] px-3 py-1 rounded-full border bg-[#141414] ${b.color}`}>{b.text}</span>
              ))}
            </div>
          </div>

          {/* Language selector row */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-gray-500 text-xs">Language:</span>
            {["python","javascript","typescript","java","cpp","go","rust"].map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`text-[11px] px-3 py-1 rounded-full border transition-all ${
                  language === l
                    ? "bg-purple-600/20 border-purple-500/60 text-white"
                    : "bg-[#141414] border-purple-500/10 text-gray-500 hover:text-gray-300 hover:border-purple-500/30"
                }`}
              >
                {getLangIcon(l)} {l}
              </button>
            ))}
          </div>

          {/* Textarea */}
          <div className={`relative rounded-2xl overflow-hidden border-2 transition-all ${
            isReviewing ? "pulse-border-active border-purple-500/40" : "border-purple-500/20 hover:border-purple-500/40"
          }`}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") startReview(); }}
              placeholder="Paste your code here... (Ctrl+Enter to review)"
              className="w-full h-52 bg-[#141414] text-white p-4 font-mono text-sm resize-none placeholder-gray-700 focus:outline-none"
              disabled={isReviewing}
            />
            <div className="absolute bottom-2 right-3 text-[10px] text-gray-700 font-mono">
              {input.split("\n").length} lines · {input.length} chars
            </div>
          </div>

          {/* Start Review button */}
          <button
            onClick={startReview}
            disabled={isReviewing || !input.trim()}
            className="w-full bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all text-sm uppercase tracking-widest shadow-[0_0_20px_rgba(124,58,237,0.3)]"
          >
            {isReviewing ? "Reviewing..." : "⚡ Start Review"}
          </button>

          {/* Step Indicator */}
          {isReviewing && (
            <div className="slide-in bg-[#141414] border border-purple-500/10 rounded-xl p-4 flex flex-col gap-3">
              {[
                { s: 1, label: "Gemini scanning for bugs...", done: step > 1 },
                { s: 2, label: "LLaMA fixing the code...", done: step > 2 },
                { s: 3, label: "Building report...", done: step > 3 },
              ].map(({ s, label, done }) => (
                <div key={s} className={`flex items-center gap-3 transition-all ${
                  step === s ? "opacity-100" : step > s ? "opacity-60" : "opacity-25"
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                    done ? "bg-green-500/20 border-green-500 text-green-400" :
                    step === s ? "border-purple-500 text-purple-400 animate-pulse" :
                    "border-gray-700 text-gray-600"
                  }`}>
                    {done ? "✓" : s}
                  </div>
                  <span className={`text-sm ${
                    done ? "text-green-400" : step === s ? "text-purple-300" : "text-gray-600"
                  }`}>{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Results — 2 columns */}
          {(geminiInfo || llamaFixedCode) && !isReviewing && (
            <div className="slide-in grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Gemini — Bug Scanner */}
              <div className="bg-[#141414] rounded-2xl p-5 border-l-4 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.05)]">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">🤖</span>
                  <h3 className="text-cyan-400 font-bold text-sm uppercase tracking-wider">Gemini — Bug Scanner</h3>
                </div>

                {issues.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <span className="text-3xl">✅</span>
                    <p className="text-green-400 font-semibold text-sm">No issues found!</p>
                    <p className="text-gray-600 text-xs">Code looks clean.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {["CRITICAL","WARNING","SUGGESTION"].map((sev) => {
                      const filtered = issues.filter(i => i.severity === sev);
                      if (filtered.length === 0) return null;
                      return (
                        <div key={sev}>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">{sev} ({filtered.length})</p>
                          {filtered.map((issue, idx) => (
                            <div key={idx} className={`p-3 rounded-xl border-l-4 mb-2 ${severityColor[sev]}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-mono text-gray-400">{issue.file}:{issue.line}</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                  sev === "CRITICAL" ? "bg-red-900/40" : sev === "WARNING" ? "bg-yellow-900/40" : "bg-blue-900/40"
                                }`}>{sev}</span>
                              </div>
                              <p className="text-white text-xs leading-relaxed">{issue.description}</p>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* LLaMA — Auto Fix */}
              <div className="bg-[#141414] rounded-2xl p-5 border-l-4 border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.05)]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🔥</span>
                    <h3 className="text-orange-400 font-bold text-sm uppercase tracking-wider">LLaMA — Auto Fix</h3>
                  </div>
                  {llamaFixedCode && (
                    <button
                      onClick={copyCode}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                        copied
                          ? "bg-green-500/20 border-green-500/40 text-green-400"
                          : "bg-[#0D0D0D] border-orange-500/20 text-orange-400 hover:border-orange-500/50"
                      }`}
                    >
                      {copied ? (
                        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Copied!</>
                      ) : (
                        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy</>
                      )}
                    </button>
                  )}
                </div>
                {llamaFixedCode ? (
                  <div className="max-h-72 overflow-y-auto rounded-xl">
                    <SyntaxHighlighter
                      language={language}
                      style={vscDarkPlus}
                      showLineNumbers={true}
                      customStyle={{ margin: 0, background: "#0D0D0D", fontSize: "12px", borderRadius: "10px" }}
                    >
                      {llamaFixedCode}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm italic">Waiting for fix...</p>
                )}
              </div>
            </div>
          )}

          {/* Score card */}
          {!isReviewing && score > 0 && (
            <div className="slide-in bg-[#141414] border border-purple-500/10 rounded-2xl p-5 flex items-center gap-6">
              <div className="relative w-20 h-20 shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1f1f1f" strokeWidth="3.5" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke={scoreRing} strokeWidth="3.5"
                    strokeDasharray={`${score * 10} 100`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 1s ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-xl font-black ${scoreColor}`}>{score}</span>
                </div>
              </div>
              <div>
                <h4 className="text-base font-bold text-white mb-1">Code Quality Score</h4>
                <p className="text-[#A1A1AA] text-xs leading-relaxed max-w-sm">
                  {score >= 8 ? "Excellent structure. Minimal bugs or security concerns." :
                   score >= 5 ? "Average quality. Some bugs or edge-cases need attention." :
                   "Poor quality. Multiple logical faults or crash vectors found."}
                </p>
                <p className="text-xs text-purple-400 font-semibold mt-1.5">
                  {issues.filter(i => i.severity === "CRITICAL").length} critical ·{" "}
                  {issues.filter(i => i.severity === "WARNING").length} warnings ·{" "}
                  {issues.filter(i => i.severity === "SUGGESTION").length} suggestions
                </p>
              </div>
            </div>
          )}

          {/* Bottom actions */}
          {!isReviewing && score > 0 && (
            <div className="slide-in flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => { setInput(""); setGeminiInfo(""); setLlamaFixedCode(""); setIssues([]); setScore(0); setStep(0); }}
                className="flex-1 bg-[#141414] hover:bg-[#1a1a1a] border border-purple-500/10 hover:border-purple-500/30 text-gray-300 font-bold py-3 px-5 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Start New Review
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-red-950/90 border border-red-500 text-red-300 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}