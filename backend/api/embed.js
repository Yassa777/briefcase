// backend/api/embed.js
const axios = require('axios');

/* read json body helper */
function getJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (err) {
        reject(err);
      }
    });
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end('method not allowed');
  }

  try {
    const { chunks = [] } = await getJsonBody(req);

    if (!process.env.OPENAI_API_KEY) {
      res.statusCode = 500;
      return res.end('missing OpenAI api key');
    }
    if (!chunks.length) {
      res.statusCode = 400;
      return res.end('no chunks provided');
    }

    console.log('Number of chunks:', chunks.length);
    console.log('First chunk text:', chunks[0].text);

    // Clean up the text by removing musical notes and extra spaces
    const inputs = chunks.map(c => c.text.replace(/[♪]/g, '').trim());
    console.log('First processed input:', inputs[0]);

    /* build OpenAI request */
    const openaiResp = await axios.post(
      'https://api.openai.com/v1/embeddings',
      {
        model: 'text-embedding-3-small',
        input: inputs,
        encoding_format: 'float'
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const embeddings = openaiResp.data.data.map(item => item.embedding);

    if (!Array.isArray(embeddings) || embeddings.length !== chunks.length) {
      throw new Error('embedding length mismatch');
    }

    /* merge embeddings back into chunk objs */
    const embedded = chunks.map((c, i) => ({
      ...c,
      embedding: embeddings[i]
    }));

    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ embedded }));
  } catch (err) {
    console.error('embed.js error:', err.message);
    if (err.response) {
      console.error('OpenAI API response:', err.response.data);
    }
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'embedding failed', detail: err.message }));
  }
};
