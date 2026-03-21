# HabitFlow

HabitFlow is a habit tracker with a vanilla HTML/CSS/JavaScript frontend and a Node.js + MongoDB backend.
It helps you manage habits, track mood, review consistency in a matrix calendar, and export report-ready insights.

## Features

- Dashboard
  - Habit check-off for any past date up to today
  - Vitality score (weighted from the last 7 days)
  - Best streak display
  - Today mood summary
  - AI Coach panel with streaming output
    - Uses full historical data (time-agnostic)
    - Uses configured location and live weather context when available

- Habit management
  - Add, edit, and delete habits
  - Frequency: daily or custom weekdays
  - Start date and color per habit

- Calendar matrix
  - Monthly matrix view
  - Rows: habits, Columns: dates
  - Tick/Cross style status (completed/missed), plus unscheduled/future states
  - Multi-habit filter using selectable chips (choose any subset)

- Mood tracking
  - 1 to 5 mood scale with optional note
  - Monthly mood history calendar

- Reports
  - Weekly and monthly CSV exports
  - Weekly and monthly PDF exports
  - Matrix report format in exports
  - PDF includes AI Coach insights for the selected report period
    - Weekly PDF -> weekly AI insights
    - Monthly PDF -> monthly AI insights

- Settings
  - Profile (name, DOB, weight)
  - AI Coach configuration
    - Groq API key
    - Optional location for weather-aware action plans
  - Export/import full app backup JSON
  - Clear all user data (danger zone)

## AI Integration

- Provider endpoint: Groq OpenAI-compatible API
- Model: `openai/gpt-oss-120b`
- Dashboard AI:
  - Full-history coaching (not restricted to weekly/monthly)
  - Streaming response rendering in UI
- PDF AI:
  - Period-specific coaching added automatically during PDF generation
- Weather context:
  - Geocoding: Open-Meteo geocoding API
  - Weather: Open-Meteo forecast API

## Privacy and Storage

- Data is stored per user in MongoDB.
- Groq API key and AI location settings are stored per user in MongoDB.
- AI requests send your app data to Groq when you run AI analysis or generate PDF with AI insights.

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript (ES6+)
- Node.js + Express
- MongoDB + Mongoose
- JWT authentication
- CDN dependencies
  - Lucide icons
  - jsPDF
  - jsPDF-AutoTable
  - Google Fonts (Inter)

## Project Structure

```
HabitFlow/
|- index.html
|- style.css
|- app.js
|- server.js
|- package.json
|- .env.example
|- README.md
```

## Getting Started

1. Clone this project.
2. Install dependencies.
3. Copy `.env.example` to `.env` and set your values.
4. Start the server.

```bash
npm install
cp .env.example .env
npm start
```

Then open `http://localhost:3000`.

## Deploy on Netlify or Vercel (single deployment)

HabitFlow now supports serverless deployment where frontend + API are deployed together on one platform.

- **Vercel**: Uses `api/index.js` as a serverless function and `vercel.json` for routing.
- **Netlify**: Uses `netlify/functions/server.js` and `netlify.toml` redirects.

### Required environment variables

Set these in your hosting provider project settings:

- `MONGODB_URI` (MongoDB Atlas connection string recommended)
- `JWT_SECRET` (high-entropy secret, at least 32 characters)
- `PORT` is optional for local development only

### Notes

- You still need a MongoDB database (for example MongoDB Atlas).
- Static files (`index.html`, `app.js`, `style.css`) are served by the platform.
- API routes continue to work under `/api/*`.

## Typical Workflow

1. Create habits in the Habits tab.
2. Check off habits from Dashboard.
3. Log mood daily.
4. Review matrix in Calendar.
5. Set AI key/location in Settings.
6. Use Dashboard AI Coach for full-history guidance.
7. Generate weekly/monthly PDF for period-specific AI insights.

## Notes

- Internet access is required for CDN libraries, AI requests, and weather context.
- Importing backup data replaces current app data after confirmation.
- Clear all user data permanently removes local HabitFlow data from this browser.
