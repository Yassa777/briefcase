// backend/api/chunk.js
const { IncomingMessage, ServerResponse } = require('http');

/* helper: "00:01:23.456" -> seconds (float) */
function vttTimeToSec(t) {
  const [h, m, s] = t.split(':');
  return parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat(s.replace(',', '.'));
}

/* helper: read json body */
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
    const { transcript = '', chunkSize = 30, overlap = 15 } = await getJsonBody(req);

    /* 1. parse cues */
    const cues = [];
    const lines = transcript.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        const [startStr, endStr] = lines[i].split('-->').map(s => s.trim());
        const text = [];
        i++;
        while (i < lines.length && lines[i] && !lines[i].includes('-->')) {
          text.push(lines[i].trim());
          i++;
        }
        cues.push({
          start: vttTimeToSec(startStr),
          end: vttTimeToSec(endStr),
          text: text.join(' ')
        });
        i--; // adjust for outer loop increment
      }
    }

    if (!cues.length) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'no cues parsed' }));
    }

    /* 2. sliding-window chunking */
    const chunks = [];
    const step = chunkSize - overlap;
    const totalDur = cues[cues.length - 1].end;

    for (let tStart = 0; tStart < totalDur; tStart += step) {
      const tEnd = Math.min(tStart + chunkSize, totalDur);
      const chunkText = cues
        .filter(c => c.start < tEnd && c.end > tStart) // overlap condition
        .map(c => c.text)
        .join(' ')
        .trim();

      if (chunkText) {
        chunks.push({
          id: chunks.length,
          start: tStart,
          end: tEnd,
          text: chunkText
        });
      }
    }

    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ chunks }));
  } catch (err) {
    console.error('chunk.js error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'internal server error' }));
  }
};
