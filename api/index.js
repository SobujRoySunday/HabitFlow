const serverless = require('serverless-http');
const { app, ensureMongoConnected } = require('../server');

const handler = serverless(app);

module.exports = async (req, res) => {
  try {
    await ensureMongoConnected();
    return handler(req, res);
  } catch (err) {
    console.error('Vercel handler error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
