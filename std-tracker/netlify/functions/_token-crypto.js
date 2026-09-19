/* AES-256-GCM encrypt/decrypt for the osu! access/refresh tokens stored per
   logged-in user (see _user-auth.js). A login-gated feature needs to call
   osu!'s API again on a later visit, potentially days later, so the token
   itself must be persisted — encrypted at rest, since it's a real bearer
   credential for the user's osu! account, not just an identity claim.
   Ported verbatim from catch-tracker's own _token-crypto.js.

   TOKEN_ENC_KEY must be a 32-byte key, base64-encoded (e.g. generate with
   `openssl rand -base64 32`). Ciphertext is stored as
   `${ivB64}:${authTagB64}:${cipherB64}` so decrypt() is self-contained. */
const crypto = require('crypto');

function key() {
    const raw = Buffer.from(process.env.TOKEN_ENC_KEY || '', 'base64');
    if (raw.length !== 32) throw new Error('TOKEN_ENC_KEY must decode to exactly 32 bytes');
    return raw;
}

function encrypt(plaintext) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(blob) {
    const [ivB64, tagB64, encB64] = String(blob).split(':');
    if (!ivB64 || !tagB64 || !encB64) throw new Error('Malformed encrypted token');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
}

module.exports = { encrypt, decrypt };
