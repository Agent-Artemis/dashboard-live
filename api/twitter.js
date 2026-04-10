const crypto = require('crypto');
const https = require('https');

function generateOAuthHeader(method, url, params, consumerKey, consumerSecret, accessToken, accessTokenSecret) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  const allParams = { ...params, ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramStr = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');

  const signatureBase = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(paramStr),
  ].join('&');

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(accessTokenSecret)}`;
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(signatureBase)
    .digest('base64');

  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');

  return `OAuth ${headerParts}`;
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON: ' + data.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  const consumerKey = process.env.TWITTER_CONSUMER_KEY;
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    return res.status(500).json({ error: 'Twitter env vars not set' });
  }

  try {
    const userId = '2037743330520379393';
    const baseUrl = `https://api.twitter.com/1.1/users/show.json`;
    const params = { user_id: userId };
    const queryStr = `user_id=${userId}`;
    const fullUrl = `${baseUrl}?${queryStr}`;

    const authHeader = generateOAuthHeader(
      'GET', baseUrl, params,
      consumerKey, consumerSecret, accessToken, accessTokenSecret
    );

    const data = await httpsGet(fullUrl, {
      Authorization: authHeader,
    });

    if (data.errors) {
      return res.status(400).json({ error: data.errors[0]?.message || 'Twitter API error' });
    }

    res.json({
      followers: data.followers_count || 0,
      tweets: data.statuses_count || 0,
      likes: data.favourites_count || 0,
      name: data.name || '@Artemis_jeff',
      screenName: data.screen_name || 'Artemis_jeff',
    });
  } catch (err) {
    console.error('Twitter error:', err);
    res.status(500).json({ error: err.message });
  }
};
