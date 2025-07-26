require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.get('/', (req, res) => res.send('Lifted Voices is live'));

app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  if (req.body.object === 'page') {
    for (const entry of req.body.entry) {
      for (const event of entry.messaging) {
        if (event.message?.text) await handleMessage(event.sender.id, event.message.text);
        else if (event.postback?.payload === 'GET_STARTED') {
          await sendText(event.sender.id,
            'Welcome to Lifted Voices Support Coach.\n\nHow are you feeling today (1‑5)? And what type of support would you like—recovery, life coaching, trauma support, etc.?');
        }
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

async function handleMessage(sender, text) {
  const ai = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: `You are Lifted Voices: Support Coach—empathic, non-judgmental, culturally grounded.` },
        { role: 'user', content: text }
      ]
    })
  }).then(r => r.json());

  const reply = ai?.choices?.[0]?.message?.content || 'I’m here to support you.';
  await sendText(sender, reply);

  // Insert parsing logic here to track mood/support and log or post to storage
}

async function sendText(sender, text) {
  await fetch(`https://graph.facebook.com/v15.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: sender }, message: { text } })
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot server ready on port ${PORT}`));
