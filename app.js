/* =============================================
   HabitFlow - Habit Tracker Application
   ============================================= */

(function () {
    'use strict';

    // ===== Constants =====
    const STORAGE_KEYS = {
        HABITS: 'habitflow_habits',
        COMPLETIONS: 'habitflow_completions',
        MOODS: 'habitflow_moods',
        PROFILE: 'habitflow_profile',
        LAST_BACKUP_REMINDER: 'habitflow_last_backup_reminder',
        GROQ_API_KEY: 'habitflow_groq_api_key',
        COACH_LOCATION: 'habitflow_coach_location',
    };

    // SVG icon markup for moods (Lucide-style inline SVGs)
    const MOOD_ICONS = {
        5: '<i data-lucide="laugh"></i>',
        4: '<i data-lucide="smile"></i>',
        3: '<i data-lucide="meh"></i>',
        2: '<i data-lucide="frown"></i>',
        1: '<i data-lucide="annoyed"></i>',
    };
    const MOOD_LABELS = { 5: 'Amazing', 4: 'Good', 3: 'Okay', 2: 'Bad', 1: 'Terrible' };
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const GROQ_API_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
    const GROQ_MODEL = 'openai/gpt-oss-120b';
    const REPORT_MARKS = {
        DONE: '✓',
        MISSED: '✗',
        UNSCHEDULED: '-',
    };
    const WEATHER_CODE_LABELS = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Fog',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        56: 'Freezing drizzle',
        57: 'Dense freezing drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        66: 'Light freezing rain',
        67: 'Heavy freezing rain',
        71: 'Slight snow fall',
        73: 'Moderate snow fall',
        75: 'Heavy snow fall',
        77: 'Snow grains',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with hail',
        99: 'Heavy thunderstorm with hail',
    };

    // ===== State =====
    let habits = [];
    let completions = {};
    let moods = {};
    let profile = { name: '', dob: '', weight: '' };
    let calendarMonth = new Date();
    let moodMonth = new Date();
    let editingHabitId = null;
    let selectedMood = null;
    let selectedHabitDate = todayStr();
    let selectedCalendarHabitIds = [];
    let calendarFilterTouched = false;
    let groqApiKey = '';
    let coachLocation = '';
    let coachInsightsCache = {};

    // ===== Helpers =====
    function todayStr() {
        return formatDate(new Date());
    }

    function formatDate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function parseDate(str) {
        const [y, m, d] = str.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function dayOfWeekForDate(dateStr) {
        return parseDate(dateStr).getDay();
    }

    function isHabitScheduledOnDate(habit, dateStr) {
        if (habit.startDate > dateStr) return false;
        if (habit.frequency === 'daily') return true;
        if (habit.frequency === 'custom' && habit.days && habit.days.includes(dayOfWeekForDate(dateStr))) return true;
        return false;
    }

    function clampToToday(dateStr) {
        const today = todayStr();
        if (!dateStr || dateStr > today) return today;
        return dateStr;
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function calcAge(dob) {
        if (!dob) return '';
        const birth = parseDate(dob);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        return age;
    }

    function daysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    function getDateStringsInRange(startDateStr, endDateStr) {
        const dates = [];
        const d = parseDate(startDateStr);
        const end = parseDate(endDateStr);

        while (d <= end) {
            dates.push(formatDate(d));
            d.setDate(d.getDate() + 1);
        }

        return dates;
    }

    function getDateStringsForMonth(year, month) {
        const totalDays = daysInMonth(year, month);
        const dates = [];

        for (let day = 1; day <= totalDays; day++) {
            dates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
        }

        return dates;
    }

    function isHabitActiveInDateList(habit, dateList) {
        return dateList.some(dateStr => isHabitScheduledOnDate(habit, dateStr));
    }

    function shortDateLabel(dateStr) {
        const d = parseDate(dateStr);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    function csvEscape(value) {
        return `"${String(value).replace(/"/g, '""')}"`;
    }

    function shiftDateStr(dateStr, deltaDays) {
        const d = parseDate(dateStr);
        d.setDate(d.getDate() + deltaDays);
        return formatDate(d);
    }

    function weatherCodeLabel(code) {
        return Object.prototype.hasOwnProperty.call(WEATHER_CODE_LABELS, code)
            ? WEATHER_CODE_LABELS[code]
            : `Weather code ${code}`;
    }

    function filterCompletionsInRange(startDate, endDate) {
        const filtered = {};

        Object.keys(completions).forEach(key => {
            const splitIndex = key.lastIndexOf(':');
            if (splitIndex === -1) return;
            const dateStr = key.slice(splitIndex + 1);

            if (dateStr >= startDate && dateStr <= endDate) {
                filtered[key] = completions[key];
            }
        });

        return filtered;
    }

    function filterMoodsInRange(startDate, endDate) {
        const filtered = {};

        Object.keys(moods).forEach(dateStr => {
            if (dateStr >= startDate && dateStr <= endDate) {
                filtered[dateStr] = moods[dateStr];
            }
        });

        return filtered;
    }

    function syncCalendarSelectedHabits(activeHabits) {
        const activeHabitIds = activeHabits.map(h => h.id);

        if (!calendarFilterTouched) {
            selectedCalendarHabitIds = activeHabitIds.slice();
            return;
        }

        const activeSet = new Set(activeHabitIds);
        selectedCalendarHabitIds = selectedCalendarHabitIds.filter(id => activeSet.has(id));
    }

    function setCalendarFilterSummary(selectedCount, totalCount) {
        const summaryEl = document.getElementById('calendar-filter-summary');
        if (!summaryEl) return;

        if (totalCount === 0) {
            summaryEl.textContent = '0 selected';
            return;
        }

        if (selectedCount === totalCount) {
            summaryEl.textContent = `All ${totalCount} selected`;
            return;
        }

        summaryEl.textContent = `${selectedCount} of ${totalCount} selected`;
    }

    function renderCalendarHabitFilter(activeHabits) {
        const listEl = document.getElementById('calendar-habit-filter-list');
        const selectAllBtn = document.getElementById('calendar-filter-select-all');
        const clearBtn = document.getElementById('calendar-filter-clear');

        syncCalendarSelectedHabits(activeHabits);

        if (activeHabits.length === 0) {
            listEl.innerHTML = '<p class="calendar-filter-empty">No active habits in this month</p>';
            if (selectAllBtn) selectAllBtn.disabled = true;
            if (clearBtn) clearBtn.disabled = true;
            setCalendarFilterSummary(0, 0);
            return;
        }

        listEl.innerHTML = activeHabits.map(h => `
            <label class="calendar-habit-chip">
                <input type="checkbox" value="${sanitize(h.id)}" ${selectedCalendarHabitIds.includes(h.id) ? 'checked' : ''}>
                <span><span class="chip-dot" style="background:${sanitize(h.color || '#7c5cfc')}"></span>${sanitize(h.name)}</span>
            </label>
        `).join('');

        listEl.querySelectorAll('input[type="checkbox"]').forEach(input => {
            input.addEventListener('change', () => {
                calendarFilterTouched = true;
                selectedCalendarHabitIds = Array.from(listEl.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
                setCalendarFilterSummary(selectedCalendarHabitIds.length, activeHabits.length);
                renderCalendar();
            });
        });

        if (selectAllBtn) {
            selectAllBtn.disabled = false;
            selectAllBtn.onclick = () => {
                calendarFilterTouched = true;
                selectedCalendarHabitIds = activeHabits.map(h => h.id);
                renderCalendar();
            };
        }

        if (clearBtn) {
            clearBtn.disabled = false;
            clearBtn.onclick = () => {
                calendarFilterTouched = true;
                selectedCalendarHabitIds = [];
                renderCalendar();
            };
        }

        setCalendarFilterSummary(selectedCalendarHabitIds.length, activeHabits.length);
    }

    function sanitize(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    function friendlyDate(d) {
        return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    // ===== Storage =====
    function save() {
        try {
            localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(habits));
            localStorage.setItem(STORAGE_KEYS.COMPLETIONS, JSON.stringify(completions));
            localStorage.setItem(STORAGE_KEYS.MOODS, JSON.stringify(moods));
            localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
        } catch (e) {
            alert('Failed to save data. Local storage may be full.');
        }
    }

    function load() {
        try {
            habits = JSON.parse(localStorage.getItem(STORAGE_KEYS.HABITS)) || [];
            completions = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPLETIONS)) || {};
            moods = JSON.parse(localStorage.getItem(STORAGE_KEYS.MOODS)) || {};
            profile = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILE)) || { name: '', dob: '', weight: '' };
            groqApiKey = localStorage.getItem(STORAGE_KEYS.GROQ_API_KEY) || '';
            coachLocation = localStorage.getItem(STORAGE_KEYS.COACH_LOCATION) || '';
            coachInsightsCache = {};
        } catch (e) {
            habits = [];
            completions = {};
            moods = {};
            profile = { name: '', dob: '', weight: '' };
            groqApiKey = '';
            coachLocation = '';
            coachInsightsCache = {};
        }
    }

    // ===== Navigation =====
    function initNavigation() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = link.dataset.tab;
                switchTab(tab);
            });
        });
    }

    function switchTab(tab) {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        const link = document.querySelector(`.nav-link[data-tab="${tab}"]`);
        const content = document.getElementById('tab-' + tab);
        if (link) link.classList.add('active');
        if (content) content.classList.add('active');

        if (tab === 'dashboard') renderDashboard();
        if (tab === 'habits') renderHabitsList();
        if (tab === 'calendar') renderCalendar();
        if (tab === 'mood') renderMoodTab();
        if (tab === 'settings') loadProfileForm();
        refreshIcons();
    }

    // ===== Dashboard =====
    function renderDashboard() {
        // Set dashboard date
        const dateEl = document.getElementById('dashboard-date');
        if (dateEl) dateEl.textContent = friendlyDate(new Date());

        renderTodayHabits();
        renderVitality();
        renderDashboardMood();
        renderBestStreak();
        refreshIcons();
    }

    function renderTodayHabits() {
        const container = document.getElementById('today-habits-list');
        const dateInput = document.getElementById('habit-check-date');
        const dateLabel = document.getElementById('habit-check-date-label');
        const today = todayStr();

        selectedHabitDate = clampToToday(selectedHabitDate || today);

        if (dateInput) {
            dateInput.max = today;
            dateInput.value = selectedHabitDate;
        }

        if (dateLabel) {
            dateLabel.textContent = friendlyDate(parseDate(selectedHabitDate));
        }

        const habitsForDate = habits.filter(h => isHabitScheduledOnDate(h, selectedHabitDate));

        if (habitsForDate.length === 0) {
            container.innerHTML = '<p class="empty-state">No habits scheduled for this date.</p>';
            return;
        }

        container.innerHTML = habitsForDate.map(h => {
            const key = h.id + ':' + selectedHabitDate;
            const done = !!completions[key];
            return `<div class="today-habit-item ${done ? 'done' : ''}" data-habit-id="${sanitize(h.id)}" style="border-left-color: ${sanitize(h.color || '#7c5cfc')}">
                <div class="habit-check">${done ? '<i data-lucide="check"></i>' : ''}</div>
                <span class="habit-label">${sanitize(h.name)}</span>
            </div>`;
        }).join('');

        container.querySelectorAll('.today-habit-item').forEach(item => {
            item.addEventListener('click', () => {
                const hId = item.dataset.habitId;
                const key = hId + ':' + selectedHabitDate;
                completions[key] = !completions[key];
                if (!completions[key]) delete completions[key];
                save();
                renderDashboard();
                renderCalendar();
            });
        });

        refreshIcons();
    }

    function initDashboardDateControls() {
        const dateInput = document.getElementById('habit-check-date');
        if (!dateInput) return;

        selectedHabitDate = clampToToday(dateInput.value || todayStr());
        dateInput.max = todayStr();
        dateInput.value = selectedHabitDate;

        dateInput.addEventListener('change', () => {
            selectedHabitDate = clampToToday(dateInput.value);
            dateInput.value = selectedHabitDate;
            renderTodayHabits();
        });
    }

    function renderVitality() {
        const todayDate = new Date();

        let totalWeight = 0;
        let weightedSum = 0;

        for (let i = 0; i < 7; i++) {
            const d = new Date(todayDate);
            d.setDate(d.getDate() - i);
            const ds = formatDate(d);
            const weight = 7 - i;

            const dayHabits = habits.filter(h => isHabitScheduledOnDate(h, ds));

            if (dayHabits.length > 0) {
                const done = dayHabits.filter(h => completions[h.id + ':' + ds]).length;
                weightedSum += (done / dayHabits.length) * weight;
                totalWeight += weight;
            }
        }

        const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;
        const ring = document.getElementById('vitality-ring');
        const scoreEl = document.getElementById('vitality-score');
        const labelEl = document.getElementById('vitality-label');

        scoreEl.textContent = score;
        const circumference = 2 * Math.PI * 52;
        ring.style.strokeDashoffset = circumference - (score / 100) * circumference;

        if (score >= 80) {
            ring.style.stroke = '#34d399';
            labelEl.textContent = 'Excellent';
        } else if (score >= 60) {
            ring.style.stroke = '#7c5cfc';
            labelEl.textContent = 'Good progress';
        } else if (score >= 40) {
            ring.style.stroke = '#fbbf24';
            labelEl.textContent = 'Keep pushing';
        } else if (score > 0) {
            ring.style.stroke = '#f87171';
            labelEl.textContent = 'Needs attention';
        } else {
            ring.style.stroke = 'rgba(255,255,255,0.05)';
            labelEl.textContent = 'Start tracking!';
        }
    }

    function renderDashboardMood() {
        const container = document.getElementById('dashboard-mood');
        const today = todayStr();
        const todayMood = moods[today];

        if (todayMood) {
            container.innerHTML = `
                <div class="mood-icon-lg">${MOOD_ICONS[todayMood.mood]}</div>
                <p class="mood-text">${MOOD_LABELS[todayMood.mood]}</p>
                ${todayMood.note ? `<p class="mood-text" style="font-size:0.75rem;margin-top:0.2rem;color:var(--text-muted);">"${sanitize(todayMood.note)}"</p>` : ''}
            `;
        } else {
            container.innerHTML = '<p class="no-mood">No mood logged today</p>';
        }
        refreshIcons();
    }

    function calculateBestStreak() {
        let bestStreak = 0;

        habits.forEach(h => {
            let streak = 0;
            const d = new Date();
            for (let i = 0; i < 365; i++) {
                const ds = formatDate(d);
                if (ds < h.startDate) break;
                const isScheduled = isHabitScheduledOnDate(h, ds);

                if (isScheduled) {
                    if (completions[h.id + ':' + ds]) {
                        streak++;
                    } else {
                        if (streak > bestStreak) bestStreak = streak;
                        streak = 0;
                    }
                }
                d.setDate(d.getDate() - 1);
            }
            if (streak > bestStreak) bestStreak = streak;
        });

        return bestStreak;
    }

    function renderBestStreak() {
        document.getElementById('best-streak').textContent = calculateBestStreak();
    }

    // ===== Habits CRUD =====
    function renderHabitsList() {
        const container = document.getElementById('habits-list');

        if (habits.length === 0) {
            container.innerHTML = '<p class="empty-state">No habits yet. Click "Add Habit" to create one!</p>';
            refreshIcons();
            return;
        }

        container.innerHTML = habits.map(h => {
            const freqText = h.frequency === 'daily' ? 'Daily' :
                'Custom: ' + (h.days || []).map(d => DAY_NAMES[d]).join(', ');
            return `<div class="habit-card" style="border-left-color: ${sanitize(h.color || '#7c5cfc')}">
                <div class="habit-card-info">
                    <span class="habit-card-name">${sanitize(h.name)}</span>
                    <span class="habit-card-meta">Since ${sanitize(h.startDate)} &middot; ${freqText}</span>
                </div>
                <div class="habit-card-actions">
                    <button class="btn btn-icon" title="Edit" data-edit="${sanitize(h.id)}"><i data-lucide="pencil"></i></button>
                    <button class="btn btn-icon" title="Delete" data-delete="${sanitize(h.id)}"><i data-lucide="trash-2"></i></button>
                </div>
            </div>`;
        }).join('');

        container.querySelectorAll('[data-edit]').forEach(btn => {
            btn.addEventListener('click', () => openHabitModal(btn.dataset.edit));
        });

        container.querySelectorAll('[data-delete]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('Delete this habit and all its data?')) {
                    deleteHabit(btn.dataset.delete);
                }
            });
        });

        refreshIcons();
    }

    function deleteHabit(id) {
        habits = habits.filter(h => h.id !== id);
        Object.keys(completions).forEach(key => {
            if (key.startsWith(id + ':')) delete completions[key];
        });
        save();
        renderHabitsList();
        renderDashboard();
        renderCalendar();
    }

    function openHabitModal(habitId) {
        editingHabitId = habitId || null;
        const modal = document.getElementById('habit-modal');
        const title = document.getElementById('modal-title');
        const nameInput = document.getElementById('habit-name');
        const startInput = document.getElementById('habit-start');
        const freqSelect = document.getElementById('habit-frequency');
        const colorInput = document.getElementById('habit-color');
        const customGroup = document.getElementById('custom-days-group');
        const dayCheckboxes = customGroup.querySelectorAll('input[type="checkbox"]');

        if (habitId) {
            const h = habits.find(x => x.id === habitId);
            if (!h) return;
            title.textContent = 'Edit Habit';
            nameInput.value = h.name;
            startInput.value = h.startDate;
            freqSelect.value = h.frequency;
            colorInput.value = h.color || '#7c5cfc';
            dayCheckboxes.forEach(cb => {
                cb.checked = (h.days || []).includes(Number(cb.value));
            });
        } else {
            title.textContent = 'Add New Habit';
            nameInput.value = '';
            startInput.value = todayStr();
            freqSelect.value = 'daily';
            colorInput.value = '#7c5cfc';
            dayCheckboxes.forEach(cb => cb.checked = false);
        }

        customGroup.style.display = freqSelect.value === 'custom' ? 'block' : 'none';
        modal.classList.add('visible');
        nameInput.focus();
        refreshIcons();
    }

    function closeHabitModal() {
        document.getElementById('habit-modal').classList.remove('visible');
        editingHabitId = null;
    }

    function saveHabit() {
        const name = document.getElementById('habit-name').value.trim();
        const startDate = document.getElementById('habit-start').value;
        const frequency = document.getElementById('habit-frequency').value;
        const color = document.getElementById('habit-color').value;

        if (!name) { alert('Please enter a habit name.'); return; }
        if (!startDate) { alert('Please select a start date.'); return; }

        let days = [];
        if (frequency === 'custom') {
            days = Array.from(document.querySelectorAll('#custom-days-group input:checked'))
                .map(cb => Number(cb.value));
            if (days.length === 0) { alert('Please select at least one day.'); return; }
        }

        if (editingHabitId) {
            const h = habits.find(x => x.id === editingHabitId);
            if (h) {
                h.name = name;
                h.startDate = startDate;
                h.frequency = frequency;
                h.color = color;
                h.days = days;
            }
        } else {
            habits.push({
                id: generateId(),
                name,
                startDate,
                frequency,
                color,
                days,
            });
        }

        save();
        closeHabitModal();
        renderHabitsList();
        renderDashboard();
        renderCalendar();
    }

    function initHabitModal() {
        document.getElementById('btn-add-habit').addEventListener('click', () => openHabitModal(null));
        document.getElementById('modal-close').addEventListener('click', closeHabitModal);
        document.getElementById('modal-cancel').addEventListener('click', closeHabitModal);
        document.getElementById('modal-save').addEventListener('click', saveHabit);

        document.getElementById('habit-modal').addEventListener('click', (e) => {
            if (e.target.id === 'habit-modal') closeHabitModal();
        });

        document.getElementById('habit-frequency').addEventListener('change', (e) => {
            document.getElementById('custom-days-group').style.display =
                e.target.value === 'custom' ? 'block' : 'none';
        });
    }

    // ===== Calendar =====
    function renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        document.getElementById('cal-month-label').textContent =
            MONTH_NAMES[month] + ' ' + year;

        const monthDates = getDateStringsForMonth(year, month);
        const activeHabits = habits.filter(h => isHabitActiveInDateList(h, monthDates));

        renderCalendarHabitFilter(activeHabits);

        if (activeHabits.length === 0) {
            grid.innerHTML = '<p class="empty-state">No active habits in this month yet</p>';
            return;
        }

        const habitsToDisplay = activeHabits.filter(h => selectedCalendarHabitIds.includes(h.id));

        if (habitsToDisplay.length === 0) {
            grid.innerHTML = '<p class="empty-state">Select one or more habits above to display them in the calendar</p>';
            return;
        }

        const todayD = todayStr();

        let html = `
            <div class="calendar-legend">
                <span class="legend-item"><span class="legend-mark completed"><i data-lucide="check"></i></span>Tick = Completed</span>
                <span class="legend-item"><span class="legend-mark missed"><i data-lucide="x"></i></span>Cross = Missed</span>
                <span class="legend-item"><span class="legend-mark unscheduled"><i data-lucide="minus"></i></span>Not scheduled</span>
            </div>
            <table class="calendar-matrix-table">
                <thead>
                    <tr>
                        <th class="habit-head">Habit</th>
        `;

        monthDates.forEach(dateStr => {
            const dayNum = Number(dateStr.slice(-2));
            const dow = DAY_NAMES[dayOfWeekForDate(dateStr)];
            const isToday = dateStr === todayD;
            html += `<th class="matrix-day-head ${isToday ? 'today-col' : ''}" title="${sanitize(dateStr)}">${dayNum}<span class="matrix-dow">${dow}</span></th>`;
        });

        html += '</tr></thead><tbody>';

        habitsToDisplay.forEach(habit => {
            html += `<tr><td class="habit-col"><span class="habit-dot" style="background:${sanitize(habit.color || '#7c5cfc')}"></span><span>${sanitize(habit.name)}</span></td>`;

            monthDates.forEach(dateStr => {
                const key = habit.id + ':' + dateStr;
                const isScheduled = isHabitScheduledOnDate(habit, dateStr);
                const isFuture = dateStr > todayD;
                const isBeforeStart = dateStr < habit.startDate;

                let stateClass = isBeforeStart ? 'not-started' : 'unscheduled';
                let marker = '<span class="matrix-placeholder">-</span>';
                let titleText = `${habit.name} on ${dateStr}: Not scheduled`;
                let canToggle = false;

                if (isScheduled) {
                    if (isFuture) {
                        stateClass = 'future';
                        titleText = `${habit.name} on ${dateStr}: Upcoming`;
                    } else {
                        const done = !!completions[key];
                        stateClass = done ? 'completed' : 'missed';
                        marker = done ? '<i data-lucide="check"></i>' : '<i data-lucide="x"></i>';
                        titleText = `${habit.name} on ${dateStr}: ${done ? 'Completed' : 'Missed'}. Click to toggle.`;
                        canToggle = true;
                    }
                } else if (isBeforeStart) {
                    titleText = `${habit.name} on ${dateStr}: Not started`;
                }

                const todayClass = dateStr === todayD ? 'today' : '';
                const toggleAttrs = canToggle
                    ? `data-habit-id="${sanitize(habit.id)}" data-date="${sanitize(dateStr)}"`
                    : '';

                html += `<td class="matrix-cell"><div class="matrix-mark ${stateClass} ${todayClass} ${canToggle ? 'togglable' : ''}" ${toggleAttrs} title="${sanitize(titleText)}">${marker}</div></td>`;
            });

            html += '</tr>';
        });

        html += '</tbody></table>';
        grid.innerHTML = html;

        grid.querySelectorAll('.matrix-mark.togglable').forEach(markEl => {
            markEl.addEventListener('click', () => {
                const habitId = markEl.dataset.habitId;
                const dateStr = markEl.dataset.date;

                if (!habitId || !dateStr) return;

                const key = habitId + ':' + dateStr;
                completions[key] = !completions[key];
                if (!completions[key]) delete completions[key];
                save();
                renderCalendar();
                renderDashboard();
            });
        });

        refreshIcons();
    }

    function initCalendar() {
        document.getElementById('cal-prev').addEventListener('click', () => {
            calendarMonth.setMonth(calendarMonth.getMonth() - 1);
            renderCalendar();
        });
        document.getElementById('cal-next').addEventListener('click', () => {
            calendarMonth.setMonth(calendarMonth.getMonth() + 1);
            renderCalendar();
        });
    }

    // ===== Mood Tracker =====
    function renderMoodTab() {
        renderMoodInput();
        renderMoodHistory();
    }

    function renderMoodInput() {
        const today = todayStr();
        const todayMood = moods[today];

        document.querySelectorAll('.mood-btn').forEach(btn => {
            btn.classList.remove('selected');
            if (todayMood && Number(btn.dataset.mood) === todayMood.mood) {
                btn.classList.add('selected');
                selectedMood = todayMood.mood;
            }
        });

        document.getElementById('mood-note').value = todayMood ? todayMood.note || '' : '';
    }

    function renderMoodHistory() {
        const container = document.getElementById('mood-history');
        const year = moodMonth.getFullYear();
        const month = moodMonth.getMonth();

        document.getElementById('mood-month-label').textContent =
            MONTH_NAMES[month] + ' ' + year;

        const totalDays = daysInMonth(year, month);
        let html = '';

        // Day headers
        DAY_NAMES.forEach(d => {
            html += `<div class="mood-day" style="font-weight:600;background:transparent;"><span class="mood-day-num">${d}</span></div>`;
        });

        // Empty cells
        const firstDay = new Date(year, month, 1).getDay();
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="mood-day" style="background:transparent;"></div>';
        }

        for (let d = 1; d <= totalDays; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const moodData = moods[dateStr];
            const level = moodData ? moodData.mood : 0;
            const icon = moodData ? MOOD_ICONS[moodData.mood] : '<span class="mood-day-dot"></span>';
            const titleText = moodData ? MOOD_LABELS[moodData.mood] + (moodData.note ? ': ' + sanitize(moodData.note) : '') : 'No mood';

            html += `<div class="mood-day" data-level="${level}" title="${titleText}">
                <span class="mood-day-num">${d}</span>
                <span class="mood-day-icon">${icon}</span>
            </div>`;
        }

        container.innerHTML = html;
        refreshIcons();
    }

    function initMood() {
        document.querySelectorAll('.mood-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedMood = Number(btn.dataset.mood);
            });
        });

        document.getElementById('btn-save-mood').addEventListener('click', () => {
            if (!selectedMood) { alert('Please select a mood.'); return; }
            const note = document.getElementById('mood-note').value.trim();
            moods[todayStr()] = { mood: selectedMood, note };
            save();
            renderMoodTab();
            renderDashboard();
            alert('Mood saved!');
        });

        document.getElementById('mood-prev').addEventListener('click', () => {
            moodMonth.setMonth(moodMonth.getMonth() - 1);
            renderMoodHistory();
        });

        document.getElementById('mood-next').addEventListener('click', () => {
            moodMonth.setMonth(moodMonth.getMonth() + 1);
            renderMoodHistory();
        });
    }

    // ===== Reports =====
    function getReportMatrixData(startDate, endDate) {
        const dates = getDateStringsInRange(startDate, endDate);

        const rows = habits
            .filter(habit => isHabitActiveInDateList(habit, dates))
            .map(habit => {
                let completed = 0;
                let scheduled = 0;

                const marks = dates.map(dateStr => {
                    if (!isHabitScheduledOnDate(habit, dateStr)) {
                        return REPORT_MARKS.UNSCHEDULED;
                    }

                    scheduled++;
                    const done = !!completions[habit.id + ':' + dateStr];
                    if (done) {
                        completed++;
                        return REPORT_MARKS.DONE;
                    }

                    return REPORT_MARKS.MISSED;
                });

                const rate = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;

                return {
                    habitName: habit.name,
                    marks,
                    completed,
                    scheduled,
                    rate,
                };
            });

        const totalScheduled = rows.reduce((sum, row) => sum + row.scheduled, 0);
        const totalDone = rows.reduce((sum, row) => sum + row.completed, 0);
        const overallRate = totalScheduled > 0 ? Math.round((totalDone / totalScheduled) * 100) : 0;

        return { dates, rows, totalScheduled, totalDone, overallRate };
    }

    function getDateRange(type) {
        const today = new Date();
        let start;
        if (type === 'weekly') {
            start = new Date(today);
            start.setDate(start.getDate() - 6);
        } else {
            start = new Date(today.getFullYear(), today.getMonth(), 1);
        }
        return { start: formatDate(start), end: formatDate(today) };
    }

    function getAverageMoodForRange(startDate, endDate) {
        const moodValues = [];
        const dates = getDateStringsInRange(startDate, endDate);

        dates.forEach(dateStr => {
            const moodEntry = moods[dateStr];
            if (moodEntry && typeof moodEntry.mood === 'number') {
                moodValues.push(moodEntry.mood);
            }
        });

        if (moodValues.length === 0) {
            return null;
        }

        return Number((moodValues.reduce((sum, val) => sum + val, 0) / moodValues.length).toFixed(2));
    }

    function getSummaryForRange(startDate, endDate) {
        const matrix = getReportMatrixData(startDate, endDate);
        return {
            range: { start: startDate, end: endDate },
            totalScheduled: matrix.totalScheduled,
            totalCompleted: matrix.totalDone,
            completionRate: matrix.overallRate,
            averageMood: getAverageMoodForRange(startDate, endDate),
        };
    }

    function getPeriodContext(periodType) {
        const range = getDateRange(periodType);
        const dayCount = getDateStringsInRange(range.start, range.end).length;
        const previousEnd = shiftDateStr(range.start, -1);
        const previousStart = shiftDateStr(previousEnd, -(dayCount - 1));

        return {
            type: periodType,
            range,
            dayCount,
            previousRange: {
                start: previousStart,
                end: previousEnd,
            },
        };
    }

    function getAllTrackedDateRange() {
        const today = todayStr();
        const candidateDates = [today];

        habits.forEach(habit => {
            if (habit && habit.startDate) {
                candidateDates.push(habit.startDate);
            }
        });

        Object.keys(moods).forEach(dateStr => {
            candidateDates.push(dateStr);
        });

        Object.keys(completions).forEach(key => {
            const splitIndex = key.lastIndexOf(':');
            if (splitIndex === -1) return;
            candidateDates.push(key.slice(splitIndex + 1));
        });

        candidateDates.sort();
        const start = candidateDates[0] || today;
        const end = today;
        const dayCount = getDateStringsInRange(start, end).length;

        return { start, end, dayCount };
    }

    function getCurrentStreakForHabit(habit) {
        let streak = 0;
        const today = new Date();

        for (let i = 0; i < 365; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const ds = formatDate(d);

            if (ds < habit.startDate) break;

            if (!isHabitScheduledOnDate(habit, ds)) continue;

            if (completions[habit.id + ':' + ds]) {
                streak++;
            } else {
                break;
            }
        }

        return streak;
    }

    function getHabitSummaryForRange(habit, startDate, endDate) {
        const dates = getDateStringsInRange(startDate, endDate);
        let scheduled = 0;
        let done = 0;

        dates.forEach(dateStr => {
            if (!isHabitScheduledOnDate(habit, dateStr)) return;
            scheduled++;
            if (completions[habit.id + ':' + dateStr]) {
                done++;
            }
        });

        const rate = scheduled > 0 ? Math.round((done / scheduled) * 100) : 0;
        return { scheduled, done, rate };
    }

    async function fetchWeatherContext(locationInput) {
        const query = (locationInput || '').trim();
        if (!query) {
            return { status: 'not_configured' };
        }

        try {
            const geoResp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
            if (!geoResp.ok) {
                return { status: 'geocode_error', query, reason: `HTTP ${geoResp.status}` };
            }

            const geoData = await geoResp.json();
            const place = geoData && Array.isArray(geoData.results) ? geoData.results[0] : null;

            if (!place) {
                return { status: 'location_not_found', query };
            }

            const lat = Number(place.latitude);
            const lon = Number(place.longitude);
            const weatherResp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=1&timezone=auto`);

            if (!weatherResp.ok) {
                return {
                    status: 'weather_error',
                    query,
                    resolvedLocation: `${place.name}${place.admin1 ? ', ' + place.admin1 : ''}${place.country ? ', ' + place.country : ''}`,
                    latitude: lat,
                    longitude: lon,
                    reason: `HTTP ${weatherResp.status}`,
                };
            }

            const weatherData = await weatherResp.json();
            const current = weatherData.current || {};
            const daily = weatherData.daily || {};
            const weatherCode = typeof current.weather_code === 'number' ? current.weather_code : null;
            const dayCode = Array.isArray(daily.weather_code) && typeof daily.weather_code[0] === 'number'
                ? daily.weather_code[0]
                : null;

            return {
                status: 'ok',
                query,
                resolvedLocation: `${place.name}${place.admin1 ? ', ' + place.admin1 : ''}${place.country ? ', ' + place.country : ''}`,
                latitude: lat,
                longitude: lon,
                timezone: weatherData.timezone || place.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                current: {
                    temperatureC: typeof current.temperature_2m === 'number' ? current.temperature_2m : null,
                    humidityPercent: typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : null,
                    windSpeedKmh: typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : null,
                    weatherCode,
                    condition: weatherCode === null ? null : weatherCodeLabel(weatherCode),
                },
                todayForecast: {
                    maxTempC: Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : null,
                    minTempC: Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : null,
                    precipitationProbabilityMax: Array.isArray(daily.precipitation_probability_max)
                        ? daily.precipitation_probability_max[0]
                        : null,
                    weatherCode: dayCode,
                    condition: dayCode === null ? null : weatherCodeLabel(dayCode),
                },
            };
        } catch (err) {
            return {
                status: 'weather_unavailable',
                query,
                reason: err && err.message ? err.message : 'Network error',
            };
        }
    }

    function buildCoachPayloadForPeriod(periodContext, weatherContext) {
        const periodRange = periodContext.range;
        const previousRange = periodContext.previousRange;

        const habitPerformance = habits.map(habit => {
            const periodSummary = getHabitSummaryForRange(habit, periodRange.start, periodRange.end);
            const previousSummary = getHabitSummaryForRange(habit, previousRange.start, previousRange.end);

            return {
                habitId: habit.id,
                name: habit.name,
                frequency: habit.frequency,
                startDate: habit.startDate,
                currentStreak: getCurrentStreakForHabit(habit),
                period: periodSummary,
                previousPeriod: previousSummary,
            };
        });

        return {
            generatedAt: new Date().toISOString(),
            todayContext: {
                isoDate: todayStr(),
                friendlyDate: friendlyDate(new Date()),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                locale: navigator.language || 'en-US',
            },
            period: {
                type: periodContext.type,
                range: periodRange,
                dayCount: periodContext.dayCount,
                previousRange,
            },
            profile,
            habits: habits.map(habit => ({
                id: habit.id,
                name: habit.name,
                frequency: habit.frequency,
                startDate: habit.startDate,
            })),
            periodData: {
                completions: filterCompletionsInRange(periodRange.start, periodRange.end),
                moods: filterMoodsInRange(periodRange.start, periodRange.end),
            },
            summary: {
                bestStreakOverall: calculateBestStreak(),
                activeHabitCount: habits.length,
                period: getSummaryForRange(periodRange.start, periodRange.end),
                previousPeriod: getSummaryForRange(previousRange.start, previousRange.end),
                habitPerformance,
            },
            context: {
                configuredLocation: coachLocation || null,
                weather: weatherContext,
            },
        };
    }

    function buildCoachPayloadForFullHistory(weatherContext) {
        const historyRange = getAllTrackedDateRange();
        const last7Range = getDateRange('weekly');
        const recent30Range = {
            start: shiftDateStr(todayStr(), -29),
            end: todayStr(),
        };

        const habitPerformance = habits.map(habit => ({
            habitId: habit.id,
            name: habit.name,
            frequency: habit.frequency,
            startDate: habit.startDate,
            currentStreak: getCurrentStreakForHabit(habit),
            fullHistory: getHabitSummaryForRange(habit, historyRange.start, historyRange.end),
            last30Days: getHabitSummaryForRange(habit, recent30Range.start, recent30Range.end),
        }));

        return {
            generatedAt: new Date().toISOString(),
            todayContext: {
                isoDate: todayStr(),
                friendlyDate: friendlyDate(new Date()),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                locale: navigator.language || 'en-US',
            },
            scope: 'full_history',
            historyRange,
            profile,
            habits: habits.map(habit => ({
                id: habit.id,
                name: habit.name,
                frequency: habit.frequency,
                startDate: habit.startDate,
            })),
            fullData: {
                completions,
                moods,
            },
            summary: {
                bestStreakOverall: calculateBestStreak(),
                activeHabitCount: habits.length,
                fullHistory: getSummaryForRange(historyRange.start, historyRange.end),
                last7Days: getSummaryForRange(last7Range.start, last7Range.end),
                last30Days: getSummaryForRange(recent30Range.start, recent30Range.end),
                habitPerformance,
            },
            context: {
                configuredLocation: coachLocation || null,
                weather: weatherContext,
            },
        };
    }

    function setCoachStatus(message, type) {
        const statusEl = document.getElementById('coach-status-dashboard');
        if (!statusEl) return;

        statusEl.textContent = message || '';
        statusEl.classList.remove('success', 'error');
        if (type === 'success') statusEl.classList.add('success');
        if (type === 'error') statusEl.classList.add('error');
    }

    function normalizeStringArray(value, maxItems) {
        if (!Array.isArray(value)) return [];
        return value
            .filter(item => typeof item === 'string' && item.trim())
            .map(item => item.trim())
            .slice(0, maxItems);
    }

    function parseCoachJsonResponse(content) {
        if (!content || typeof content !== 'string') return null;

        try {
            return JSON.parse(content);
        } catch (err) {
            const start = content.indexOf('{');
            const end = content.lastIndexOf('}');
            if (start === -1 || end === -1 || end <= start) {
                return null;
            }
            try {
                return JSON.parse(content.slice(start, end + 1));
            } catch (err2) {
                return null;
            }
        }
    }

    function renderStreamingCoachOutput(rawText) {
        const outputEl = document.getElementById('coach-output-dashboard');
        if (!outputEl) return;

        outputEl.innerHTML = `<pre class="coach-raw">${sanitize(rawText)}</pre>`;
    }

    function renderCoachInsights(parsed, fallbackText, outputId) {
        const outputEl = document.getElementById(outputId || 'coach-output-dashboard');
        if (!outputEl) return;

        if (!parsed) {
            outputEl.innerHTML = `<pre class="coach-raw">${sanitize(fallbackText || 'No content returned by model.')}</pre>`;
            return;
        }

        const analysis = typeof parsed.analysis === 'string' ? parsed.analysis.trim() : '';
        const tips = normalizeStringArray(parsed.tips, 8);
        const advice = normalizeStringArray(parsed.advice, 8);
        const quotes = normalizeStringArray(parsed.quotes, 6);
        const actionPlan = normalizeStringArray(parsed.action_plan || parsed.actionPlan, 8);

        let html = '';

        if (analysis) {
            html += `<section class="coach-section"><h3>Analysis</h3><p>${sanitize(analysis)}</p></section>`;
        }

        if (tips.length > 0) {
            html += `<section class="coach-section"><h3>Tips</h3><ul class="coach-list">${tips.map(item => `<li>${sanitize(item)}</li>`).join('')}</ul></section>`;
        }

        if (advice.length > 0) {
            html += `<section class="coach-section"><h3>Advice</h3><ul class="coach-list">${advice.map(item => `<li>${sanitize(item)}</li>`).join('')}</ul></section>`;
        }

        if (actionPlan.length > 0) {
            html += `<section class="coach-section"><h3>Action Plan</h3><ul class="coach-list">${actionPlan.map(item => `<li>${sanitize(item)}</li>`).join('')}</ul></section>`;
        }

        if (quotes.length > 0) {
            html += `<section class="coach-section"><h3>Motivation Quotes</h3>${quotes.map(item => `<blockquote class="coach-quote">${sanitize(item)}</blockquote>`).join('')}</section>`;
        }

        if (!html) {
            html = `<pre class="coach-raw">${sanitize(JSON.stringify(parsed, null, 2))}</pre>`;
        }

        outputEl.innerHTML = html;
    }

    function getCoachCacheKey(periodContext) {
        return `${periodContext.type}:${periodContext.range.start}:${periodContext.range.end}:${(coachLocation || '').trim().toLowerCase()}`;
    }

    async function requestGroqCoachCompletion(messages, options) {
        const useStream = !!(options && options.stream);
        const onChunk = options && typeof options.onChunk === 'function' ? options.onChunk : null;

        const response = await fetch(GROQ_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${groqApiKey}`,
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                temperature: 0.7,
                stream: useStream,
                messages,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Groq request failed (${response.status}): ${errText.slice(0, 220)}`);
        }

        if (!useStream || !response.body) {
            const result = await response.json();
            const content = result && result.choices && result.choices[0] && result.choices[0].message
                ? result.choices[0].message.content
                : '';
            return { content };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let done = false;
        let buffer = '';
        let content = '';

        while (!done) {
            const readResult = await reader.read();
            done = readResult.done;
            buffer += decoder.decode(readResult.value || new Uint8Array(), { stream: !done });

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) return;

                const data = trimmed.slice(5).trim();
                if (!data || data === '[DONE]') return;

                try {
                    const parsed = JSON.parse(data);
                    const chunk = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].delta
                        ? parsed.choices[0].delta.content || ''
                        : '';
                    if (!chunk) return;

                    content += chunk;
                    if (onChunk) {
                        onChunk(chunk, content);
                    }
                } catch (err) {
                    // Ignore malformed stream lines.
                }
            });
        }

        return { content };
    }

    async function getCoachInsightsForPeriod(periodType, options) {
        const periodContext = getPeriodContext(periodType);
        const useCache = options && Object.prototype.hasOwnProperty.call(options, 'useCache')
            ? !!options.useCache
            : true;
        const cacheKey = getCoachCacheKey(periodContext);

        if (useCache && coachInsightsCache[cacheKey]) {
            return coachInsightsCache[cacheKey];
        }

        const weatherContext = await fetchWeatherContext(coachLocation);
        const payload = buildCoachPayloadForPeriod(periodContext, weatherContext);

        const messages = [
            {
                role: 'system',
                content: 'You are a compassionate habit coach. Return JSON only with keys: analysis (string), tips (string[]), advice (string[]), action_plan (string[]), quotes (string[]). Focus your evaluation on the provided period, while using today and weather/location context for practical action steps.',
            },
            {
                role: 'user',
                content: 'Analyze this HabitFlow dataset and provide coaching. The response must be tailored to ONLY the provided period window. Data: ' + JSON.stringify(payload),
            },
        ];

        const response = await requestGroqCoachCompletion(messages, options || {});
        const parsed = parseCoachJsonResponse(response.content);

        const result = {
            parsed,
            content: response.content,
            periodContext,
            weatherContext,
        };

        coachInsightsCache[cacheKey] = result;
        return result;
    }

    async function getCoachInsightsForFullHistory(options) {
        const useCache = options && Object.prototype.hasOwnProperty.call(options, 'useCache')
            ? !!options.useCache
            : true;

        const cacheKey = `full-history:${todayStr()}:${(coachLocation || '').trim().toLowerCase()}:${habits.length}:${Object.keys(completions).length}:${Object.keys(moods).length}`;

        if (useCache && coachInsightsCache[cacheKey]) {
            return coachInsightsCache[cacheKey];
        }

        const weatherContext = await fetchWeatherContext(coachLocation);
        const payload = buildCoachPayloadForFullHistory(weatherContext);

        const messages = [
            {
                role: 'system',
                content: 'You are a compassionate habit coach. Return JSON only with keys: analysis (string), tips (string[]), advice (string[]), action_plan (string[]), quotes (string[]). Evaluate the user across their complete tracked history, use trend-aware reasoning, and provide practical actions that fit today and provided weather/location context.',
            },
            {
                role: 'user',
                content: 'Analyze this HabitFlow dataset and provide coaching using the entire history. Data: ' + JSON.stringify(payload),
            },
        ];

        const response = await requestGroqCoachCompletion(messages, options || {});
        const parsed = parseCoachJsonResponse(response.content);

        const result = {
            parsed,
            content: response.content,
            scope: 'full_history',
            weatherContext,
        };

        coachInsightsCache[cacheKey] = result;
        return result;
    }

    async function runDashboardCoachAnalysis() {
        const btn = document.getElementById('btn-groq-coach-dashboard');

        if (!groqApiKey) {
            setCoachStatus('Configure Groq API key in Settings first.', 'error');
            return;
        }

        if (btn) btn.disabled = true;
        setCoachStatus('Streaming AI coach suggestions...', '');
        renderStreamingCoachOutput('Starting analysis...');

        try {
            const result = await getCoachInsightsForFullHistory({
                stream: true,
                useCache: false,
                onChunk: function (_chunk, fullText) {
                    renderStreamingCoachOutput(fullText);
                },
            });

            renderCoachInsights(result.parsed, result.content, 'coach-output-dashboard');
            setCoachStatus('Full-history AI plan generated successfully.', 'success');
        } catch (err) {
            const message = err && err.message ? err.message : 'Unknown error while calling Groq API.';
            setCoachStatus(message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function generateCSV(type) {
        const { start, end } = getDateRange(type);
        const matrix = getReportMatrixData(start, end);

        const header = ['Habit', ...matrix.dates.map(shortDateLabel), 'Completed', 'Scheduled', 'Rate'];
        let csv = header.map(csvEscape).join(',') + '\n';

        if (matrix.rows.length === 0) {
            csv += `${csvEscape('No active habits in this period')}\n`;
        } else {
            matrix.rows.forEach(row => {
                const cells = [
                    row.habitName,
                    ...row.marks,
                    row.completed,
                    row.scheduled,
                    `${row.rate}%`,
                ];
                csv += cells.map(csvEscape).join(',') + '\n';
            });
        }

        csv += '\nSummary\n';
        csv += `${csvEscape('Total Scheduled')},${csvEscape(matrix.totalScheduled)}\n`;
        csv += `${csvEscape('Completed')},${csvEscape(matrix.totalDone)}\n`;
        csv += `${csvEscape('Completion Rate')},${csvEscape(matrix.overallRate + '%')}\n`;

        csv += '\nProfile Information\n';
        csv += `${csvEscape('Name')},${csvEscape(profile.name || 'N/A')}\n`;
        csv += `${csvEscape('Age')},${csvEscape(calcAge(profile.dob) || 'N/A')}\n`;
        csv += `${csvEscape('Weight')},${csvEscape(profile.weight ? profile.weight + ' kg' : 'N/A')}\n`;

        csv += '\nLegend\n';
        csv += `${csvEscape(REPORT_MARKS.DONE)},${csvEscape('Completed')}\n`;
        csv += `${csvEscape(REPORT_MARKS.MISSED)},${csvEscape('Missed')}\n`;
        csv += `${csvEscape('-')},${csvEscape('Not scheduled')}\n`;

        downloadFile(csv, `habitflow-${type}-report.csv`, 'text/csv');
    }

    function ensurePdfSpace(doc, currentY, requiredHeight) {
        const pageHeight = doc.internal.pageSize.getHeight();
        if (currentY + requiredHeight <= pageHeight - 14) {
            return currentY;
        }

        doc.addPage();
        return 20;
    }

    function writePdfWrappedText(doc, text, x, y, maxWidth, lineHeight) {
        const lines = doc.splitTextToSize(text, maxWidth);
        doc.text(lines, x, y);
        return y + (lines.length * lineHeight);
    }

    function appendPdfCoachSection(doc, startY, periodType, coachResult, coachError) {
        let y = ensurePdfSpace(doc, startY, 32);
        const pageWidth = doc.internal.pageSize.getWidth();
        const contentWidth = pageWidth - 28;

        doc.setFontSize(12);
        doc.setTextColor(124, 92, 252);
        doc.text(`AI Coach Insights (${periodType === 'weekly' ? 'Weekly' : 'Monthly'})`, 14, y);
        y += 7;

        doc.setFontSize(9);
        doc.setTextColor(90);

        if (coachError) {
            y = writePdfWrappedText(doc, `AI section unavailable: ${coachError}`, 14, y, contentWidth, 4.5);
            return y + 4;
        }

        const parsed = coachResult && coachResult.parsed ? coachResult.parsed : null;
        if (!parsed) {
            const fallback = coachResult && coachResult.content
                ? coachResult.content
                : 'AI response not available.';
            y = writePdfWrappedText(doc, fallback, 14, y, contentWidth, 4.5);
            return y + 4;
        }

        const analysis = typeof parsed.analysis === 'string' ? parsed.analysis.trim() : '';
        const tips = normalizeStringArray(parsed.tips, 5);
        const advice = normalizeStringArray(parsed.advice, 5);
        const actionPlan = normalizeStringArray(parsed.action_plan || parsed.actionPlan, 6);
        const quotes = normalizeStringArray(parsed.quotes, 3);

        if (analysis) {
            y = ensurePdfSpace(doc, y, 18);
            doc.setFontSize(10);
            doc.setTextColor(35);
            doc.text('Analysis', 14, y);
            y += 4.5;
            doc.setFontSize(9);
            doc.setTextColor(90);
            y = writePdfWrappedText(doc, analysis, 14, y, contentWidth, 4.3) + 2;
        }

        const sections = [
            { title: 'Action Plan', items: actionPlan },
            { title: 'Tips', items: tips },
            { title: 'Advice', items: advice },
            { title: 'Motivation Quotes', items: quotes },
        ];

        sections.forEach(section => {
            if (!section.items.length) return;

            y = ensurePdfSpace(doc, y, 14);
            doc.setFontSize(10);
            doc.setTextColor(35);
            doc.text(section.title, 14, y);
            y += 4.3;

            doc.setFontSize(9);
            doc.setTextColor(90);
            section.items.forEach(item => {
                y = ensurePdfSpace(doc, y, 7);
                y = writePdfWrappedText(doc, `- ${item}`, 14, y, contentWidth, 4.1) + 0.6;
            });

            y += 1;
        });

        return y;
    }

    async function generatePDF(type) {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            alert('PDF library not loaded. Please check your internet connection.');
            return;
        }

        const { start, end } = getDateRange(type);
        const matrix = getReportMatrixData(start, end);
        const doc = new jsPDF({ orientation: 'landscape' });

        doc.setFontSize(20);
        doc.setTextColor(124, 92, 252);
        doc.text('HabitFlow Report', 14, 20);

        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`${type.charAt(0).toUpperCase() + type.slice(1)} Report: ${start} to ${end}`, 14, 28);

        doc.setFontSize(12);
        doc.setTextColor(40);
        let y = 38;
        doc.text(`Name: ${profile.name || 'N/A'}`, 14, y);
        y += 7;
        doc.text(`Age: ${calcAge(profile.dob) || 'N/A'}`, 14, y);
        y += 7;
        doc.text(`Weight: ${profile.weight ? profile.weight + ' kg' : 'N/A'}`, 14, y);
        y += 12;

        doc.setFontSize(11);
        doc.text(`Total Scheduled: ${matrix.totalScheduled}  |  Completed: ${matrix.totalDone}  |  Completion Rate: ${matrix.overallRate}%`, 14, y);
        y += 10;

        const moodEntries = [];
        const d = new Date(parseDate(start));
        const endD = parseDate(end);
        while (d <= endD) {
            const ds = formatDate(d);
            if (moods[ds]) moodEntries.push(moods[ds].mood);
            d.setDate(d.getDate() + 1);
        }
        if (moodEntries.length > 0) {
            const avgMoodValue = moodEntries.reduce((a, b) => a + b, 0) / moodEntries.length;
            doc.text(`Average Mood: ${avgMoodValue.toFixed(1)}/5 (${MOOD_LABELS[Math.round(avgMoodValue)] || 'N/A'})`, 14, y);
            y += 10;
        }

        if (matrix.rows.length > 0) {
            const dateColumns = matrix.dates.map(shortDateLabel);

            doc.autoTable({
                startY: y,
                head: [['Habit', ...dateColumns, 'Done', 'Scheduled', 'Rate']],
                body: matrix.rows.map(row => [
                    row.habitName,
                    ...row.marks,
                    String(row.completed),
                    String(row.scheduled),
                    `${row.rate}%`,
                ]),
                theme: 'grid',
                headStyles: { fillColor: [124, 92, 252], fontSize: 7 },
                styles: { fontSize: 7, cellPadding: 2, halign: 'center', valign: 'middle' },
                columnStyles: {
                    0: { halign: 'left', cellWidth: 85 },
                },
                didParseCell: function (data) {
                    if (data.section !== 'body') return;

                    const dateStartIndex = 1;
                    const dateEndIndex = matrix.dates.length;

                    if (data.column.index >= dateStartIndex && data.column.index <= dateEndIndex) {
                        const mark = data.cell.raw;

                        if (mark === REPORT_MARKS.DONE) {
                            data.cell.styles.fillColor = [52, 211, 153];
                            data.cell.styles.textColor = [10, 24, 33];
                        } else if (mark === REPORT_MARKS.MISSED) {
                            data.cell.styles.fillColor = [248, 113, 113];
                            data.cell.styles.textColor = [44, 12, 12];
                        } else {
                            data.cell.styles.textColor = [120, 120, 140];
                        }
                    }
                },
            });

            const finalTableY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : y + 8;
            doc.setFontSize(9);
            doc.setTextColor(110);
            doc.text(`Legend: ${REPORT_MARKS.DONE} = Completed, ${REPORT_MARKS.MISSED} = Missed, - = Not scheduled`, 14, finalTableY);
            y = finalTableY + 6;
        } else {
            doc.text('No habit data for this period.', 14, y);
            y += 8;
        }

        let coachResult = null;
        let coachError = '';

        if (!groqApiKey) {
            coachError = 'Groq API key is not configured in Settings.';
        } else {
            try {
                coachResult = await getCoachInsightsForPeriod(type, { stream: false, useCache: false });
            } catch (err) {
                coachError = err && err.message ? err.message : 'Failed to generate AI insights.';
            }
        }

        appendPdfCoachSection(doc, y, type, coachResult, coachError);

        doc.save(`habitflow-${type}-report.pdf`);
    }

    function initReports() {
        document.getElementById('btn-weekly-pdf').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
                await generatePDF('weekly');
            } finally {
                btn.disabled = false;
            }
        });
        document.getElementById('btn-weekly-csv').addEventListener('click', () => generateCSV('weekly'));
        document.getElementById('btn-monthly-pdf').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
                await generatePDF('monthly');
            } finally {
                btn.disabled = false;
            }
        });
        document.getElementById('btn-monthly-csv').addEventListener('click', () => generateCSV('monthly'));
    }

    // ===== Settings & Profile =====
    function loadProfileForm() {
        document.getElementById('profile-name').value = profile.name || '';
        document.getElementById('profile-dob').value = profile.dob || '';
        document.getElementById('profile-weight').value = profile.weight || '';

        const aiKeyInput = document.getElementById('settings-groq-api-key');
        const locationInput = document.getElementById('settings-coach-location');

        if (aiKeyInput) aiKeyInput.value = groqApiKey || '';
        if (locationInput) locationInput.value = coachLocation || '';
    }

    function saveAISettings() {
        const aiKeyInput = document.getElementById('settings-groq-api-key');
        const locationInput = document.getElementById('settings-coach-location');

        const nextKey = aiKeyInput ? aiKeyInput.value.trim() : '';
        const nextLocation = locationInput ? locationInput.value.trim() : '';

        groqApiKey = nextKey;
        coachLocation = nextLocation;
        coachInsightsCache = {};

        if (groqApiKey) {
            localStorage.setItem(STORAGE_KEYS.GROQ_API_KEY, groqApiKey);
        } else {
            localStorage.removeItem(STORAGE_KEYS.GROQ_API_KEY);
        }

        if (coachLocation) {
            localStorage.setItem(STORAGE_KEYS.COACH_LOCATION, coachLocation);
        } else {
            localStorage.removeItem(STORAGE_KEYS.COACH_LOCATION);
        }

        setCoachStatus('AI settings saved. Dashboard coach and PDF reports will use them.', 'success');
        alert('AI settings saved!');
    }

    function clearAllUserData() {
        const confirmed = confirm('This will permanently clear all HabitFlow data from this browser. Continue?');
        if (!confirmed) return;

        const confirmedAgain = confirm('Please confirm again: clear all habits, completions, moods, profile, and AI settings?');
        if (!confirmedAgain) return;

        habits = [];
        completions = {};
        moods = {};
        profile = { name: '', dob: '', weight: '' };
        selectedMood = null;
        selectedHabitDate = todayStr();
        selectedCalendarHabitIds = [];
        calendarFilterTouched = false;
        groqApiKey = '';
        coachLocation = '';
        coachInsightsCache = {};

        Object.keys(STORAGE_KEYS).forEach(keyName => {
            localStorage.removeItem(STORAGE_KEYS[keyName]);
        });

        loadProfileForm();
        renderHabitsList();
        renderDashboard();
        renderCalendar();
        renderMoodTab();
        document.getElementById('backup-reminder').style.display = 'none';
        setCoachStatus('All user data has been cleared.', 'success');

        const coachOutput = document.getElementById('coach-output-dashboard');
        if (coachOutput) {
            coachOutput.innerHTML = '<p class="empty-state">Run AI analysis to see your personalized full-history action plan.</p>';
        }

        alert('All user data cleared.');
    }

    function initDashboardCoach() {
        const analyzeBtn = document.getElementById('btn-groq-coach-dashboard');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', runDashboardCoachAnalysis);
        }
    }

    function initSettings() {
        document.getElementById('btn-save-profile').addEventListener('click', () => {
            profile.name = document.getElementById('profile-name').value.trim();
            profile.dob = document.getElementById('profile-dob').value;
            profile.weight = document.getElementById('profile-weight').value;
            save();
            alert('Profile saved!');
        });

        document.getElementById('btn-save-ai-settings').addEventListener('click', saveAISettings);
        document.getElementById('btn-clear-all-data').addEventListener('click', clearAllUserData);

        document.getElementById('btn-export-data').addEventListener('click', exportAllData);
        document.getElementById('toast-backup').addEventListener('click', () => {
            exportAllData();
            dismissReminder();
        });

        document.getElementById('import-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data.habits && data.completions && data.moods) {
                        if (confirm('This will replace all current data. Continue?')) {
                            habits = data.habits;
                            completions = data.completions;
                            moods = data.moods;
                            profile = data.profile || { name: '', dob: '', weight: '' };
                            save();
                            renderDashboard();
                            alert('Data imported successfully!');
                        }
                    } else {
                        alert('Invalid backup file format.');
                    }
                } catch (err) {
                    alert('Failed to read backup file. Make sure it is a valid HabitFlow JSON backup.');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });
    }

    function exportAllData() {
        const data = {
            version: 1,
            exportDate: new Date().toISOString(),
            habits,
            completions,
            moods,
            profile,
        };
        const json = JSON.stringify(data, null, 2);
        downloadFile(json, `habitflow-backup-${todayStr()}.json`, 'application/json');
        localStorage.setItem(STORAGE_KEYS.LAST_BACKUP_REMINDER, todayStr());
    }

    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ===== Backup Reminder =====
    function checkBackupReminder() {
        const lastReminder = localStorage.getItem(STORAGE_KEYS.LAST_BACKUP_REMINDER);
        const today = todayStr();

        if (lastReminder !== today && habits.length > 0) {
            document.getElementById('backup-reminder').style.display = 'block';
        }

        document.getElementById('toast-dismiss').addEventListener('click', dismissReminder);
    }

    function dismissReminder() {
        document.getElementById('backup-reminder').style.display = 'none';
        localStorage.setItem(STORAGE_KEYS.LAST_BACKUP_REMINDER, todayStr());
    }

    // ===== Init =====
    function init() {
        load();
        initNavigation();
        initHabitModal();
        initCalendar();
        initDashboardDateControls();
        initDashboardCoach();
        initMood();
        initReports();
        initSettings();
        renderDashboard();
        checkBackupReminder();
        refreshIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
