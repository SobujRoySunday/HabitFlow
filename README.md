# HabitFlow

HabitFlow is a modern, browser-based habit tracker built with vanilla HTML, CSS, and JavaScript.
It helps you track daily routines, log mood, review consistency, and export progress reports.

## Features

- Dashboard with:
  - Today list of scheduled habits
  - Vitality score based on weighted completion over the last 7 days
  - Best streak display
  - Today mood summary
- Habit management:
  - Add, edit, and delete habits
  - Daily or custom-day schedules
  - Custom color per habit
  - Start date support
- Calendar tracking:
  - Month view per selected habit
  - Completed, missed, future, and not-started states
- Mood tracker:
  - 1 to 5 mood scale with notes
  - Monthly mood history view
- Reports:
  - Weekly and monthly CSV export
  - Weekly and monthly PDF export
  - Completion stats and average mood summary in PDF
- Settings and backup:
  - Profile fields (name, date of birth, weight)
  - Full data export/import as JSON
  - Daily in-app backup reminder

## Privacy and Storage

All data is stored locally in your browser using `localStorage`.
No backend or cloud database is used by default.

If browser storage is cleared, your data will be removed unless you created a backup JSON file.

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript (ES6+)
- External libraries loaded from CDN:
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
```

## Getting Started

No build step is required.

1. Clone or download this project.
2. Open `index.html` directly in a browser, or serve the folder with a local server.

Example local server options:

- Python:

```bash
python -m http.server 5500
```

Then open `http://localhost:5500`.

## How to Use

1. Open the **Habits** tab and create at least one habit.
2. Mark today habits complete from the **Dashboard**.
3. Log your mood in the **Mood** tab.
4. Review progress in **Calendar** and **Reports**.
5. Export backup data regularly in **Settings**.

## Notes

- PDF generation requires internet access to load CDN scripts.
- The app is fully client-side and can run as a static site.
- Importing backup data replaces current local data after confirmation.
