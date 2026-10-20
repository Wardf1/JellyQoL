(function () {
    'use strict';
    if (window.MediaHiderUI) return;
    const dictionaries = {
        en: {
            introduction: 'Manage movie and series visibility. Administrators retain access.',
            findTitle: 'Find a movie or series', placeholder: 'Enter at least 2 characters', search: 'Search',
            hiddenTitles: 'Hidden titles', sync: 'Refresh and check restrictions', restoreAll: 'Restore all titles',
            uninstall: 'Restore all titles before uninstalling the plugin. Refresh open clients to update their lists.',
            empty: 'No titles found.', movie: 'Movie', series: 'Series', removed: 'Removed item',
            hide: 'Hide from users', restore: 'Restore visibility', hideSeries: 'Hide entire series from users', restoreSeries: 'Restore visibility of entire series',
            hidden: 'Hidden from users', visible: 'Visible to users', inherited: 'Applies to the entire series: {name}',
            savedHidden: 'The title is now hidden from users.', savedVisible: 'Visibility has been restored.',
            saving: 'Saving changes…', adminOnly: 'An administrator account is required.',
            failure: 'The operation failed. Refresh the list and check the Jellyfin log. Saved restrictions will be retried automatically.',
            tooShort: 'Enter at least 2 characters.', synced: 'Lists and restrictions are up to date.',
            confirmRestore: 'Restore visibility of every title hidden by Jelly QoL?',
            restoredAll: 'All titles have been restored. You can uninstall the plugin.',
            syncError: 'The last synchronization failed. Check restrictions or inspect the Jellyfin log.',
            webError: 'The title-page controls require File Transformation. Install or enable a version compatible with Jellyfin 12.1, restart the server, and check the Jellyfin log if the message persists.'
        },
        pl: {
            introduction: 'Zarządzaj widocznością filmów i seriali. Administratorzy zachowują dostęp.',
            findTitle: 'Znajdź film lub serial', placeholder: 'Wpisz co najmniej 2 znaki', search: 'Szukaj',
            hiddenTitles: 'Ukryte tytuły', sync: 'Odśwież i sprawdź blokady', restoreAll: 'Przywróć wszystkie tytuły',
            uninstall: 'Przed odinstalowaniem wtyczki przywróć wszystkie tytuły. Odśwież otwarte aplikacje, aby zaktualizować listy.',
            empty: 'Brak tytułów.', movie: 'Film', series: 'Serial', removed: 'Usunięty element',
            hide: 'Ukryj przed użytkownikami', restore: 'Przywróć widoczność', hideSeries: 'Ukryj cały serial przed użytkownikami', restoreSeries: 'Przywróć widoczność całego serialu',
            hidden: 'Ukryty przed użytkownikami', visible: 'Widoczny dla użytkowników', inherited: 'Dotyczy całego serialu: {name}',
            savedHidden: 'Tytuł został ukryty przed użytkownikami.', savedVisible: 'Przywrócono widoczność tytułu.',
            saving: 'Zapisywanie zmian…', adminOnly: 'Dostęp wymaga konta administratora.',
            failure: 'Operacja nie powiodła się. Odśwież listę i sprawdź log Jellyfin. Zapisane blokady zostaną ponowione automatycznie.',
            tooShort: 'Wpisz co najmniej 2 znaki.', synced: 'Listy i blokady są aktualne.',
            confirmRestore: 'Przywrócić widoczność wszystkich tytułów ukrytych przez Jelly QoL?',
            restoredAll: 'Przywrócono wszystkie tytuły. Możesz odinstalować wtyczkę.',
            syncError: 'Ostatnia synchronizacja nie powiodła się. Sprawdź blokady lub zajrzyj do logu Jellyfin.',
            webError: 'Kontrolki na stronie tytułu wymagają File Transformation. Zainstaluj lub włącz wersję zgodną z Jellyfin 12.1 i uruchom serwer ponownie. Jeśli komunikat pozostanie, sprawdź log Jellyfin.'
        }
    };
    Object.assign(dictionaries.en, {
        filterWarnings: 'Warn about active filters', filterAnimation: 'Animate active-filter warnings', filtersScope: 'These settings apply to all accounts in the server web client. Other open clients update within 30 seconds.', qolSaved: 'QoL settings saved.', filtersHelp: 'Active-filter warnings update automatically in the Jellyfin 12.1 web client, for all accounts.', visibilityHeading: 'Media visibility', groups: 'Optional user groups', groupsHelp: 'Without groups, hidden titles are visible only to administrators. With groups, choose all users or selected groups when hiding a title.',
        groupName: 'Group name', groupMembers: 'Group members', saveGroup: 'Save group', cancelEdit: 'Cancel editing', edit: 'Edit', deleteGroup: 'Delete', noGroups: 'No groups configured. Hidden titles remain administrator-only.',
        noUsers: 'No non-administrator accounts are available.', members: 'Members: {count}', groupSaved: 'The group has been saved.', groupDeleted: 'The group has been deleted.',
        deleteConfirm: 'Delete this group? Titles hidden only for this group will become administrator-only.',
        groupError: 'Check the unique group name, selected accounts, and an optional future reveal date.',
        revealAt: 'Reveal group titles on (optional)', scheduleHelp: 'Each group has its own one-time date and time, using this browser’s time zone. The Jellyfin scheduled task checks once a minute. Only titles hidden for that group are revealed; administrator-only restrictions stay in place.',
        scheduled: 'Reveal on: {date}', completed: 'Last revealed: {date}', noSchedule: 'No reveal scheduled', invalidDate: 'Choose a valid future date and time.',
        audienceTitle: 'Hide this title from', allUsers: 'All non-administrator accounts', selectedGroups: 'Selected groups', chooseGroups: 'Select at least one group.',
        save: 'Save', cancel: 'Cancel', changeAudience: 'Change hiding audience', hiddenGroups: 'Hidden from: {groups}'
    });
    Object.assign(dictionaries.pl, {
        filterWarnings: 'Ostrzegaj o aktywnych filtrach', filterAnimation: 'Animuj ostrzeżenia o aktywnych filtrach', filtersScope: 'Ustawienia dotyczą wszystkich kont w interfejsie WWW serwera. Pozostałe otwarte przeglądarki zaktualizują się w ciągu 30 sekund.', qolSaved: 'Zapisano ustawienia QoL.', filtersHelp: 'Ostrzeżenia o aktywnych filtrach aktualizują się automatycznie w interfejsie WWW Jellyfin 12.1, na wszystkich kontach.', visibilityHeading: 'Widoczność materiałów', groups: 'Opcjonalne grupy użytkowników', groupsHelp: 'Bez grup ukryte tytuły widzą tylko administratorzy. Po utworzeniu grup przy ukrywaniu możesz wybrać wszystkich użytkowników lub wybrane grupy.',
        groupName: 'Nazwa grupy', groupMembers: 'Członkowie grupy', saveGroup: 'Zapisz grupę', cancelEdit: 'Anuluj edycję', edit: 'Edytuj', deleteGroup: 'Usuń', noGroups: 'Nie utworzono grup. Ukryte tytuły pozostają dostępne tylko administratorom.',
        noUsers: 'Brak kont bez uprawnień administratora.', members: 'Członkowie: {count}', groupSaved: 'Zapisano grupę.', groupDeleted: 'Usunięto grupę.',
        deleteConfirm: 'Usunąć grupę? Tytuły ukryte wyłącznie dla tej grupy staną się dostępne tylko administratorom.',
        groupError: 'Sprawdź unikalną nazwę grupy, wybrane konta i opcjonalny przyszły termin odkrycia.',
        revealAt: 'Odkryj materiały grupie (opcjonalnie)', scheduleHelp: 'Każda grupa ma własną jednorazową datę i godzinę w strefie czasowej tej przeglądarki. Zadanie Jellyfin sprawdza terminy co minutę. Odkrywane są tylko tytuły ukryte dla danej grupy; blokady wyłącznie dla administratorów pozostają.',
        scheduled: 'Odkrycie: {date}', completed: 'Ostatnie odkrycie: {date}', noSchedule: 'Bez zaplanowanego odkrycia', invalidDate: 'Wybierz prawidłową przyszłą datę i godzinę.',
        audienceTitle: 'Ukryj ten tytuł przed', allUsers: 'Wszystkimi kontami bez administratora', selectedGroups: 'Wybranymi grupami', chooseGroups: 'Wybierz co najmniej jedną grupę.',
        save: 'Zapisz', cancel: 'Anuluj', changeAudience: 'Zmień odbiorców blokady', hiddenGroups: 'Ukryty przed: {groups}'
    });
    function language() {
        const culture = document.documentElement.lang || document.documentElement.getAttribute('data-culture') || navigator.language || 'en';
        return /^pl(?:[-_]|$)/i.test(culture) ? 'pl' : 'en';
    }
    function t(key) { return dictionaries[language()][key] || dictionaries.en[key] || key; }
    function apiClient() { return window.ApiClient; }
    function request(method, route, data) {
        const api = apiClient();
        if (!api) return Promise.reject(new Error('Jellyfin client unavailable'));
        const options = { type: method, url: api.getUrl('MediaHider/' + route), dataType: method === 'GET' ? 'json' : undefined };
        if (data !== undefined) { options.data = JSON.stringify(data); options.contentType = 'application/json'; }
        return api.ajax(options);
    }
    function icon(name, extra) {
        const node = document.createElement('span');
        node.className = 'material-icons ' + name + (extra ? ' ' + extra : '');
        node.setAttribute('aria-hidden', 'true');
        return node;
    }
    let toastTimer;
    function toast(text, error) {
        let node = document.getElementById('mediaHiderToast');
        if (!node) {
            node = document.createElement('div'); node.id = 'mediaHiderToast'; node.setAttribute('role', 'status');
            node.style.cssText = 'position:fixed;bottom:2em;left:50%;transform:translateX(-50%);z-index:100000;background:#202020;color:#fff;padding:1em 1.4em;border-radius:.5em;box-shadow:0 3px 20px #0008;max-width:min(34em,80vw);text-align:center';
            document.body.appendChild(node);
        }
        node.textContent = text; node.style.border = error ? '1px solid #ff8080' : '';
        clearTimeout(toastTimer); toastTimer = setTimeout(() => node.remove(), 6000);
    }
    function errorText(error) {
        const code = error.status || (error.response && error.response.status);
        return t(code === 401 || code === 403 ? 'adminOnly' : 'failure');
    }
    function changed() {
        cached = null; pendingMenu = null;
        try { localStorage.setItem('mediahider:lastChange', String(Date.now())); } catch (_) { /* storage may be disabled */ }
        document.dispatchEvent(new CustomEvent('mediahider:changed'));
        schedule();
    }
    function currentItemId() {
        const route = location.hash ? location.hash.slice(1) : location.pathname + location.search;
        if (!/(?:^|\/)details(?:\?|$)/i.test(route)) return null;
        const id = new URLSearchParams(route.split('?')[1] || '').get('id');
        return id && /^[a-f\d]{32}$|^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id) ? id : null;
    }
    function detailPage() {
        return Array.from(document.querySelectorAll('.itemDetailPage')).find(p => !p.classList.contains('hide') && p.getAttribute('aria-hidden') !== 'true');
    }
    function sessionKey() {
        const api = apiClient();
        const id = api && api.getCurrentUserId();
        return id ? (typeof api.serverAddress === 'function' ? api.serverAddress() : '') + ':' + id : null;
    }
    let cached = null;
    let inFlight = null;
    let pendingMenu = null;
    let scheduleTimer;
    let lastContext = null;
    function context() {
        const id = currentItemId(); const session = sessionKey(); const page = detailPage();
        return id && session && page ? { id, session, page, key: session + ':' + id } : null;
    }
    function clearDetails() {
        document.querySelectorAll('[data-mediahider-status], [data-mediahider-menu]').forEach(n => n.remove());
        cached = null; pendingMenu = null; lastContext = null;
    }
    async function stateFor(ctx, force) {
        if (!force && cached && cached.key === ctx.key && Date.now() - cached.at < 15000) return cached.state;
        if (inFlight && inFlight.key === ctx.key) return inFlight.promise;
        const promise = (async () => {
            const user = await apiClient().getCurrentUser();
            if (!user.Policy || !user.Policy.IsAdministrator) return null;
            const state = await request('GET', 'Items/' + encodeURIComponent(ctx.id) + '/Visibility');
            if (context()?.key !== ctx.key) return null;
            cached = { key: ctx.key, at: Date.now(), state };
            return state;
        })();
        inFlight = { key: ctx.key, promise };
        try { return await promise; }
        finally { if (inFlight && inFlight.promise === promise) inFlight = null; }
    }
    function renderBadge(ctx, state) {
        ctx.page.querySelectorAll('.itemMiscInfo-primary').forEach(container => {
            let badge = container.querySelector('[data-mediahider-status]');
            const signature = String(state.Hidden) + ':' + language() + ':' + String(state.Inherited) + ':' + state.TargetName + ':' + (state.GroupNames || []).join('|');
            if (badge && badge.dataset.signature === signature) return;
            if (!badge) {
                badge = document.createElement('div'); badge.className = 'mediaInfoItem mediaInfoItem-mediaHider';
                badge.setAttribute('data-mediahider-status', ''); container.appendChild(badge);
            }
            badge.dataset.signature = signature;
            badge.style.cssText = 'display:inline-flex;align-items:center;gap:.4em;vertical-align:middle';
            const glyph = icon(state.Hidden ? 'visibility_off' : 'visibility'); glyph.style.fontSize = '1.15em';
            const text = document.createElement('span'); text.textContent = state.Hidden && (state.GroupNames || []).length ? t('hiddenGroups').replace('{groups}', state.GroupNames.join(', ')) : t(state.Hidden ? 'hidden' : 'visible');
            badge.replaceChildren(glyph, text);
            badge.title = state.Inherited ? t('inherited').replace('{name}', state.TargetName) : 'Jelly QoL';
        });
    }
    async function chooseAudience(state) {
        const settings = await request('GET', 'Groups');
        if (!settings.Groups.length) return [];
        return new Promise(resolve => {
            const dialog = document.createElement('dialog'); dialog.id = 'mhAudienceDialog';
            dialog.style.cssText = 'background:#202020;color:#eee;border:1px solid #8886;border-radius:.6em;padding:1.5em;width:30em;max-width:85vw;max-height:85vh;overflow:auto';
            const title = document.createElement('h2'); title.textContent = t('audienceTitle'); title.id = 'mhAudienceTitle'; dialog.setAttribute('aria-labelledby', title.id);
            const form = document.createElement('form'); const options = document.createElement('div');
            const selected = new Set(state.GroupIds || []);
            function radio(value, text, checked) {
                const label = document.createElement('label'); label.style.cssText = 'display:block;padding:.6em 0';
                const input = document.createElement('input'); input.type = 'radio'; input.name = 'mhAudience'; input.value = value; input.checked = checked;
                label.append(input, document.createTextNode(' ' + text)); options.appendChild(label); return input;
            }
            const all = radio('all', t('allUsers'), selected.size === 0); const groupsOnly = radio('groups', t('selectedGroups'), selected.size > 0);
            const checks = document.createElement('div'); checks.style.marginLeft = '1.5em';
            settings.Groups.forEach(group => {
                const label = document.createElement('label'); label.style.cssText = 'display:block;padding:.5em 0';
                const input = document.createElement('input'); input.type = 'checkbox'; input.value = group.Id; input.checked = selected.has(group.Id); input.disabled = all.checked;
                label.append(input, document.createTextNode(' ' + group.Name)); checks.appendChild(label);
            });
            options.addEventListener('change', () => checks.querySelectorAll('input').forEach(input => { input.disabled = !groupsOnly.checked; }));
            const error = document.createElement('p'); error.setAttribute('role', 'status'); error.style.color = '#ff8080';
            const buttons = document.createElement('div'); buttons.style.cssText = 'display:flex;gap:1em;margin-top:1em';
            const save = document.createElement('button'); save.type = 'submit'; save.className = 'raised button-submit emby-button'; save.textContent = t('save');
            const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'raised emby-button'; cancel.textContent = t('cancel');
            let finished = false;
            function finish(value) { if (finished) return; finished = true; dialog.remove(); resolve(value); }
            cancel.addEventListener('click', () => finish(null)); dialog.addEventListener('cancel', () => finish(null)); dialog.addEventListener('close', () => finish(null));
            form.addEventListener('submit', event => {
                event.preventDefault(); const ids = Array.from(checks.querySelectorAll('input:checked')).map(input => input.value);
                if (groupsOnly.checked && !ids.length) { error.textContent = t('chooseGroups'); return; }
                finish(all.checked ? [] : ids);
            });
            buttons.append(save, cancel); form.append(options, checks, error, buttons); dialog.append(title, form); document.body.appendChild(dialog);
            if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
        });
    }
    function saveAudience(id, groupIds) {
        return groupIds.length ? request('POST', 'Hidden/' + encodeURIComponent(id) + '/Groups', { GroupIds: groupIds })
            : request('POST', 'Hidden/' + encodeURIComponent(id));
    }
    async function changeAudience(ctx) {
        try {
            const state = await stateFor(ctx, true); if (!state || context()?.key !== ctx.key) return;
            const ids = await chooseAudience(state); if (ids === null || context()?.key !== ctx.key) return;
            await saveAudience(state.TargetId, ids); changed(); toast(t('savedHidden'));
        } catch (error) { toast(errorText(error), true); }
    }
    async function toggle(ctx, menu, button) {
        if (button.dataset.busy) return;
        button.dataset.busy = 'true'; button.disabled = true;
        try {
            // Refresh before choosing the operation to avoid toggling a stale cached state.
            const state = await stateFor(ctx, true);
            if (!state || context()?.key !== ctx.key) return;
            if (state.Hidden) await request('DELETE', 'Hidden/' + encodeURIComponent(state.TargetId));
            else { const ids = await chooseAudience(state); if (ids === null || context()?.key !== ctx.key) return; await saveAudience(state.TargetId, ids); }
            changed(); toast(t(state.Hidden ? 'savedVisible' : 'savedHidden'));
        } catch (error) { cached = null; toast(errorText(error), true); schedule(); }
        finally { button.disabled = false; delete button.dataset.busy; }
    }
    async function extendMenu() {
        const pending = pendingMenu;
        if (!pending || Date.now() > pending.deadline || context()?.key !== pending.ctx.key) return;
        const menu = Array.from(document.querySelectorAll('.actionSheet')).find(n => !pending.existing.has(n));
        if (!menu || menu.querySelector('[data-mediahider-menu]')) return;
        const state = await stateFor(pending.ctx, false);
        if (!state || pendingMenu !== pending || !menu.isConnected || context()?.key !== pending.ctx.key) return;
        if (menu.querySelector('[data-mediahider-menu]')) return;
        const container = menu.querySelector('.actionSheetScroller');
        if (!container) return;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'listItem listItem-button actionSheetMenuItem';
        button.setAttribute('is', 'emby-button'); button.setAttribute('data-id', 'mediahider-toggle');
        button.setAttribute('data-mediahider-menu', '');
        const glyph = icon(state.Hidden ? 'visibility' : 'visibility_off', 'actionsheetMenuItemIcon listItemIcon listItemIcon-transparent');
        const body = document.createElement('div'); body.className = 'listItemBody actionsheetListItemBody';
        const label = document.createElement('div'); label.className = 'listItemBodyText actionSheetItemText';
        label.textContent = t(state.Inherited ? (state.Hidden ? 'restoreSeries' : 'hideSeries') : (state.Hidden ? 'restore' : 'hide'));
        body.appendChild(label); button.append(glyph, body);
        // Let Jellyfin's own menu handler close the sheet and restore focus normally.
        button.addEventListener('click', () => toggle(pending.ctx, menu, button));
        container.insertBefore(button, container.firstChild);
        if (state.Hidden) {
            const settings = await request('GET', 'Groups');
            if (settings.Groups.length && menu.isConnected && context()?.key === pending.ctx.key) {
                const edit = button.cloneNode(true); edit.setAttribute('data-id', 'mediahider-audience'); edit.setAttribute('data-mediahider-menu', 'audience');
                edit.querySelector('.actionSheetItemText').textContent = t('changeAudience');
                edit.addEventListener('click', () => changeAudience(pending.ctx)); container.insertBefore(edit, button.nextSibling);
            }
        }
    }
    async function refresh() {
        const ctx = context();
        if (!ctx) { clearDetails(); return; }
        if (lastContext !== ctx.key) {
            const pending = pendingMenu;
            clearDetails(); lastContext = ctx.key;
            if (pending && pending.ctx.key === ctx.key) pendingMenu = pending;
        }
        try {
            const state = await stateFor(ctx, false);
            if (!state || context()?.key !== ctx.key) { if (context()?.key === ctx.key) clearDetails(); return; }
            renderBadge(ctx, state); await extendMenu();
        } catch (_) {
            if (context()?.key === ctx.key) ctx.page.querySelectorAll('[data-mediahider-status]').forEach(n => n.remove());
        }
    }
    function schedule() { if (!scheduleTimer) scheduleTimer = setTimeout(() => { scheduleTimer = null; refresh(); }, 80); }
    document.addEventListener('click', event => {
        const button = event.target.closest && event.target.closest('.btnMoreCommands');
        const ctx = context();
        if (!button || !ctx || !ctx.page.contains(button)) return;
        pendingMenu = { ctx, existing: new Set(document.querySelectorAll('.actionSheet')), deadline: Date.now() + 5000 };
        schedule();
    }, true);
    ['pageshow', 'viewshow', 'mediahider:changed'].forEach(name => document.addEventListener(name, () => { cached = null; schedule(); }));
    window.addEventListener('hashchange', () => { clearDetails(); schedule(); });
    window.addEventListener('popstate', () => { clearDetails(); schedule(); });
    window.addEventListener('storage', event => { if (event.key === 'mediahider:lastChange') { cached = null; schedule(); } });
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'lang', 'aria-hidden'] });
    setInterval(schedule, 2000);

    Object.assign(dictionaries.en, {
        testAnnouncement:'Test',testHelp:'Preview the current fields without saving, date restrictions or appearance limits.',testEmpty:'Enter a message to preview.',testFailed:'Could not load the preview. Reload the web client and try again.',announcements:'Announcements',servicesHelp:'Configure header shortcuts. Leave a URL empty to hide that shortcut.',
        importHelp:'Import supported settings from a JS Injector JSON export. Scripts are read as text and never executed.',importScripts:'Import JS Injector settings',importDone:'Settings imported and saved. Disable the corresponding scripts in JS Injector.',importError:'Could not import settings. Use a valid JS Injector JSON export and check its supported fields.',
        announcementHelp:'Optional home-page message. Display limits and dismissal are stored separately for each account in this browser. Changing the message starts a new announcement.',
        sectionFilters:'Active filters',sectionInterface:'Interface',sectionLinks:'Header shortcuts',sectionAnnouncement:'Announcement content',sectionSchedule:'Dates and display limits',
        EnableFilterWarnings:'Warn about active filters',AnimateFilterWarnings:'Blink the active-filter icon',EnableContextMenu:'Right-click a title to open its native menu',
        EnableSearchOrder:'Search order: Movies → Series → Discover on Seerr; hide empty sections',EnableToastIcons:'Fix missing icons in Jellyfin Enhanced notifications',EnablePagination:'Pagination at the top and bottom',
        EnableHeaderLinks:'Show configured header shortcuts',HeaderLink1Name:'First shortcut — name',HeaderLink1Url:'First shortcut — URL',HeaderLink2Name:'Second shortcut — name',HeaderLink2Url:'Second shortcut — URL',
        EnableAnnouncement:'Enable the announcement',AnnouncementTitle:'Title',AnnouncementMessage:'Message',AnnouncementDetails:'Bullet points (one per line)',AnnouncementUrl:'Button URL (optional)',AnnouncementLinkText:'Button text',AnnouncementPosition:'Position',top:'Below the header',bottom:'Bottom of the screen',
        AnnouncementShowAfter:'Show from (optional)',AnnouncementExpiresAt:'Show until (optional)',AnnouncementDurationSeconds:'Auto-hide after seconds (0 = manual)',AnnouncementMaxAppearances:'Maximum appearances (0 = unlimited)',AnnouncementCooldownSeconds:'Minimum interval in seconds (0 = none)',AnnouncementResetHours:'Reset the appearance counter after hours (0 = never)',AnnouncementRepeatInSession:'Allow multiple appearances in one browser session',AnnouncementRememberDismiss:'Remember manual dismissal until the message changes',
        limitsHelp:'Dates use this browser’s time zone. Counters are local to each account and browser. Keep the announcement disabled while preparing its contents.',qolValidation:'Check addresses, dates and display limits. URLs must start with http:// or https://.'
    });
    Object.assign(dictionaries.pl, {
        testAnnouncement:'Test',testHelp:'Podgląd bieżących pól bez zapisywania, ograniczeń daty i limitu wyświetleń.',testEmpty:'Wpisz treść komunikatu, aby go przetestować.',testFailed:'Nie udało się załadować podglądu. Odśwież interfejs i spróbuj ponownie.',announcements:'Komunikaty',servicesHelp:'Skonfiguruj skróty w nagłówku. Puste pole adresu ukrywa dany skrót.',
        importHelp:'Wczytaj obsługiwane ustawienia z eksportu JSON wtyczki JS Injector. Skrypty są odczytywane jako tekst i nie są wykonywane.',importScripts:'Importuj ustawienia JS Injector',importDone:'Zaimportowano i zapisano ustawienia. Wyłącz odpowiadające im skrypty w JS Injector.',importError:'Nie udało się wczytać ustawień. Wybierz prawidłowy eksport JSON z JS Injector i sprawdź obsługiwane pola.',
        announcementHelp:'Opcjonalny komunikat na stronie głównej. Limity i zamknięcie są zapamiętywane oddzielnie dla każdego konta w tej przeglądarce. Zmiana treści rozpoczyna nowy komunikat.',
        sectionFilters:'Aktywne filtry',sectionInterface:'Interfejs',sectionLinks:'Skróty w nagłówku',sectionAnnouncement:'Treść komunikatu',sectionSchedule:'Terminy i limity wyświetlania',
        EnableFilterWarnings:'Ostrzegaj o aktywnych filtrach',AnimateFilterWarnings:'Migająca ikona aktywnych filtrów',EnableContextMenu:'Prawy przycisk myszy otwiera menu tytułu',
        EnableSearchOrder:'Wyszukiwanie: Filmy → Seriale → Odkryj na Seerr; pomijaj puste sekcje',EnableToastIcons:'Naprawiaj brakujące ikony powiadomień Jellyfin Enhanced',EnablePagination:'Paginacja u góry i na dole strony',
        EnableHeaderLinks:'Pokazuj skonfigurowane skróty w nagłówku',HeaderLink1Name:'Pierwszy skrót — nazwa',HeaderLink1Url:'Pierwszy skrót — adres URL',HeaderLink2Name:'Drugi skrót — nazwa',HeaderLink2Url:'Drugi skrót — adres URL',
        EnableAnnouncement:'Włącz komunikat',AnnouncementTitle:'Tytuł',AnnouncementMessage:'Treść',AnnouncementDetails:'Lista punktów (jeden w wierszu)',AnnouncementUrl:'Adres przycisku (opcjonalnie)',AnnouncementLinkText:'Tekst przycisku',AnnouncementPosition:'Położenie',top:'Pod nagłówkiem',bottom:'Na dole ekranu',
        AnnouncementShowAfter:'Pokazuj od (opcjonalnie)',AnnouncementExpiresAt:'Pokazuj do (opcjonalnie)',AnnouncementDurationSeconds:'Ukryj po tylu sekundach (0 = ręcznie)',AnnouncementMaxAppearances:'Maksymalna liczba wyświetleń (0 = bez limitu)',AnnouncementCooldownSeconds:'Minimalny odstęp w sekundach (0 = brak)',AnnouncementResetHours:'Wyzeruj licznik wyświetleń po godzinach (0 = nigdy)',AnnouncementRepeatInSession:'Zezwalaj na kilka wyświetleń w jednej sesji przeglądarki',AnnouncementRememberDismiss:'Zapamiętaj ręczne zamknięcie do zmiany treści',
        limitsHelp:'Daty używają strefy czasowej tej przeglądarki. Liczniki są oddzielne dla każdego konta i przeglądarki. Na czas przygotowania treści pozostaw komunikat wyłączony.',qolValidation:'Sprawdź adresy, daty i limity. Adresy muszą zaczynać się od http:// lub https://.'
    });
    function importSupportedScripts(input, current) {
        if (!input || !Array.isArray(input.CustomJavaScripts) || input.CustomJavaScripts.length > 1000) throw new Error('Invalid script export');
        const settings = { ...current }; let supported = 0;
        // Parse only literal strings/numbers/booleans. Never evaluate JavaScript from the export.
        function literal(value) {
            if (value === 'null') return null; if (value === 'true' || value === 'false') return value === 'true';
            if (/^\d+$/.test(value)) return Number(value);
            if (value.startsWith('"')) return JSON.parse(value);
            return value.slice(1,-1).replace(/\\(u[\da-fA-F]{4}|x[\da-fA-F]{2}|[\s\S])/g,(_,c)=>c[0]==='u'||c[0]==='x'?String.fromCharCode(parseInt(c.slice(1),16)):({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'}[c]??c));
        }
        const stringPattern = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g;
        for (const entry of input.CustomJavaScripts) {
            if (typeof entry.Script !== 'string' || entry.Script.length > 1000000) continue;
            const source = entry.Script, name = String(entry.Name || '').toLowerCase();
            if (name === 'reports2') {
                const block = source.match(/const\s+links\s*=\s*\[([\s\S]*?)\];/)?.[1];
                const strings = block?.match(stringPattern)?.map(literal);
                if (strings?.length >= 8) { supported++;settings.EnableHeaderLinks = entry.Enabled === true;settings.HeaderLink1Name=strings[1];settings.HeaderLink1Url=strings[3];settings.HeaderLink2Name=strings[5];settings.HeaderLink2Url=strings[7]; }
            }
            const toggles = {'ppm fix':'EnableContextMenu','seerr search fix':'EnableSearchOrder','icon fix':'EnableToastIcons','sitepagination':'EnablePagination'};
            if (toggles[name]) { supported++;settings[toggles[name]]=entry.Enabled===true; }
            if (name === 'warning pop-up') {
                supported++;settings.EnableAnnouncement=entry.Enabled===true;
                const block=source.match(/const\s+CONFIG\s*=\s*\{([\s\S]*?)\};/)?.[1]||'';
                const mapping={message:'AnnouncementMessage',showAfter:'AnnouncementShowAfter',expiresAt:'AnnouncementExpiresAt',visibleDurationSeconds:'AnnouncementDurationSeconds',maxAppearances:'AnnouncementMaxAppearances',cooldownSeconds:'AnnouncementCooldownSeconds',resetCounterAfterHours:'AnnouncementResetHours',allowMultipleAppearancesPerSession:'AnnouncementRepeatInSession',rememberManualDismiss:'AnnouncementRememberDismiss',openUrl:'AnnouncementUrl',position:'AnnouncementPosition'};
                const pattern=/\b(\w+)\s*:\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|true|false|null|\d+)\s*[,\n]/g;let match;
                while ((match=pattern.exec(block))) if(mapping[match[1]])settings[mapping[match[1]]]=literal(match[2]);
                const strip=value=>value.replace(/<[^>]+>/g,'').trim();
                settings.AnnouncementTitle=strip(source.match(/<h2>([\s\S]*?)<\/h2>/)?.[1]||'');
                settings.AnnouncementDetails=Array.from(source.matchAll(/<li>([\s\S]*?)<\/li>/g),m=>strip(m[1])).join('\n');
                const link=source.match(/link\.textContent\s*=\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/);if(link)settings.AnnouncementLinkText=literal(link[1]);
            }
        }
        if(!supported)throw new Error('No supported scripts'); return settings;
    }
    function setupQoL(page, message, isBusy, setBusy) {
        const schema = [
            ['jqQoLForm','sectionFilters',[['EnableFilterWarnings','checkbox'],['AnimateFilterWarnings','checkbox']]],
            ['jqQoLForm','sectionInterface',[['EnableContextMenu','checkbox'],['EnableSearchOrder','checkbox'],['EnableToastIcons','checkbox'],['EnablePagination','checkbox']]],
            ['jqServicesForm','sectionLinks',[['EnableHeaderLinks','checkbox'],['HeaderLink1Name','text',80],['HeaderLink1Url','url',2048],['HeaderLink2Name','text',80],['HeaderLink2Url','url',2048]]],
            ['jqAnnouncementForm','sectionAnnouncement',[['EnableAnnouncement','checkbox'],['AnnouncementTitle','text',160],['AnnouncementMessage','textarea',4000],['AnnouncementDetails','textarea',4000],['AnnouncementUrl','url',2048],['AnnouncementLinkText','text',120],['AnnouncementPosition','select']]],
            ['jqAnnouncementForm','sectionSchedule',[['AnnouncementShowAfter','datetime-local'],['AnnouncementExpiresAt','datetime-local'],['AnnouncementDurationSeconds','number',86400],['AnnouncementMaxAppearances','number',100000],['AnnouncementCooldownSeconds','number',31536000],['AnnouncementResetHours','number',87600],['AnnouncementRepeatInSession','checkbox'],['AnnouncementRememberDismiss','checkbox']]]
        ];
        let model = {}, loaded = false;
        const controls = new Map();
        for (const [formId, title, fields] of schema) {
            const form=page.querySelector('#'+formId); if(!form)continue;
            const group=document.createElement('fieldset');group.style.cssText='border:1px solid #8885;border-radius:8px;padding:1.2em;margin:1.5em 0';
            const legend=document.createElement('legend');legend.dataset.mhText=title;legend.textContent=t(title);group.appendChild(legend);
            for(const [key,type,max] of fields){
                const id=key==='EnableFilterWarnings'?'jqFilterWarnings':key==='AnimateFilterWarnings'?'jqFilterAnimation':'jq'+key;
                const label=document.createElement('label');label.htmlFor=id;label.style.cssText=type==='checkbox'?'display:flex;align-items:center;gap:.75em;margin:1.1em 0':'display:block;margin:1.25em 0';
                const caption=document.createElement('span');caption.dataset.mhText=key;caption.textContent=t(key);
                let input;
                if(type==='textarea') {input=document.createElement('textarea');input.rows=key==='AnnouncementMessage'?4:3;}
                else if(type==='select'){input=document.createElement('select');for(const value of ['top','bottom']){const option=document.createElement('option');option.value=value;option.dataset.mhText=value;option.textContent=t(value);input.appendChild(option);}}
                else {input=document.createElement('input');input.type=type;}
                input.id=id;input.dataset.jqolSetting=key;input.dataset.jqolType=type;
                if(type!=='checkbox')input.style.cssText='display:block;width:100%;box-sizing:border-box;margin-top:.45em;padding:.7em;background:#8881;border:1px solid #8887;border-radius:4px;color:inherit;font:inherit';
                if(type==='number'){input.min='0';input.max=String(max);input.step='1';}else if(max)input.maxLength=max;
                if(type==='url')input.placeholder='https://example.org/';
                if(type==='checkbox')label.append(input,caption);else label.append(caption,input);
                group.appendChild(label);controls.set(key,input);
            }
            form.appendChild(group);
        }
        function fill(settings){
            model={...settings};
            for(const [key,input] of controls){let value=settings[key];const type=input.dataset.jqolType;
                if(type==='checkbox')input.checked=value===true;
                else if(type==='datetime-local'){const date=value?new Date(value):null;input.value=date&&Number.isFinite(date.getTime())?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16):'';}
                else input.value=value==null?(type==='number'?'0':type==='select'?'top':''):String(value);
            }
            loaded=true;
        }
        function collect(form){
            const result={...model};
            for(const input of form.querySelectorAll('[data-jqol-setting]')){
                const key=input.dataset.jqolSetting,type=input.dataset.jqolType;
                if(type==='checkbox')result[key]=input.checked;
                else if(type==='number'){const value=Number(input.value);if(!Number.isInteger(value)||value<0||value>Number(input.max))throw new Error('Invalid limit');result[key]=value;}
                else if(type==='datetime-local'){const date=input.value?new Date(input.value):null;if(date&&!Number.isFinite(date.getTime()))throw new Error('Invalid date');result[key]=date?date.toISOString():null;}
                else result[key]=input.value.trim();
            }
            return result;
        }
        async function save(settings){
            await request('POST','QoL',settings); model=settings;
            window.dispatchEvent(new CustomEvent('jellyqol:features',{detail:settings})); message(t('qolSaved'));
        }
        let previewLoader;
        async function previewModule() {
            if (window.JellyQoLExtras?.previewAnnouncement) return window.JellyQoLExtras;
            if (!previewLoader) previewLoader = new Promise((resolve, reject) => {
                const script = document.createElement('script'); script.src = apiClient().getUrl('MediaHider/WebExtras.js') + '?v=1.5.1.0';
                script.onload = () => window.JellyQoLExtras?.previewAnnouncement ? resolve(window.JellyQoLExtras) : reject(new Error('Preview unavailable'));
                script.onerror = () => { script.remove(); previewLoader = null; reject(new Error('Preview unavailable')); };
                document.head.appendChild(script);
            });
            return previewLoader;
        }
        for(const id of ['jqQoLForm','jqServicesForm','jqAnnouncementForm']){
            const form=page.querySelector('#'+id);if(!form)continue;
            if(id==='jqAnnouncementForm'){const hint=document.createElement('p');hint.dataset.mhText='limitsHelp';hint.textContent=t('limitsHelp');form.appendChild(hint);}
            const button=document.createElement('button');button.type='submit';button.className='raised button-submit emby-button';button.dataset.mhText='save';button.textContent=t('save');form.appendChild(button);
            if (id === 'jqAnnouncementForm') {
                const test = document.createElement('button'); test.id = 'jqTestAnnouncement'; test.type = 'button'; test.className = 'raised emby-button'; test.style.cssText = 'margin-inline-start:12px;display:inline-flex;align-items:center;gap:.5em';
                const label = document.createElement('span'); label.dataset.mhText = 'testAnnouncement'; label.textContent = t('testAnnouncement'); test.append(icon('visibility'), label); form.appendChild(test);
                const help = document.createElement('p'); help.dataset.mhText = 'testHelp'; help.textContent = t('testHelp'); help.style.cssText = 'font-size:.9em;opacity:.7;margin-top:1em'; form.appendChild(help);
                test.addEventListener('click', async () => {
                    if (isBusy() || !loaded) return;
                    let current;
                    try { current = collect(form); } catch (_) { message(t('qolValidation'), true); return; }
                    if (!current.AnnouncementMessage?.trim()) { message(t('testEmpty'), true); return; }
                    test.disabled = true;
                    try { const module = await previewModule(); if (!module.previewAnnouncement(current)) message(t('testEmpty'), true); }
                    catch (_) { message(t('testFailed'), true); }
                    finally { test.disabled = false; }
                });
            }
            form.addEventListener('submit',async event=>{event.preventDefault();if(isBusy()||!loaded)return;setBusy(true);button.disabled=true;try{await save(collect(form));}catch(error){message(error.status===400||!error.status?t('qolValidation'):errorText(error),true);}finally{setBusy(false);button.disabled=false;}});
        }
        page.querySelector('#jqImportButton')?.addEventListener('click',()=>page.querySelector('#jqImportScripts').click());
        page.querySelector('#jqImportScripts')?.addEventListener('change',async event=>{
            const file=event.target.files?.[0];if(!file||isBusy())return;
            if(file.size>5*1024*1024){message(t('importError'),true);return;}
            setBusy(true);
            try{const imported=importSupportedScripts(JSON.parse(await file.text()),model);await save(imported);fill(imported);message(t('importDone'));}
            catch(_){message(t('importError'),true);}finally{setBusy(false);event.target.value='';}
        });
        return {load:async()=>{if(!controls.size)return;fill(await request('GET','QoL'));}};
    }
    function initializePanel(page) {
        if (page.dataset.mediahiderReady) return;
        page.dataset.mediahiderReady = 'true';
        const results = page.querySelector('#mhResults'); const hidden = page.querySelector('#mhHidden');
        const status = page.querySelector('#mhStatus'); const query = page.querySelector('#mhQuery');
        let busy = false; let generation = 0; let currentResults = []; let currentHidden = []; let groupSettings = { Groups: [], Users: [] };
        function message(text, error) { status.textContent = text; status.style.color = error ? '#ff8080' : ''; }
        function rows(container, items) {
            container.replaceChildren();
            if (!items.length) { container.textContent = t('empty'); return; }
            items.forEach(item => {
                const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid #8884';
                const label = document.createElement('div'); label.style.cssText = 'flex:1;min-width:0;overflow-wrap:anywhere';
                label.textContent = (item.Missing ? t('removed') : item.Name) + (item.Year ? ' (' + item.Year + ')' : '') + ' · ' + t(item.Type === 'Series' ? 'series' : 'movie');
                const button = document.createElement('button'); button.type = 'button'; button.className = 'raised emby-button';
                button.textContent = t(item.Hidden ? 'restore' : 'hide'); button.disabled = busy;
                button.addEventListener('click', () => mutate(() => request(item.Hidden ? 'DELETE' : 'POST', 'Hidden/' + encodeURIComponent(item.Id)), item.Hidden ? 'savedVisible' : 'savedHidden'));
                if (item.Hidden && (item.GroupNames || []).length) label.textContent += ' · ' + t('hiddenGroups').replace('{groups}', item.GroupNames.join(', '));
                row.append(label, button);
                if (item.Hidden && groupSettings.Groups.length) {
                    const audience = document.createElement('button'); audience.type = 'button'; audience.className = 'raised emby-button'; audience.textContent = t('changeAudience');
                    audience.addEventListener('click', async () => {
                        try { const ids = await chooseAudience(item); if (ids !== null) await mutate(() => saveAudience(item.Id, ids), 'savedHidden'); }
                        catch (error) { message(errorText(error), true); }
                    }); row.appendChild(audience);
                }
                container.appendChild(row);
            });
        }
        const groupList = page.querySelector('#mhGroupsList'); const groupForm = page.querySelector('#mhGroupForm');
        const groupId = page.querySelector('#mhGroupId'); const groupName = page.querySelector('#mhGroupName');
        const groupUsers = page.querySelector('#mhGroupUsers'); const groupDate = page.querySelector('#mhGroupRevealAt');
        function formatDate(value) { return new Date(value).toLocaleString(language(), { dateStyle: 'short', timeStyle: 'short' }); }
        function localDateValue(value) {
            if (!value) return '';
            const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }
        function renderUsers(ids) {
            groupUsers.replaceChildren();
            if (!groupSettings.Users.length) { groupUsers.textContent = t('noUsers'); return; }
            groupSettings.Users.forEach(user => {
                const label = document.createElement('label'); label.style.cssText = 'display:block;padding:.4em 0';
                const input = document.createElement('input'); input.type = 'checkbox'; input.value = user.Id; input.checked = ids.includes(user.Id);
                label.append(input, document.createTextNode(' ' + user.Name)); groupUsers.appendChild(label);
            });
        }
        function editGroup(group) {
            groupId.value = group ? group.Id : ''; groupName.value = group ? group.Name : ''; groupDate.value = localDateValue(group && group.RevealAtUtc);
            renderUsers(group ? group.UserIds : []);
            if (group) groupName.focus();
        }
        function renderGroups() {
            groupList.replaceChildren();
            if (!groupSettings.Groups.length) { groupList.textContent = t('noGroups'); return; }
            groupSettings.Groups.forEach(group => {
                const row = document.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:1em;align-items:center;padding:1em 0;border-bottom:1px solid #8884';
                const text = document.createElement('div'); text.style.flex = '1'; text.style.minWidth = '12em';
                const name = document.createElement('strong'); name.textContent = group.Name;
                const detail = document.createElement('div'); detail.textContent = t('members').replace('{count}', String(group.UserIds.length)) + ' · ' +
                    (group.RevealAtUtc ? t('scheduled').replace('{date}', formatDate(group.RevealAtUtc)) : group.LastRevealAtUtc ? t('completed').replace('{date}', formatDate(group.LastRevealAtUtc)) : t('noSchedule'));
                text.append(name, detail);
                const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'raised emby-button'; edit.textContent = t('edit'); edit.addEventListener('click', () => editGroup(group));
                const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'raised emby-button'; remove.textContent = t('deleteGroup');
                remove.addEventListener('click', () => { if (window.confirm(t('deleteConfirm'))) mutate(async () => { await request('DELETE', 'Groups/' + encodeURIComponent(group.Id)); if (groupId.value === group.Id) editGroup(null); }, 'groupDeleted'); });
                row.append(text, edit, remove); groupList.appendChild(row);
            });
        }
        async function loadGroups() {
            const selected = Array.from(groupUsers.querySelectorAll('input:checked')).map(input => input.value);
            groupSettings = await request('GET', 'Groups'); renderGroups(); renderUsers(selected);
        }
        groupForm.addEventListener('submit', async event => {
            event.preventDefault();
            let date = null;
            if (groupDate.value) { date = new Date(groupDate.value); if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) { message(t('invalidDate'), true); return; } }
            const data = { Id: groupId.value || null, Name: groupName.value.trim(), UserIds: Array.from(groupUsers.querySelectorAll('input:checked')).map(input => input.value), RevealAtUtc: date ? date.toISOString() : null };
            if (!data.Name) { message(t('groupError'), true); return; }
            await mutate(async () => { await request('POST', 'Groups', data); editGroup(null); }, 'groupSaved');
        });
        page.querySelector('#mhCancelGroup').addEventListener('click', () => editGroup(null));
        const tabs = Array.from(page.querySelectorAll('[role="tab"]'));
        function selectTab(tab) {
            tabs.forEach(node => {
                const selected = node === tab;
                node.setAttribute('aria-selected', String(selected)); node.tabIndex = selected ? 0 : -1;
                page.querySelector('#' + node.getAttribute('aria-controls')).hidden = !selected;
            });
        }
        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => selectTab(tab));
            tab.addEventListener('keydown', event => {
                let next;
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = tabs[(index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length];
                if (event.key === 'Home') next = tabs[0];
                if (event.key === 'End') next = tabs[tabs.length - 1];
                if (next) { event.preventDefault(); selectTab(next); next.focus(); }
            });
        });
        const qolPanel = setupQoL(page, message, () => busy, value => { busy = value; });
        function translate() {
            page.querySelectorAll('[data-mh-text]').forEach(n => { n.textContent = t(n.dataset.mhText); });
            query.placeholder = t('placeholder'); rows(results, currentResults); rows(hidden, currentHidden); renderGroups();
        }
        async function loadHidden() { currentHidden = await request('GET', 'Hidden'); rows(hidden, currentHidden); }
        async function search() {
            const id = ++generation; const value = query.value.trim();
            if (value.length < 2) { currentResults = []; results.replaceChildren(); return; }
            const items = await request('GET', 'Search?query=' + encodeURIComponent(value));
            if (id === generation) { currentResults = items; rows(results, items); }
        }
        async function mutate(action, success) {
            if (busy) return;
            busy = true; page.querySelectorAll('button').forEach(b => { b.disabled = true; }); message(t('saving'));
            try { await action(); changed(); busy = false; await Promise.all([loadHidden(), search(), loadGroups()]); rows(results, currentResults); rows(hidden, currentHidden); message(t(success)); }
            catch (error) { message(errorText(error), true); }
            finally { busy = false; page.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
        }
        page.querySelector('#mhSearchForm').addEventListener('submit', event => {
            event.preventDefault();
            if (query.value.trim().length < 2) { message(t('tooShort'), true); return; }
            search().catch(error => message(errorText(error), true));
        });
        page.querySelector('#mhSync').addEventListener('click', () => mutate(() => request('POST', 'Reconcile'), 'synced'));
        page.querySelector('#mhRestoreAll').addEventListener('click', () => {
            if (window.confirm(t('confirmRestore'))) mutate(() => request('POST', 'RestoreAll'), 'restoredAll');
        });
        async function shown() {
            translate(); message('');
            try {
                await qolPanel.load(); await loadGroups(); await loadHidden(); const state = await request('GET', 'Status');
                if (state.WebIntegrationError) message(t('webError'), true);
                else if (state.LastError) message(t('syncError'), true);
            } catch (error) { message(errorText(error), true); }
        }
        page.addEventListener('pageshow', shown);
        const languageObserver = new MutationObserver(() => { if (page.isConnected) translate(); else languageObserver.disconnect(); });
        languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
        shown();
    }
    window.MediaHiderUI = { initializePanel, t, importSupportedScripts };
    schedule();
})();
