/* =============================================
   HabitFlow - Habit Tracker Application
   ============================================= */

(function () {
    'use strict';

    const STORAGE_KEYS = {
        AUTH_TOKEN: 'habitflow_auth_token',
    };

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
    const REPORT_MARKS = { DONE: '✓', MISSED: '✗', UNSCHEDULED: '-' };
    const MAX_LOG_TAGS = 12;

    let authToken = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
    let currentUser = null;

    let habits = [];
    let habitLogs = {};
    let moods = {};
    let suggestions = [];
    let profile = { name: '', dob: '', weight: '' };
    let groqApiKey = '';
    let coachLocation = '';

    let calendarMonth = new Date();
    let moodMonth = new Date();
    let editingHabitId = null;
    let selectedMood = null;
    let selectedMoodDate = todayStr();
    let selectedHabitDate = todayStr();
    let selectedCalendarHabitIds = [];
    let calendarFilterTouched = false;
    let authMode = 'login';

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

    function toDateTimeLocalValue(date) {
        const d = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${day}T${h}:${min}`;
    }

    function dayOfWeekForDate(dateStr) {
        return parseDate(dateStr).getDay();
    }

    function sanitize(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function getHabitId(habit) {
        return habit.id || habit._id;
    }

    function logKey(habitId, dateStr) {
        return `${habitId}:${dateStr}`;
    }

    function getLog(habitId, dateStr) {
        return habitLogs[logKey(habitId, dateStr)] || null;
    }

    function friendlyDate(d) {
        return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    function refreshIcons() {
        if (window.lucide) window.lucide.createIcons();
    }

    function clampToToday(dateStr) {
        const today = todayStr();
        if (!dateStr || dateStr > today) return today;
        return dateStr;
    }

    function isHabitScheduledOnDate(habit, dateStr) {
        if (habit.startDate > dateStr) return false;
        if (habit.frequency === 'daily') return true;
        if (habit.frequency === 'custom' && Array.isArray(habit.days) && habit.days.includes(dayOfWeekForDate(dateStr))) return true;
        return false;
    }

    function shortDateLabel(dateStr) {
        const d = parseDate(dateStr);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    function csvEscape(value) {
        const safeValue = value == null ? '' : String(value);
        return `"${safeValue.replace(/"/g, '""')}"`;
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

    function daysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    function getDateStringsForMonth(year, month) {
        const total = daysInMonth(year, month);
        const out = [];
        for (let day = 1; day <= total; day++) {
            out.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
        }
        return out;
    }

    function apiHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) headers.Authorization = `Bearer ${authToken}`;
        return headers;
    }

    async function apiFetch(path, options) {
        const res = await fetch(path, {
            ...options,
            headers: {
                ...apiHeaders(),
                ...(options && options.headers ? options.headers : {}),
            },
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message || `Request failed (${res.status})`);
        }
        if (res.status === 204) return null;
        return res.json();
    }

    function setAuthState(token, user) {
        authToken = token || '';
        currentUser = user || null;
        if (authToken) {
            localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, authToken);
        } else {
            localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        }
        renderAuthShell();
    }

    function renderAuthShell() {
        const authShell = document.getElementById('auth-shell');
        const appEl = document.getElementById('app');
        const sidebarUser = document.getElementById('sidebar-user');
        if (authShell) authShell.classList.toggle('visible', !currentUser);
        if (appEl) appEl.style.filter = currentUser ? '' : 'blur(2px)';
        if (sidebarUser) sidebarUser.textContent = currentUser ? `@${currentUser.username}` : '';
    }

    function renderAuthMode() {
        const loginTab = document.getElementById('auth-tab-login');
        const registerTab = document.getElementById('auth-tab-register');
        const submitBtn = document.getElementById('btn-auth-submit');
        const pwdInput = document.getElementById('auth-password');
        if (!loginTab || !registerTab || !submitBtn) return;

        if (authMode === 'login') {
            loginTab.classList.remove('btn-secondary');
            loginTab.classList.add('btn-primary');
            registerTab.classList.remove('btn-primary');
            registerTab.classList.add('btn-secondary');
            submitBtn.textContent = 'Login';
            if (pwdInput) pwdInput.autocomplete = 'current-password';
        } else {
            registerTab.classList.remove('btn-secondary');
            registerTab.classList.add('btn-primary');
            loginTab.classList.remove('btn-primary');
            loginTab.classList.add('btn-secondary');
            submitBtn.textContent = 'Register';
            if (pwdInput) pwdInput.autocomplete = 'new-password';
        }
    }

    function setAuthStatus(message, isError) {
        const status = document.getElementById('auth-status');
        if (!status) return;
        status.textContent = message || '';
        status.style.color = isError ? 'var(--danger)' : 'var(--text-secondary)';
    }

    async function runAuthSubmit() {
        const username = (document.getElementById('auth-username').value || '').trim();
        const password = (document.getElementById('auth-password').value || '').trim();
        if (username.length < 3 || password.length < 6) {
            setAuthStatus('Username must be 3+ chars and password 6+ chars.', true);
            return;
        }

        const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
        try {
            setAuthStatus(authMode === 'login' ? 'Logging in...' : 'Registering...', false);
            const result = await apiFetch(endpoint, {
                method: 'POST',
                body: JSON.stringify({ username, password }),
            });
            setAuthState(result.token, result.user);
            setAuthStatus('', false);
            document.getElementById('auth-password').value = '';
            await loadBootstrapData();
            renderAll();
        } catch (err) {
            setAuthStatus(err.message || 'Authentication failed.', true);
        }
    }

    async function loadExistingSession() {
        if (!authToken) return false;
        try {
            const me = await apiFetch('/api/auth/me');
            currentUser = me.user;
            return true;
        } catch (_err) {
            console.warn('Session validation failed, clearing local token.');
            setAuthState('', null);
            return false;
        }
    }

    async function loadBootstrapData() {
        const data = await apiFetch('/api/bootstrap');
        habits = (data.habits || []).map(h => ({ ...h, id: h.id || h._id }));
        habitLogs = {};
        (data.logs || []).forEach(log => {
            const habitId = String(log.habitId);
            habitLogs[logKey(habitId, log.date)] = {
                ...log,
                habitId,
                tags: Array.isArray(log.tags) ? log.tags : [],
            };
        });
        moods = {};
        (data.moods || []).forEach(m => {
            moods[m.date] = { mood: m.mood, note: m.note || '' };
        });
        const settings = data.settings || {};
        profile = settings.profile || { name: '', dob: '', weight: '' };
        groqApiKey = settings.groqApiKey || '';
        coachLocation = settings.coachLocation || '';
        suggestions = data.suggestions || [];
    }

    function normalizeSuggestionDate(s) {
        return s.contextDate || (s.createdAt ? s.createdAt.slice(0, 10) : todayStr());
    }

    function renderSuggestionHistory() {
        const el = document.getElementById('coach-output-history');
        if (!el) return;
        if (!suggestions.length) {
            el.innerHTML = '<p class="empty-state">Past AI suggestions will appear here.</p>';
            return;
        }
        const top = suggestions.slice(0, 6);
        el.innerHTML = top.map(s => `
            <section class="coach-section">
                <p class="suggestion-meta">${sanitize(normalizeSuggestionDate(s))} &middot; ${sanitize(s.contextType || 'dashboard')}</p>
                <p>${sanitize(s.content || '')}</p>
            </section>
        `).join('');
    }

    async function saveSettings() {
        await apiFetch('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ profile, groqApiKey, coachLocation }),
        });
    }

    function loadProfileForm() {
        document.getElementById('profile-name').value = profile.name || '';
        document.getElementById('profile-dob').value = profile.dob || '';
        document.getElementById('profile-weight').value = profile.weight || '';
        document.getElementById('settings-groq-api-key').value = groqApiKey || '';
        document.getElementById('settings-coach-location').value = coachLocation || '';
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

    function initNavigation() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                if (!currentUser) return;
                switchTab(link.dataset.tab);
            });
        });
    }

    function renderImplementationIntentions() {
        const el = document.getElementById('implementation-intentions');
        if (!el) return;
        const candidates = habits.filter(h => h.active !== false && (h.preferredTime || h.preferredLocation));
        if (!candidates.length) {
            el.innerHTML = '<p class="empty-state">Add preferred time/location in habits to generate intentions.</p>';
            return;
        }
        el.innerHTML = candidates.slice(0, 8).map(h => {
            const t = h.preferredTime ? h.preferredTime : 'a consistent time';
            const loc = h.preferredLocation ? h.preferredLocation : 'a consistent place';
            return `<div class="today-habit-item" style="cursor:default;border-left-color:${sanitize(h.color || '#7c5cfc')}"><span class="habit-label">I will ${sanitize(h.name)} at ${sanitize(t)} in ${sanitize(loc)}.</span></div>`;
        }).join('');
    }

    function renderDashboard() {
        const dateEl = document.getElementById('dashboard-date');
        if (dateEl) dateEl.textContent = friendlyDate(new Date());
        renderTodayHabits();
        renderVitality();
        renderDashboardMood();
        renderBestStreak();
        renderImplementationIntentions();
        renderSuggestionHistory();
        refreshIcons();
    }

    function normalizeTagsInput(value) {
        // Keep in sync with server normalizeTags rules.
        const uniqueTags = Array.from(new Set((value || '').split(',').map(v => v.trim()).filter(Boolean)));
        return uniqueTags.slice(0, MAX_LOG_TAGS);
    }

    async function saveHabitLogEntry(habit, payload) {
        const habitId = getHabitId(habit);
        const saved = await apiFetch(`/api/habit-logs/${habitId}`, {
            method: 'PUT',
            body: JSON.stringify({ date: selectedHabitDate, ...payload }),
        });
        habitLogs[logKey(habitId, selectedHabitDate)] = {
            ...saved,
            habitId,
            tags: Array.isArray(saved.tags) ? saved.tags : [],
        };
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
        if (dateLabel) dateLabel.textContent = friendlyDate(parseDate(selectedHabitDate));

        const habitsForDate = habits.filter(h => h.active !== false && isHabitScheduledOnDate(h, selectedHabitDate));
        if (!habitsForDate.length) {
            container.innerHTML = '<p class="empty-state">No habits scheduled for this date.</p>';
            return;
        }

        container.innerHTML = habitsForDate.map(h => {
            const habitId = getHabitId(h);
            const log = getLog(habitId, selectedHabitDate);
            const done = !!(log && log.completed);
            const performedAt = log && log.performedAt ? toDateTimeLocalValue(log.performedAt) : toDateTimeLocalValue(new Date());
            const numericValue = log && typeof log.numericValue === 'number' ? String(log.numericValue) : '';
            const tagsValue = log && Array.isArray(log.tags) ? log.tags.join(', ') : '';
            const quantitative = h.trackingMode === 'numeric';
            const unitLabel = h.unit ? ` (${sanitize(h.unit)})` : '';

            return `
            <div class="today-habit-item ${done ? 'done' : ''}" data-habit-id="${sanitize(habitId)}" style="border-left-color:${sanitize(h.color || '#7c5cfc')}">
                <div class="today-habit-main">
                    <div class="habit-check">${done ? '<i data-lucide="check"></i>' : ''}</div>
                    <span class="habit-label">${sanitize(h.name)}</span>
                </div>
                <div class="habit-log-details">
                    <input class="text-input log-performed" type="datetime-local" value="${sanitize(performedAt)}" title="Performed at">
                    ${quantitative ? `<input class="text-input log-value" type="number" step="0.01" placeholder="Value${unitLabel}" value="${sanitize(numericValue)}">` : '<div></div>'}
                    <input class="text-input log-tags" type="text" placeholder="Tags (#focus, #energy)" value="${sanitize(tagsValue)}">
                    <button class="btn btn-secondary btn-sm log-save" type="button">Save</button>
                </div>
            </div>`;
        }).join('');

        container.querySelectorAll('.today-habit-item').forEach(item => {
            const habitId = item.dataset.habitId;
            const habit = habits.find(h => getHabitId(h) === habitId);
            if (!habit) return;

            const main = item.querySelector('.today-habit-main');
            main.addEventListener('click', async () => {
                const existing = getLog(habitId, selectedHabitDate);
                const nextCompleted = !(existing && existing.completed);
                const performedInput = item.querySelector('.log-performed');
                const numericInput = item.querySelector('.log-value');
                const tagsInput = item.querySelector('.log-tags');
                const payload = {
                    completed: nextCompleted,
                    performedAt: performedInput && performedInput.value ? new Date(performedInput.value).toISOString() : new Date().toISOString(),
                    numericValue: numericInput && numericInput.value !== '' ? Number(numericInput.value) : null,
                    tags: normalizeTagsInput(tagsInput ? tagsInput.value : ''),
                };
                try {
                    await saveHabitLogEntry(habit, payload);
                    renderDashboard();
                    renderCalendar();
                } catch (err) {
                    alert(err.message || 'Failed to save log');
                }
            });

            item.querySelector('.log-save').addEventListener('click', async () => {
                const existing = getLog(habitId, selectedHabitDate);
                const performedInput = item.querySelector('.log-performed');
                const numericInput = item.querySelector('.log-value');
                const tagsInput = item.querySelector('.log-tags');
                const numericValue = numericInput && numericInput.value !== '' ? Number(numericInput.value) : null;
                const payload = {
                    completed: existing ? !!existing.completed : (habit.trackingMode === 'numeric' ? numericValue !== null : false),
                    performedAt: performedInput && performedInput.value ? new Date(performedInput.value).toISOString() : null,
                    numericValue,
                    tags: normalizeTagsInput(tagsInput ? tagsInput.value : ''),
                };
                try {
                    await saveHabitLogEntry(habit, payload);
                    renderDashboard();
                    renderCalendar();
                } catch (err) {
                    alert(err.message || 'Failed to save log');
                }
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

    function completionExists(habitId, dateStr) {
        const log = getLog(habitId, dateStr);
        return !!(log && log.completed);
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
            const dayHabits = habits.filter(h => h.active !== false && isHabitScheduledOnDate(h, ds));
            if (dayHabits.length > 0) {
                const done = dayHabits.filter(h => completionExists(getHabitId(h), ds)).length;
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
        const mood = moods[todayStr()];
        if (mood) {
            container.innerHTML = `
                <div class="mood-icon-lg">${MOOD_ICONS[mood.mood]}</div>
                <p class="mood-text">${MOOD_LABELS[mood.mood]}</p>
                ${mood.note ? `<p class="mood-text" style="font-size:0.75rem;margin-top:0.2rem;color:var(--text-muted);">"${sanitize(mood.note)}"</p>` : ''}
            `;
        } else {
            container.innerHTML = '<p class="no-mood">No mood logged today</p>';
        }
        refreshIcons();
    }

    function calculateBestStreak() {
        let best = 0;
        habits.forEach(h => {
            if (h.active === false) return;
            let streak = 0;
            const d = new Date();
            for (let i = 0; i < 365; i++) {
                const ds = formatDate(d);
                if (ds < h.startDate) break;
                if (isHabitScheduledOnDate(h, ds)) {
                    if (completionExists(getHabitId(h), ds)) streak++;
                    else {
                        best = Math.max(best, streak);
                        streak = 0;
                    }
                }
                d.setDate(d.getDate() - 1);
            }
            best = Math.max(best, streak);
        });
        return best;
    }

    function renderBestStreak() {
        document.getElementById('best-streak').textContent = calculateBestStreak();
    }

    function renderHabitsList() {
        const container = document.getElementById('habits-list');
        if (!habits.length) {
            container.innerHTML = '<p class="empty-state">No habits yet. Click "Add Habit" to create one!</p>';
            refreshIcons();
            return;
        }

        container.innerHTML = habits.map(h => {
            const freqText = h.frequency === 'daily' ? 'Daily' : `Custom: ${(h.days || []).map(d => DAY_NAMES[d]).join(', ')}`;
            const modeText = h.trackingMode === 'numeric'
                ? `Numeric${h.targetValue != null ? ` target ${h.targetValue}${h.unit ? ` ${sanitize(h.unit)}` : ''}` : ''}`
                : 'Boolean';
            return `<div class="habit-card" style="border-left-color:${sanitize(h.color || '#7c5cfc')}">
                <div class="habit-card-info">
                    <span class="habit-card-name">${sanitize(h.name)}</span>
                    <span class="habit-card-meta">Since ${sanitize(h.startDate)} &middot; ${sanitize(freqText)} &middot; ${modeText}</span>
                </div>
                <div class="habit-card-actions">
                    <button class="btn btn-icon" title="Edit" data-edit="${sanitize(getHabitId(h))}"><i data-lucide="pencil"></i></button>
                    <button class="btn btn-icon" title="Delete" data-delete="${sanitize(getHabitId(h))}"><i data-lucide="trash-2"></i></button>
                </div>
            </div>`;
        }).join('');

        container.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => openHabitModal(btn.dataset.edit)));
        container.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
            if (!confirm('Delete this habit and all its data?')) return;
            try {
                await apiFetch(`/api/habits/${btn.dataset.delete}`, { method: 'DELETE' });
                habits = habits.filter(h => getHabitId(h) !== btn.dataset.delete);
                Object.keys(habitLogs).forEach(k => { if (k.startsWith(btn.dataset.delete + ':')) delete habitLogs[k]; });
                renderAll();
            } catch (err) {
                alert(err.message || 'Failed to delete habit');
            }
        }));

        refreshIcons();
    }

    function openHabitModal(habitId) {
        editingHabitId = habitId || null;
        const modal = document.getElementById('habit-modal');
        const title = document.getElementById('modal-title');
        const nameInput = document.getElementById('habit-name');
        const descriptionInput = document.getElementById('habit-description');
        const startInput = document.getElementById('habit-start');
        const freqSelect = document.getElementById('habit-frequency');
        const colorInput = document.getElementById('habit-color');
        const modeInput = document.getElementById('habit-tracking-mode');
        const unitInput = document.getElementById('habit-unit');
        const targetInput = document.getElementById('habit-target');
        const prefTimeInput = document.getElementById('habit-preferred-time');
        const prefLocInput = document.getElementById('habit-preferred-location');
        const customGroup = document.getElementById('custom-days-group');
        const dayCheckboxes = customGroup.querySelectorAll('input[type="checkbox"]');

        if (habitId) {
            const h = habits.find(x => getHabitId(x) === habitId);
            if (!h) return;
            title.textContent = 'Edit Habit';
            nameInput.value = h.name || '';
            descriptionInput.value = h.description || '';
            startInput.value = h.startDate;
            freqSelect.value = h.frequency || 'daily';
            colorInput.value = h.color || '#7c5cfc';
            modeInput.value = h.trackingMode || 'boolean';
            unitInput.value = h.unit || '';
            targetInput.value = h.targetValue != null ? h.targetValue : '';
            prefTimeInput.value = h.preferredTime || '';
            prefLocInput.value = h.preferredLocation || '';
            dayCheckboxes.forEach(cb => { cb.checked = (h.days || []).includes(Number(cb.value)); });
        } else {
            title.textContent = 'Add New Habit';
            nameInput.value = '';
            descriptionInput.value = '';
            startInput.value = todayStr();
            freqSelect.value = 'daily';
            colorInput.value = '#7c5cfc';
            modeInput.value = 'boolean';
            unitInput.value = '';
            targetInput.value = '';
            prefTimeInput.value = '';
            prefLocInput.value = '';
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

    async function saveHabit() {
        const name = document.getElementById('habit-name').value.trim();
        const description = document.getElementById('habit-description').value.trim();
        const startDate = document.getElementById('habit-start').value;
        const frequency = document.getElementById('habit-frequency').value;
        const color = document.getElementById('habit-color').value;
        const trackingMode = document.getElementById('habit-tracking-mode').value;
        const unit = document.getElementById('habit-unit').value.trim();
        const targetRaw = document.getElementById('habit-target').value;
        const preferredTime = document.getElementById('habit-preferred-time').value;
        const preferredLocation = document.getElementById('habit-preferred-location').value.trim();

        if (!name) { alert('Please enter a habit name.'); return; }
        if (!startDate) { alert('Please select a start date.'); return; }

        let days = [];
        if (frequency === 'custom') {
            days = Array.from(document.querySelectorAll('#custom-days-group input:checked')).map(cb => Number(cb.value));
            if (!days.length) { alert('Please select at least one day.'); return; }
        }

        const payload = {
            name,
            description,
            startDate,
            frequency,
            color,
            days,
            trackingMode,
            unit,
            targetValue: targetRaw === '' ? null : Number(targetRaw),
            preferredTime,
            preferredLocation,
            active: true,
        };

        try {
            if (editingHabitId) {
                const updated = await apiFetch(`/api/habits/${editingHabitId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                });
                habits = habits.map(h => getHabitId(h) === editingHabitId ? { ...updated, id: updated.id || updated._id } : h);
            } else {
                const created = await apiFetch('/api/habits', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                habits.unshift({ ...created, id: created.id || created._id });
            }
            closeHabitModal();
            renderAll();
        } catch (err) {
            alert(err.message || 'Failed to save habit');
        }
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
            document.getElementById('custom-days-group').style.display = e.target.value === 'custom' ? 'block' : 'none';
        });
    }

    function syncCalendarSelectedHabits(activeHabits) {
        const activeIds = activeHabits.map(h => getHabitId(h));
        if (!calendarFilterTouched) {
            selectedCalendarHabitIds = activeIds.slice();
            return;
        }
        const activeSet = new Set(activeIds);
        selectedCalendarHabitIds = selectedCalendarHabitIds.filter(id => activeSet.has(id));
    }

    function setCalendarFilterSummary(selectedCount, totalCount) {
        const summary = document.getElementById('calendar-filter-summary');
        if (!summary) return;
        if (totalCount === 0) summary.textContent = '0 selected';
        else if (selectedCount === totalCount) summary.textContent = `All ${totalCount} selected`;
        else summary.textContent = `${selectedCount} of ${totalCount} selected`;
    }

    function renderCalendarHabitFilter(activeHabits) {
        const listEl = document.getElementById('calendar-habit-filter-list');
        const selectAllBtn = document.getElementById('calendar-filter-select-all');
        const clearBtn = document.getElementById('calendar-filter-clear');

        syncCalendarSelectedHabits(activeHabits);

        if (!activeHabits.length) {
            listEl.innerHTML = '<p class="calendar-filter-empty">No active habits in this month</p>';
            if (selectAllBtn) selectAllBtn.disabled = true;
            if (clearBtn) clearBtn.disabled = true;
            setCalendarFilterSummary(0, 0);
            return;
        }

        listEl.innerHTML = activeHabits.map(h => `
            <label class="calendar-habit-chip">
                <input type="checkbox" value="${sanitize(getHabitId(h))}" ${selectedCalendarHabitIds.includes(getHabitId(h)) ? 'checked' : ''}>
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
                selectedCalendarHabitIds = activeHabits.map(h => getHabitId(h));
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

    async function toggleCalendarCell(habitId, dateStr) {
        const existing = getLog(habitId, dateStr);
        const payload = {
            date: dateStr,
            completed: !(existing && existing.completed),
            performedAt: existing && existing.performedAt ? existing.performedAt : new Date().toISOString(),
            numericValue: existing && typeof existing.numericValue === 'number' ? existing.numericValue : null,
            tags: existing && Array.isArray(existing.tags) ? existing.tags : [],
        };
        const saved = await apiFetch(`/api/habit-logs/${habitId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        habitLogs[logKey(habitId, dateStr)] = { ...saved, habitId, tags: Array.isArray(saved.tags) ? saved.tags : [] };
    }

    function renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        document.getElementById('cal-month-label').textContent = `${MONTH_NAMES[month]} ${year}`;

        const monthDates = getDateStringsForMonth(year, month);
        const activeHabits = habits.filter(h => h.active !== false && monthDates.some(ds => isHabitScheduledOnDate(h, ds)));
        renderCalendarHabitFilter(activeHabits);

        if (!activeHabits.length) {
            grid.innerHTML = '<p class="empty-state">No active habits in this month yet</p>';
            return;
        }

        const habitsToDisplay = activeHabits.filter(h => selectedCalendarHabitIds.includes(getHabitId(h)));
        if (!habitsToDisplay.length) {
            grid.innerHTML = '<p class="empty-state">Select one or more habits above to display them in the calendar</p>';
            return;
        }

        const today = todayStr();
        let html = `
            <div class="calendar-legend">
                <span class="legend-item"><span class="legend-mark completed"><i data-lucide="check"></i></span>Tick = Completed</span>
                <span class="legend-item"><span class="legend-mark missed"><i data-lucide="x"></i></span>Cross = Missed</span>
                <span class="legend-item"><span class="legend-mark unscheduled"><i data-lucide="minus"></i></span>Not scheduled</span>
            </div>
            <table class="calendar-matrix-table"><thead><tr><th class="habit-head">Habit</th>`;

        monthDates.forEach(dateStr => {
            const dayNum = Number(dateStr.slice(-2));
            const dow = DAY_NAMES[dayOfWeekForDate(dateStr)];
            const isToday = dateStr === today;
            html += `<th class="matrix-day-head ${isToday ? 'today-col' : ''}" title="${sanitize(dateStr)}">${dayNum}<span class="matrix-dow">${dow}</span></th>`;
        });
        html += '</tr></thead><tbody>';

        habitsToDisplay.forEach(habit => {
            const habitId = getHabitId(habit);
            html += `<tr><td class="habit-col"><span class="habit-dot" style="background:${sanitize(habit.color || '#7c5cfc')}"></span><span>${sanitize(habit.name)}</span></td>`;
            monthDates.forEach(dateStr => {
                const isScheduled = isHabitScheduledOnDate(habit, dateStr);
                const isFuture = dateStr > today;
                const isBeforeStart = dateStr < habit.startDate;
                const log = getLog(habitId, dateStr);

                let stateClass = isBeforeStart ? 'not-started' : 'unscheduled';
                let marker = '<span class="matrix-placeholder">-</span>';
                let titleText = `${habit.name} on ${dateStr}: Not scheduled`;
                let canToggle = false;

                if (isScheduled) {
                    if (isFuture) {
                        stateClass = 'future';
                        titleText = `${habit.name} on ${dateStr}: Upcoming`;
                    } else {
                        const done = !!(log && log.completed);
                        stateClass = done ? 'completed' : 'missed';
                        marker = done ? '<i data-lucide="check"></i>' : '<i data-lucide="x"></i>';
                        titleText = `${habit.name} on ${dateStr}: ${done ? 'Completed' : 'Missed'}. Click to toggle.`;
                        canToggle = true;
                    }
                }

                html += `<td class="matrix-cell"><div class="matrix-mark ${stateClass} ${dateStr === today ? 'today' : ''} ${canToggle ? 'togglable' : ''}" ${canToggle ? `data-habit-id="${sanitize(habitId)}" data-date="${sanitize(dateStr)}"` : ''} title="${sanitize(titleText)}">${marker}</div></td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table>';
        grid.innerHTML = html;

        grid.querySelectorAll('.matrix-mark.togglable').forEach(el => {
            el.addEventListener('click', async () => {
                const habitId = el.dataset.habitId;
                const dateStr = el.dataset.date;
                try {
                    await toggleCalendarCell(habitId, dateStr);
                    renderCalendar();
                    renderDashboard();
                } catch (err) {
                    alert(err.message || 'Failed to toggle completion');
                }
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

    function renderMoodInput() {
        const moodDateInput = document.getElementById('mood-date');
        if (moodDateInput) {
            moodDateInput.max = todayStr();
            moodDateInput.value = selectedMoodDate;
        }

        const moodData = moods[selectedMoodDate];
        selectedMood = moodData ? moodData.mood : null;

        document.querySelectorAll('.mood-btn').forEach(btn => {
            btn.classList.remove('selected');
            if (moodData && Number(btn.dataset.mood) === moodData.mood) {
                btn.classList.add('selected');
            }
        });

        document.getElementById('mood-note').value = moodData ? moodData.note || '' : '';
    }

    function renderMoodHistoryGraph(year, month) {
        const graphEl = document.getElementById('mood-graph');
        if (!graphEl) return;
        const total = daysInMonth(year, month);
        let bars = '';
        let count = 0;
        for (let d = 1; d <= total; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const entry = moods[dateStr];
            if (entry && entry.mood) {
                count++;
                const h = Math.max(4, Math.round((entry.mood / 5) * 100));
                bars += `<div class="mood-graph-bar" style="height:${h}%" title="${sanitize(dateStr)}: ${sanitize(MOOD_LABELS[entry.mood])}"></div>`;
            } else {
                bars += '<div class="mood-graph-bar" style="height:4%;opacity:0.18"></div>';
            }
        }
        graphEl.innerHTML = count ? bars : '<p class="mood-graph-empty">No mood logs for this month yet.</p>';
    }

    function renderMoodHistory() {
        const container = document.getElementById('mood-history');
        const year = moodMonth.getFullYear();
        const month = moodMonth.getMonth();
        document.getElementById('mood-month-label').textContent = `${MONTH_NAMES[month]} ${year}`;

        const totalDays = daysInMonth(year, month);
        let html = '';
        DAY_NAMES.forEach(d => {
            html += `<div class="mood-day" style="font-weight:600;background:transparent;"><span class="mood-day-num">${d}</span></div>`;
        });
        const firstDay = new Date(year, month, 1).getDay();
        for (let i = 0; i < firstDay; i++) html += '<div class="mood-day" style="background:transparent;"></div>';

        for (let d = 1; d <= totalDays; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const moodData = moods[dateStr];
            const level = moodData ? moodData.mood : 0;
            const icon = moodData ? MOOD_ICONS[moodData.mood] : '<span class="mood-day-dot"></span>';
            const titleText = moodData ? `${MOOD_LABELS[moodData.mood]}${moodData.note ? ': ' + moodData.note : ''}` : 'No mood';
            html += `<div class="mood-day" data-level="${level}" title="${sanitize(titleText)}" data-date="${sanitize(dateStr)}"><span class="mood-day-num">${d}</span><span class="mood-day-icon">${icon}</span></div>`;
        }

        container.innerHTML = html;
        container.querySelectorAll('.mood-day[data-date]').forEach(el => {
            el.addEventListener('click', () => {
                selectedMoodDate = clampToToday(el.dataset.date);
                renderMoodInput();
            });
        });

        renderMoodHistoryGraph(year, month);
        refreshIcons();
    }

    function renderMoodTab() {
        renderMoodInput();
        renderMoodHistory();
    }

    function initMood() {
        document.querySelectorAll('.mood-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedMood = Number(btn.dataset.mood);
            });
        });

        const dateInput = document.getElementById('mood-date');
        if (dateInput) {
            dateInput.addEventListener('change', () => {
                selectedMoodDate = clampToToday(dateInput.value || todayStr());
                renderMoodInput();
            });
        }

        document.getElementById('btn-save-mood').addEventListener('click', async () => {
            if (!selectedMood) { alert('Please select a mood.'); return; }
            const note = document.getElementById('mood-note').value.trim();
            try {
                const saved = await apiFetch(`/api/moods/${selectedMoodDate}`, {
                    method: 'PUT',
                    body: JSON.stringify({ mood: selectedMood, note }),
                });
                moods[selectedMoodDate] = { mood: saved.mood, note: saved.note || '' };
                renderMoodTab();
                renderDashboard();
                alert('Mood saved!');
            } catch (err) {
                alert(err.message || 'Failed to save mood');
            }
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

    function getReportMatrixData(startDate, endDate) {
        const dates = getDateStringsInRange(startDate, endDate);
        const rows = habits
            .filter(h => h.active !== false && dates.some(ds => isHabitScheduledOnDate(h, ds)))
            .map(habit => {
                let completed = 0;
                let scheduled = 0;
                const habitId = getHabitId(habit);
                const marks = dates.map(dateStr => {
                    if (!isHabitScheduledOnDate(habit, dateStr)) return REPORT_MARKS.UNSCHEDULED;
                    scheduled++;
                    const done = completionExists(habitId, dateStr);
                    if (done) {
                        completed++;
                        return REPORT_MARKS.DONE;
                    }
                    return REPORT_MARKS.MISSED;
                });
                const rate = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
                return { habitName: habit.name, marks, completed, scheduled, rate };
            });

        const totalScheduled = rows.reduce((s, r) => s + r.scheduled, 0);
        const totalDone = rows.reduce((s, r) => s + r.completed, 0);
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

    function calcAge(dob) {
        if (!dob) return '';
        const birth = parseDate(dob);
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
        return age;
    }

    function generateCSV(type) {
        const { start, end } = getDateRange(type);
        const matrix = getReportMatrixData(start, end);
        const header = ['Habit', ...matrix.dates.map(shortDateLabel), 'Completed', 'Scheduled', 'Rate'];
        let csv = header.map(csvEscape).join(',') + '\n';

        if (!matrix.rows.length) {
            csv += `${csvEscape('No active habits in this period')}\n`;
        } else {
            matrix.rows.forEach(row => {
                const cells = [row.habitName, ...row.marks, row.completed, row.scheduled, `${row.rate}%`];
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

        downloadFile(csv, `habitflow-${type}-report.csv`, 'text/csv');
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

    function normalizeStringArray(value, maxItems) {
        if (!Array.isArray(value)) return [];
        const output = [];
        for (const item of value) {
            if (typeof item !== 'string') continue;
            const trimmed = item.trim();
            if (!trimmed) continue;
            output.push(trimmed);
            if (output.length >= maxItems) break;
        }
        return output;
    }

    function parseCoachJsonResponse(content) {
        if (!content || typeof content !== 'string') return null;
        try {
            return JSON.parse(content);
        } catch (_err) {
            const start = content.indexOf('{');
            const end = content.lastIndexOf('}');
            if (start === -1 || end === -1 || end <= start) return null;
            try {
                return JSON.parse(content.slice(start, end + 1));
            } catch (_err2) {
                return null;
            }
        }
    }

    function renderStreamingCoachOutput(rawText) {
        const output = document.getElementById('coach-output-dashboard');
        if (!output) return;
        output.innerHTML = `<pre class="coach-raw">${sanitize(rawText)}</pre>`;
    }

    function renderCoachInsights(parsed, fallbackText) {
        const output = document.getElementById('coach-output-dashboard');
        if (!output) return;
        if (!parsed) {
            output.innerHTML = `<pre class="coach-raw">${sanitize(fallbackText || 'No content returned by model.')}</pre>`;
            return;
        }

        const analysis = typeof parsed.analysis === 'string' ? parsed.analysis.trim() : '';
        const tips = normalizeStringArray(parsed.tips, 8);
        const advice = normalizeStringArray(parsed.advice, 8);
        const quotes = normalizeStringArray(parsed.quotes, 6);
        const actionPlan = normalizeStringArray(parsed.action_plan || parsed.actionPlan, 8);

        let html = '';
        if (analysis) html += `<section class="coach-section"><h3>Analysis</h3><p>${sanitize(analysis)}</p></section>`;
        if (tips.length) html += `<section class="coach-section"><h3>Tips</h3><ul class="coach-list">${tips.map(i => `<li>${sanitize(i)}</li>`).join('')}</ul></section>`;
        if (advice.length) html += `<section class="coach-section"><h3>Advice</h3><ul class="coach-list">${advice.map(i => `<li>${sanitize(i)}</li>`).join('')}</ul></section>`;
        if (actionPlan.length) html += `<section class="coach-section"><h3>Action Plan</h3><ul class="coach-list">${actionPlan.map(i => `<li>${sanitize(i)}</li>`).join('')}</ul></section>`;
        if (quotes.length) html += `<section class="coach-section"><h3>Motivation Quotes</h3>${quotes.map(i => `<blockquote class="coach-quote">${sanitize(i)}</blockquote>`).join('')}</section>`;
        if (!html) html = `<pre class="coach-raw">${sanitize(JSON.stringify(parsed, null, 2))}</pre>`;
        output.innerHTML = html;
    }

    function setCoachStatus(message, type) {
        const status = document.getElementById('coach-status-dashboard');
        if (!status) return;
        status.textContent = message || '';
        status.classList.remove('success', 'error');
        if (type === 'success') status.classList.add('success');
        if (type === 'error') status.classList.add('error');
    }

    function buildCoachPayload() {
        return {
            generatedAt: new Date().toISOString(),
            todayContext: {
                isoDate: todayStr(),
                friendlyDate: friendlyDate(new Date()),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                locale: navigator.language || 'en-US',
            },
            profile,
            habits: habits.map(h => ({
                id: getHabitId(h),
                name: h.name,
                trackingMode: h.trackingMode || 'boolean',
                unit: h.unit || '',
                targetValue: h.targetValue == null ? null : h.targetValue,
            })),
            fullData: {
                habitLogs,
                moods,
            },
            context: {
                configuredLocation: coachLocation || null,
            },
        };
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
                    if (onChunk) onChunk(chunk, content);
                } catch (_err) {
                    // Ignore malformed stream lines.
                }
            });
        }

        return { content };
    }

    async function saveAISuggestion(content, parsed) {
        const suggestion = await apiFetch('/api/ai-suggestions', {
            method: 'POST',
            body: JSON.stringify({
                content,
                parsed: parsed || null,
                contextDate: todayStr(),
                contextType: 'dashboard',
            }),
        });
        suggestions.unshift(suggestion);
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
            const payload = buildCoachPayload();
            const messages = [
                {
                    role: 'system',
                    content: 'You are a compassionate habit coach. Return JSON only with keys: analysis (string), tips (string[]), advice (string[]), action_plan (string[]), quotes (string[]).',
                },
                {
                    role: 'user',
                    content: 'Analyze this HabitFlow dataset and provide coaching using the entire history. Data: ' + JSON.stringify(payload),
                },
            ];

            const response = await requestGroqCoachCompletion(messages, {
                stream: true,
                onChunk: function (_chunk, fullText) { renderStreamingCoachOutput(fullText); },
            });
            const parsed = parseCoachJsonResponse(response.content);
            renderCoachInsights(parsed, response.content);
            setCoachStatus('Full-history AI plan generated successfully.', 'success');
            await saveAISuggestion(response.content, parsed);
            renderSuggestionHistory();
        } catch (err) {
            setCoachStatus(err && err.message ? err.message : 'Unknown error while calling Groq API.', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
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
        doc.text(`Name: ${profile.name || 'N/A'}`, 14, y); y += 7;
        doc.text(`Age: ${calcAge(profile.dob) || 'N/A'}`, 14, y); y += 7;
        doc.text(`Weight: ${profile.weight ? profile.weight + ' kg' : 'N/A'}`, 14, y); y += 12;
        doc.setFontSize(11);
        doc.text(`Total Scheduled: ${matrix.totalScheduled}  |  Completed: ${matrix.totalDone}  |  Completion Rate: ${matrix.overallRate}%`, 14, y);
        y += 10;

        if (matrix.rows.length > 0) {
            const dateColumns = matrix.dates.map(shortDateLabel);
            doc.autoTable({
                startY: y,
                head: [['Habit', ...dateColumns, 'Done', 'Scheduled', 'Rate']],
                body: matrix.rows.map(row => [row.habitName, ...row.marks, String(row.completed), String(row.scheduled), `${row.rate}%`]),
                theme: 'grid',
                headStyles: { fillColor: [124, 92, 252], fontSize: 7 },
                styles: { fontSize: 7, cellPadding: 2, halign: 'center', valign: 'middle' },
                columnStyles: { 0: { halign: 'left', cellWidth: 85 } },
            });
        } else {
            doc.text('No habit data for this period.', 14, y);
        }

        doc.save(`habitflow-${type}-report.pdf`);
    }

    function initReports() {
        document.getElementById('btn-weekly-pdf').addEventListener('click', async (e) => {
            const btn = e.currentTarget; btn.disabled = true;
            try { await generatePDF('weekly'); } finally { btn.disabled = false; }
        });
        document.getElementById('btn-monthly-pdf').addEventListener('click', async (e) => {
            const btn = e.currentTarget; btn.disabled = true;
            try { await generatePDF('monthly'); } finally { btn.disabled = false; }
        });
        document.getElementById('btn-weekly-csv').addEventListener('click', () => generateCSV('weekly'));
        document.getElementById('btn-monthly-csv').addEventListener('click', () => generateCSV('monthly'));
    }

    function initSettings() {
        document.getElementById('btn-save-profile').addEventListener('click', async () => {
            profile.name = document.getElementById('profile-name').value.trim();
            profile.dob = document.getElementById('profile-dob').value;
            profile.weight = document.getElementById('profile-weight').value;
            try {
                await saveSettings();
                alert('Profile saved!');
            } catch (err) {
                alert(err.message || 'Failed to save profile');
            }
        });

        document.getElementById('btn-save-ai-settings').addEventListener('click', async () => {
            groqApiKey = document.getElementById('settings-groq-api-key').value.trim();
            coachLocation = document.getElementById('settings-coach-location').value.trim();
            try {
                await saveSettings();
                setCoachStatus('AI settings saved. Dashboard coach and PDF reports will use them.', 'success');
                alert('AI settings saved!');
            } catch (err) {
                alert(err.message || 'Failed to save settings');
            }
        });

        document.getElementById('btn-clear-all-data').addEventListener('click', async () => {
            alert('Clear-all is disabled in server mode. Remove data per habit or account from database tools.');
        });

        document.getElementById('btn-export-data').addEventListener('click', () => {
            const data = {
                version: 2,
                exportDate: new Date().toISOString(),
                habits,
                habitLogs,
                moods,
                profile,
                suggestions,
            };
            downloadFile(JSON.stringify(data, null, 2), `habitflow-backup-${todayStr()}.json`, 'application/json');
        });

        document.getElementById('import-file').addEventListener('change', (e) => {
            e.target.value = '';
            alert('Import is disabled in server mode to avoid cross-user data overwrite.');
        });

        const clearAllBtn = document.getElementById('btn-clear-all-data');
        if (clearAllBtn) clearAllBtn.style.display = 'none';
        const importLabel = document.querySelector('label.file-label[for=\"import-file\"]');
        if (importLabel) importLabel.style.display = 'none';
    }

    function initDashboardCoach() {
        const btn = document.getElementById('btn-groq-coach-dashboard');
        if (btn) btn.addEventListener('click', runDashboardCoachAnalysis);
    }

    function initAuth() {
        const loginTab = document.getElementById('auth-tab-login');
        const registerTab = document.getElementById('auth-tab-register');
        const submitBtn = document.getElementById('btn-auth-submit');
        const logoutBtn = document.getElementById('btn-logout');

        loginTab.addEventListener('click', () => { authMode = 'login'; renderAuthMode(); setAuthStatus('', false); });
        registerTab.addEventListener('click', () => { authMode = 'register'; renderAuthMode(); setAuthStatus('', false); });
        submitBtn.addEventListener('click', runAuthSubmit);

        ['auth-username', 'auth-password'].forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') runAuthSubmit();
            });
        });

        logoutBtn.addEventListener('click', () => {
            setAuthState('', null);
            habits = [];
            habitLogs = {};
            moods = {};
            suggestions = [];
            profile = { name: '', dob: '', weight: '' };
            groqApiKey = '';
            coachLocation = '';
            renderAll();
        });

        renderAuthMode();
        renderAuthShell();
    }

    function renderAll() {
        renderDashboard();
        renderHabitsList();
        renderCalendar();
        renderMoodTab();
        loadProfileForm();
        refreshIcons();
    }

    function initLegacyToastDismiss() {
        const dismiss = document.getElementById('toast-dismiss');
        const toast = document.getElementById('backup-reminder');
        if (dismiss && toast) dismiss.addEventListener('click', () => { toast.style.display = 'none'; });
        const backup = document.getElementById('toast-backup');
        if (backup && toast) backup.addEventListener('click', () => { toast.style.display = 'none'; });
    }

    async function init() {
        initAuth();
        initNavigation();
        initHabitModal();
        initCalendar();
        initDashboardDateControls();
        initMood();
        initReports();
        initSettings();
        initDashboardCoach();
        initLegacyToastDismiss();

        const hasSession = await loadExistingSession();
        if (hasSession) {
            try {
                await loadBootstrapData();
            } catch (err) {
                setAuthStatus(err.message || 'Failed to load user data.', true);
            }
        }
        renderAll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
