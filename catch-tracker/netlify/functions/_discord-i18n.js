/* Response-text localization for the Discord bot. Catch Tracker's own site
   is bilingual only (zh/en — see js/common.js getLang()), so this mirrors
   that scope rather than the main site's 9-locale _discord-i18n.js: two
   dictionaries, module-scoped "current locale" set once per request via
   setLocale(), then t(key, params) everywhere. A future taiko/standard
   tracker sharing this bot can copy this file as-is. */
let current = 'en';

const KNOWN_KEYS = new Set(['en', 'zh']);

function setLocale(discordLocale) {
    current = String(discordLocale || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

const DICT = {
    en: {
        site_footer: 'Catch Tracker',
        need_name_or_link: "Give a username, or /link your osu! account first.",
        user_not_found: 'osu! user "{name}" not found.',
        not_passed: 'Failed',
        hours: '{n}h',
        f_pp: 'PP', f_global_rank: 'Global Rank', f_country_rank: '{cc} Rank', f_acc: 'Accuracy',
        f_playcount: 'Playcount', f_level: 'Level', f_max_combo: 'Max Combo', f_playtime: 'Play Time',
        f_grades: 'Grades', f_stars: 'Star Rating', f_length: 'Length', f_status: 'Status',
        country_word: 'Country',
        footer_rank_trend: 'rank trend (last snapshots)',
        api_v2: 'osu! API v2',
        recent_none: '{name} has no recent {mode} plays.',
        top_none: '{name} has no {mode} plays.',
        top_no_nth: "{name} doesn't have a #{idx} best {mode} play.",
        top_title: "{name}'s top {mode} plays ({n})",
        page_prev: '◀ Prev', page_next: 'Next ▶',
        link_need_name: 'Give your osu! username or id, e.g. `/link username:HANABI_RN`.',
        link_done: 'Linked to **{name}** (#{id}). /pp, /recent, /top and /replay will use this account by default.',
        unlink_done: 'Unlinked your osu! account.',
        replay_need_query: 'Give a score id, or a link to it on the site or on osu!.',
        replay_not_found: 'Score not found.',
        replay_wrong_mode: "That score isn't an osu!catch score — this bot only tracks osu!catch.",
        replay_fail: 'Could not look up that score.',
        replay_no_replay: 'That score has no replay uploaded on osu!.',
        replay_view_btn: 'View replay on Catch Tracker',
        replay_map_btn: 'Beatmap',
        f_mods: 'Mods',
        f_date: 'Date',
        error_generic: 'Something went wrong: {msg}',
        unknown_command: 'Unknown command.',
    },
    zh: {
        site_footer: 'Catch Tracker',
        need_name_or_link: '請提供 osu! 使用者名稱，或先用 /link 綁定你的帳號。',
        user_not_found: '找不到 osu! 使用者「{name}」。',
        not_passed: '未過關',
        hours: '{n} 小時',
        f_pp: 'PP', f_global_rank: '全球排名', f_country_rank: '{cc} 排名', f_acc: '準確度',
        f_playcount: '遊玩次數', f_level: '等級', f_max_combo: '最大連段', f_playtime: '遊玩時間',
        f_grades: '評級分布', f_stars: '星等', f_length: '長度', f_status: '狀態',
        country_word: '國家',
        footer_rank_trend: '排名趨勢（近期快照）',
        api_v2: 'osu! API v2',
        recent_none: '{name} 最近沒有 {mode} 遊玩紀錄。',
        top_none: '{name} 沒有 {mode} 遊玩紀錄。',
        top_no_nth: '{name} 沒有第 {idx} 名的 {mode} 最佳成績。',
        top_title: '{name} 的 {mode} 最佳成績（{n}）',
        page_prev: '◀ 上一頁', page_next: '下一頁 ▶',
        link_need_name: '請提供你的 osu! 使用者名稱或 ID，例如 `/link username:HANABI_RN`。',
        link_done: '已綁定 **{name}**（#{id}）。/pp、/recent、/top、/replay 預設會使用這個帳號。',
        unlink_done: '已解除 osu! 帳號綁定。',
        replay_need_query: '請提供成績 ID，或站內／osu! 的成績連結。',
        replay_not_found: '找不到這筆成績。',
        replay_wrong_mode: '這不是 osu!catch 的成績——本 bot 只追蹤 osu!catch。',
        replay_fail: '查詢這筆成績時發生錯誤。',
        replay_no_replay: '這筆成績在 osu! 上沒有上傳回放。',
        replay_view_btn: '在 Catch Tracker 上觀看回放',
        replay_map_btn: '圖譜連結',
        f_mods: 'Mods',
        f_date: '日期',
        error_generic: '發生錯誤：{msg}',
        unknown_command: '未知的指令。',
    },
};

function t(key, params) {
    let s = (DICT[current] && DICT[current][key]) || DICT.en[key] || key;
    if (params) {
        for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    }
    return s;
}

module.exports = { setLocale, t, KNOWN_KEYS };
