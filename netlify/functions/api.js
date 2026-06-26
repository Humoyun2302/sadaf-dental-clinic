/**
 * netlify/functions/api.js
 * 
 * Wraps the Express admin server as a Netlify serverless function.
 * All /api/* requests are redirected here via netlify.toml.
 */

const serverless = require('serverless-http');
const app = require('../../admin-server');

module.exports.handler = serverless(app);
