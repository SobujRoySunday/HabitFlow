const serverless = require('serverless-http');
const { app, ensureMongoConnected } = require('../../server');

const appHandler = serverless(app);

exports.handler = async (event, context) => {
  try {
    await ensureMongoConnected();
    return await appHandler(event, context);
  } catch (err) {
    console.error('Netlify function error:', err);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
