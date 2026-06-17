"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface User {
  userId: string;
  name: string;
  email: string;
  image?: string;
  firstLoginAt?: string;
  lastLoginAt?: string;
}

interface StatsSummary {
  totalUsers: number;
  totalDebates: number;
  totalCodeReviews: number;
  mostActiveUser: {
    userId: string;
    name: string;
    email: string;
    chatCount: number;
  } | null;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<StatsSummary>({
    totalUsers: 0,
    totalDebates: 0,
    totalCodeReviews: 0,
    mostActiveUser: null,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auth Protection
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated" && !(session?.user as any)?.isAdmin) {
      router.replace("/dashboard");
    }
  }, [status, session, router]);

  // Load User and Stats Data
  useEffect(() => {
    if (status !== "authenticated" || !(session?.user as any)?.isAdmin) return;

    const fetchAdminData = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        const res = await fetch("/api/admin/users");
        const data = await res.json();
        
        if (!res.ok) {
          setErrorMsg(data.error || "Failed to fetch admin users");
          return;
        }
        
        setUsers(data.users || []);
        setStats(
          data.stats || {
            totalUsers: 0,
            totalDebates: 0,
            totalCodeReviews: 0,
            mostActiveUser: null,
          }
        );
      } catch (error: any) {
        console.error("Error loading admin users:", error);
        setErrorMsg(error.message || "An unexpected network error occurred loading user list.");
      } finally {
        setLoading(false);
      }
    };

    fetchAdminData();
  }, [status, session]);

  // Load Selected User's History
  const handleUserClick = async (user: User) => {
    setSelectedUser(user);
    setUserHistory([]);
    setLoadingHistory(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/users/${user.userId}/history`);
      const data = await res.json();
      
      if (!res.ok) {
        setErrorMsg(data.error || "Failed to load user history");
        return;
      }
      
      setUserHistory(data.items || []);
    } catch (error: any) {
      console.error("Error loading user history:", error);
      setErrorMsg(error.message || "Failed to query user history archive.");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Filter users based on search query
  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (isoString?: string) => {
    if (!isoString) return "—";
    const date = new Date(isoString);
    return (
      date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  if (status === "loading" || status === "unauthenticated" || !(session?.user as any)?.isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0D0D0D] min-h-screen">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0D0D0D] min-h-screen font-sans text-gray-200">
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(15px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fadeUp 0.4s ease forwards; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div
          className="absolute top-0 left-[-15%] w-[600px] h-[600px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #7C3AED 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 right-[-15%] w-[500px] h-[500px] rounded-full opacity-8"
          style={{ background: "radial-gradient(circle, #06B6D4 0%, transparent 70%)" }}
        />
      </div>

      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 py-10 flex flex-col gap-8">
        
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800/60 pb-6">
          <div>
            <Link
              href="/dashboard"
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 mb-2 w-fit"
            >
              <span>🏠</span> Back to Dashboard
            </Link>
            <h1 className="text-3xl font-black text-white flex items-center gap-3">
              <span className="bg-purple-500/10 text-purple-400 p-2 rounded-xl border border-purple-500/20 text-xl">🛡️</span>
              Admin Control Panel
            </h1>
          </div>
          <p className="text-gray-500 text-xs sm:text-right">
            Welcome, admin <span className="text-purple-400 font-semibold">{session?.user?.name || "Admin"}</span>
          </p>
        </div>

        {/* Configuration Alert Box */}
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-xs font-semibold flex items-center gap-3 fade-up">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <p className="font-bold text-white mb-0.5">Configuration Alert</p>
              <p className="text-gray-400 font-normal leading-relaxed">{errorMsg}</p>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-gray-500 hover:text-white transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Stats Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 fade-up">
          {/* Metric 1 */}
          <div className="bg-[#141414] border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4">
            <span className="text-2xl bg-purple-500/10 p-2.5 rounded-lg text-purple-400">👥</span>
            <div>
              <p className="text-2xl font-black text-white">{loading ? "…" : stats.totalUsers}</p>
              <p className="text-gray-500 text-xs">Total Registered Users</p>
            </div>
          </div>
          {/* Metric 2 */}
          <div className="bg-[#141414] border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4">
            <span className="text-2xl bg-cyan-500/10 p-2.5 rounded-lg text-cyan-400">⚔️</span>
            <div>
              <p className="text-2xl font-black text-white">{loading ? "…" : stats.totalDebates}</p>
              <p className="text-gray-500 text-xs">Total Debates Run</p>
            </div>
          </div>
          {/* Metric 3 */}
          <div className="bg-[#141414] border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4">
            <span className="text-2xl bg-orange-500/10 p-2.5 rounded-lg text-orange-400">🔍</span>
            <div>
              <p className="text-2xl font-black text-white">{loading ? "…" : stats.totalCodeReviews}</p>
              <p className="text-gray-500 text-xs">Total Code Reviews</p>
            </div>
          </div>
          {/* Metric 4 */}
          <div className="bg-[#141414] border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4 col-span-1 sm:col-span-2 lg:col-span-1">
            <span className="text-2xl bg-green-500/10 p-2.5 rounded-lg text-green-400">⚡</span>
            <div className="min-w-0 flex-1">
              {loading ? (
                <p className="text-2xl font-black text-white">…</p>
              ) : stats.mostActiveUser ? (
                <>
                  <p className="text-sm font-bold text-white truncate">{stats.mostActiveUser.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {stats.mostActiveUser.chatCount} chats ({stats.mostActiveUser.email})
                  </p>
                </>
              ) : (
                <p className="text-sm font-bold text-gray-500">No active user</p>
              )}
              <p className="text-gray-500 text-xs">Most Active User</p>
            </div>
          </div>
        </div>

        {/* Main Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start fade-up">
          
          {/* Users Table Card */}
          <div className={`bg-[#141414] border border-gray-800/80 rounded-2xl p-6 transition-all duration-300 ${
            selectedUser ? "lg:col-span-7" : "lg:col-span-12"
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                📂 Platform Users
                <span className="text-xs font-normal text-gray-500">({filteredUsers.length} found)</span>
              </h2>
              
              {/* Search Box */}
              <div className="relative max-w-xs w-full">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-xs">🔍</span>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-4 py-1.5 rounded-lg bg-[#0D0D0D] border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40 transition-colors"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 text-xs">Loading registered users list...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl bg-[#0D0D0D]/30">
                <span className="text-3xl opacity-20 block mb-2">👥</span>
                <p className="text-gray-500 text-sm">No users match your criteria.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800/80 text-gray-500 font-semibold uppercase tracking-wider">
                      <th className="pb-3 pl-2">User Details</th>
                      <th className="pb-3">Email Address</th>
                      <th className="pb-3 hidden sm:table-cell">First Sign-In</th>
                      <th className="pb-3 hidden md:table-cell">Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr
                        key={user.userId}
                        onClick={() => handleUserClick(user)}
                        className={`border-b border-gray-800/40 hover:bg-purple-600/5 cursor-pointer transition-all ${
                          selectedUser?.userId === user.userId ? "bg-purple-600/5 border-l-2 border-l-purple-500 pl-1" : ""
                        }`}
                      >
                        <td className="py-3.5 pl-2 flex items-center gap-3">
                          {user.image ? (
                            <img
                              src={user.image}
                              alt={user.name}
                              className="w-7 h-7 rounded-full border border-gray-800 shrink-0"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="w-7 h-7 rounded-full bg-purple-600/20 text-purple-400 flex items-center justify-center font-bold text-xs shrink-0">
                              {user.name.charAt(0)}
                            </span>
                          )}
                          <span className="font-bold text-white group-hover:text-purple-300 truncate max-w-[150px]">
                            {user.name}
                          </span>
                        </td>
                        <td className="py-3.5 text-gray-400 font-medium select-all truncate max-w-[180px]">
                          {user.email}
                        </td>
                        <td className="py-3.5 text-gray-500 hidden sm:table-cell">
                          {formatDate(user.firstLoginAt)}
                        </td>
                        <td className="py-3.5 text-gray-500 hidden md:table-cell">
                          {formatDate(user.lastLoginAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* User History Details Panel (Side Column) */}
          {selectedUser && (
            <div className="lg:col-span-5 bg-[#141414] border border-purple-500/20 rounded-2xl p-6 shadow-[0_0_40px_rgba(124,58,237,0.06)] flex flex-col gap-6 fade-up">
              
              {/* Detail Header */}
              <div className="flex items-start justify-between border-b border-gray-800/80 pb-4">
                <div className="flex items-center gap-3">
                  {selectedUser.image ? (
                    <img
                      src={selectedUser.image}
                      alt={selectedUser.name}
                      className="w-10 h-10 rounded-full border border-purple-500/20"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-purple-600/30 text-purple-400 flex items-center justify-center font-black">
                      {selectedUser.name.charAt(0)}
                    </span>
                  )}
                  <div>
                    <h3 className="text-sm font-black text-white leading-tight">{selectedUser.name}</h3>
                    <p className="text-[10px] text-gray-500 select-all">{selectedUser.email}</p>
                  </div>
                </div>
                
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-gray-500 hover:text-white text-xs p-1"
                >
                  ✕ Close
                </button>
              </div>

              {/* Login metrics */}
              <div className="grid grid-cols-2 gap-3 bg-[#0D0D0D]/60 border border-gray-800/80 rounded-xl p-3.5 text-[10px]">
                <div>
                  <p className="text-gray-500 mb-0.5">First Signed In</p>
                  <p className="text-gray-300 font-semibold">{formatDate(selectedUser.firstLoginAt)}</p>
                </div>
                <div>
                  <p className="text-gray-500 mb-0.5">Last Signed In</p>
                  <p className="text-gray-300 font-semibold">{formatDate(selectedUser.lastLoginAt)}</p>
                </div>
              </div>

              {/* Saved History List */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 mb-3 flex items-center gap-2">
                  <span>📜</span> User Chat Records
                  <span className="bg-[#0D0D0D] px-2 py-0.5 rounded-full border border-gray-800 text-[9px] text-gray-500">
                    {userHistory.length}
                  </span>
                </h4>

                {loadingHistory ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-500 text-[10px] italic">Fetching chat archives...</p>
                  </div>
                ) : userHistory.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-gray-800 rounded-xl bg-[#0D0D0D]/20">
                    <p className="text-gray-600 text-xs italic">No saved history items found</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                    {userHistory.map((item) => (
                      <button
                        key={item.chatId}
                        onClick={() => setSelectedChat(item)}
                        className="w-full text-left bg-[#0D0D0D] border border-gray-800 hover:border-purple-500/30 hover:bg-[#1C1C1C] p-3 rounded-xl transition-all flex flex-col gap-1.5 group"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            item.type === "debate"
                              ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                              : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                          }`}>
                            {item.type === "debate" ? "⚔️ DEBATE" : "🔍 REVIEW"}
                          </span>
                          <span className="text-[9px] text-gray-600">
                            {formatDate(item.createdAt).split(" at ")[0]}
                          </span>
                        </div>
                        <p className="text-gray-300 text-xs font-semibold leading-snug line-clamp-2 group-hover:text-purple-300 transition-colors">
                          {item.type === "debate" ? item.content.topic : `Code Review: ${item.content.language}`}
                        </p>
                        {item.type === "debate" ? (
                          <span className="text-[9px] text-gray-500">
                            Winner: <span className="font-semibold">{item.content.winner}</span>
                          </span>
                        ) : (
                          <div className="flex justify-between items-center text-[9px] text-gray-500 w-full">
                            <span>Score: <span className="font-bold text-green-400">{item.content.score}/10</span></span>
                            <span>{item.content.issueCount} bugs</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── DETAIL MODAL OVERLAY ── */}
      {selectedChat && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-gray-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] fade-up">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  selectedChat.type === "debate"
                    ? "bg-purple-500/15 text-purple-400 border border-purple-500/20"
                    : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/20"
                }`}>
                  {selectedChat.type === "debate" ? "⚔️ AI Debate Transcript" : "🔍 Code Review Report"}
                </span>
                <span className="text-gray-500 text-xs">{formatDate(selectedChat.createdAt)}</span>
              </div>
              <button
                onClick={() => setSelectedChat(null)}
                className="text-gray-400 hover:text-white transition-colors p-2 text-xl"
              >
                ✕
              </button>
            </div>

            {/* Modal Scroll Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 scrollbar-hide text-xs">
              {selectedChat.type === "debate" ? (
                // DEBATE TEMPLATE
                <div className="space-y-6">
                  {/* Topic and info */}
                  <div className="bg-[#0D0D0D] border border-gray-800 rounded-xl p-4">
                    <h3 className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Debate Topic</h3>
                    <p className="text-white text-base font-black leading-snug">{selectedChat.content.topic}</p>
                    <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-800/80 text-[10px] text-gray-400">
                      <span>Category: <strong className="text-purple-400">{selectedChat.content.category || "General"}</strong></span>
                      <span>Winner: <strong className="text-green-400">{selectedChat.content.winner}</strong></span>
                      <span>Rounds: <strong className="text-white">{selectedChat.content.rounds}</strong></span>
                    </div>
                  </div>

                  {/* Verdict Block */}
                  {selectedChat.content.verdict && (
                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4">
                      <h4 className="text-purple-400 font-bold text-xs uppercase tracking-wider mb-2">⚖️ Judge's Verdict</h4>
                      <p className="text-gray-300 leading-relaxed italic">{selectedChat.content.verdict}</p>
                    </div>
                  )}

                  {/* Argument Rounds */}
                  <div className="space-y-4">
                    <h4 className="text-white font-bold text-sm border-b border-gray-800 pb-2">🎙️ Debate Transcripts</h4>
                    {Array.from({ length: selectedChat.content.rounds || 0 }).map((_, idx) => {
                      const round = idx + 1;
                      const forArg = selectedChat.content.forArgs?.find((a: any) => a.round === round);
                      const againstArg = selectedChat.content.againstArgs?.find((a: any) => a.round === round);

                      return (
                        <div key={round} className="space-y-3 pt-2">
                          <h5 className="text-purple-400 text-xs font-bold uppercase">Round {round}</h5>
                          {forArg && (
                            <div className="bg-[#0D0D0D] border-l-2 border-cyan-500 rounded-r-xl p-4">
                              <p className="text-cyan-400 font-bold text-[10px] uppercase mb-1">🤖 Gemini (FOR)</p>
                              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{forArg.text}</p>
                            </div>
                          )}
                          {againstArg && (
                            <div className="bg-[#0D0D0D] border-l-2 border-orange-500 rounded-r-xl p-4">
                              <p className="text-orange-400 font-bold text-[10px] uppercase mb-1">🔥 LLaMA (AGAINST)</p>
                              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{againstArg.text}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // CODE REVIEW TEMPLATE
                <div className="space-y-6">
                  {/* Summary card */}
                  <div className="bg-[#0D0D0D] border border-gray-800 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <span className="text-gray-500 block">Language</span>
                      <span className="text-white font-bold uppercase">{selectedChat.content.language}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Quality Score</span>
                      <span className="text-green-400 font-bold">{selectedChat.content.score || 7}/10</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Bugs Found</span>
                      <span className="text-cyan-400 font-bold">{selectedChat.content.issueCount || 0}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Lines Scanned</span>
                      <span className="text-white font-bold">{selectedChat.content.linesReviewed || 0}</span>
                    </div>
                  </div>

                  {/* Code Snippet Block */}
                  <div className="space-y-2">
                    <h4 className="text-white font-bold text-xs">Submitted Code</h4>
                    <div className="bg-[#0D0D0D] border border-gray-800 rounded-xl p-4 max-h-[300px] overflow-y-auto">
                      <pre className="font-mono text-gray-300 leading-relaxed whitespace-pre select-all text-[11px]">
                        {selectedChat.content.fullCode || selectedChat.content.code}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-800 px-6 py-4 bg-[#0D0D0D]/50 flex justify-end">
              <button
                onClick={() => setSelectedChat(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors font-medium"
              >
                Close View
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
