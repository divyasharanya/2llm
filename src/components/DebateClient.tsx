"use client";

import { useState, useEffect } from "react";
import jsPDF from "jspdf";
import DocumentUpload, { RagChunk, retrieveRagContext, formatRagContext } from "@/components/DocumentUpload";

interface Argument {
  round: number;
  text: string;
  wordCount: number;
}

interface DebateSave {
  id: string;
  topic: string;
  rounds: number;
  winner: "FOR" | "AGAINST" | "DRAW";
  date: string;
  forArgs: Argument[];
  againstArgs: Argument[];
  verdict: string;
}

interface DebateStats {
  totalDebates: number;
  totalRounds: number;
  forWins: number;
  againstWins: number;
  categoryCounts: Record<string, number>;
}

const TOPIC_SUGGESTIONS: Record<string, string[]> = {
  Technology: [
    "Should AI replace software engineers?",
    "Is social media doing more harm than good?",
    "Should self-driving cars be fully legal?",
  ],
  Ethics: [
    "Is universal basic income morally justified?",
    "Should genetic engineering on humans be allowed?",
    "Is capital punishment ever ethical?",
  ],
  Science: [
    "Should we prioritize Mars colonization over Earth's problems?",
    "Is nuclear energy the future of clean power?",
    "Should animal testing be banned entirely?",
  ],
  Politics: [
    "Should voting be mandatory for all citizens?",
    "Is democracy the best form of government?",
    "Should social media platforms be regulated by governments?",
  ],
  Business: [
    "Should a 4-day work week become the global standard?",
    "Is remote work better than working in an office?",
    "Should big tech companies be broken up?",
  ],
  Environment: [
    "Should governments ban single-use plastics entirely?",
    "Is veganism the only sustainable diet?",
    "Should carbon taxes be mandatory worldwide?",
  ],
};

const CATEGORY_ICONS: Record<string, string> = {
  Technology: "💻", Ethics: "⚖️", Science: "🔬",
  Politics: "🏛️", Business: "💼", Environment: "🌿",
};

export default function DebateClient() {
  const [topic, setTopic] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [language, setLanguage] = useState("English");
  const [rounds, setRounds] = useState(2);
  const [currentRound, setCurrentRound] = useState(0);
  const [forArguments, setForArguments] = useState<Argument[]>([]);
  const [againstArguments, setAgainstArguments] = useState<Argument[]>([]);
  const [verdict, setVerdict] = useState("");
  const [winner, setWinner] = useState<"FOR" | "AGAINST" | "DRAW" | "">("");
  const [confidence, setConfidence] = useState(50);
  const [isDebating, setIsDebating] = useState(false);
  const [debateComplete, setDebateComplete] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0=idle,1=gemini,2=llama,3=verdict
  const [shareMsg, setShareMsg] = useState(false);

  // ── RAG state ────────────────────────────────────────────────────────────────
  const [ragDocumentId, setRagDocumentId] = useState<string | null>(null);
  const [ragFileName, setRagFileName] = useState("");
  const [ragChunkCount, setRagChunkCount] = useState(0);
  // per-round sources: map of round number -> chunks for FOR and AGAINST
  const [ragForSources, setRagForSources] = useState<Record<number, RagChunk[]>>({});
  const [ragAgainstSources, setRagAgainstSources] = useState<Record<number, RagChunk[]>>({});
  const [openSourcePanel, setOpenSourcePanel] = useState<string | null>(null); // "for-1", "against-2" etc.

  const [debateHistory, setDebateHistory] = useState<DebateSave[]>([]);

  const [debateStats, setDebateStats] = useState<DebateStats>({ totalDebates: 0, totalRounds: 0, forWins: 0, againstWins: 0, categoryCounts: {} });

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
        .filter((item: any) => item.type === "debate")
        .map((item: any) => ({
          id: item.chatId,
          ...item.content
        }));
      setDebateHistory(history);

      // Compute stats in-memory dynamically from DynamoDB history items
      let totalDebates = history.length;
      let totalRounds = 0;
      let forWins = 0;
      let againstWins = 0;
      let categoryCounts: Record<string, number> = {};

      history.forEach((h: any) => {
        totalRounds += h.rounds || 0;
        if (h.winner === "FOR") forWins++;
        if (h.winner === "AGAINST") againstWins++;
        if (h.category) {
          categoryCounts[h.category] = (categoryCounts[h.category] || 0) + 1;
        }
      });
      setDebateStats({ totalDebates, totalRounds, forWins, againstWins, categoryCounts });
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

  // ── RAG context retrieval ─────────────────────────────────────────────────
  const getContext = async (query: string, topK = 5): Promise<string> => {
    if (!ragDocumentId) return "";
    const chunks = await retrieveRagContext(ragDocumentId, query, topK);
    return formatRagContext(chunks);
  };

  const getContextChunks = async (query: string, topK = 5): Promise<RagChunk[]> => {
    if (!ragDocumentId) return [];
    return retrieveRagContext(ragDocumentId, query, topK);
  };

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
      body: JSON.stringify({ prompt, max_tokens: 300 }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "API error");
    return data.text;
  };

  const parseWinner = (verdictText: string): "FOR" | "AGAINST" | "DRAW" => {
    const upper = verdictText.toUpperCase();
    const forScore = (upper.match(/\bFOR\b/g) || []).length;
    const againstScore = (upper.match(/\bAGAINST\b/g) || []).length;
    if (Math.abs(forScore - againstScore) <= 1) return "DRAW";
    return forScore > againstScore ? "FOR" : "AGAINST";
  };

  const startDebate = async () => {
    if (!topic.trim()) return;
    setIsDebating(true);
    setCurrentRound(0);
    setForArguments([]);
    setAgainstArguments([]);
    setVerdict("");
    setWinner("");
    setDebateComplete(false);
    setStep(1);

    const localFor: Argument[] = [];
    const localAgainst: Argument[] = [];

    for (let i = 1; i <= rounds; i++) {
      setCurrentRound(i);

      // Gemini — FOR
      setTyping("for");
      setStep(1);
      const forQuery = `${topic} — arguments in favour, benefits, positive case`;
      const [forContext, forChunks] = await Promise.all([
        getContext(forQuery),
        getContextChunks(forQuery),
      ]);
      const forResp = await callGemini(
        `You are debating FOR the following topic. Give 2-3 strong, specific arguments in ${language}. Be concise and convincing. Max 150 words.${forContext}\nTopic: "${topic}"\nRound ${i} of ${rounds}.${
          ragDocumentId ? "\nYou MUST reference at least one fact or quote from the document context above, citing as [Doc]." : ""
        }`
      ).catch(() => "Could not generate argument.");
      const newFor: Argument = { round: i, text: forResp, wordCount: forResp.split(/\s+/).length };
      localFor.push(newFor);
      setForArguments(prev => [...prev, newFor]);
      if (forChunks.length > 0) setRagForSources(prev => ({ ...prev, [i]: forChunks }));

      // LLaMA — AGAINST
      setTyping("against");
      setStep(2);
      const againstQuery = `${topic} — arguments against, risks, negative case, counter-arguments`;
      const [againstContext, againstChunks] = await Promise.all([
        getContext(againstQuery),
        getContextChunks(againstQuery),
      ]);
      const againstResp = await callGroq(
        `You are debating AGAINST the following topic. Directly rebut the FOR side and give strong counter-arguments in ${language}. Be concise and direct. Max 150 words.${againstContext}\nTopic: "${topic}"\nRound ${i} of ${rounds}.${
          ragDocumentId ? "\nYou MUST reference at least one fact or quote from the document context above, citing as [Doc]." : ""
        }`
      ).catch(() => "Could not generate argument.");
      const newAgainst: Argument = { round: i, text: againstResp, wordCount: againstResp.split(/\s+/).length };
      localAgainst.push(newAgainst);
      setAgainstArguments(prev => [...prev, newAgainst]);
      if (againstChunks.length > 0) setRagAgainstSources(prev => ({ ...prev, [i]: againstChunks }));
    }

    setTyping(null);
    setStep(3);

    // Verdict
    const verdictPrompt = `You are a neutral debate judge. The topic is: "${topic}".\n\nFOR arguments:\n${localFor.map(a => `Round ${a.round}: ${a.text}`).join("\n")}\n\nAGAINST arguments:\n${localAgainst.map(a => `Round ${a.round}: ${a.text}`).join("\n")}\n\nGive:\n1. Which side won (FOR or AGAINST) and why in 1-2 sentences\n2. Three key takeaways from this debate as bullet points\n3. End with: "FOR argument was X% stronger" where X is a number between 51-75.`;
    const finalVerdict = await callGemini(verdictPrompt).catch(() => "Verdict unavailable.");
    setVerdict(finalVerdict);

    const detectedWinner = parseWinner(finalVerdict);
    setWinner(detectedWinner);

    // Parse confidence
    const confMatch = finalVerdict.match(/(\d+)%\s*stronger/);
    setConfidence(confMatch ? parseInt(confMatch[1]) : 55);

    setDebateComplete(true);
    setIsDebating(false);
    setStep(0);
    // Save to history
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const content = {
      topic,
      rounds,
      winner: detectedWinner,
      date: dateStr,
      forArgs: localFor,
      againstArgs: localAgainst,
      verdict: finalVerdict,
      category: selectedCategory,
    };

    const saveToDb = async (attempt = 1) => {
      try {
        const res = await fetch("/api/history/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "debate", content }),
        });
        if (!res.ok) throw new Error("Failed to save");
        const data = await res.json();
        
        // Update history and stats locally
        setDebateHistory(prev => {
          const updated = [{ id: data.chatId, ...content }, ...prev];
          
          // Compute new stats
          let totalDebates = updated.length;
          let totalRounds = 0;
          let forWins = 0;
          let againstWins = 0;
          let categoryCounts: Record<string, number> = {};

          updated.forEach((h: any) => {
            totalRounds += h.rounds || 0;
            if (h.winner === "FOR") forWins++;
            if (h.winner === "AGAINST") againstWins++;
            if (h.category) {
              categoryCounts[h.category] = (categoryCounts[h.category] || 0) + 1;
            }
          });
          setDebateStats({ totalDebates, totalRounds, forWins, againstWins, categoryCounts });
          
          return updated;
        });
      } catch {
        showToast("Could not sync history. Retrying...");
        setTimeout(() => saveToDb(attempt + 1), 5000);
      }
    };
    await saveToDb();
  };

  const loadDebate = (save: DebateSave) => {
    setTopic(save.topic);
    setRounds(save.rounds);
    setForArguments(save.forArgs);
    setAgainstArguments(save.againstArgs);
    setVerdict(save.verdict);
    setWinner(save.winner);
    setDebateComplete(true);
    setIsDebating(false);
  };

  const clearHistory = async () => {
    const itemsToDelete = [...debateHistory];
    setDebateHistory([]);
    setDebateStats({ totalDebates: 0, totalRounds: 0, forWins: 0, againstWins: 0, categoryCounts: {} });

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

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("AI Debate Arena", 20, 28);
    doc.setFontSize(13);
    doc.setFont("helvetica", "normal");
    doc.text(`Topic: ${topic}`, 20, 40);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 47);
    let y = 58;
    forArguments.forEach((arg) => {
      if (y > 270) { doc.addPage(); y = 30; }
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text(`FOR — Round ${arg.round}:`, 20, y); y += 6;
      const split = doc.splitTextToSize(arg.text, 170);
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      doc.text(split, 20, y); y += split.length * 5 + 8;
    });
    againstArguments.forEach((arg) => {
      if (y > 270) { doc.addPage(); y = 30; }
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text(`AGAINST — Round ${arg.round}:`, 20, y); y += 6;
      const split = doc.splitTextToSize(arg.text, 170);
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      doc.text(split, 20, y); y += split.length * 5 + 8;
    });
    if (y + 30 > 270) { doc.addPage(); y = 30; }
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("Verdict:", 20, y); y += 7;
    const sv = doc.splitTextToSize(verdict, 170);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(sv, 20, y);
    doc.save(`debate-${topic.slice(0, 20).replace(/\s+/g, "-")}.pdf`);
  };

  const shareDebate = async () => {
    const summary = `🎙️ AI Debate: ${topic}\n\nWinner: ${winner}\n\n${verdict}\n\n— Generated by AI Debate Arena`;
    await navigator.clipboard.writeText(summary);
    setShareMsg(true);
    setTimeout(() => setShareMsg(false), 2000);
  };

  const resetDebate = () => {
    setTopic("");
    setSelectedCategory("");
    setForArguments([]);
    setAgainstArguments([]);
    setVerdict("");
    setWinner("");
    setConfidence(50);
    setDebateComplete(false);
    setCurrentRound(0);
    setStep(0);
    setRagForSources({});
    setRagAgainstSources({});
    setOpenSourcePanel(null);
  };

  const topCategory = Object.entries(debateStats.categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  const totalWins = debateStats.forWins + debateStats.againstWins;
  const forPct = totalWins > 0 ? Math.round((debateStats.forWins / totalWins) * 100) : 50;

  return (
    <div className="flex-1 flex flex-col items-center p-6 bg-[#0D0D0D] min-h-screen font-sans">

      {/* Animated top gradient line */}
      <div
        className="fixed top-0 left-0 right-0 h-[3px] z-50"
        style={{
          background: "linear-gradient(90deg, #7C3AED, #06B6D4, #F97316, #7C3AED)",
          backgroundSize: "300% auto",
          animation: "gradientShift 4s linear infinite",
        }}
      />
      <style>{`
        @keyframes gradientShift { 0%{background-position:0% center} 100%{background-position:300% center} }
        @keyframes slideIn { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        .slide-in { animation: slideIn 0.4s ease forwards; }
        @keyframes pulse-glow {
          0%,100%{box-shadow:0 0 0 0 transparent}
          50%{box-shadow:0 0 18px rgba(124,58,237,0.3)}
        }
        .topic-input:focus { animation: pulse-glow 1.6s ease-in-out infinite; }
      `}</style>

      <div className="w-full max-w-7xl flex flex-col md:flex-row gap-8 mt-6">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="w-full md:w-[260px] shrink-0 flex flex-col gap-5 bg-[#141414] border border-purple-500/10 rounded-2xl p-5 shadow-[0_0_30px_rgba(124,58,237,0.04)] self-start">

          {/* Debate History */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-white font-bold text-sm flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Debate History
              </h4>
              {debateHistory.length > 0 && (
                <button onClick={clearHistory} className="text-[10px] text-red-400/70 hover:text-red-400 transition-colors">Clear</button>
              )}
            </div>

            {isLoadingHistory ? (
              <div className="flex flex-col items-center gap-2 py-6 bg-[#0D0D0D]/50 rounded-xl border border-dashed border-purple-500/10">
                <span className="text-xl animate-spin text-purple-400">🌀</span>
                <p className="text-gray-600 text-[11px] italic text-center">Syncing history...</p>
              </div>
            ) : debateHistory.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 bg-[#0D0D0D]/50 rounded-xl border border-dashed border-purple-500/10">
                <span className="text-2xl opacity-30">🎙️</span>
                <p className="text-gray-600 text-[11px] italic text-center">No debates yet.<br/>Start your first debate!</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {debateHistory.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadDebate(item)}
                    className="w-full text-left bg-[#0D0D0D] border border-purple-500/5 hover:border-purple-500/30 hover:bg-[#1A1A1A] p-3 rounded-xl transition-all flex flex-col gap-1.5 group"
                  >
                    {/* Date + rounds */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-600">{item.date}</span>
                      <span className="bg-[#1a1a1a] border border-purple-500/15 text-purple-400 text-[10px] px-2 py-0.5 rounded-full">{item.rounds}R</span>
                    </div>
                    {/* Topic */}
                    <p className="text-[#A1A1AA] text-[11px] leading-snug line-clamp-2 group-hover:text-gray-300 transition-colors">
                      {item.topic}
                    </p>
                    {/* Winner badge */}
                    <span className={`self-start text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      item.winner === "FOR" ? "bg-cyan-500/15 text-cyan-400" :
                      item.winner === "AGAINST" ? "bg-orange-500/15 text-orange-400" :
                      "bg-gray-700/40 text-gray-400"
                    }`}>
                      {item.winner === "FOR" ? "🤖 FOR wins" : item.winner === "AGAINST" ? "🔥 AGAINST wins" : "🤝 DRAW"}
                    </span>
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
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { icon: "🗣️", value: debateStats.totalDebates, label: "Debates", color: "text-purple-400" },
                { icon: "⚡", value: debateStats.totalRounds, label: "Rounds", color: "text-cyan-400" },
                { icon: "🤖", value: debateStats.forWins, label: "FOR Wins", color: "text-cyan-400" },
                { icon: "🔥", value: debateStats.againstWins, label: "AGAINST", color: "text-orange-400" },
              ].map((stat) => (
                <div key={stat.label} className="bg-[#0D0D0D] rounded-xl p-3 text-center border border-purple-500/5 hover:border-purple-500/15 transition-colors">
                  <span className="text-base block mb-0.5">{stat.icon}</span>
                  <p className={`font-bold text-sm ${stat.color}`}>{stat.value}</p>
                  <p className="text-gray-600 text-[10px]">{stat.label}</p>
                </div>
              ))}
            </div>
            {/* FOR vs AGAINST bar */}
            {totalWins > 0 && (
              <div className="bg-[#0D0D0D] rounded-xl p-3 border border-purple-500/5">
                <div className="flex justify-between text-[10px] mb-1.5">
                  <span className="text-cyan-400 font-semibold">FOR {forPct}%</span>
                  <span className="text-orange-400 font-semibold">{100 - forPct}% AGAINST</span>
                </div>
                <div className="h-2 rounded-full bg-orange-500/30 overflow-hidden">
                  <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${forPct}%` }} />
                </div>
              </div>
            )}
            {topCategory !== "—" && (
              <div className="mt-2 bg-[#0D0D0D] rounded-xl p-3 text-center border border-purple-500/5">
                <span className="text-base">{CATEGORY_ICONS[topCategory] || "🏆"}</span>
                <p className="text-white font-bold text-xs mt-0.5">{topCategory}</p>
                <p className="text-gray-600 text-[10px]">Most Debated</p>
              </div>
            )}
          </div>
        </aside>

        {/* ── MAIN AREA ── */}
        <main className="flex-1 flex flex-col gap-6 min-w-0">

          {/* Title + badges */}
          <div>
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] via-purple-400 to-[#06B6D4] mb-3">
              AI Debate Arena
            </h1>
            <div className="flex flex-wrap gap-2">
              {[
                { text: "⚡ Powered by Gemini vs LLaMA", color: "border-purple-500/20 text-purple-300" },
                { text: "🧠 Research-grade arguments", color: "border-cyan-500/20 text-cyan-300" },
                { text: "📄 Export to PDF", color: "border-orange-500/20 text-orange-300" },
              ].map((b) => (
                <span key={b.text} className={`text-[11px] px-3 py-1 rounded-full border bg-[#141414] ${b.color}`}>{b.text}</span>
              ))}
            </div>
          </div>

          {/* ── RAG Document Upload ───────────────────────────────────── */}
          <DocumentUpload
            label="Upload Research Document"
            onDocumentReady={(docId, fileName, chunkCount) => {
              setRagDocumentId(docId);
              setRagFileName(fileName);
              setRagChunkCount(chunkCount);
            }}
            onClear={() => {
              setRagDocumentId(null);
              setRagFileName("");
              setRagChunkCount(0);
              setRagForSources({});
              setRagAgainstSources({});
            }}
            disabled={isDebating}
          />

          {/* Topic Input */}
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !isDebating) startDebate(); }}
              placeholder="Enter a debate topic... (e.g. Should AI replace teachers?)"
              className="topic-input w-full bg-[#141414] text-white px-5 py-4 rounded-2xl border-2 border-purple-500/20 hover:border-purple-500/40 focus:border-purple-500/70 placeholder-gray-700 text-sm transition-all focus:outline-none"
              disabled={isDebating}
            />

            {/* Category pills */}
            <div className="flex flex-wrap gap-2">
              {Object.keys(TOPIC_SUGGESTIONS).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? "" : cat)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    selectedCategory === cat
                      ? "bg-purple-600/20 border-purple-500/60 text-white"
                      : "bg-[#141414] border-purple-500/10 text-gray-500 hover:text-gray-300 hover:border-purple-500/30"
                  }`}
                >
                  <span>{CATEGORY_ICONS[cat]}</span> {cat}
                </button>
              ))}
            </div>

            {/* Suggested topics */}
            {selectedCategory && (
              <div className="slide-in flex flex-col gap-2">
                <p className="text-[11px] text-gray-600 uppercase tracking-widest">Suggested topics for {selectedCategory}</p>
                <div className="flex flex-col gap-1.5">
                  {TOPIC_SUGGESTIONS[selectedCategory].map((t) => (
                    <button
                      key={t}
                      onClick={() => { setTopic(t); setSelectedCategory(""); }}
                      className="text-left text-sm text-[#A1A1AA] hover:text-white bg-[#141414] hover:bg-[#1a1a1a] border border-purple-500/10 hover:border-purple-500/30 px-4 py-2.5 rounded-xl transition-all"
                    >
                      → {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Controls row */}
          <div className="flex flex-wrap gap-3 items-center">
            <select
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              className="bg-[#141414] text-white px-4 py-2.5 rounded-xl border border-purple-500/15 text-sm focus:outline-none focus:border-purple-500/50"
            >
              {[2, 3, 4].map((r) => (
                <option key={r} value={r}>{r} Rounds</option>
              ))}
            </select>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-[#141414] text-white px-4 py-2.5 rounded-xl border border-purple-500/15 text-sm focus:outline-none focus:border-purple-500/50"
            >
              {["English", "Hindi", "Telugu"].map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <button
              onClick={startDebate}
              disabled={isDebating || !topic.trim()}
              className="flex-1 bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2.5 px-6 rounded-xl transition-all text-sm uppercase tracking-widest shadow-[0_0_20px_rgba(124,58,237,0.25)]"
            >
              {isDebating ? "Debating..." : "⚡ Start Debate"}
            </button>
          </div>

          {/* Step Indicator */}
          {isDebating && (
            <div className="slide-in bg-[#141414] border border-purple-500/10 rounded-xl p-4 flex flex-col gap-3">
              {[
                { s: 1, label: `Gemini building argument... (Round ${currentRound})`, done: step > 1 },
                { s: 2, label: `LLaMA counter-arguing... (Round ${currentRound})`, done: step > 2 },
                { s: 3, label: "Generating verdict...", done: step > 3 },
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

          {/* Round timeline */}
          {(isDebating || debateComplete) && forArguments.length > 0 && (
            <div className="flex items-center gap-3">
              {[...Array(rounds)].map((_, i) => (
                <div key={i} className={`flex items-center gap-2`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    i + 1 < currentRound || debateComplete ? "bg-purple-500/20 border-purple-500 text-purple-400" :
                    i + 1 === currentRound ? "border-cyan-500 text-cyan-400 animate-pulse" :
                    "border-gray-700 text-gray-600"
                  }`}>
                    {i + 1 < currentRound || debateComplete ? "✓" : i + 1}
                  </div>
                  {i < rounds - 1 && <div className="w-6 h-px bg-gray-700" />}
                </div>
              ))}
              {debateComplete && (
                <div className="ml-2 w-8 h-8 rounded-full flex items-center justify-center text-xs border-2 bg-purple-600/20 border-purple-500 text-purple-400">⚖️</div>
              )}
            </div>
          )}

          {/* FOR / AGAINST Cards */}
          {(forArguments.length > 0 || isDebating) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* FOR - Gemini */}
              <div className="bg-[#141414] rounded-2xl p-5 border-2 border-cyan-500/25 shadow-[0_0_20px_rgba(6,182,212,0.06)] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🤖</span>
                    <div>
                      <h3 className="text-cyan-400 font-bold text-sm uppercase tracking-wider">FOR</h3>
                      <p className="text-[10px] text-gray-600">Gemini</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ragDocumentId && forArguments.length > 0 && (
                      <span className="text-[9px] bg-purple-500/15 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full">📄 Grounded</span>
                    )}
                    {forArguments.length > 0 && (
                      <span className="text-[10px] text-gray-600">{forArguments[forArguments.length-1]?.wordCount || 0} words</span>
                    )}
                  </div>
                </div>
                {typing === "for" ? (
                  <div className="flex items-center gap-3 py-8 justify-center">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: `${i*160}ms` }} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {forArguments.map((arg) => (
                      <div key={arg.round} className="slide-in p-3.5 rounded-xl border-l-4 border-cyan-500 bg-cyan-950/10">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] text-cyan-600 font-bold uppercase tracking-wider">Round {arg.round}</span>
                          {ragForSources[arg.round]?.length > 0 && (
                            <button
                              onClick={() => setOpenSourcePanel(openSourcePanel === `for-${arg.round}` ? null : `for-${arg.round}`)}
                              className="text-[9px] text-purple-400/70 hover:text-purple-400 transition-colors flex items-center gap-1"
                            >
                              📚 {ragForSources[arg.round].length} sources {openSourcePanel === `for-${arg.round}` ? "▲" : "▼"}
                            </button>
                          )}
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed">{arg.text}</p>
                        {openSourcePanel === `for-${arg.round}` && ragForSources[arg.round] && (
                          <div className="mt-3 space-y-2 border-t border-cyan-500/10 pt-3">
                            <p className="text-[9px] text-gray-600 uppercase tracking-wider">Retrieved document sources</p>
                            {ragForSources[arg.round].map((chunk, ci) => (
                              <div key={ci} className="bg-[#0D0D0D] rounded-lg p-2.5 border border-purple-500/10">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[9px] text-purple-400 font-semibold">Excerpt {ci + 1}</span>
                                  <span className="text-[9px] text-gray-600">{(chunk.score * 100).toFixed(0)}% relevant</span>
                                </div>
                                <p className="text-[10px] text-gray-400 leading-relaxed line-clamp-3">{chunk.text}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AGAINST - LLaMA */}
              <div className="bg-[#141414] rounded-2xl p-5 border-2 border-orange-500/25 shadow-[0_0_20px_rgba(249,115,22,0.06)] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🔥</span>
                    <div>
                      <h3 className="text-orange-400 font-bold text-sm uppercase tracking-wider">AGAINST</h3>
                      <p className="text-[10px] text-gray-600">LLaMA</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ragDocumentId && againstArguments.length > 0 && (
                      <span className="text-[9px] bg-purple-500/15 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full">📄 Grounded</span>
                    )}
                    {againstArguments.length > 0 && (
                      <span className="text-[10px] text-gray-600">{againstArguments[againstArguments.length-1]?.wordCount || 0} words</span>
                    )}
                  </div>
                </div>
                {typing === "against" ? (
                  <div className="flex items-center gap-3 py-8 justify-center">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-2.5 h-2.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: `${i*160}ms` }} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {againstArguments.map((arg) => (
                      <div key={arg.round} className="slide-in p-3.5 rounded-xl border-l-4 border-orange-500 bg-orange-950/10">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] text-orange-600 font-bold uppercase tracking-wider">Round {arg.round}</span>
                          {ragAgainstSources[arg.round]?.length > 0 && (
                            <button
                              onClick={() => setOpenSourcePanel(openSourcePanel === `against-${arg.round}` ? null : `against-${arg.round}`)}
                              className="text-[9px] text-purple-400/70 hover:text-purple-400 transition-colors flex items-center gap-1"
                            >
                              📚 {ragAgainstSources[arg.round].length} sources {openSourcePanel === `against-${arg.round}` ? "▲" : "▼"}
                            </button>
                          )}
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed">{arg.text}</p>
                        {openSourcePanel === `against-${arg.round}` && ragAgainstSources[arg.round] && (
                          <div className="mt-3 space-y-2 border-t border-orange-500/10 pt-3">
                            <p className="text-[9px] text-gray-600 uppercase tracking-wider">Retrieved document sources</p>
                            {ragAgainstSources[arg.round].map((chunk, ci) => (
                              <div key={ci} className="bg-[#0D0D0D] rounded-lg p-2.5 border border-purple-500/10">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[9px] text-purple-400 font-semibold">Excerpt {ci + 1}</span>
                                  <span className="text-[9px] text-gray-600">{(chunk.score * 100).toFixed(0)}% relevant</span>
                                </div>
                                <p className="text-[10px] text-gray-400 leading-relaxed line-clamp-3">{chunk.text}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Verdict Card */}
          {debateComplete && verdict && (
            <div className="slide-in">
              {/* Winner Banner */}
              <div className={`rounded-t-2xl px-5 py-3 flex items-center gap-3 ${
                winner === "FOR" ? "bg-cyan-500/15 border-b border-cyan-500/30" :
                winner === "AGAINST" ? "bg-orange-500/15 border-b border-orange-500/30" :
                "bg-purple-500/15 border-b border-purple-500/30"
              }`}>
                <span className="text-2xl">
                  {winner === "FOR" ? "🤖" : winner === "AGAINST" ? "🔥" : "🤝"}
                </span>
                <div>
                  <p className={`font-black text-base uppercase tracking-widest ${
                    winner === "FOR" ? "text-cyan-400" : winner === "AGAINST" ? "text-orange-400" : "text-purple-400"
                  }`}>
                    {winner === "FOR" ? "FOR wins" : winner === "AGAINST" ? "AGAINST wins" : "Draw"}
                  </p>
                  <p className="text-gray-500 text-[11px]">
                    {winner !== "DRAW" && `${winner === "FOR" ? "FOR" : "AGAINST"} argument was ${confidence}% stronger`}
                  </p>
                </div>
              </div>

              {/* Verdict body */}
              <div className="bg-[#141414] border border-purple-500/15 border-t-0 rounded-b-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">⚖️</span>
                  <h3 className="text-white font-bold text-base">Verdict</h3>
                </div>
                <p className="text-[#A1A1AA] text-sm leading-relaxed whitespace-pre-line">{verdict}</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {debateComplete && (
            <div className="slide-in flex flex-col sm:flex-row gap-3">
              <button
                onClick={shareDebate}
                className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm border transition-all ${
                  shareMsg
                    ? "bg-green-500/20 border-green-500/40 text-green-400"
                    : "bg-[#141414] border-purple-500/20 text-gray-300 hover:border-purple-500/50 hover:text-white"
                }`}
              >
                {shareMsg ? "✓ Copied!" : "🔗 Share"}
              </button>
              <button
                onClick={exportPDF}
                className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-[#7C3AED] to-purple-600 hover:opacity-90 text-white font-bold py-3 px-5 rounded-xl transition-all text-sm shadow-[0_0_15px_rgba(124,58,237,0.2)]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Export PDF
              </button>
              <button
                onClick={resetDebate}
                className="px-5 py-3 rounded-xl font-bold text-sm bg-[#141414] border border-purple-500/10 hover:border-purple-500/30 text-gray-400 hover:text-white transition-all"
              >
                New Debate
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