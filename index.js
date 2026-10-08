require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const fetch = require('node-fetch');
const app = express();

const { VERIFY_TOKEN, PAGE_ACCESS_TOKEN, APP_SECRET, OPENAI_API_KEY, OPENAI_MODEL } = process.env;
const required = { VERIFY_TOKEN, PAGE_ACCESS_TOKEN, APP_SECRET, OPENAI_API_KEY, OPENAI_MODEL };
const missing = Object.entries(required).filter(([,value]) => !value || value.startsWith('replace-with-')).map(([key]) => key);
if (missing.length) {
  console.error('Lifted Voices cannot start: missing required configuration:', missing.join(', '));
  process.exit(1);
}
app.disable('x-powered-by');
app.use(express.json({
  limit: '32kb',
  verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); }
}));
app.get('/', (req, res) => res.type('text/plain').send('Lifted Voices pre-release service. Not for clinical or emergency use.'));
app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

function verifySignature(req) {
  const header = req.get('X-Hub-Signature-256');
  if (!header || !/^sha256=[a-f0-9]{64}$/i.test(header)) return false;
  const expected = crypto.createHmac('sha256', APP_SECRET).update(req.rawBody || Buffer.alloc(0)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(header.slice(7).toLowerCase()), Buffer.from(expected));
}
function safeResponse(input) {
  if (/\b(suicid(?:e|al)|kill myself|end my life|self.harm|overdose|hurt myself)\b/i.test(input)) {
    return 'I am sorry you are going through this. I cannot provide crisis support. If you may be in immediate danger, call local emergency services. In the U.S., call or text 988 for crisis support. Please reach out to someone you trust who can be with you.';
  }
  return null;
}
const recent = new Map();
app.post('/webhook', async (req, res) => {
  if (!verifySignature(req)) return res.sendStatus(403);
  if (req.body?.object !== 'page' || !Array.isArray(req.body.entry)) return res.sendStatus(400);
  res.sendStatus(200);
  for (const entry of req.body.entry) {
    for (const event of (Array.isArray(entry.messaging) ? entry.messaging : [])) {
      const sender = event.sender?.id;
      if (!sender || !/^\d+$/.test(String(sender))) continue;
      const now = Date.now(), last = recent.get(sender) || 0;
      if (now - last < 5000) continue;
      recent.set(sender, now);
      if (recent.size > 10000) recent.clear();
      const message = event.message?.text;
      if (typeof message !== 'string' && event.postback?.payload !== 'GET_STARTED') continue;
      const reply = typeof message === 'string' ? await handleMessage(message.slice(0, 2000)) :
        'Welcome to Lifted Voices. This experimental coach is not a clinician or emergency service. Please do not share health or sensitive personal information. For immediate danger, contact emergency services.';
      await sendText(sender, reply);
    }
  }
});

async function handleMessage(input) {
  const crisis = safeResponse(input);
  if (crisis) return crisis;
  // Do not transmit private disclosures to a model until consent and privacy requirements are implemented.
  return 'Lifted Voices is not yet available for public coaching. Please do not share sensitive or health information. If you need urgent help in the U.S., call or text 988, or call emergency services for immediate danger.';
}
async function sendText(sender, message) {
  try {
    const response = await fetch('https://graph.facebook.com/v24.0/me/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PAGE_ACCESS_TOKEN}` },
      body: JSON.stringify({ recipient: { id: sender }, message: { text: message } }),
      timeout: 10000
    });
    if (!response.ok) console.error('Messenger delivery unsuccessful: HTTP', response.status);
  } catch (err) {
    console.error('Messenger delivery failed:', err.message);
  }
}
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log('Lifted Voices pre-release server started.'));
