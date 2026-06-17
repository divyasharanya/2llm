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
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
AUTH_SECRET=your_auth_secret
AUTH_URL=https://your-amplify-domain.com
APP_AWS_REGION=your_aws_region
APP_AWS_ACCESS_KEY_ID=your_aws_access_key_id
APP_AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
DYNAMODB_TABLE_NAME=UserChats
ADMIN_EMAIL=your_admin_email@example.com
```

## AWS Amplify Deployment

1. Clone this repo
2. Add environment variables in AWS Amplify console:
   - Navigate to your app settings
   - Add the variables listed above
3. Connect your GitHub repo to AWS Amplify
4. Deploy - Amplify will automatically use `amplify.yml` for build configuration

The app uses Next.js with standalone output for SSR support on Amplify.

## DynamoDB Tables Configuration

This application requires two DynamoDB tables created in your AWS account:

1. **`UserChats`**:
   - **Partition Key**: `userId` (String)
   - **Sort Key**: `chatId` (String)
   - *Stores complete chat/debate and code-review transcripts and reports.*

2. **`Users`**:
   - **Partition Key**: `userId` (String)
   - *Stores registered user profiles (both Google and email credentials).*

## Additional Environment Variables

The app also supports the `NEXTAUTH_SECRET` and `NEXTAUTH_URL` aliases for `AUTH_SECRET` and `AUTH_URL`.