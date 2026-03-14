# HabitFlow

HabitFlow is a browser-based habit tracker built with vanilla HTML, CSS, and JavaScript.
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

- Data is stored in browser localStorage.
- No backend database is required for core app usage.
- Groq API key and AI location settings are stored locally in the same browser.
- AI requests send your app data to Groq when you run AI analysis or generate PDF with AI insights.

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript (ES6+)
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
|- README.md
```

## Getting Started

No build step is required.

1. Clone or download this project.
2. Open `index.html` directly in your browser, or run a local static server.

Example (Python):

```bash
python -m http.server 5500
```

Then open `http://localhost:5500`.

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
