/* gzip'd-JSON helpers for the big Netlify Blobs datasets (feed:recent,
   rankings:global). Ported verbatim from catch-tracker's own _blob-json.js
   (itself ported from the main site's) — see that file's comments for the
   full rationale (scheduled functions have a 30s hard timeout; gzip buys
   ~5-6x so multi-MB blobs still finish uploading in time). getJSONGz
   auto-detects gzip via magic bytes and falls back to plain UTF-8 JSON. */
const { gzipSync, gunzipSync } = require('node:zlib');

async function setJSONGz(store, key, value) {
    const gz = gzipSync(Buffer.from(JSON.stringify(value)));
    await store.set(key, new Blob([gz]));
}

async function getJSONGz(store, key) {
    const ab = await store.get(key, { type: 'arrayBuffer' });
    if (ab == null) return null;
    const buf = Buffer.from(ab);
    if (buf.length === 0) return null;
    const isGzip = buf[0] === 0x1f && buf[1] === 0x8b;
    const json = isGzip ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
    return JSON.parse(json);
}

module.exports = { setJSONGz, getJSONGz };
