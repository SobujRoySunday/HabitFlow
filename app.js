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
        } catch (e) {
            habits = [];
            completions = {};
            moods = {};
            profile = { name: '', dob: '', weight: '' };
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

    function renderBestStreak() {
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

        document.getElementById('best-streak').textContent = bestStreak;
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
        populateHabitSelect();

        const select = document.getElementById('calendar-habit-select');
        const grid = document.getElementById('calendar-grid');
        const habitId = select.value;

        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        document.getElementById('cal-month-label').textContent =
            MONTH_NAMES[month] + ' ' + year;

        if (!habitId) {
            grid.innerHTML = '<p class="empty-state">Select a habit to view its calendar</p>';
            return;
        }

        const habit = habits.find(h => h.id === habitId);
        if (!habit) {
            grid.innerHTML = '<p class="empty-state">Habit not found</p>';
            return;
        }

        const totalDays = daysInMonth(year, month);
        const firstDay = new Date(year, month, 1).getDay();
        const todayD = todayStr();

        let html = '<table class="calendar-table"><thead><tr>';
        DAY_NAMES.forEach(d => html += `<th>${d}</th>`);
        html += '</tr></thead><tbody><tr>';

        for (let i = 0; i < firstDay; i++) {
            html += '<td></td>';
        }

        for (let d = 1; d <= totalDays; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dateObj = new Date(year, month, d);
            const isToday = dateStr === todayD;
            const isBeforeStart = dateStr < habit.startDate;
            const isFuture = dateStr > todayD;
            const scheduled = isHabitScheduledOnDate(habit, dateStr);
            const canToggle = scheduled && !isFuture;

            let cls = '';
            let icon = '';
            if (isBeforeStart) {
                cls = 'not-started';
            } else if (isFuture) {
                cls = 'future';
            } else if (scheduled) {
                const key = habit.id + ':' + dateStr;
                if (completions[key]) {
                    cls = 'completed';
                    icon = '<i data-lucide="check-circle"></i>';
                } else {
                    cls = 'missed';
                    icon = '<i data-lucide="x-circle"></i>';
                }
            }

            html += `<td><div class="cal-day ${cls} ${isToday ? 'today' : ''} ${canToggle ? 'togglable' : ''}" ${canToggle ? `data-date="${sanitize(dateStr)}"` : ''}>${d}${icon ? `<span class="status-icon">${icon}</span>` : ''}</div></td>`;

            if ((firstDay + d) % 7 === 0 && d < totalDays) {
                html += '</tr><tr>';
            }
        }

        html += '</tr></tbody></table>';
        grid.innerHTML = html;

        grid.querySelectorAll('.cal-day.togglable').forEach(dayEl => {
            dayEl.addEventListener('click', () => {
                const dateStr = dayEl.dataset.date;
                if (!dateStr) return;

                const key = habit.id + ':' + dateStr;
                completions[key] = !completions[key];
                if (!completions[key]) delete completions[key];
                save();
                renderCalendar();
                renderDashboard();
            });
        });

        refreshIcons();
    }

    function populateHabitSelect() {
        const select = document.getElementById('calendar-habit-select');
        const currentVal = select.value;
        select.innerHTML = '<option value="">-- Select Habit --</option>' +
            habits.map(h => `<option value="${sanitize(h.id)}" ${h.id === currentVal ? 'selected' : ''}>${sanitize(h.name)}</option>`).join('');
    }

    function initCalendar() {
        document.getElementById('calendar-habit-select').addEventListener('change', renderCalendar);
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
    function getReportData(startDate, endDate) {
        const rows = [];
        const d = new Date(parseDate(startDate));
        const end = parseDate(endDate);

        while (d <= end) {
            const ds = formatDate(d);

            habits.forEach(h => {
                if (isHabitScheduledOnDate(h, ds)) {
                    const done = !!completions[h.id + ':' + ds];
                    rows.push({
                        date: ds,
                        day: DAY_NAMES[dayOfWeekForDate(ds)],
                        habit: h.name,
                        status: done ? 'Completed' : 'Missed',
                    });
                }
            });

            d.setDate(d.getDate() + 1);
        }
        return rows;
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

    function generateCSV(type) {
        const { start, end } = getDateRange(type);
        const rows = getReportData(start, end);

        let csv = 'Date,Day,Habit,Status\n';
        rows.forEach(r => {
            csv += `"${r.date}","${r.day}","${r.habit}","${r.status}"\n`;
        });

        csv += '\n\nProfile Information\n';
        csv += `Name,"${sanitize(profile.name || 'N/A')}"\n`;
        csv += `Age,"${calcAge(profile.dob) || 'N/A'}"\n`;
        csv += `Weight,"${profile.weight ? profile.weight + ' kg' : 'N/A'}"\n`;

        downloadFile(csv, `habitflow-${type}-report.csv`, 'text/csv');
    }

    function generatePDF(type) {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            alert('PDF library not loaded. Please check your internet connection.');
            return;
        }

        const { start, end } = getDateRange(type);
        const rows = getReportData(start, end);
        const doc = new jsPDF();

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

        const totalScheduled = rows.length;
        const totalDone = rows.filter(r => r.status === 'Completed').length;
        const rate = totalScheduled > 0 ? Math.round((totalDone / totalScheduled) * 100) : 0;

        doc.setFontSize(11);
        doc.text(`Total Scheduled: ${totalScheduled}  |  Completed: ${totalDone}  |  Completion Rate: ${rate}%`, 14, y);
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
            const avgMood = (moodEntries.reduce((a, b) => a + b, 0) / moodEntries.length).toFixed(1);
            doc.text(`Average Mood: ${avgMood}/5 (${MOOD_LABELS[Math.round(avgMood)] || 'N/A'})`, 14, y);
            y += 10;
        }

        if (rows.length > 0) {
            doc.autoTable({
                startY: y,
                head: [['Date', 'Day', 'Habit', 'Status']],
                body: rows.map(r => [r.date, r.day, r.habit, r.status]),
                theme: 'grid',
                headStyles: { fillColor: [124, 92, 252] },
                styles: { fontSize: 9 },
                alternateRowStyles: { fillColor: [245, 245, 255] },
            });
        } else {
            doc.text('No habit data for this period.', 14, y);
        }

        doc.save(`habitflow-${type}-report.pdf`);
    }

    function initReports() {
        document.getElementById('btn-weekly-pdf').addEventListener('click', () => generatePDF('weekly'));
        document.getElementById('btn-weekly-csv').addEventListener('click', () => generateCSV('weekly'));
        document.getElementById('btn-monthly-pdf').addEventListener('click', () => generatePDF('monthly'));
        document.getElementById('btn-monthly-csv').addEventListener('click', () => generateCSV('monthly'));
    }

    // ===== Settings & Profile =====
    function loadProfileForm() {
        document.getElementById('profile-name').value = profile.name || '';
        document.getElementById('profile-dob').value = profile.dob || '';
        document.getElementById('profile-weight').value = profile.weight || '';
    }

    function initSettings() {
        document.getElementById('btn-save-profile').addEventListener('click', () => {
            profile.name = document.getElementById('profile-name').value.trim();
            profile.dob = document.getElementById('profile-dob').value;
            profile.weight = document.getElementById('profile-weight').value;
            save();
            alert('Profile saved!');
        });

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
