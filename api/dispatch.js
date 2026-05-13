export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const ZOHO_URL = 'https://www.zohoapis.com/crm/v7/functions/getdispatchdata/actions/execute?auth_type=apikey&zapikey=1003.6c59aa591f000cc4ea59d69815d975bc.f0eaba07efbf31624f0408d5f38b2920';
  const CLIQ_TOKEN = '1001.ac5469e61cc9730676db8ee72a55d41f.acce5676f22e97813ad570d44816645d';

  // ── GET: fetch SO data ──────────────────────────────
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

  // ── POST: send confirmation to Cliq ────────────────
  if (req.method === 'POST') {
    const { channel, message } = req.body;
    if (!channel || !message) {
      return res.status(400).json({ error: 'Missing channel or message' });
    }
    const targetChannel = channel || 'crmalert';
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
