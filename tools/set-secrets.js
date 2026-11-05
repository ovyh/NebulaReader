/* 把签名所需的值写入 GitHub Actions Secrets（libsodium sealed box） */
const fs = require('fs');
const path = require('path');
const sodium = require('libsodium-wrappers');

const REPO = process.env.GH_REPO || 'ovyh/NebulaReader';
const TOKEN = process.env.GH_TOKEN;
const API = 'https://api.github.com';
const KS = process.env.KS_PATH;
const PASSWORD = process.env.KS_PASSWORD;
const ALIAS = process.env.KS_ALIAS || 'nebula';

async function gh(p, opts = {}) {
  const res = await fetch(API + p, {
    ...opts,
    headers: {
      Authorization: 'token ' + TOKEN,
      'User-Agent': 'dsh-agent',
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(p + ' -> ' + res.status + ' ' + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

(async () => {
  await sodium.ready;

  const key = await gh('/repos/' + REPO + '/actions/secrets/public-key');
  const pk = sodium.from_base64(key.key, sodium.base64_variants.ORIGINAL);

  const secrets = {
    ANDROID_KEYSTORE_BASE64: fs.readFileSync(KS).toString('base64'),
    ANDROID_KEYSTORE_PASSWORD: PASSWORD,
    ANDROID_KEY_ALIAS: ALIAS,
    ANDROID_KEY_PASSWORD: PASSWORD
  };

  for (const [name, value] of Object.entries(secrets)) {
    const enc = sodium.crypto_box_seal(sodium.from_string(value), pk);
    await gh('/repos/' + REPO + '/actions/secrets/' + name, {
      method: 'PUT',
      body: JSON.stringify({
        encrypted_value: sodium.to_base64(enc, sodium.base64_variants.ORIGINAL),
        key_id: key.key_id
      })
    });
    console.log('set:', name, '(' + value.length + ' chars)');
  }

  const list = await gh('/repos/' + REPO + '/actions/secrets');
  console.log('secrets now:', list.secrets.map((s) => s.name).join(', '));
})().catch((e) => { console.error(e.message); process.exit(1); });
