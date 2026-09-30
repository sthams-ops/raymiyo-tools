export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const ZOHO_API_KEY = process.env.ZOHO_DISPATCH_API_KEY;
  const CLIQ_TOKEN = process.env.CLIQ_DISPATCH_TOKEN;
  const ZOHO_URL = `https://www.zohoapis.com/crm/v7/functions/getdispatchdata/actions/execute?auth_type=apikey&zapikey=${ZOHO_API_KEY}`;
  const ALLOWED_CHANNELS = ['crmalert'];

  if (req.method === 'GET') {
    const soNumber = req.query.so;
    if (!soNumber) {
      return res.status(400).json({ error: 'Missing so parameter' });
    }
    try {
      const response = await fetch(`${ZOHO_URL}&soNumber=${encodeURIComponent(soNumber)}`);
      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { channel, message } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: 'Missing message' });
    }
    const targetChannel = /^[a-z0-9_]{1,80}$/.test(channel || '') ? channel : 'crmalert';
    const webhookUrl = `https://cliq.zoho.com/api/v2/channelsbyname/${targetChannel}/message?zapikey=${CLIQ_TOKEN}`;
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message })
      });
      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
