// backend/api/cluster.js
const { DBSCAN } = require('density-clustering');
const cosine = require('cosine-distance'); // tiny util

/* body helper */
function getJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (e) {
        reject(e);
      }
    });
  });
}

/* cosine distance matrix builder */
function buildDistanceMatrix(vectors) {
  const n = vectors.length;
  const dist = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = cosine(vectors[i], vectors[j]);
      dist[i][j] = dist[j][i] = d;
    }
  }
  return dist;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end('method not allowed');
  }

  try {
    const { embedded = [], eps = 0.25, minPts = 3 } = await getJsonBody(req);
    if (!embedded.length) {
      res.statusCode = 400;
      return res.end('no embeddings provided');
    }

    const vectors = embedded.map(c => c.embedding);

    /* dbscan on cosine distances */
    const dbscan = new DBSCAN();
    const clusters = dbscan.run(vectors, eps, minPts, buildDistanceMatrix);

    /* noise points (label = -1) */
    const noise = dbscan.noise;

    /* build cluster objects */
    const clusterObjs = clusters.map((idxArr, k) => {
      const memberChunks = idxArr.map(i => embedded[i]);
      return {
        id: k,
        chunkIds: idxArr,
        start: Math.min(...memberChunks.map(c => c.start)),
        end: Math.max(...memberChunks.map(c => c.end)),
        texts: memberChunks.map(c => c.text).join(' ')
      };
    });

    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        clusters: clusterObjs,
        noise // optional: indices that didn't fit anywhere
      })
    );
  } catch (err) {
    console.error('cluster.js error:', err.message);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'clustering failed', detail: err.message }));
  }
};
