"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"google" | "email">("google");

  // Email form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // UI States
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard");
    }
  }, [status, router]);

  const handleGoogleLogin = () => {
    signIn("google", { callbackUrl: "/dashboard" });
  };

  const handleEmailLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim() || !password) {
      setErrorMsg("Email and password are required");
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // Handle specific table-not-found error message if returned
        if (result.error.includes("Users table not found")) {
          setErrorMsg("Users table not found. Please create the Users table in AWS Console.");
        } else {
          setErrorMsg("Invalid email or password");
        }
      } else if (result?.ok) {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during login");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0D0D0D] min-h-screen">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#0D0D0D] min-h-screen font-sans">
      {/* Gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div
          className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #7C3AED 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #06B6D4 0%, transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md bg-[#141414] border border-purple-500/10 hover:border-purple-500/20 transition-all rounded-2xl p-8 shadow-[0_0_60px_rgba(124,58,237,0.08)] flex flex-col gap-6">
        
        {/* Logo + Header */}
        <div className="text-center flex flex-col gap-2.5">
          <div className="flex justify-center mb-1 text-5xl">⚔️</div>
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] via-purple-400 to-[#06B6D4]">
            AI Debate Arena
          </h1>
          <p className="text-gray-500 text-sm">
            Welcome back — sign in to continue
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-[#0D0D0D] p-1 rounded-xl border border-gray-800/80">
          <button
            onClick={() => {
              setActiveTab("google");
              setErrorMsg(null);
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "google"
                ? "bg-purple-600 text-white shadow-md shadow-purple-500/10"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Google OAuth
          </button>
          <button
            onClick={() => {
              setActiveTab("email");
              setErrorMsg(null);
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "email"
                ? "bg-purple-600 text-white shadow-md shadow-purple-500/10"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Email & Password
          </button>
        </div>

        {/* Error Alert Box */}
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 text-red-400 text-xs text-center font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Auth Forms */}
        {activeTab === "google" ? (
          <div className="flex flex-col gap-4">
            {/* Google Button */}
            <button
              onClick={handleGoogleLogin}
              className="w-full bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-6 rounded-xl transition-all text-sm flex items-center justify-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.3)] border border-gray-200 hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)] active:scale-[0.98]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1l3.15,2.44C20.33,17.65 21.35,14.65 21.35,11.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12,20.6c2.43,0 4.47,-0.8 5.96,-2.26l-3.15,-2.44c-0.87,0.59 -1.99,0.94 -2.81,0.94 -2.17,0 -4.01,-1.47 -4.67,-3.45H4.11v2.53C5.59,16.29 8.57,20.6 12,20.6z"
                  fill="#34A853"
                />
                <path
                  d="M7.33,13.39c-0.17,-0.5 -0.27,-1.04 -0.27,-1.59s0.1,-1.09 0.27,-1.59V7.68H4.11C3.54,8.83 3.22,10.12 3.22,11.8s0.32,2.97 0.89,4.12l3.22,-2.53z"
                  fill="#FBBC05"
                />
                <path
                  d="M12,6.2c1.32,0 2.51,0.45 3.44,1.35l2.58,-2.58C16.46,3.46 14.42,2.6 12,2.6c-3.43,0 -6.41,4.31 -7.89,7.62l3.22,2.53c0.66,-1.98 2.5,-3.45 4.67,-3.45z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>
            <p className="text-gray-600 text-[10px] text-center">
              Sign in with Google — no password required.
            </p>
          </div>
        ) : (
          /* Email Credentials sign in form */
          <form onSubmit={handleEmailLoginSubmit} className="flex flex-col gap-4">
            {/* Email input */}
            <div className="flex flex-col gap-1 text-left">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">Email Address</label>
              <input
                type="email"
                required
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0D0D0D] border border-gray-800 rounded-xl py-2.5 px-4 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40 transition-colors"
              />
            </div>
            
            {/* Password input */}
            <div className="flex flex-col gap-1 text-left">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">Password</label>
              <input
                type="password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0D0D0D] border border-gray-800 rounded-xl py-2.5 px-4 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40 transition-colors"
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-all text-xs flex items-center justify-center gap-2 mt-2 shadow-[0_4px_20px_rgba(124,58,237,0.15)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Logging in...
                </>
              ) : (
                "Log In"
              )}
            </button>
          </form>
        )}

        <p className="text-gray-600 text-[10px] text-center">
          By continuing you agree to our Terms of Service
        </p>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-gray-700 text-xs">or</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        {/* Signup link */}
        <p className="text-gray-500 text-xs text-center">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-purple-400 hover:text-purple-300 font-bold transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
