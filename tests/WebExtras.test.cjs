const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const code=fs.readFileSync(path.join(__dirname,'../src/WebExtras.js'),'utf8');
const pause=(ms=220)=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(t,html='',overrides={},options={}){
 const dom=new JSDOM('<!doctype html><html lang="'+(options.lang||'en')+'"><head></head><body>'+html+'</body></html>',{url:'https://jellyfin.test/base/web/index.html#'+(options.route||'/home'),runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>{dom.window.JellyQoLExtras?.dispose();dom.window.close();});
 const w=dom.window,d=w.document;w.HTMLElement.prototype.getClientRects=function(){return [{top:0,bottom:40,width:100,height:40}]};
 const settings={EnableHeaderLinks:true,HeaderLink1Name:'Changes',HeaderLink1Url:'https://example.org/changes',HeaderLink2Name:'Requests',HeaderLink2Url:'https://example.org/requests',EnableContextMenu:true,EnableSearchOrder:true,EnableToastIcons:true,EnablePagination:true,EnableAnnouncement:false,AnnouncementTitle:'News',AnnouncementMessage:'New titles available',AnnouncementDetails:'First\nSecond',AnnouncementPosition:'top',AnnouncementDurationSeconds:0,AnnouncementMaxAppearances:5,AnnouncementCooldownSeconds:3600,AnnouncementResetHours:24,AnnouncementRepeatInSession:false,AnnouncementRememberDismiss:true,...overrides};
 const identity={user:options.user===undefined?'A':options.user};const calls=[];w.ApiClient={getCurrentUserId:()=>identity.user,serverAddress:()=> 'https://jellyfin.test/base',getUrl:r=>'/base/'+r,ajax:async req=>{calls.push(req);return options.ajax?options.ajax(req,settings):{...settings}}};w.eval(code);
 return{w,d,identity,calls,settings,change:updates=>{Object.assign(settings,updates);w.dispatchEvent(new w.CustomEvent('jellyqol:features',{detail:settings}))}};
}
const header='<div class="MuiToolbar-root"><div><button aria-controls="app-sync-play-menu">Sync</button><button aria-controls="app-user-menu">User</button></div></div>';
test('configured shortcuts use supplied names and URLs, refresh live and disappear on logout',async t=>{
 const f=fixture(t,header);await pause();assert.equal(f.d.querySelector('#jqol-service-1').href,'https://example.org/changes');assert.equal(f.d.querySelector('#jqol-service-2').getAttribute('aria-label'),'Requests');assert.match(f.d.querySelector('a').rel,/noopener/);
 f.change({HeaderLink1Name:'Updates',HeaderLink1Url:'https://example.net/updates',HeaderLink2Url:''});await pause();assert.equal(f.d.querySelector('#jqol-service-1').title,'Updates');assert.equal(f.d.querySelectorAll('.jqol-service-link').length,1);
 f.identity.user=null;f.w.location.hash='/login';await pause();assert.equal(f.d.querySelectorAll('.jqol-service-link').length,0);
});
test('no settings request or links on public pages, even if a stale user ID remains',async t=>{
 const f=fixture(t,header,{}, {route:'/login'});await pause();assert.equal(f.calls.length,0);assert.equal(f.d.querySelector('a'),null);
});
test('unsafe service URLs never become clickable',async t=>{
 const f=fixture(t,header,{HeaderLink1Url:'javascript:alert(1)',HeaderLink2Url:'https://user:secret@example.org/'});await pause();assert.equal(f.d.querySelectorAll('.jqol-service-link').length,0);
});
test('right-click invokes the native title menu once and preserves browser shortcuts and inputs',async t=>{
 const f=fixture(t,'<div class="card" data-id="movie"><button data-action="menu">Menu</button><span id="target">Movie</span><input></div>');let count=0;f.d.querySelector('button').addEventListener('click',()=>count++);await pause();
 const dispatch=(node,opts={})=>{const event=new f.w.MouseEvent('contextmenu',{button:2,bubbles:true,cancelable:true,...opts});node.dispatchEvent(event);return event};
 assert.equal(dispatch(f.d.querySelector('#target')).defaultPrevented,true);assert.equal(count,1);
 assert.equal(dispatch(f.d.querySelector('#target'),{ctrlKey:true}).defaultPrevented,false);assert.equal(dispatch(f.d.querySelector('#target'),{shiftKey:true}).defaultPrevented,false);dispatch(f.d.querySelector('input'));assert.equal(count,1);
 f.change({EnableContextMenu:false});await pause();dispatch(f.d.querySelector('#target'));assert.equal(count,1);
});
test('toast placeholders become local icons without injecting text as HTML, and disabling restores tokens',async t=>{
 const f=fixture(t,'<div class="jellyfin-enhanced-toast">{{icon.audio}} English &lt;img src=x onerror=alert(1)&gt; {{icon.subtitles}}</div>');await pause();assert.equal(f.d.querySelectorAll('.jqol-toast-icon').length,2);assert.equal(f.d.querySelector('img'),null);
 f.change({EnableToastIcons:false});await pause();assert.equal(f.d.querySelector('.jqol-toast-icon'),null);assert.match(f.d.querySelector('.jellyfin-enhanced-toast').textContent,/\{\{icon.audio\}\}/);
});
test('search ranks movies, series, Seerr; empty sections stay hidden until real results arrive',async t=>{
 const f=fixture(t,'<div class="searchResults"><div class="verticalSection" id="series"><h2>Series</h2><div class="itemsContainer"></div></div><div class="jellyseerr-section" id="seerr"><h2>Discover on Seerr</h2><div class="jellyseerr-card">Result</div></div><div class="verticalSection" id="movies"><h2>Movies</h2><div class="itemsContainer"><div class="card" data-type="Movie">Movie</div></div></div></div>',{}, {route:'/search?query=test'});await pause();
 assert.equal(f.d.querySelector('#movies').getAttribute('data-jqol-search-rank'),'0');assert.equal(f.d.querySelector('#series').getAttribute('data-jqol-search-rank'),'1');assert.equal(f.d.querySelector('#seerr').getAttribute('data-jqol-search-rank'),'2');assert.equal(f.w.getComputedStyle(f.d.querySelector('#series')).display,'none');
 f.d.querySelector('#series .itemsContainer').innerHTML='<div class="card" data-type="Series">Show</div>';await pause();assert.equal(f.d.querySelector('#series').hasAttribute('data-jqol-search-empty'),false);
 f.w.location.hash='/home';await pause();assert.equal(f.d.querySelectorAll('[data-jqol-search-rank]').length,0);
});
test('top and bottom pagination forward to native controls and track counts, disabled state and language',async t=>{
 const f=fixture(t,'<main><div><span class="MuiChip-root">1–100 of 250</span><button id="prev" disabled><svg data-testid="NavigateBeforeIcon"></svg></button><button id="next"><svg data-testid="NavigateNextIcon"></svg></button></div><div class="grid"><a class="card" href="#/details?id=1">Movie</a></div></main>',{}, {route:'/movies'});let clicks=0;f.d.querySelector('#next').addEventListener('click',()=>{clicks++;f.d.querySelector('.MuiChip-root').textContent='101–200 of 250';f.d.querySelector('#prev').disabled=false});await pause();
 assert.equal(f.d.querySelectorAll('.jqol-pagination').length,2);const bottom=f.d.querySelector('.jqol-pagination-bottom');assert.equal(bottom.parentElement.className,'grid');assert.equal(bottom.querySelector('button').disabled,true);bottom.querySelectorAll('button')[1].click();await pause();assert.equal(clicks,1);assert.match(bottom.textContent,/101–200 of 250/);assert.equal(bottom.querySelector('button').disabled,false);
 f.change({EnablePagination:false});await pause();assert.equal(f.d.querySelector('.jqol-pagination'),null);assert.equal(f.d.querySelector('#next').classList.contains('jqol-native-arrow'),false);
});
test('home announcement uses configured data, dismisses per account and never appears on login or other pages',async t=>{
 const f=fixture(t,header,{EnableAnnouncement:true,AnnouncementMessage:'Text <script>bad()</script>'});await pause();let banner=f.d.querySelector('#jqol-announcement');assert.ok(banner);assert.equal(banner.querySelector('script'),null);assert.equal(banner.querySelectorAll('li').length,2);
 banner.querySelector('button').click();await pause();assert.equal(f.d.querySelector('#jqol-announcement'),null);f.w.JellyQoLExtras.refresh();await pause();assert.equal(f.d.querySelector('#jqol-announcement'),null);
 f.identity.user='B';f.w.JellyQoLExtras.refresh();await pause(350);assert.ok(f.d.querySelector('#jqol-announcement'));
 f.w.location.hash='/movies';await pause();assert.equal(f.d.querySelector('#jqol-announcement'),null);
});
test('announcement dates and cooldown change live, and an updated message resets dismissal',async t=>{
 const f=fixture(t,header,{EnableAnnouncement:true,AnnouncementShowAfter:new Date(Date.now()+86400000).toISOString()});await pause();assert.equal(f.d.querySelector('#jqol-announcement'),null);
 f.change({AnnouncementShowAfter:null});await pause();assert.ok(f.d.querySelector('#jqol-announcement'));f.d.querySelector('#jqol-announcement button').click();f.change({AnnouncementMessage:'Updated message',AnnouncementExpiresAt:new Date(Date.now()+86400000).toISOString()});await pause();assert.ok(f.d.querySelector('#jqol-announcement'));
 f.change({AnnouncementExpiresAt:new Date(Date.now()-1000).toISOString()});await pause();assert.equal(f.d.querySelector('#jqol-announcement'),null);
});
test('re-injection is idempotent and steady UI does not cause an observer loop',async t=>{
 const f=fixture(t,header);await pause();f.w.eval(code);await pause();assert.equal(f.d.querySelectorAll('#jelly-qol-extras-style').length,1);
 let count=0;const observer=new f.w.MutationObserver(records=>count+=records.length);observer.observe(f.d.body,{childList:true,attributes:true,subtree:true});await pause(500);observer.disconnect();assert.equal(count,0);
});
test('a delayed settings response cannot undo preferences saved after the request started',async t=>{
 let complete;const f=fixture(t,header,{}, {ajax:()=>new Promise(resolve=>{complete=resolve})});await pause();
 f.change({EnableHeaderLinks:false});complete({...f.settings,EnableHeaderLinks:true});await pause();assert.equal(f.d.querySelectorAll('.jqol-service-link').length,0);
});
test('announcement preview bypasses disabled state and expired dates without touching counters, session or saved settings',async t=>{
 const f=fixture(t,'<button id="test">Test</button>',{EnableAnnouncement:false},{route:'/configurationpage?name=mediahider'});await pause();
 const beforeLocal=JSON.stringify(Object.entries(f.w.localStorage)),beforeSession=JSON.stringify(Object.entries(f.w.sessionStorage));
 f.d.querySelector('#test').focus();const result=f.w.JellyQoLExtras.previewAnnouncement({...f.settings,AnnouncementTitle:'Unsaved preview',AnnouncementMessage:'Preview <script>bad()</script>',AnnouncementExpiresAt:'2000-01-01T00:00:00Z',AnnouncementMaxAppearances:1});
 assert.equal(result,true);await pause();const preview=f.d.querySelector('#jqol-announcement-preview');assert.ok(preview);assert.equal(preview.querySelector('h2').textContent,'Unsaved preview');assert.equal(preview.querySelector('script'),null);assert.equal(f.d.querySelector('#jqol-announcement'),null);
 preview.querySelector('button').click();assert.equal(f.d.activeElement.id,'test');assert.equal(f.settings.EnableAnnouncement,false);assert.equal(JSON.stringify(Object.entries(f.w.localStorage)),beforeLocal);assert.equal(JSON.stringify(Object.entries(f.w.sessionStorage)),beforeSession);
});
test('preview works before settings finish loading and is removed when leaving the settings page',async t=>{
 let complete;const f=fixture(t,'',{}, {route:'/configurationpage?name=mediahider',ajax:()=>new Promise(resolve=>{complete=resolve})});
 assert.equal(f.w.JellyQoLExtras.previewAnnouncement({AnnouncementMessage:'Preview immediately',AnnouncementPosition:'bottom'}),true);await pause();assert.ok(f.d.querySelector('#jqol-announcement-preview'));assert.equal(f.d.querySelector('#jqol-announcement-preview').style.bottom,'16px');
 complete(f.settings);await pause();assert.ok(f.d.querySelector('#jqol-announcement-preview'));f.w.location.hash='/movies';await pause();assert.equal(f.d.querySelector('#jqol-announcement-preview'),null);
});