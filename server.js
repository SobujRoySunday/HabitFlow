require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/habitflow';
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 60 },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const UserSettingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    profile: {
      name: { type: String, default: '' },
      dob: { type: String, default: '' },
      weight: { type: String, default: '' },
    },
    groqApiKey: { type: String, default: '' },
    coachLocation: { type: String, default: '' },
  },
  { timestamps: true }
);

const HabitSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 220 },
    startDate: { type: String, required: true },
    frequency: { type: String, enum: ['daily', 'custom'], default: 'daily' },
    days: [{ type: Number, min: 0, max: 6 }],
    color: { type: String, default: '#7c5cfc' },
    trackingMode: { type: String, enum: ['boolean', 'numeric'], default: 'boolean' },
    unit: { type: String, default: '', maxlength: 30 },
    targetValue: { type: Number, default: null },
    preferredTime: { type: String, default: '' },
    preferredLocation: { type: String, default: '', maxlength: 120 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const HabitLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    habitId: { type: Schema.Types.ObjectId, ref: 'Habit', required: true, index: true },
    date: { type: String, required: true, index: true },
    completed: { type: Boolean, default: false },
    performedAt: { type: Date, default: null },
    numericValue: { type: Number, default: null },
    tags: [{ type: String, trim: true, maxlength: 40 }],
    notes: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true }
);
HabitLogSchema.index({ userId: 1, habitId: 1, date: 1 }, { unique: true });

const MoodLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true, index: true },
    mood: { type: Number, required: true, min: 1, max: 5 },
    note: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true }
);
MoodLogSchema.index({ userId: 1, date: 1 }, { unique: true });

const AISuggestionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true },
    parsed: { type: Schema.Types.Mixed, default: null },
    contextDate: { type: String, default: '' },
    contextType: { type: String, default: 'dashboard' },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

const User = mongoose.model('User', UserSchema);
const UserSettings = mongoose.model('UserSettings', UserSettingsSchema);
const Habit = mongoose.model('Habit', HabitSchema);
const HabitLog = mongoose.model('HabitLog', HabitLogSchema);
const MoodLog = mongoose.model('MoodLog', MoodLogSchema);
const AISuggestion = mongoose.model('AISuggestion', AISuggestionSchema);

function signToken(user) {
  return jwt.sign({ sub: String(user._id), username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map(t => String(t || '').trim()).filter(Boolean).slice(0, 12))];
}

app.post('/api/auth/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ message: 'Username must be at least 3 and password at least 6 characters.' });
  }
  const existing = await User.findOne({ username }).lean();
  if (existing) return res.status(409).json({ message: 'Username already exists.' });
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ username, passwordHash });
  await UserSettings.create({ userId: user._id });
  const token = signToken(user);
  return res.status(201).json({ token, user: { id: String(user._id), username: user.username } });
});

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ message: 'Invalid credentials.' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials.' });
  const token = signToken(user);
  return res.json({ token, user: { id: String(user._id), username: user.username } });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await User.findById(req.userId).lean();
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  return res.json({ user: { id: String(user._id), username: user.username } });
});

app.get('/api/bootstrap', auth, async (req, res) => {
  const [habits, logs, moods, settings, suggestions] = await Promise.all([
    Habit.find({ userId: req.userId }).sort({ createdAt: -1 }).lean(),
    HabitLog.find({ userId: req.userId }).lean(),
    MoodLog.find({ userId: req.userId }).lean(),
    UserSettings.findOne({ userId: req.userId }).lean(),
    AISuggestion.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  return res.json({ habits, logs, moods, settings: settings || { profile: {}, groqApiKey: '', coachLocation: '' }, suggestions });
});

app.get('/api/habits', auth, async (req, res) => {
  const habits = await Habit.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
  res.json(habits);
});

app.post('/api/habits', auth, async (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.startDate) return res.status(400).json({ message: 'Name and startDate are required.' });
  const habit = await Habit.create({
    userId: req.userId,
    name: String(body.name).trim(),
    description: String(body.description || '').trim(),
    startDate: String(body.startDate),
    frequency: body.frequency === 'custom' ? 'custom' : 'daily',
    days: Array.isArray(body.days) ? body.days.map(Number).filter(d => d >= 0 && d <= 6) : [],
    color: body.color || '#7c5cfc',
    trackingMode: body.trackingMode === 'numeric' ? 'numeric' : 'boolean',
    unit: String(body.unit || '').trim(),
    targetValue: typeof body.targetValue === 'number' ? body.targetValue : null,
    preferredTime: String(body.preferredTime || ''),
    preferredLocation: String(body.preferredLocation || '').trim(),
    active: body.active !== false,
  });
  res.status(201).json(habit);
});

app.put('/api/habits/:id', auth, async (req, res) => {
  const update = { ...req.body };
  delete update.userId;
  const habit = await Habit.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, update, { new: true });
  if (!habit) return res.status(404).json({ message: 'Habit not found' });
  res.json(habit);
});

app.delete('/api/habits/:id', auth, async (req, res) => {
  const habit = await Habit.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!habit) return res.status(404).json({ message: 'Habit not found' });
  await HabitLog.deleteMany({ userId: req.userId, habitId: req.params.id });
  res.status(204).send();
});

app.put('/api/habit-logs/:habitId', auth, async (req, res) => {
  const date = String(req.body.date || '');
  if (!date) return res.status(400).json({ message: 'date is required' });
  const habit = await Habit.findOne({ _id: req.params.habitId, userId: req.userId }).lean();
  if (!habit) return res.status(404).json({ message: 'Habit not found' });

  const completed = !!req.body.completed;
  const numericValue = typeof req.body.numericValue === 'number' ? req.body.numericValue : null;
  const performedAt = req.body.performedAt ? new Date(req.body.performedAt) : (completed ? new Date() : null);
  const tags = normalizeTags(req.body.tags);
  const notes = String(req.body.notes || '');

  const log = await HabitLog.findOneAndUpdate(
    { userId: req.userId, habitId: req.params.habitId, date },
    { $set: { completed, performedAt, numericValue, tags, notes } },
    { upsert: true, new: true }
  );
  res.json(log);
});

app.get('/api/habit-logs', auth, async (req, res) => {
  const logs = await HabitLog.find({ userId: req.userId }).lean();
  res.json(logs);
});

app.put('/api/moods/:date', auth, async (req, res) => {
  const date = req.params.date;
  const mood = Number(req.body.mood);
  const note = String(req.body.note || '');
  if (!Number.isFinite(mood) || mood < 1 || mood > 5) return res.status(400).json({ message: 'Mood must be 1-5' });
  const entry = await MoodLog.findOneAndUpdate(
    { userId: req.userId, date },
    { $set: { mood, note } },
    { upsert: true, new: true }
  );
  res.json(entry);
});

app.get('/api/moods', auth, async (req, res) => {
  const moods = await MoodLog.find({ userId: req.userId }).lean();
  res.json(moods);
});

app.get('/api/settings', auth, async (req, res) => {
  let settings = await UserSettings.findOne({ userId: req.userId }).lean();
  if (!settings) settings = await UserSettings.create({ userId: req.userId });
  res.json(settings);
});

app.put('/api/settings', auth, async (req, res) => {
  const payload = {
    profile: {
      name: String((req.body.profile && req.body.profile.name) || ''),
      dob: String((req.body.profile && req.body.profile.dob) || ''),
      weight: String((req.body.profile && req.body.profile.weight) || ''),
    },
    groqApiKey: String(req.body.groqApiKey || ''),
    coachLocation: String(req.body.coachLocation || ''),
  };
  const settings = await UserSettings.findOneAndUpdate(
    { userId: req.userId },
    { $set: payload },
    { upsert: true, new: true }
  );
  res.json(settings);
});

app.post('/api/ai-suggestions', auth, async (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ message: 'content is required' });
  const suggestion = await AISuggestion.create({
    userId: req.userId,
    content,
    parsed: req.body.parsed || null,
    contextDate: String(req.body.contextDate || ''),
    contextType: String(req.body.contextType || 'dashboard'),
    metadata: req.body.metadata || null,
  });
  res.status(201).json(suggestion);
});

app.get('/api/ai-suggestions', auth, async (req, res) => {
  const suggestions = await AISuggestion.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(30).lean();
  res.json(suggestions);
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use(express.static(__dirname));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`HabitFlow server listening on http://localhost:${PORT}`);
  });
}

start();
