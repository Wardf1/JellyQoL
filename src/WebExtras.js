(function () {
    'use strict';
    if (window.JellyQoLExtras) return;
    let settings = null, identity = '', loading = false, generation = 0, timer = null, disposed = false;
    const intervals = [];
    let pager = null, bannerKey = '', bannerTimer = null;
    const memory = new Map(), searchNodes = new Set();
    const icons = {
        '{{icon:jellyfish}}': 'M4 4h16l-6 7v7l-4 2v-9z', '{{icon.audio}}': 'M3 9h4l5-4v14l-5-4H3zM16 8q6 4 0 8',
        '{{icon.subtitles}}': 'M3 5h18v14H3zM6 10h4m3 0h5M6 14h7m2 0h3', '{{icon.aspectRatio}}': 'M3 5h18v14H3zM7 11V8h4m6 5v3h-4'
    };
    const lang = () => /^pl(?:[-_]|$)/i.test(document.documentElement.lang || navigator.language || '') ? 'pl' : 'en';
    const words = () => lang() === 'pl'
        ? { previous: 'Poprzednia strona', next: 'Następna strona', of: 'z', pager: 'Nawigacja stron', close: 'Zamknij komunikat', details: 'Więcej informacji', announcement: 'Komunikat' }
        : { previous: 'Previous page', next: 'Next page', of: 'of', pager: 'Page navigation', close: 'Dismiss announcement', details: 'More information', announcement: 'Announcement' };
    const route = () => (location.hash.replace(/^#!?/, '').split('?')[0] || '/').toLowerCase().replace(/\/$/, '') || '/';
    const publicPage = () => /^\/(?:login|selectserver|addserver|forgotpassword|forgotpasswordpin|disclaimer|quickconnect|wizard)(?:\b|\/)/.test(route());
    const currentIdentity = () => {
        const api = window.ApiClient, user = api?.getCurrentUserId?.();
        return user && !publicPage() ? (api.serverAddress?.() || location.origin) + ':' + user : '';
    };
    const visible = node => Boolean(node && node.getClientRects().length && !node.closest('.hide,[hidden],[aria-hidden="true"]'));
    function attr(node, name, value) {
        if (value == null) { if (node.hasAttribute(name)) node.removeAttribute(name); }
        else if (node.getAttribute(name) !== String(value)) node.setAttribute(name, String(value));
    }
    function content(node, value) { if (node.textContent !== String(value)) node.textContent = String(value); }
    function safeUrl(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch (_) { return ''; } }
    function svg(path, className = '') {
        const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        element.setAttribute('viewBox', '0 0 24 24'); element.setAttribute('aria-hidden', 'true');
        if (className) element.setAttribute('class', className);
        const shape = document.createElementNS(element.namespaceURI, 'path'); shape.setAttribute('d', path);
        shape.setAttribute('fill', 'none'); shape.setAttribute('stroke', 'currentColor'); shape.setAttribute('stroke-width', '2');
        shape.setAttribute('stroke-linecap', 'round'); shape.setAttribute('stroke-linejoin', 'round'); element.appendChild(shape); return element;
    }
    async function loadSettings() {
        const key = currentIdentity();
        if (!key || loading || !window.ApiClient?.ajax) return;
        loading = true; const requestGeneration = generation;
        try {
            const value = await window.ApiClient.ajax({ type: 'GET', url: window.ApiClient.getUrl('MediaHider/Extras'), dataType: 'json' });
            if (key === currentIdentity() && requestGeneration === generation) { settings = value; schedule(); }
        } catch (_) { /* keep the last valid settings while offline */ }
        finally { loading = false; }
    }
    function links() {
        const sync = Array.from(document.querySelectorAll('.MuiToolbar-root [aria-controls="app-sync-play-menu"]')).find(visible);
        const user = Array.from(document.querySelectorAll('.MuiToolbar-root [aria-controls="app-user-menu"]')).find(visible);
        const modern = sync?.parentElement || user?.parentElement;
        const host = modern || Array.from(document.querySelectorAll('.headerRight')).find(visible);
        const reference = modern ? (sync || user) : host?.firstChild;
        for (const [index, name, url, path] of [
            [1, settings?.HeaderLink1Name, settings?.HeaderLink1Url, 'M12 8v4l3 3M3 12a9 9 0 1 0 3-6M3 3v6h6'],
            [2, settings?.HeaderLink2Name, settings?.HeaderLink2Url, 'M4 4h16v16H4zM4 9h16M9 4v5M15 4v5']
        ]) {
            let link = document.getElementById('jqol-service-' + index);
            const href = safeUrl(url);
            if (!settings?.EnableHeaderLinks || !host || !href || !name) { link?.remove(); continue; }
            if (!link) {
                link = document.createElement('a'); link.id = 'jqol-service-' + index; link.className = 'jqol-service-link';
                link.target = '_blank'; link.rel = 'noopener noreferrer'; link.appendChild(svg(path));
            }
            attr(link, 'href', href); attr(link, 'title', name); attr(link, 'aria-label', name);
            if (link.parentElement !== host) host.insertBefore(link, reference);
        }
    }
    function cardAt(target) { return target instanceof Element ? target.closest('.card[data-id], .listItem[data-id]') : null; }
    function nativeMenu(card) {
        return card?.querySelector('button[data-action="menu"],.itemAction[data-action="menu"],.cardOverflowButton,.btnMore,.btnMoreCommands') ||
            card?.querySelector('svg[data-testid="MoreVertIcon"],svg[data-testid="MoreHorizIcon"]')?.closest('button');
    }
    function context(event) {
        if (!settings?.EnableContextMenu || !currentIdentity() || (event.type !== 'contextmenu' && event.button !== 2) || (event.ctrlKey && !event.shiftKey)) return;
        if (event.target.closest?.('input,textarea,select,video,audio,[contenteditable="true"],.MuiPopover-root,.actionSheet')) return;
        const card = cardAt(event.target); if (!card) return;
        if (event.shiftKey) { event.stopImmediatePropagation(); return; }
        const menu = nativeMenu(card); if (!menu || menu.disabled || menu.getAttribute('aria-disabled') === 'true') return;
        event.preventDefault(); event.stopImmediatePropagation(); if (event.type === 'contextmenu') menu.click();
    }
    function toastIcons() {
        if (!settings?.EnableToastIcons) {
            document.querySelectorAll('svg[data-jqol-toast-token]').forEach(node => node.replaceWith(document.createTextNode(node.getAttribute('data-jqol-toast-token')))); return;
        }
        document.querySelectorAll('.jellyfin-enhanced-toast').forEach(toast => {
            const walker = document.createTreeWalker(toast, NodeFilter.SHOW_TEXT), nodes = [];
            while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('script,style,svg,textarea') && /\{\{icon(?::jellyfish|\.audio|\.subtitles|\.aspectRatio)\}\}/.test(walker.currentNode.data)) nodes.push(walker.currentNode);
            for (const node of nodes) {
                const fragment = document.createDocumentFragment();
                for (const part of node.data.split(/(\{\{icon(?::jellyfish|\.audio|\.subtitles|\.aspectRatio)\}\})/g)) {
                    if (!icons[part]) fragment.appendChild(document.createTextNode(part));
                    else { const icon = svg(icons[part], 'jqol-toast-icon'); icon.setAttribute('data-jqol-toast-token', part); fragment.appendChild(icon); }
                }
                node.replaceWith(fragment);
            }
        });
    }
    function clearSearch() {
        for (const node of searchNodes) for (const name of ['data-jqol-search-list','data-jqol-search-rank','data-jqol-search-empty']) attr(node, name, null);
        searchNodes.clear();
    }
    function search() {
        if (!settings?.EnableSearchOrder || !/^\/search(?:\.html)?$/.test(route())) { clearSearch(); return; }
        const rows = document.querySelectorAll('.searchResults > .verticalSection, .searchResults > .jellyseerr-section, .jellyseerr-section');
        for (const row of rows) {
            const heading = (row.querySelector('h2,h3,.sectionTitle')?.textContent || '').trim().toLowerCase();
            const seerr = row.matches('.jellyseerr-section');
            let kind = seerr ? '2' : row.querySelector('[data-type="Movie"]') || /^(filmy|movies|films)$/.test(heading) ? '0'
                : row.querySelector('[data-type="Series"]') || /^(seriale|series|tv shows|shows)$/.test(heading) ? '1' : '3';
            attr(row, 'data-jqol-search-rank', kind); searchNodes.add(row);
            const parent = row.parentElement;
            if (parent) { attr(parent, 'data-jqol-search-list', ''); searchNodes.add(parent); }
            if (seerr && parent?.querySelector(':scope > .searchResults')) {
                const native = parent.querySelector(':scope > .searchResults'); attr(native, 'data-jqol-search-rank', '0'); searchNodes.add(native);
            }
            const cards = row.querySelector('.card,.listItem,.jellyseerr-card,[data-tmdb-id],a[href*="/movie/"],a[href*="/tv/"]');
            const list = row.querySelector('.itemsContainer,.jellyseerr-results,.jellyseerr-grid,.jellyseerr-results-container');
            const loading = row.querySelector('[role="progressbar"],.loading,.spinner,.jellyseerr-loading');
            const headingOnly = Array.from(row.children).every(node => node.matches('h1,h2,h3,.sectionTitle,.sectionTitleContainer'));
            const empty = !cards && !loading && (list ? !list.children.length : row.querySelector('.noItemsMessage,.jellyseerr-no-results,.jellyseerr-empty') || headingOnly);
            attr(row, 'data-jqol-search-empty', empty ? '' : null);
        }
    }
    function pagerCleanup() {
        if (!pager) return;
        pager.chip.classList.remove('jqol-native-counter'); pager.previous.classList.remove('jqol-native-arrow'); pager.next.classList.remove('jqol-native-arrow');
        pager.top.element.remove(); pager.bottom.element.remove(); pager = null;
    }
    const counterPattern = /^(\d[\d\s\u00a0\u202f,.'’]*)\s*[-–—]\s*(\d[\d\s\u00a0\u202f,.'’]*)\s+(?:z|of)\s+(\d[\d\s\u00a0\u202f,.'’]*)$/i;
    function paginationPair(chip) {
        for (let parent = chip.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            if (Array.from(parent.querySelectorAll('.MuiChip-root')).filter(node => visible(node) && counterPattern.test(node.textContent.trim())).length > 1) return null;
            const previous = parent.querySelector('button:has(svg[data-testid="NavigateBeforeIcon"]),button:has(svg[data-testid="ChevronLeftIcon"]),button:has(svg[data-testid="KeyboardArrowLeftIcon"]),button[title="Poprzedni"],button[title="Previous"]');
            const next = parent.querySelector('button:has(svg[data-testid="NavigateNextIcon"]),button:has(svg[data-testid="ChevronRightIcon"]),button:has(svg[data-testid="KeyboardArrowRightIcon"]),button[title="Następny"],button[title="Next"]');
            if (previous && next) return { previous, next };
        }
        return null;
    }
    const disabled = node => !node || node.disabled || node.getAttribute('aria-disabled') === 'true';
    function makePager(bottom) {
        const element = document.createElement('nav'); element.className = 'jqol-pagination' + (bottom ? ' jqol-pagination-bottom' : '');
        element.setAttribute('aria-label', words().pager); const track = document.createElement('div'); track.className = 'jqol-page-track';
        const count = document.createElement('span'); count.className = 'jqol-page-count'; count.setAttribute('aria-live', 'polite');
        const controls = {};
        for (const [direction, path] of [['previous','M14 6l-6 6 6 6'],['next','M10 6l6 6-6 6']]) {
            const button = document.createElement('button'); button.type = 'button'; button.appendChild(svg(path)); controls[direction] = button;
            button.addEventListener('click', () => { const native = pager && paginationPair(pager.chip)?.[direction]; if (!disabled(native)) native.click(); schedule(); });
        }
        track.append(controls.previous, count, controls.next); element.appendChild(track); return { element, count, ...controls };
    }
    function bottomHost(chip) {
        const selectors = '.card,.listItem,a[href*="details?id="],a[href*="/details?"]';
        for (let scope = chip.parentElement; scope && scope !== document.body; scope = scope.parentElement) {
            const cards = Array.from(scope.querySelectorAll(selectors)).filter(node => visible(node) && !node.closest('header,nav,aside,.MuiAppBar-root,.skinHeader,.jqol-pagination'));
            if (!cards.length) continue;
            let host = cards[0].parentElement;
            while (host && !cards.every(card => host.contains(card))) host = host.parentElement;
            if (host && host !== document.body && host !== document.documentElement) return host;
        }
        return chip.closest('main,[role="main"],.page,.view') || Array.from(document.querySelectorAll('main,[role="main"]')).find(visible);
    }
    function pagination() {
        if (!settings?.EnablePagination) { pagerCleanup(); return; }
        const chip = Array.from(document.querySelectorAll('.MuiChip-root')).find(node => visible(node) && counterPattern.test(node.textContent.trim()));
        const pair = chip && paginationPair(chip);
        if (!chip || !pair) { pagerCleanup(); return; }
        if (pager && pager.chip !== chip) pagerCleanup();
        if (!pager) pager = { chip, ...pair, top: makePager(false), bottom: makePager(true) };
        for (const direction of ['previous','next']) {
            if (pager[direction] !== pair[direction]) pager[direction].classList.remove('jqol-native-arrow');
            pager[direction] = pair[direction]; pair[direction].classList.add('jqol-native-arrow');
        }
        const match = chip.textContent.trim().match(counterPattern);
        for (const view of [pager.top,pager.bottom]) {
            attr(view.element, 'aria-label', words().pager); content(view.count, match[1].trim() + '–' + match[2].trim() + ' ' + words().of + ' ' + match[3].trim());
            for (const direction of ['previous','next']) { view[direction].disabled = disabled(pair[direction]); attr(view[direction], 'title', words()[direction]); attr(view[direction], 'aria-label', words()[direction]); }
        }
        if (chip.nextSibling !== pager.top.element) chip.after(pager.top.element);
        chip.classList.add('jqol-native-counter');
        const host = bottomHost(chip); if (host && host.lastElementChild !== pager.bottom.element) host.appendChild(pager.bottom.element); else if (!host) pager.bottom.element.remove();
    }
    function hash(value) { let result = 2166136261; for (const char of value) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16); }
    function stateFor(key) { try { return JSON.parse(localStorage.getItem(key)) || memory.get(key) || {}; } catch (_) { return memory.get(key) || {}; } }
    function saveState(key, state) { memory.set(key, state); try { localStorage.setItem(key, JSON.stringify(state)); } catch (_) { /* memory fallback */ } }
    function sessionShown(key, value) { try { if (value) sessionStorage.setItem(key, '1'); return sessionStorage.getItem(key) === '1'; } catch (_) { return Boolean(memory.get(key + ':session')); } finally { if (value) memory.set(key + ':session', true); } }
    function removeBanner() { if (bannerTimer !== null) clearTimeout(bannerTimer); bannerTimer = null; document.getElementById('jqol-announcement')?.remove(); }
    function announcement() {
        const home = ['/', '/home', '/home.html'].includes(route()) && !new URLSearchParams(location.hash.split('?')[1] || '').get('tab')?.match(/^[1-9]/);
        const now = Date.now(), config = settings;
        const start = config?.AnnouncementShowAfter ? Date.parse(config.AnnouncementShowAfter) : null;
        const end = config?.AnnouncementExpiresAt ? Date.parse(config.AnnouncementExpiresAt) : null;
        if (!config?.EnableAnnouncement || !config.AnnouncementMessage || !home || (start !== null && (!Number.isFinite(start) || now < start)) || (end !== null && (!Number.isFinite(end) || now >= end))) { removeBanner(); return; }
        const key = 'jellyqol:announcement:' + identity + ':' + hash(JSON.stringify([config.AnnouncementTitle,config.AnnouncementMessage,config.AnnouncementDetails,config.AnnouncementUrl,start,end]));
        if (bannerKey !== key) { removeBanner(); bannerKey = key; }
        let state = stateFor(key);
        if (state.dismissed) { removeBanner(); return; }
        const existing = document.getElementById('jqol-announcement');
        if (existing) { positionBanner(existing); return; }
        if (config.AnnouncementResetHours > 0 && state.first && now - state.first >= config.AnnouncementResetHours * 3600000) {
            state = {}; saveState(key, state); try { sessionStorage.removeItem(key); } catch (_) { /* optional storage */ } memory.delete(key + ':session');
        }
        if (!config.AnnouncementRepeatInSession && sessionShown(key)) return;
        if (config.AnnouncementMaxAppearances > 0 && (state.count || 0) >= config.AnnouncementMaxAppearances) return;
        if (config.AnnouncementCooldownSeconds > 0 && state.last && now - state.last < config.AnnouncementCooldownSeconds * 1000) return;
        const banner = document.createElement('section'); banner.id = 'jqol-announcement'; banner.setAttribute('aria-label', words().announcement);
        const body = document.createElement('div'); body.setAttribute('role','status'); body.setAttribute('aria-live','polite');
        if (config.AnnouncementTitle) { const heading = document.createElement('h2'); heading.textContent = config.AnnouncementTitle; body.appendChild(heading); }
        const message = document.createElement('p'); message.textContent = config.AnnouncementMessage; body.appendChild(message);
        if (config.AnnouncementDetails) { const list = document.createElement('ul'); for (const line of config.AnnouncementDetails.split('\n').map(x=>x.trim()).filter(Boolean)) { const item = document.createElement('li'); item.textContent = line; list.appendChild(item); } body.appendChild(list); }
        banner.appendChild(body);
        const url = safeUrl(config.AnnouncementUrl);
        if (url) { const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = config.AnnouncementLinkText || words().details; banner.appendChild(link); }
        function close(event) { event.preventDefault(); if (config.AnnouncementRememberDismiss) saveState(key, { ...stateFor(key), dismissed: true }); removeBanner(); }
        const closeButton = document.createElement('button'); closeButton.type='button'; closeButton.className='jqol-announcement-close';closeButton.textContent='×';closeButton.setAttribute('aria-label',words().close);closeButton.addEventListener('click',close);banner.appendChild(closeButton);
        banner.addEventListener('keydown', event=>{ if(event.key==='Escape') close(event); });
        document.body.appendChild(banner); positionBanner(banner);
        saveState(key,{...state,first:state.first||now,last:now,count:(state.count||0)+1}); sessionShown(key,true);
        if(config.AnnouncementDurationSeconds>0) bannerTimer=setTimeout(()=>{bannerTimer=null;banner.remove();},config.AnnouncementDurationSeconds*1000);
    }
    function positionBanner(banner) {
        const bottom = settings?.AnnouncementPosition === 'bottom'; let top = 16;
        if (!bottom) for (const header of document.querySelectorAll('.MuiAppBar-root,.skinHeader,.MuiToolbar-root')) { const rect=header.getBoundingClientRect();if(visible(header)&&rect.top<=5)top=Math.max(top,Math.round(rect.bottom)+16); }
        if(banner.style.top!==(bottom?'auto':top+'px'))banner.style.top=bottom?'auto':top+'px';
        if(banner.style.bottom!==(bottom?'16px':'auto'))banner.style.bottom=bottom?'16px':'auto';
    }
    function cleanup() { document.querySelectorAll('.jqol-service-link').forEach(node=>node.remove());clearSearch();pagerCleanup();removeBanner(); }
    function update() {
        const key=currentIdentity();
        if(key!==identity){identity=key;generation++;settings=null;loading=false;cleanup();if(key)loadSettings();}
        if(!key||!settings){cleanup();return;}
        links();toastIcons();search();pagination();announcement();
    }
    function schedule() {
        if(disposed || typeof document === 'undefined' || !document.body)return;
        if(!currentIdentity())cleanup();
        if(timer!==null)return;
        timer=setTimeout(()=>{timer=null;observer.disconnect();try{update();}finally{observer.observe(document.body,options);}},80);
    }
    const options={childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','disabled','aria-disabled','aria-hidden','hidden','lang']};
    const observer=new MutationObserver(schedule);
    function start(){
        const style=document.createElement('style');style.id='jelly-qol-extras-style';style.textContent=`
.jqol-service-link{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;flex:0 0 44px;color:inherit;border-radius:50%;text-decoration:none}.jqol-service-link:hover{background:#ffffff18}.jqol-service-link svg{width:24px;height:24px}.jqol-service-link:focus-visible{outline:2px solid currentColor;outline-offset:-3px}
.jqol-toast-icon{width:20px;height:20px;vertical-align:middle;color:var(--wardf-focus,#00a4dc);margin-inline:4px;flex-shrink:0}
[data-jqol-search-list]{display:flex!important;flex-direction:column!important}[data-jqol-search-rank="0"]{order:0}[data-jqol-search-rank="1"]{order:1}[data-jqol-search-rank="2"]{order:2}[data-jqol-search-rank="3"]{order:3}[data-jqol-search-empty]{display:none!important}
.jqol-native-arrow{display:none!important}.jqol-native-counter{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip-path:inset(50%)!important;pointer-events:none!important}
.jqol-pagination{display:inline-flex;align-items:center;vertical-align:middle;max-width:100%;color:inherit}.jqol-page-track{display:inline-flex;align-items:center;gap:4px;padding:5px;border:1px solid #ffffff25;border-radius:14px;background:var(--wardf-surface,#252525);box-shadow:0 6px 20px #0004}.jqol-pagination button{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;min-width:42px;background:transparent;color:inherit;border:0;border-radius:10px;cursor:pointer}.jqol-pagination button:hover:not(:disabled){background:#ffffff15}.jqol-pagination button:focus-visible{outline:2px solid #00a4dc}.jqol-pagination button:disabled{opacity:.35;cursor:default}.jqol-pagination svg{width:20px;height:20px}.jqol-page-count{font-size:13px;font-variant-numeric:tabular-nums;padding:0 12px;white-space:nowrap}.jqol-pagination-bottom{display:flex;justify-content:center;width:100%;flex:0 0 100%;grid-column:1/-1;clear:both;padding:28px 0;padding-bottom:max(28px,env(safe-area-inset-bottom))}
#jqol-announcement{position:fixed;right:max(16px,env(safe-area-inset-right));width:min(420px,calc(100vw - 32px));max-height:calc(100dvh - 100px);overflow:auto;box-sizing:border-box;z-index:9999;padding:24px;border:1px solid #ffffff30;border-radius:18px;background:var(--wardf-surface,#252525);color:#f5f5f5;box-shadow:0 18px 60px #0007;font:15px/1.6 system-ui,sans-serif}#jqol-announcement h2{margin:0 32px 12px 0;font-size:24px}#jqol-announcement p{margin:0;white-space:pre-wrap}#jqol-announcement ul{padding-left:1.4em}#jqol-announcement a{display:inline-block;margin-top:16px;padding:8px 14px;border-radius:8px;background:#00a4dc;color:#fff;text-decoration:none}#jqol-announcement .jqol-announcement-close{position:absolute;top:8px;right:8px;width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:inherit;font-size:28px;cursor:pointer}#jqol-announcement .jqol-announcement-close:hover{background:#ffffff15}#jqol-announcement :focus-visible{outline:2px solid #00a4dc;outline-offset:2px}
@media(max-width:480px){.jqol-page-count{padding:0 6px;font-size:12px}.jqol-page-track{gap:0}.jqol-pagination button{width:36px;min-width:36px}}
`;
        document.head.appendChild(style);observer.observe(document.body,options);schedule();
        intervals.push(setInterval(()=>{if(!document.hidden)schedule();},1000),setInterval(()=>{if(!document.hidden)loadSettings();},30000));
    }
    for(const type of ['pointerdown','mousedown','pointerup','mouseup','contextmenu'])document.addEventListener(type,context,true);
    for(const type of ['hashchange','popstate','resize','storage','pageshow'])window.addEventListener(type,schedule);
    for(const type of ['viewshow','visibilitychange'])document.addEventListener(type,schedule,true);
    window.addEventListener('jellyqol:features',event=>{if(currentIdentity()&&event.detail){generation++;settings={...settings,...event.detail};schedule();}});
    window.JellyQoLExtras={refresh:schedule,dispose:()=>{disposed=true;generation++;observer.disconnect();clearTimeout(timer);intervals.forEach(clearInterval);cleanup();}};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();