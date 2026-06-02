import Link from "next/link";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-black">
      <div className="text-center px-4">
        <h1 className="text-5xl md:text-7xl font-bold mb-6">
          AI-Powered Research & Code Intelligence
        </h1>
        <p className="text-xl md:text-2xl text-zinc-400 mb-12">
          Two AI models. One debates your ideas. One destroys your code.
        </p>
        <div className="flex flex-col md:flex-row gap-8 justify-center">
          <Link href="/debate" className="block">
            <div className="bg-zinc-900 border-2 border-zinc-800 rounded-xl p-8 hover:border-blue-500 transition-all duration-300 w-80">
              <div className="text-6xl mb-4">⚔️</div>
              <h2 className="text-2xl font-bold mb-3">Debate Arena</h2>
              <p className="text-zinc-400 mb-6">
                Watch two AI models debate your topic with FOR and AGAINST arguments
              </p>
              <span className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full font-medium transition-colors">
                Launch
              </span>
            </div>
          </Link>
          <Link href="/code-review" className="block">
            <div className="bg-zinc-900 border-2 border-zinc-800 rounded-xl p-8 hover:border-red-500 transition-all duration-300 w-80">
              <div className="text-6xl mb-4">🔍</div>
              <h2 className="text-2xl font-bold mb-3">Code Review Duo</h2>
              <p className="text-zinc-400 mb-6">
                Let Builder and Attacker AI models review your code for issues
              </p>
              <span className="inline-block bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-full font-medium transition-colors">
                Launch
              </span>
            </div>
          </Link>
        </div>
      </div>
      <footer className="mt-20 pb-8 text-zinc-500 text-sm">
        Built with Gemini + LLaMA + Next.js
      </footer>
    </div>
  );
}