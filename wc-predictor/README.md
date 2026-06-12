# Raymiyo WC 2026 — Office Prediction League

## Files
```
wc-predictor/
├── vercel.json          ← routing config
├── package.json
├── api/
│   ├── football.js      ← proxy to football-data.org (hides API key)
│   └── predictions.js   ← stores player predictions + scoring
└── public/
    └── index.html       ← full app UI
```

## Deploy Steps

### Step 1 — Get Free API Key
1. Go to https://www.football-data.org/client/register
2. Register with your email — it's completely free
3. They email you an API token (looks like: `abc123def456...`)
4. Save this token

### Step 2 — Push to GitHub
Add these files to your existing GitHub repo `sthams-ops/raymiyo-tools`
OR create a new repo called `raymiyo-wc-2026`

### Step 3 — Deploy on Vercel
1. Go to vercel.com → New Project
2. Import from GitHub → select the repo
3. Root directory: `wc-predictor` (if inside raymiyo-tools)
4. Click Deploy

### Step 4 — Set Environment Variables in Vercel
Go to Project → Settings → Environment Variables

Add these two:
```
FOOTBALL_API_KEY = [your token from football-data.org]
ADMIN_PIN        = [pick a 4-digit PIN — only Mijesh knows this]
```

Click Save → Redeploy

### Step 5 — Done!
Your app is live at: `https://your-project.vercel.app`

Share this URL with your team on WhatsApp.

## How Employees Use It
1. Open the URL on their phone
2. Go to "Predict" tab
3. Tap their name
4. Pick winner + optional exact score for each match
5. Submit before kickoff

## How Mijesh Uses Admin
1. Go to "Admin" tab
2. Enter your PIN
3. After each match ends, enter the final score
4. Click "Score" — all player points update automatically
5. Leaderboard updates live for everyone

## Scoring
- Correct winner = 1 point
- Exact scoreline = 3 points
- Wrong = 0 points
- Grand Prize (₨7,000) = highest total points on July 19

## Notes
- football-data.org free tier: 10 calls/minute — plenty for 6 users
- Predictions stored in server memory (resets on cold start)
- For permanent storage across deploys → upgrade to Vercel KV (free tier available)
