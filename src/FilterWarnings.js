(function () {
    'use strict';
    if (window.JellyQoLFilters) return;
    const dialogSelector = '.filterDialog, .dynamicFilterDialog';
    const modernIconSelector = 'svg[data-testid="FilterAltIcon"]';
    const categoryFields = {
        filtersStatus: ['Status'], filtersSeriesStatus: ['SeriesStatus'], filtersEpisodesStatus: ['EpisodeFilter', 'EpisodesStatus'],
        filtersFeatures: ['Features'], filtersVideoTypes: ['VideoBasicFilter', 'VideoTypes'], filtersGenres: ['Genres'],
        filtersOfficialRatings: ['OfficialRatings'], filtersTags: ['Tags'], filtersYears: ['Years'], filtersStudios: ['StudioIds'],
        filtersAudioLanguages: ['AudioLanguages'], filtersSubtitleLanguages: ['SubtitleLanguages']
    };
    // Jellyfin 12.1 library tabs and local-storage keys, also used when MUI unmounts collapsed categories.
    const views = {
        '/movies': ['movies', 'suggestions', 'favorites', 'collections', 'genres', 'studios', 'playlists'],
        '/tv': ['series', 'suggestions', 'upcoming', 'genres', 'studios', 'episodes', 'collections', 'playlists'],
        '/music': ['albums', 'suggestions', 'albumartists', 'artists', 'playlists', 'songs', 'genres', 'collections'],
        '/books': ['folders', 'books', 'authors', 'suggestions', 'genres', 'collections', 'favorites'],
        '/boxsets': ['collections', 'favorites', 'genres'], '/playlists': ['playlists', 'favorites'],
        '/homevideos': ['folders', 'photos', 'photoalbums', 'videos'], '/musicvideos': ['folders', 'suggestions', 'musicvideos', 'playlists'],
        '/mixed': ['folders', 'suggestions', 'mixed', 'collections', 'playlists'],
        '/livetv': ['programs', 'guide', 'channels', 'recordings', 'schedule', 'seriestimers']
    };
    let features = { EnableFilterWarnings: true, AnimateFilterWarnings: true };
    const featureUrl = new URL('Features', document.currentScript?.src || new URL('../MediaHider/FilterWarnings.js', location.href)).href;
    let scope = '', counts = new Map(), timer = null;
    const text = () => /^pl(?:[-_]|$)/i.test(document.documentElement.lang || navigator.language || '')
        ? { active: 'Aktywne filtry', clear: 'Wyczyść wszystkie filtry' }
        : { active: 'Active filters', clear: 'Clear all filters' };
    function attr(node, name, value) {
        if (value == null) { if (node.hasAttribute(name)) node.removeAttribute(name); }
        else if (node.getAttribute(name) !== String(value)) node.setAttribute(name, String(value));
    }
    function markButton(button, active) {
        if (!button) return;
        attr(button, 'data-jqol-filter-warning', active ? text().active : null);
        attr(button, 'aria-description', active ? text().active : null);
    }
    function settings() {
        try {
            const route = new URL(location.hash.slice(1) || location.pathname, location.origin);
            const tabs = views[route.pathname];
            if (!tabs) return null;
            const selected = Array.from(document.querySelectorAll('[role="tablist"] [role="tab"]'));
            const selectedIndex = selected.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
            const index = route.searchParams.has('tab') ? Number(route.searchParams.get('tab')) : Math.max(0, selectedIndex);
            if (!Number.isInteger(index) || !tabs[index]) return null;
            const parent = route.pathname === '/livetv' ? 'livetv' : route.searchParams.get('topParentId');
            const value = JSON.parse(localStorage.getItem(tabs[index] + ' - ' + parent) || 'null');
            return value && typeof value.Filters === 'object' && value.Filters !== null ? value.Filters : null;
        } catch (_) { return null; }
    }
    function modern() {
        const icons = document.querySelectorAll(modernIconSelector);
        let active = false;
        for (const icon of icons) {
            const badge = icon.closest('.MuiBadge-root')?.querySelector('.MuiBadge-badge');
            const enabled = Boolean(badge && !badge.classList.contains('MuiBadge-invisible'));
            markButton(icon.closest('button'), enabled);
            active ||= enabled;
        }
        if (!active) counts.clear();
        const filters = active ? settings() : null;
        document.querySelectorAll('#filter-popover .MuiAccordion-root').forEach(section => {
            const summary = section.querySelector('.MuiAccordionSummary-root');
            if (!summary) return;
            const id = summary.id.replace(/-header$/, '');
            const inputs = section.querySelectorAll('input[type="checkbox"]');
            let count = active ? counts.get(id) || 0 : 0;
            if (active && filters && categoryFields[id]) {
                count = categoryFields[id].reduce((total, field) => total + (Array.isArray(filters[field]) ? filters[field].length : 0), 0);
            }
            // Mounted controls reflect React's committed state; do not count native click's transient value.
            if (active && inputs.length && !filters) count = Array.from(inputs).filter(input => input.closest('.MuiCheckbox-root')?.classList.contains('Mui-checked') ?? input.checked).length;
            counts.set(id, count);
            attr(summary, 'data-jqol-filter-count', count > 0 ? count : null);
        });
    }
    function legacy() {
        document.querySelectorAll(dialogSelector).forEach(dialog => {
            const checked = Array.from(dialog.querySelectorAll('input[type="checkbox"]:checked'));
            dialog.querySelectorAll('label .checkboxLabel').forEach(label => {
                const input = label.closest('label').querySelector('input[type="checkbox"]');
                attr(label, 'data-jqol-filter-label', input?.checked ? '' : null);
            });
            dialog.querySelectorAll('[is="emby-collapse"].emby-collapse').forEach(section => {
                const button = section.querySelector('.emby-collapsible-button');
                if (button) {
                    const count = section.querySelectorAll('input[type="checkbox"]:checked').length;
                    attr(button, 'data-jqol-filter-count', count > 0 ? count : null);
                }
            });
            let clear = dialog.querySelector('[data-jqol-clear]');
            if (!clear) {
                clear = document.createElement('button'); clear.type = 'button'; clear.className = 'emby-button raised';
                clear.setAttribute('data-jqol-clear', '');
                clear.addEventListener('click', () => {
                    for (const input of Array.from(dialog.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)'))) {
                        if (input.isConnected && input.checked) input.click();
                    }
                    schedule();
                });
                (dialog.querySelector('.filterDialogContent') || dialog).appendChild(clear);
            }
            if (clear.textContent !== text().clear) clear.textContent = text().clear;
            clear.disabled = !checked.some(input => !input.disabled);
        });
        document.querySelectorAll('.btnFilter-wrapper').forEach(wrapper => {
            const indicator = wrapper.querySelector('.filterIndicator');
            // The built-in indicator is authoritative even after a dialog closes or a page changes.
            const active = Boolean(indicator && !indicator.classList.contains('hide') && !indicator.hidden);
            markButton(wrapper.querySelector('button') || wrapper.querySelector('.btnFilter'), active);
        });
    }
    function update() {
        const identity = location.href + '|' + (window.ApiClient?.getCurrentUserId?.() || '');
        if (scope !== identity) { scope = identity; counts.clear(); }
        attr(document.documentElement, 'data-jqol-filters-enabled', features.EnableFilterWarnings ? '' : null);
        attr(document.documentElement, 'data-jqol-filter-animation', features.AnimateFilterWarnings ? null : 'off');
        if (features.EnableFilterWarnings) { modern(); legacy(); }
        else {
            counts.clear();
            document.querySelectorAll('[data-jqol-filter-warning]').forEach(node => markButton(node, false));
            document.querySelectorAll('[data-jqol-filter-count], [data-jqol-filter-label]').forEach(node => { attr(node, 'data-jqol-filter-count', null); attr(node, 'data-jqol-filter-label', null); });
            document.querySelectorAll('[data-jqol-clear]').forEach(node => node.remove());
        }
    }
    function schedule() {
        if (timer !== null) return;
        timer = setTimeout(() => {
            timer = null;
            // Ignore our own attributes/text so rendering never feeds an observer loop.
            observer.disconnect();
            try { update(); } finally { observer.observe(document.documentElement, options); }
        }, 35);
    }
    const options = { childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['class', 'checked', 'aria-checked', 'aria-selected', 'hidden', 'lang'] };
    const observer = new MutationObserver(schedule);
    let loadingFeatures = false, featureGeneration = 0;
    async function loadFeatures() {
        if (loadingFeatures || typeof window.fetch !== 'function') return;
        loadingFeatures = true;
        const requestGeneration = featureGeneration;
        try {
            const response = await fetch(featureUrl, { credentials: 'same-origin', cache: 'no-store' });
            if (response.ok) {
                const value = await response.json();
                if (requestGeneration === featureGeneration && typeof value.EnableFilterWarnings === 'boolean' && typeof value.AnimateFilterWarnings === 'boolean') {
                    features = value; schedule();
                }
            }
        } catch (_) { /* retain last valid settings during a connection failure */ }
        finally { loadingFeatures = false; }
    }
    window.addEventListener('jellyqol:features', event => {
        if (typeof event.detail?.EnableFilterWarnings !== 'boolean' || typeof event.detail?.AnimateFilterWarnings !== 'boolean') return;
        featureGeneration++; features = event.detail; schedule();
    });
    function start() {
        const style = document.createElement('style'); style.id = 'jelly-qol-filters-style';
        style.textContent = `
@keyframes jqolFilterPulse { 0%,100% { color:#f87171; } 50% { color:#fbbf24; } }
@keyframes jqolIconBlink { 0%,100% { color:#f87171; opacity:1; } 50% { color:#fbbf24; opacity:.25; } }
[data-jqol-filter-warning] { color:#fbbf24!important; }
[data-jqol-filter-warning] svg[data-testid="FilterAltIcon"],
[data-jqol-filter-warning] .material-icons { animation:jqolIconBlink 1.2s ease-in-out infinite!important; }
html[data-jqol-filters-enabled] #filter-popover .MuiFormControlLabel-root:has(.MuiCheckbox-root.Mui-checked) .MuiFormControlLabel-label,
[data-jqol-filter-label] { animation:jqolFilterPulse 1.2s ease-in-out infinite; }
[data-jqol-filter-count] { background-color:rgba(255,160,30,.13)!important; }
[data-jqol-filter-count]::after { content:attr(data-jqol-filter-count); border-radius:1em; background:#c2392f; color:#fff; padding:.12em .5em; margin-inline:.5em; font-size:.75rem; line-height:1.3; }
[data-jqol-clear] { margin:1em auto; display:block; }
html[data-jqol-filter-animation="off"] [data-jqol-filter-warning] svg,
html[data-jqol-filter-animation="off"] [data-jqol-filter-warning] .material-icons,
html[data-jqol-filter-animation="off"][data-jqol-filters-enabled] #filter-popover .MuiFormControlLabel-root:has(.MuiCheckbox-root.Mui-checked) .MuiFormControlLabel-label,
html[data-jqol-filter-animation="off"] [data-jqol-filter-label] { animation:none!important; color:#fbbf24!important; }
@media (prefers-reduced-motion:reduce) {
[data-jqol-filter-warning] svg[data-testid="FilterAltIcon"], [data-jqol-filter-warning] .material-icons,
html[data-jqol-filters-enabled] #filter-popover .MuiFormControlLabel-root:has(.MuiCheckbox-root.Mui-checked) .MuiFormControlLabel-label,
[data-jqol-filter-label] { animation:none!important; color:#fbbf24!important; }
}
`;
        document.head.appendChild(style);
        loadFeatures();
        setInterval(() => { if (!document.hidden) loadFeatures(); }, 30000);
        observer.observe(document.documentElement, options);
        // React can update .checked without an attribute mutation; this bounded fallback only runs while filters are open.
        setInterval(() => { if (!document.hidden && document.querySelector('#filter-popover, ' + dialogSelector)) schedule(); }, 500);
        schedule();
    }
    for (const event of ['change', 'input', 'click', 'viewshow', 'visibilitychange']) document.addEventListener(event, schedule, true);
    for (const event of ['hashchange', 'popstate', 'storage', 'local-storage', 'pageshow']) window.addEventListener(event, schedule);
    window.JellyQoLFilters = { refresh: schedule };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();