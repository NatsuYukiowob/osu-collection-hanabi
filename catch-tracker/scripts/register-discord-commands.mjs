/* One-shot: (re)register Catch Tracker's Discord bot's slash commands.
   Run after deploying discord-interactions.js and setting the app's
   Interactions Endpoint URL (https://<this-site>.netlify.app/discord):

     DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... node scripts/register-discord-commands.mjs

   Both values also read from a local .env (gitignored) if present. A global
   PUT replaces the whole command set and can take up to ~1h to propagate to
   every client. Pass a guild id as the first arg to register to just that
   server instead (instant, handy for testing):

     node scripts/register-discord-commands.mjs 123456789012345678

   Command *names* stay English; descriptions are localized to zh-TW via
   description_localizations, matching this site's own bilingual (zh/en)
   scope — see _discord-i18n.js for response-text localization. */
import { readFile } from 'node:fs/promises';

async function loadDotEnv() {
    try {
        const txt = await readFile(new URL('../.env', import.meta.url), 'utf8');
        for (const line of txt.split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
            if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    } catch { /* no .env, fine */ }
}

// -> { description, description_localizations: { 'zh-TW': ... } }
function d(en, zh) {
    return { description: en, description_localizations: { 'zh-TW': zh } };
}

const usernameOpt = { type: 3, name: 'username', required: false, ...d('osu! name or ID (omit to use your linked account)', 'osu! 名稱或 ID（省略則用 /link 綁定的帳號）') };

const commands = [
    { name: 'pp', ...d("Look up an osu!catch player's PP and rank", '查詢 osu!catch 玩家的 PP 與排名'), options: [usernameOpt] },
    {
        name: 'recent', ...d("Show a player's most recent osu!catch score", '查看某位玩家最近的一筆 osu!catch 成績'),
        options: [usernameOpt, { type: 4, name: 'index', required: false, ...d('Which score (1 = newest, up to 50)', '第幾筆（1 = 最新，最多 50）') }],
    },
    {
        name: 'top', ...d("Show a player's best osu!catch scores", '查看某位玩家的 osu!catch 最佳成績'),
        options: [usernameOpt, { type: 4, name: 'index', required: false, ...d('Show one entry in detail (1-100; omit for top 5)', '看第幾名的單筆詳情（1–100；省略則列前 5）') }],
    },
    {
        name: 'replay', ...d("Show a score card + a link to watch its replay on Catch Tracker", '顯示成績卡片，並附上在 Catch Tracker 觀看回放的連結'),
        options: [{ type: 3, name: 'query', required: true, ...d('Score id, or a link to it on this site or on osu!', '成績 ID，或站內／osu! 的成績連結') }],
    },
    { name: 'link', ...d('Link your Discord account to an osu! account', '把你的 Discord 帳號綁定一個 osu! 帳號'), options: [{ type: 3, name: 'username', required: true, ...d('osu! name or ID', 'osu! 名稱或 ID') }] },
    { name: 'unlink', ...d('Unlink your osu! account', '解除 osu! 帳號綁定') },
];

async function main() {
    await loadDotEnv();
    const appId = process.env.DISCORD_APP_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!appId || !botToken) {
        console.error('Missing DISCORD_APP_ID or DISCORD_BOT_TOKEN (env or .env).');
        process.exit(1);
    }

    const guildId = process.argv[2];
    const url = guildId
        ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
        : `https://discord.com/api/v10/applications/${appId}/commands`;

    const res = await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
    });

    const text = await res.text();
    if (!res.ok) {
        console.error(`Discord API ${res.status}:`, text);
        process.exit(1);
    }
    const registered = JSON.parse(text);
    console.log(`Registered ${registered.length} command(s) ${guildId ? `to guild ${guildId}` : 'globally'}:`);
    for (const c of registered) console.log(`  /${c.name} — ${c.description}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
