/* Forum-grade client-side BBCode <-> preview editor for the 工具庫/BBCode
   tab, matching osu!'s own forum BBCode dialect (see
   https://osu.ppy.sh/wiki/en/Article_styling_criteria/formatting for the
   tag set this targets). Nothing is sent anywhere.

   A real tokenizer + stack-based parser builds a tag tree first (like a
   browser building the DOM), THEN a separate render pass walks that tree
   to HTML. That split is what makes out-of-order/unclosed tags behave
   sanely: closing a tag auto-closes anything still open above it (the
   same "which ancestor does this end tag belong to" rule real forums use)
   instead of each tag type being regex-substituted independently over the
   whole string. A stray closing tag with no open match is just dropped.
   [code]/[imagemap]/[img]/[youtube]/[audio] read their content as raw
   text (no nested-tag parsing) since that content is data, not prose —
   [url]/[email] do the same only in their bare (argument-less) form,
   where the tag body IS the link target.

   Wrapped in an IIFE since this page shares a global script scope with
   ~30 other feature files. */
(function () {
    const DRAFT_KEY = 'osu_bbcode_draft';

    function escapeHtmlBBCode(str) {
        return String(str ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    // Only accept plain hex or CSS-keyword-ish colour values in [color=...]
    // — rejects anything that could break out of the style attribute.
    function safeColor(v) {
        return v && /^#?[a-zA-Z0-9]{1,20}$/.test(v) ? v : null;
    }
    function safeUrl(v) {
        const url = (v || '').trim();
        return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : null;
    }
    function safeEmail(v) {
        const email = (v || '').trim();
        return /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/.test(email) ? email : null;
    }
    function clampPct(n) {
        return Math.max(0, Math.min(100, n));
    }
    function stripQuotes(s) {
        if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
            return s.slice(1, -1);
        }
        return s;
    }

    /* ---------- tokenize + parse: raw BBCode -> a tag tree ---------- */

    const KNOWN_TAGS = 'b|i|u|s|colour|color|size|centre|heading|url|img|email|list|quote|code|notice|spoiler|box|imagemap|youtube|audio|profile';
    // Content is read raw (no nested-tag scanning) for these — it's data
    // (a URL, a video id, coordinate rows), not formatted prose.
    const RAW_CONTENT_TAGS = new Set(['code', 'imagemap', 'img', 'youtube', 'audio']);

    function parseBBCode(src) {
        const root = { name: 'root', arg: null, children: [] };
        const stack = [root];
        const top = () => stack[stack.length - 1];
        const pushText = (value) => { if (value) top().children.push({ text: value }); };

        const tagRe = new RegExp(`\\[(\\/)?(${KNOWN_TAGS})(=[^\\]]*)?\\]|\\[\\*\\]`, 'gi');
        let i = 0, m;
        while ((m = tagRe.exec(src))) {
            if (m.index > i) pushText(src.slice(i, m.index));

            if (m[0] === '[*]') {
                if (top().name === 'item') stack.pop();
                if (top().name === 'list') {
                    const item = { name: 'item', arg: null, children: [] };
                    top().children.push(item);
                    stack.push(item);
                } else {
                    pushText('[*]');
                }
                i = tagRe.lastIndex;
                continue;
            }

            const closing = !!m[1];
            const name = m[2].toLowerCase();

            if (closing) {
                let depth = -1;
                for (let d = stack.length - 1; d >= 1; d--) {
                    if (stack[d].name === name) { depth = d; break; }
                }
                if (depth !== -1) stack.length = depth; // auto-closes anything still open above it too
                // else: a stray end tag with nothing to close — silently dropped.
                i = tagRe.lastIndex;
                continue;
            }

            let arg = m[3] ? stripQuotes(m[3].slice(1)) : null;
            const rawAlways = RAW_CONTENT_TAGS.has(name);
            const rawBare = (name === 'url' || name === 'email') && arg == null;

            if (rawAlways || rawBare) {
                const closeRe = new RegExp(`\\[\\/${name}\\]`, 'i');
                const rest = src.slice(tagRe.lastIndex);
                const cm = closeRe.exec(rest);
                const rawContent = cm ? rest.slice(0, cm.index) : rest;
                top().children.push({ name, arg, children: [{ text: rawContent }] });
                i = cm ? tagRe.lastIndex + cm.index + cm[0].length : src.length;
                tagRe.lastIndex = i;
                continue;
            }

            const node = { name, arg, children: [] };
            top().children.push(node);
            stack.push(node);
            i = tagRe.lastIndex;
        }
        if (i < src.length) pushText(src.slice(i));
        return root;
    }

    /* ---------- render: tag tree -> HTML ---------- */

    function rawText(node) {
        return node.children.map(c => c.text ?? '').join('');
    }

    function renderChildren(node) {
        return node.children.map(renderNode).join('');
    }

    function renderNode(node) {
        if (node.text !== undefined) return escapeHtmlBBCode(node.text).replace(/\n/g, '<br>');

        switch (node.name) {
            case 'b': return `<b>${renderChildren(node)}</b>`;
            case 'i': return `<i>${renderChildren(node)}</i>`;
            case 'u': return `<u>${renderChildren(node)}</u>`;
            case 's': return `<s>${renderChildren(node)}</s>`;
            case 'colour':
            case 'color': {
                const c = safeColor(node.arg);
                return c ? `<span style="color:${c}">${renderChildren(node)}</span>` : renderChildren(node);
            }
            case 'size': {
                const n = Math.max(30, Math.min(200, parseInt(node.arg, 10) || 100));
                return `<span style="font-size:${n}%">${renderChildren(node)}</span>`;
            }
            case 'centre': return `<div style="text-align:center">${renderChildren(node)}</div>`;
            case 'heading': return `<div class="bbcode-heading">${renderChildren(node)}</div>`;
            case 'notice': return `<div class="bbcode-notice">${renderChildren(node)}</div>`;
            case 'spoiler': return `<span class="bbcode-spoiler">${renderChildren(node)}</span>`;
            case 'code': return `<pre>${escapeHtmlBBCode(rawText(node))}</pre>`;

            case 'url': {
                if (node.arg != null) {
                    const target = safeUrl(node.arg);
                    return target ? `<a href="${target}" target="_blank" rel="noopener noreferrer">${renderChildren(node)}</a>` : renderChildren(node);
                }
                const raw = rawText(node).trim();
                const target = safeUrl(raw);
                return target ? `<a href="${target}" target="_blank" rel="noopener noreferrer">${escapeHtmlBBCode(raw)}</a>` : escapeHtmlBBCode(raw);
            }
            case 'email': {
                if (node.arg != null) {
                    const addr = safeEmail(node.arg);
                    return addr ? `<a href="mailto:${addr}">${renderChildren(node)}</a>` : renderChildren(node);
                }
                const raw = rawText(node).trim();
                const addr = safeEmail(raw);
                return addr ? `<a href="mailto:${addr}">${escapeHtmlBBCode(raw)}</a>` : escapeHtmlBBCode(raw);
            }
            case 'img': {
                const u = safeUrl(rawText(node).trim());
                return u ? `<img src="${u}" alt="">` : '';
            }
            case 'profile': {
                const id = node.arg && /^\d+$/.test(node.arg.trim()) ? node.arg.trim() : null;
                return id ? `<a href="https://osu.ppy.sh/users/${id}" target="_blank" rel="noopener noreferrer">${renderChildren(node)}</a>` : renderChildren(node);
            }
            case 'youtube': {
                const id = rawText(node).trim();
                if (!/^[a-zA-Z0-9_-]{6,20}$/.test(id)) return escapeHtmlBBCode(`[youtube]${id}[/youtube]`);
                return `<div class="bbcode-video-wrap"><iframe src="https://www.youtube.com/embed/${id}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
            }
            case 'audio': {
                const u = safeUrl(rawText(node).trim());
                return u ? `<audio controls src="${u}"></audio>` : '';
            }
            case 'box': {
                const title = node.arg && node.arg.trim() ? escapeHtmlBBCode(node.arg.trim()) : 'Details';
                return `<details class="bbcode-box"><summary>${title}</summary><div class="bbcode-box-body">${renderChildren(node)}</div></details>`;
            }
            case 'quote': {
                const head = node.arg ? `<span class="quote-author">${escapeHtmlBBCode(node.arg)} wrote:</span>` : '';
                return `<blockquote>${head}${renderChildren(node)}</blockquote>`;
            }
            case 'list': return `<${node.arg === '1' ? 'ol' : 'ul'}>${renderChildren(node)}</${node.arg === '1' ? 'ol' : 'ul'}>`;
            case 'item': return `<li>${renderChildren(node)}</li>`;
            case 'imagemap': return renderImagemap(rawText(node));
            case 'root': return renderChildren(node);
            default: return '';
        }
    }

    // osu!'s [imagemap]: first line is the image URL, every following line
    // is "x y width height url label…" — a clickable rectangle in percent
    // of the image's own size (not pixels), so it stays correct at any
    // display width. label may contain spaces; url may not, so it's what
    // splits the two.
    function renderImagemap(raw) {
        const lines = raw.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
        if (!lines.length) return '';
        const imgUrl = safeUrl(lines[0]);
        if (!imgUrl) return '';
        const regions = [];
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(/\s+/);
            if (parts.length < 5) continue;
            const [x, y, w, h] = parts.slice(0, 4).map(parseFloat);
            if (![x, y, w, h].every(Number.isFinite)) continue;
            const url = safeUrl(parts[5 - 1]);
            if (!url) continue;
            const label = parts.slice(5).join(' ');
            regions.push({ x: clampPct(x), y: clampPct(y), w: clampPct(w), h: clampPct(h), url, label });
        }
        const regionsHtml = regions.map(r => `<a class="bbcode-imagemap-region" style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%" href="${r.url}" target="_blank" rel="noopener noreferrer"${r.label ? ` title="${escapeHtmlBBCode(r.label)}"` : ''}></a>`).join('');
        return `<div class="bbcode-imagemap"><img src="${imgUrl}" alt="" draggable="false">${regionsHtml}</div>`;
    }

    function renderBBCode(src) {
        return renderNode(parseBBCode(src));
    }

    const input = document.getElementById('bbcode-input');
    const preview = document.getElementById('bbcode-preview');
    if (!input || !preview) return;

    function updatePreview() {
        preview.innerHTML = input.value.trim() ? renderBBCode(input.value) : '';
        try { localStorage.setItem(DRAFT_KEY, input.value); } catch { /* ignore */ }
    }

    input.addEventListener('input', updatePreview);

    try {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) input.value = saved;
    } catch { /* ignore */ }
    updatePreview();

    document.getElementById('bbcode-clear').addEventListener('click', () => {
        input.value = '';
        updatePreview();
        input.focus();
    });

    document.getElementById('bbcode-copy').addEventListener('click', async () => {
        const btn = document.getElementById('bbcode-copy');
        try {
            await navigator.clipboard.writeText(input.value);
            const original = btn.textContent;
            btn.textContent = t('bbcode_copied');
            setTimeout(() => { btn.textContent = original; }, 1500);
        } catch {
            input.select();
            document.execCommand('copy');
        }
    });

    document.querySelectorAll('#bbcode-toolbar button').forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.getAttribute('data-tag');
            const hasDefault = btn.hasAttribute('data-default');
            const defaultVal = btn.getAttribute('data-default');
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const selected = input.value.slice(start, end);

            let openTag, closeTag, insertText;
            if (hasDefault) {
                const val = selected || defaultVal;
                openTag = `[${tag}=${val}]`;
                closeTag = `[/${tag}]`;
                insertText = selected || '';
            } else if (btn.hasAttribute('data-block')) {
                openTag = `[${tag}]\n[*]`;
                closeTag = `\n[/${tag}]`;
                insertText = selected || 'item';
            } else {
                openTag = `[${tag}]`;
                closeTag = `[/${tag}]`;
                insertText = selected;
            }

            const newValue = input.value.slice(0, start) + openTag + insertText + closeTag + input.value.slice(end);
            input.value = newValue;
            const cursorPos = start + openTag.length + insertText.length;
            input.focus();
            input.setSelectionRange(cursorPos, cursorPos);
            updatePreview();
        });
    });
})();
