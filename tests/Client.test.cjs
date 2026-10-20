const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const code = fs.readFileSync(path.join(__dirname, '../src/Client.js'), 'utf8');
const A = '11111111111111111111111111111111';
const B = '22222222222222222222222222222222';
const pause = (ms = 230) => new Promise(resolve => setTimeout(resolve, ms));
function fixture(options = {}) {
    const dom = new JSDOM('<!doctype html><html lang="' + (options.lang || 'en') + '"><body><div class="itemDetailPage"><div class="itemMiscInfo itemMiscInfo-primary"><div class="mediaInfoItem">2026</div></div><button class="btnMoreCommands"><div class="detailButton-content"><span class="material-icons detailButton-icon more_vert"></span></div></button></div></body></html>', { url: 'https://jellyfin.test/base/web/index.html#/details?id=' + A, runScripts: 'outside-only' });
    const { window } = dom;
    const calls = [];
    const states = { [A]: { ItemId: A, TargetId: A, TargetName: 'Test movie', Type: 'Movie', Hidden: false, Inherited: false }, [B]: { ItemId: B, TargetId: B, TargetName: 'Other movie', Type: 'Movie', Hidden: true, Inherited: false } };
    const identity = { id: 'admin', administrator: options.admin !== false };
    const api = {
        getCurrentUserId: () => identity.id,
        serverAddress: () => 'https://jellyfin.test/base',
        getCurrentUser: async () => ({ Policy: { IsAdministrator: identity.administrator } }),
        getUrl: route => '/base/' + route,
        ajax: async req => {
            calls.push({ ...req });
            if (options.ajax) { const result = await options.ajax(req, states); if (result !== undefined) return result; }
            const route = req.url.replace('/base/MediaHider/', '');
            if (route.startsWith('Items/')) return { ...states[route.split('/')[1]] };
            if (route === 'Hidden') return Object.values(states).filter(s => s.Hidden).map(s => ({ Id: s.TargetId, Name: s.TargetName, Type: s.Type, Hidden: true }));
            if (route === 'Status') return {};
            if (route === 'QoL') return { EnableFilterWarnings: true, AnimateFilterWarnings: true };
            if (route === 'Groups') return { Groups: options.groups || [], Users: options.users || [] };
            if (route.startsWith('Search?')) return Object.values(states).map(s => ({ Id: s.TargetId, Name: s.TargetName, Type: s.Type, Hidden: s.Hidden }));
            if (route.startsWith('Hidden/')) {
                const state = states[route.split('/')[1]]; state.Hidden = req.type === 'POST';
                state.GroupIds = route.endsWith('/Groups') ? JSON.parse(req.data).GroupIds : [];
                state.GroupNames = (options.groups || []).filter(g => state.GroupIds.includes(g.Id)).map(g => g.Name);
                return;
            }
            throw new Error('Unexpected route ' + route);
        }
    };
    window.ApiClient = api;
    window.document.querySelector('.btnMoreCommands').addEventListener('click', () => {
        const menu = window.document.createElement('div'); menu.className = 'actionSheet';
        menu.innerHTML = '<div class="actionSheetScroller"><button class="actionSheetMenuItem" data-id="edit">Edit metadata</button></div>';
        menu.addEventListener('click', e => { if (e.target.closest('.actionSheetMenuItem')) menu.remove(); });
        window.document.body.appendChild(menu);
    });
    window.eval(code);
    return { dom, window, calls, states, identity, close: () => window.close(), badge: () => window.document.querySelector('[data-mediahider-status]'), openMenu: async () => { window.document.querySelector('.detailButton-content').click(); await pause(); return Array.from(window.document.querySelectorAll('.actionSheet')).at(-1); } };
}
for (const lang of ['en', 'pl']) {
    test(lang + ': administrator sees icon and visibility description; menu hides and restores title', async t => {
        const f = fixture({ lang }); t.after(f.close); await pause();
        assert.ok(f.badge().querySelector('.material-icons.visibility'));
        assert.equal(f.badge().textContent, lang === 'pl' ? 'Widoczny dla użytkowników' : 'Visible to users');
        const menu = await f.openMenu();
        assert.equal(menu.querySelector('[data-id="edit"]').textContent, 'Edit metadata');
        const action = menu.querySelector('[data-mediahider-menu]');
        assert.equal(action.textContent, lang === 'pl' ? 'Ukryj przed użytkownikami' : 'Hide from users');
        action.click(); await pause(350);
        assert.ok(f.calls.some(c => c.type === 'POST' && c.url.endsWith('/Hidden/' + A)));
        assert.ok(f.badge().querySelector('.visibility_off'));
        assert.equal(f.badge().textContent, lang === 'pl' ? 'Ukryty przed użytkownikami' : 'Hidden from users');
        const next = await f.openMenu(); next.querySelector('[data-mediahider-menu]').click(); await pause(350);
        assert.ok(f.calls.some(c => c.type === 'DELETE' && c.url.endsWith('/Hidden/' + A)));
        assert.ok(f.badge().querySelector('.visibility'));
    });
}
test('non-administrators receive neither status nor menu controls', async t => {
    const f = fixture({ admin: false }); t.after(f.close); await pause();
    assert.equal(f.badge(), null);
    const menu = await f.openMenu(); assert.equal(menu.querySelector('[data-mediahider-menu]'), null);
    assert.ok(menu.querySelector('[data-id="edit"]'));
    assert.equal(f.calls.length, 0);
});
test('inherited episode status controls the parent series', async t => {
    const f = fixture(); t.after(f.close);
    f.states[A] = { ItemId: A, TargetId: B, TargetName: 'Series name', Type: 'Series', Hidden: true, Inherited: true };
    await pause(); assert.match(f.badge().title, /Series name/);
    const menu = await f.openMenu(); const button = menu.querySelector('[data-mediahider-menu]');
    assert.equal(button.textContent, 'Restore visibility of entire series'); button.click(); await pause(350);
    assert.ok(f.calls.some(c => c.type === 'DELETE' && c.url.endsWith('/Hidden/' + B)));
});
test('navigation cannot attach a delayed result to a different title', async t => {
    let resolveFirst;
    const f = fixture({ ajax: req => req.url.includes('Items/' + A) ? new Promise(resolve => { resolveFirst = resolve; }) : undefined });
    t.after(f.close); await pause();
    f.window.location.hash = '#/details?id=' + B; await pause();
    assert.equal(f.badge().textContent, 'Hidden from users');
    resolveFirst({ ...f.states[A] }); await pause();
    assert.equal(f.badge().textContent, 'Hidden from users');
});
test('language changes update the badge without duplicating it', async t => {
    const f = fixture(); t.after(f.close); await pause();
    f.window.document.documentElement.lang = 'pl-PL'; await pause();
    assert.equal(f.badge().textContent, 'Widoczny dla użytkowników');
    assert.equal(f.window.document.querySelectorAll('[data-mediahider-status]').length, 1);
});
test('logging out removes admin controls and pending menus', async t => {
    const f = fixture(); t.after(f.close); await pause(); await f.openMenu();
    f.identity.id = null; f.window.document.dispatchEvent(new f.window.Event('pageshow')); await pause();
    assert.equal(f.badge(), null); assert.equal(f.window.document.querySelector('[data-mediahider-menu]'), null);
});
test('an unrelated action sheet is not modified', async t => {
    const f = fixture(); t.after(f.close); await pause();
    const unrelated = f.window.document.createElement('div'); unrelated.className = 'actionSheet'; unrelated.innerHTML = '<div class="actionSheetScroller"></div>';
    f.window.document.body.appendChild(unrelated); await pause();
    assert.equal(unrelated.querySelector('[data-mediahider-menu]'), null);
    const menu = await f.openMenu(); assert.ok(menu.querySelector('[data-mediahider-menu]'));
    assert.equal(unrelated.querySelector('[data-mediahider-menu]'), null);
});
test('failed saves keep the previous state and show an error', async t => {
    const f = fixture({ ajax: req => { if (req.type === 'POST') throw { status: 500 }; } });
    t.after(f.close); await pause(); const menu = await f.openMenu(); menu.querySelector('[data-mediahider-menu]').click(); await pause(350);
    assert.equal(f.states[A].Hidden, false); assert.equal(f.badge().textContent, 'Visible to users');
    assert.match(f.window.document.querySelector('#mediaHiderToast').textContent, /operation failed/);
});
for (const lang of ['en', 'pl']) {
    test(lang + ': the plugin settings panel is translated and safely renders title names', async t => {
        const f = fixture({ lang }); t.after(f.close); await pause();
        const html = fs.readFileSync(path.join(__dirname, '../src/configPage.html'), 'utf8');
        const parsed = new JSDOM(html); const page = f.window.document.importNode(parsed.window.document.querySelector('#mediaHiderPage'), true); parsed.window.close();
        f.states[B].TargetName = '<img src=x onerror=alert(1)>';
        f.window.document.body.appendChild(page); f.window.MediaHiderUI.initializePanel(page); await pause();
        assert.equal(page.querySelector('[data-mh-text="search"]').textContent, lang === 'pl' ? 'Szukaj' : 'Search');
        assert.equal(page.querySelector('#mhQuery').placeholder, lang === 'pl' ? 'Wpisz co najmniej 2 znaki' : 'Enter at least 2 characters');
        assert.match(page.querySelector('#mhHidden').textContent, /<img/); assert.equal(page.querySelector('#mhHidden img'), null);
    });
}
test('opening the native menu before the first badge refresh still adds the action', async t => {
    const f = fixture(); t.after(f.close);
    const menu = await f.openMenu();
    assert.ok(menu.querySelector('[data-mediahider-menu]'));
    assert.equal(f.badge().textContent, 'Visible to users');
});
for (const lang of ['en', 'pl']) {
    test(lang + ': missing web integration asks for File Transformation instead of filesystem permissions', async t => {
        const f = fixture({ lang, ajax: req => req.url.endsWith('/Status') ? { WebIntegrationError: 'dependency missing' } : undefined });
        t.after(f.close); await pause();
        const parsed = new JSDOM(fs.readFileSync(path.join(__dirname, '../src/configPage.html'), 'utf8'));
        const page = f.window.document.importNode(parsed.window.document.querySelector('#mediaHiderPage'), true); parsed.window.close();
        f.window.document.body.appendChild(page); f.window.MediaHiderUI.initializePanel(page); await pause();
        assert.match(page.querySelector('#mhStatus').textContent, /File Transformation/);
        assert.doesNotMatch(page.querySelector('#mhStatus').textContent, /write access|prawo zapisu|index\.html/);
    });
}
const G1 = '33333333333333333333333333333333';
const G2 = '44444444444444444444444444444444';
test('selecting a group from the native menu saves only that audience and shows it in the badge', async t => {
    const f = fixture({ groups: [{Id:G1,Name:'Group A',UserIds:[]},{Id:G2,Name:'Group B',UserIds:[]}] });
    t.after(f.close); await pause(); const menu = await f.openMenu(); menu.querySelector('[data-mediahider-menu]').click(); await pause();
    const dialog = f.window.document.querySelector('#mhAudienceDialog'); assert.ok(dialog);
    dialog.querySelector('input[value="groups"]').click(); dialog.querySelector('input[value="'+G1+'"]').click();
    dialog.querySelector('form').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true})); await pause(350);
    const call = f.calls.find(c=>c.type==='POST' && c.url.endsWith('/Hidden/'+A+'/Groups'));
    assert.deepEqual(JSON.parse(call.data).GroupIds,[G1]); assert.equal(f.badge().textContent,'Hidden from: Group A');
});
test('cancelling the optional group chooser does not change visibility', async t => {
    const f = fixture({ groups: [{Id:G1,Name:'Group A',UserIds:[]}] }); t.after(f.close); await pause();
    (await f.openMenu()).querySelector('[data-mediahider-menu]').click(); await pause();
    const dialog=f.window.document.querySelector('#mhAudienceDialog');
    Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Cancel').click(); await pause();
    assert.equal(f.states[A].Hidden,false); assert.equal(f.calls.filter(c=>c.type==='POST').length,0);
});
test('each group editor saves its own optional date and time as UTC', async t => {
    const user={Id:'55555555555555555555555555555555',Name:'Viewer'};
    const f=fixture({users:[user]}); t.after(f.close); await pause();
    const parsed=new JSDOM(fs.readFileSync(path.join(__dirname,'../src/configPage.html'),'utf8'));
    const page=f.window.document.importNode(parsed.window.document.querySelector('#mediaHiderPage'),true); parsed.window.close();
    f.window.document.body.appendChild(page); f.window.MediaHiderUI.initializePanel(page); await pause();
    page.querySelector('#mhGroupName').value='Group A'; page.querySelector('#mhGroupUsers input').checked=true;
    const future=new Date(Date.now()+48*3600000).toISOString().slice(0,16); page.querySelector('#mhGroupRevealAt').value=future;
    page.querySelector('#mhGroupForm').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true})); await pause();
    const call=f.calls.find(c=>c.type==='POST'&&c.url.endsWith('/Groups')); const data=JSON.parse(call.data);
    assert.equal(data.Name,'Group A'); assert.deepEqual(data.UserIds,[user.Id]); assert.equal(data.RevealAtUtc,new f.window.Date(future).toISOString());
});

test('Jelly QoL settings expose two accessible tabs and save QoL preferences separately', async t => {
    const f=fixture();t.after(f.close);
    const html=fs.readFileSync(path.join(__dirname,'../src/configPage.html'),'utf8');
    const source=new JSDOM(html);const page=source.window.document.querySelector('#mediaHiderPage');
    f.window.document.body.appendChild(f.window.document.importNode(page,true));source.window.close();
    const panel=f.window.document.querySelector('#mediaHiderPage');f.window.MediaHiderUI.initializePanel(panel);await pause();
    const media=panel.querySelector('#jqMediaTab'),qol=panel.querySelector('#jqQoLTab');assert.equal(media.textContent,'Media Hider');assert.equal(qol.textContent,'QoL');
    qol.click();assert.equal(panel.querySelector('#jqMediaPanel').hidden,true);assert.equal(panel.querySelector('#jqQoLPanel').hidden,false);assert.equal(qol.getAttribute('aria-selected'),'true');
    panel.querySelector('#jqFilterWarnings').checked=false;
    panel.querySelector('#jqQoLForm').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));await pause();
    const call=f.calls.find(c=>c.type==='POST'&&c.url.endsWith('/QoL'));assert.equal(JSON.parse(call.data).EnableFilterWarnings,false);assert.equal(JSON.parse(call.data).AnimateFilterWarnings,true);
    qol.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(media.getAttribute('aria-selected'),'true');
});
test('service settings and announcement fields save configured values independently, with four keyboard-accessible tabs',async t=>{
 const f=fixture({ajax:async req=>req.url.endsWith('/QoL')?{EnableFilterWarnings:true,AnimateFilterWarnings:true,EnableHeaderLinks:true,HeaderLink1Name:'Original',HeaderLink1Url:'https://example.org/',EnableAnnouncement:false}:undefined});t.after(f.close);
 const source=new JSDOM(fs.readFileSync(path.join(__dirname,'../src/configPage.html'),'utf8'));const panel=f.window.document.importNode(source.window.document.querySelector('#mediaHiderPage'),true);source.window.close();f.window.document.body.appendChild(panel);f.window.MediaHiderUI.initializePanel(panel);await pause();
 assert.equal(panel.querySelectorAll('[role=tab]').length,4);panel.querySelector('#jqServicesTab').click();assert.equal(panel.querySelector('#jqServicesForm').closest('[role=tabpanel]').hidden,false);
 panel.querySelector('#jqHeaderLink1Name').value='Requests';panel.querySelector('#jqHeaderLink1Url').value='https://example.net/request';panel.querySelector('#jqServicesForm').dispatchEvent(new f.window.Event('submit',{cancelable:true,bubbles:true}));await pause();
 const saved=JSON.parse(f.calls.findLast(c=>c.type==='POST'&&c.url.endsWith('/QoL')).data);assert.equal(saved.HeaderLink1Name,'Requests');assert.equal(saved.HeaderLink1Url,'https://example.net/request');assert.equal(saved.EnableFilterWarnings,true);
});
test('JS Injector importer reads only supported literal values and never executes supplied code',t=>{
 const f=fixture();t.after(f.close);f.window.importExecuted=false;
 const data={CustomJavaScripts:[{Name:'Reports2',Enabled:true,Script:"const links = [['one','Changes','M0 0','https://example.org/'],['two','Requests','M1 1','https://example.net/']]; window.importExecuted=true;"},{Name:'PPM Fix',Enabled:true,Script:'throw new Error("must not execute")'},{Name:'Warning Pop-Up',Enabled:false,Script:"const CONFIG = {message: 'Line one\\nLine two', maxAppearances: 8, cooldownSeconds: 10, expiresAt: '2030-12-01T00:00:00+01:00', }; <h2>News</h2><li>First</li> link.textContent = 'Read more';"}]};
 const result=f.window.MediaHiderUI.importSupportedScripts(data,{EnableFilterWarnings:true});assert.equal(result.HeaderLink2Url,'https://example.net/');assert.equal(result.EnableContextMenu,true);assert.equal(result.EnableAnnouncement,false);assert.equal(result.AnnouncementMessage,'Line one\nLine two');assert.equal(result.AnnouncementMaxAppearances,8);assert.equal(result.AnnouncementTitle,'News');assert.equal(f.window.importExecuted,false);assert.equal(result.EnableFilterWarnings,true);
});
test('announcement Test uses unsaved form values without posting or enabling the announcement',async t=>{
 const f=fixture({ajax:async req=>req.url.endsWith('/QoL')?{EnableFilterWarnings:true,AnimateFilterWarnings:true,EnableAnnouncement:false,AnnouncementMessage:'Saved text'}:undefined});t.after(f.close);
 const source=new JSDOM(fs.readFileSync(path.join(__dirname,'../src/configPage.html'),'utf8'));const panel=f.window.document.importNode(source.window.document.querySelector('#mediaHiderPage'),true);source.window.close();f.window.document.body.appendChild(panel);f.window.MediaHiderUI.initializePanel(panel);await pause();
 let preview;f.window.JellyQoLExtras={previewAnnouncement:value=>{preview=value;return true}};panel.querySelector('#jqAnnouncementMessage').value='Unsaved text';panel.querySelector('#jqTestAnnouncement').click();await pause();assert.equal(preview.AnnouncementMessage,'Unsaved text');assert.equal(preview.EnableAnnouncement,false);assert.equal(f.calls.filter(call=>call.type==='POST').length,0);
});