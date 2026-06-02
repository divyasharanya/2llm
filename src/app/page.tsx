import Link from "next/link";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 px-4">
      <div className="text-center max-w-4xl">
        <h1 className="text-6xl md:text-7xl font-black mb-6">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500">
            AI-Powered Research
          </span>
        </h1>
        <p className="text-xl md:text-2xl text-gray-400 mb-12 leading-relaxed">
          Two elite AI models. One debates your ideas. One destroys your code.
        </p>
        
        <div className="flex flex-col md:flex-row gap-8 justify-center">
          <Link href="/debate" className="group">
            <div className="bg-gradient-to-br from-gray-900 to-gray-950 border-2 border-blue-500/30 rounded-2xl p-10 hover:border-blue-500 transition-all duration-500 w-80 shadow-2xl">
              <div className="w-20 h-20 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-3-3h-4m-4 0H5a3 3 0 00-3 3v2h4m4 0v-2a3 3 0 013-3h4a3 3 0 013 3v2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-3 text-white">Debate Arena</h2>
              <p className="text-gray-400 mb-6 leading-relaxed">
                Watch Gemini and LLaMA debate your topics with real-time analysis
              </p>
              <span className="inline-block bg-blue-600 group-hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-semibold transition-all shadow-lg">
                Launch Debate
              </span>
            </div>
          </Link>
          
          <Link href="/code-review" className="group">
            <div className="bg-gradient-to-br from-gray-900 to-gray-950 border-2 border-orange-500/30 rounded-2xl p-10 hover:border-orange-500 transition-all duration-500 w-80 shadow-2xl">
              <div className="w-20 h-20 bg-gradient-to-r from-orange-600 to-red-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l4-4-4-4" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-3 text-white">Code Review Duo</h2>
              <p className="text-gray-400 mb-6 leading-relaxed">
                Gemini analyzes your code while LLaMA provides optimized solutions
              </p>
              <span className="inline-block bg-orange-600 group-hover:bg-orange-700 text-white px-8 py-3 rounded-xl font-semibold transition-all shadow-lg">
                Launch Review
              </span>
            </div>
          </Link>
        </div>
      </div>
      
      <footer className="mt-20 pb-8 text-gray-500 text-sm">
        Built with Gemini 2.5 + LLaMA 3.1 + Next.js
      </footer>
    </div>
  );
}