"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export default function Navbar() {
  const { data: session, status } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleLogout = async () => {
    await signOut({ redirect: false, callbackUrl: "/" });
    window.location.assign("/");
  };

  return (
    <nav className="w-full bg-black/80 backdrop-blur-md border-b border-gray-800/60 px-6 py-4 flex justify-between items-center z-50 relative">
      <Link href="/" className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
        AI Debate Arena
      </Link>

      <div className="flex items-center gap-4">
        {status === "authenticated" && session?.user ? (
          <>
            {/* Nav links */}
            <Link href="/debate" className="text-gray-400 hover:text-white transition-colors text-sm font-medium hidden sm:block">
              Debate
            </Link>
            <Link href="/code-review" className="text-gray-400 hover:text-white transition-colors text-sm font-medium hidden sm:block">
              Code Review
            </Link>

            {/* User dropdown */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 focus:outline-none border border-gray-800 hover:border-purple-500/40 bg-[#141414] py-1.5 px-3 rounded-full transition-all"
              >
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt={session.user.name || "User"}
                    className="w-6 h-6 rounded-full border border-purple-500/30"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-purple-600/30 flex items-center justify-center text-xs font-bold text-purple-400">
                    {session.user.name?.charAt(0) || "U"}
                  </span>
                )}
                <span className="text-gray-300 hover:text-white text-xs font-medium max-w-[100px] truncate">
                  {session.user.name}
                </span>
                <svg className={`w-3 h-3 text-gray-500 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-[#141414] border border-gray-800 rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.5)] py-1.5 z-50">
                    <Link
                      href="/dashboard"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-xs text-gray-300 hover:text-white hover:bg-purple-600/10 transition-colors font-medium"
                    >
                      <span>🏠</span> Dashboard
                    </Link>
                    {(session.user as any).isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-600/10 transition-colors font-bold animate-pulse"
                      >
                        <span>🛡️</span> Admin Panel
                      </Link>
                    )}
                    <Link
                      href="/debate"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-xs text-gray-300 hover:text-white hover:bg-purple-600/10 transition-colors font-medium"
                    >
                      <span>⚔️</span> My Debates
                    </Link>
                    <Link
                      href="/code-review"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-xs text-gray-300 hover:text-white hover:bg-purple-600/10 transition-colors font-medium"
                    >
                      <span>🔍</span> My Reviews
                    </Link>
                    <div className="h-px bg-gray-800 my-1" />
                    <button
                      onClick={() => { setDropdownOpen(false); handleLogout(); }}
                      className="flex items-center gap-2 w-full text-left px-4 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors font-semibold"
                    >
                      <span>↩</span> Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : status === "unauthenticated" ? (
          <>
            <Link
              href="/login"
              className="text-gray-400 hover:text-white text-sm font-medium transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 hover:scale-105"
              style={{ background: "linear-gradient(135deg, #7C3AED, #6D28D9)" }}
            >
              Sign up
            </Link>
          </>
        ) : null}
      </div>
    </nav>
  );
}