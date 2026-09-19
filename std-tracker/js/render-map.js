/* Ported from catch-tracker's own render-map.js, minus its score-detail
   modal registration and replay links (neither feature exists on this site
   yet) and its Maps-catalog status badge (this site has no catalog crawler
   for v1 — map-stats.js's `meta.status` is always null here). */
async function loadMap() {
    const main = document.getElementById('map-main');
    const params = new URLSearchParams(location.search);
    const beatmapId = params.get('id');
    if (!beatmapId) {
        main.innerHTML = `<p class="empty-state">${t('map_no_id')}</p>`;
        return;
    }

    try {
        const data = await apiGet('map-stats', { beatmap_id: beatmapId });
        const m = data.meta;

        if (!m) {
            main.innerHTML = `<p class="empty-state">${t('map_no_scores')}</p>`;
            return;
        }

        document.title = `Std Tracker — ${m.title || beatmapId}`;

        const statBars = (entries, labelFn) => {
            if (!entries.length) return `<p class="empty-state">${t('no_data')}</p>`;
            const max = Math.max(...entries.map(([, n]) => n));
            return `<div class="stat-bars">${entries.map(([key, n]) => `
                <div class="stat-bar-row">
                    <div>${labelFn(key)}</div>
                    <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${max ? Math.round((n / max) * 100) : 0}%"></div></div>
                    <div class="stat-bar-count">${n}</div>
                </div>`).join('')}</div>`;
        };

        const gradeEntries = Object.entries(data.gradeCounts).sort((a, b) => b[1] - a[1]);
        const modEntries = Object.entries(data.modCounts).sort((a, b) => b[1] - a[1]);
        const fcRate = data.sampleSize ? Math.round(100 * data.fcCount / data.sampleSize) : 0;

        const cover = coverArtUrl(m.beatmapset_id);
        main.innerHTML = `
            <div class="card profile-header${cover ? ' has-cover' : ''}"${cover ? ` style="background-image:url('${cover.replace(/'/g, '%27')}')"` : ''}>
                <div>
                    <h1 style="margin:0 0 6px">${escapeHtml(m.artist)} - ${escapeHtml(m.title)} [${escapeHtml(m.version)}]</h1>
                    <p style="color:var(--text-dim);margin:0">${t('mapped_by', { creator: escapeHtml(m.creator) })} · ${m.difficulty_rating != null ? m.difficulty_rating.toFixed(2) + '★' : ''}</p>
                </div>
            </div>
            <p class="coverage-note">${t('map_coverage', { n: data.sampleSize, fc: fcRate })}</p>
            <div style="display:flex;gap:18px;flex-wrap:wrap">
                <div class="card" style="flex:1;min-width:220px">
                    <h2 style="margin-top:0">${t('grade_distribution')}</h2>
                    ${statBars(gradeEntries, g => gradeBadge(g))}
                </div>
                <div class="card" style="flex:1;min-width:220px">
                    <h2 style="margin-top:0">${t('mod_usage')}</h2>
                    ${statBars(modEntries, mod => modHexHtml(mod))}
                </div>
            </div>
            <h2>${t('tracked_scores')}</h2>
            <div class="table-wrap">
            <table>
                <thead><tr><th>${t('th_player')}</th><th>${t('th_mods')}</th><th>${t('th_grade')}</th><th>${t('th_acc')}</th><th>${t('th_pp')}</th><th>${t('th_when')}</th></tr></thead>
                <tbody>${data.scores.map(s => `
                    <tr>
                        <td>${playerLink(s.user_id, s.username)}</td>
                        <td>${modsTag(s.mods)}</td>
                        <td>${gradeBadge(s.rank)}${fcTag(s.is_fc)}</td>
                        <td>${fmtAccuracy(s.accuracy)}</td>
                        <td>${fmtPP(s.pp)}</td>
                        <td>${relTime(s.created_at)}</td>
                    </tr>`).join('') || `<tr><td colspan="6" class="empty-state">${t('no_scores_short')}</td></tr>`}</tbody>
            </table>
            </div>
        `;
    } catch (err) {
        main.innerHTML = `<p class="empty-state">${t('map_failed')}</p>`;
    }
}

loadMap();
