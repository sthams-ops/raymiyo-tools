export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const soNumber = req.query.so;
  if (!soNumber) {
    return res.status(400).json({ error: 'Missing so parameter' });
  }

  const ZOHO_URL = 'https://www.zohoapis.com/crm/v7/functions/getdispatchdata/actions/execute?auth_type=apikey&zapikey=1003.6c59aa591f000cc4ea59d69815d975bc.f0eaba07efbf31624f0408d5f38b2920';

  try {
    const response = await fetch(`${ZOHO_URL}&soNumber=${encodeURIComponent(soNumber)}`);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
