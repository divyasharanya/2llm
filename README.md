# AI Debate Arena

AI-Powered Research & Code Intelligence platform with debate and code review features.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Features

- **Debate Arena** (`/debate`): Two AI models debate your topics
- **Code Review Duo** (`/code-review`): Builder and Attacker AI review your code

## Environment Variables

Add these to `.env.local`:

```
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_GROQ_API_KEY=your_groq_api_key
```

## AWS Amplify Deployment

1. Clone this repo
2. Add environment variables in AWS Amplify console:
   - Navigate to your app settings
   - Add `NEXT_PUBLIC_GEMINI_API_KEY` and `NEXT_PUBLIC_GROQ_API_KEY`
3. Connect your GitHub repo to AWS Amplify
4. Deploy - Amplify will automatically use `amplify.yml` for build configuration

The app uses Next.js with standalone output for SSR support on Amplify.