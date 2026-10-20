const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const code = fs.readFileSync(path.join(__dirname, '../src/FilterWarnings.js'), 'utf8');
const pause = (ms = 85) => new Promise(resolve => setTimeout(resolve, ms));
function fixture(t, html = '', options = {}) {
    const dom = new JSDOM('<!doctype html><html lang="'+(options.lang || 'en')+'"><head></head><body>'+html+'</body></html>', {
        url: 'https://jellyfin.test/web/index.html#/movies?topParentId=A&tab=0', runScripts: 'outside-only', pretendToBeVisual: true
    });
    t.after(() => dom.window.close());
    dom.window.ApiClient = { getCurrentUserId: () => 'viewer' };
    if (options.filters) dom.window.localStorage.setItem('movies - A', JSON.stringify({ Filters: options.filters }));
    dom.window.eval(code);
    return { w: dom.window, d: dom.window.document };
}
const icon = active => '<button id="filter"><span class="MuiBadge-root"><svg data-testid="FilterAltIcon"></svg><span class="MuiBadge-badge '+(active ? '' : 'MuiBadge-invisible')+'"></span></span></button>';
const section = (id, inputs = '') => '<section class="MuiAccordion-root"><button class="MuiAccordionSummary-root" id="'+id+'-header">'+id+'</button><div class="details">'+inputs+'</div></section>';
const check = '<label class="MuiFormControlLabel-root"><input type="checkbox" checked><span class="MuiFormControlLabel-label">Favorite</span></label>';
for (const lang of ['pl', 'en']) test(lang+': native badge immediately drives warning on normal user account, without opening a dialog', async t => {
    const {w,d} = fixture(t,icon(false),{lang}); await pause();
    assert.equal(d.querySelector('#filter').hasAttribute('data-jqol-filter-warning'),false);
    d.querySelector('.MuiBadge-badge').classList.remove('MuiBadge-invisible'); await pause();
    assert.equal(d.querySelector('#filter').getAttribute('data-jqol-filter-warning'),lang==='pl'?'Aktywne filtry':'Active filters');
    d.querySelector('.MuiBadge-badge').classList.add('MuiBadge-invisible'); await pause();
    assert.equal(d.querySelector('#filter').hasAttribute('aria-description'),false);
    assert.equal(w.sessionStorage.length,0);
});
test('collapsed MUI categories get counts from current library settings before ever opening a category',async t=>{
    const {d}=fixture(t,icon(true)+'<div id="filter-popover">'+section('filtersGenres')+section('filtersVideoTypes')+'</div>',{filters:{Genres:['Drama','Comedy'],VideoTypes:['Dvd'],VideoBasicFilter:['IsHD']}});await pause();
    assert.equal(d.querySelector('#filtersGenres-header').getAttribute('data-jqol-filter-count'),'2');
    assert.equal(d.querySelector('#filtersVideoTypes-header').getAttribute('data-jqol-filter-count'),'2');
});
test('mounted controls update on checked-property changes without attribute mutations or DOM replacement',async t=>{
    const {w,d}=fixture(t,icon(true)+'<div id="filter-popover">'+section('filtersStatus',check)+'</div>');await pause();
    const input=d.querySelector('input');const header=d.querySelector('.MuiAccordionSummary-root');assert.equal(header.getAttribute('data-jqol-filter-count'),'1');
    input.checked=false;input.dispatchEvent(new w.Event('change',{bubbles:true}));await pause();
    assert.equal(header.hasAttribute('data-jqol-filter-count'),false);
    input.checked=true;await pause(650);assert.equal(header.getAttribute('data-jqol-filter-count'),'1');
});
test('duplicate change events never double-count a selection; category unmount retains count',async t=>{
    const {w,d}=fixture(t,icon(true)+'<div id="filter-popover">'+section('filtersStatus',check)+'</div>');await pause();
    const input=d.querySelector('input');for(let i=0;i<4;i++)input.dispatchEvent(new w.Event('change',{bubbles:true}));await pause();
    assert.equal(d.querySelector('.MuiAccordionSummary-root').getAttribute('data-jqol-filter-count'),'1');
    d.querySelector('.details').replaceChildren();await pause();assert.equal(d.querySelector('.MuiAccordionSummary-root').getAttribute('data-jqol-filter-count'),'1');
});
test('native clear removes collapsed counts even while stored settings still contain stale selections',async t=>{
    const {d}=fixture(t,icon(true)+'<div id="filter-popover">'+section('filtersGenres')+'</div>',{filters:{Genres:['Drama']}});await pause();
    d.querySelector('.MuiBadge-badge').classList.add('MuiBadge-invisible');await pause();
    assert.equal(d.querySelector('.MuiAccordionSummary-root').hasAttribute('data-jqol-filter-count'),false);
});
test('navigation, back/forward and local-storage events refresh counts without GUI reload',async t=>{
    const {w,d}=fixture(t,icon(true)+'<div id="filter-popover">'+section('filtersGenres')+'</div>',{filters:{Genres:['Drama']}});await pause();
    w.localStorage.setItem('movies - B',JSON.stringify({Filters:{Genres:['Comedy','Action']}}));w.location.hash='/movies?topParentId=B&tab=0';await pause();
    assert.equal(d.querySelector('.MuiAccordionSummary-root').getAttribute('data-jqol-filter-count'),'2');
    w.localStorage.setItem('movies - B',JSON.stringify({Filters:{}}));w.dispatchEvent(new w.CustomEvent('local-storage',{detail:{key:'movies - B'}}));await pause();
    assert.equal(d.querySelector('.MuiAccordionSummary-root').hasAttribute('data-jqol-filter-count'),false);
});
test('legacy 12.1 uses native indicator, counts current controls and clear invokes actual Jellyfin change handlers',async t=>{
    const {w,d}=fixture(t,'<div class="btnFilter-wrapper"><div class="filterIndicator hide">!</div><button class="btnFilter"><span class="material-icons filter_alt"></span></button></div><div class="filterDialog"><div class="filterDialogContent"><div is="emby-collapse" class="emby-collapse"><button class="emby-collapsible-button">Status</button><label><input type="checkbox" checked><span class="checkboxLabel">Played</span></label></div></div></div>');
    let changes=0;d.querySelector('input').addEventListener('change',()=>{changes++;d.querySelector('.filterIndicator').classList.add('hide')});d.querySelector('.filterIndicator').classList.remove('hide');await pause();
    assert.ok(d.querySelector('.btnFilter').hasAttribute('data-jqol-filter-warning'));assert.equal(d.querySelector('.emby-collapsible-button').getAttribute('data-jqol-filter-count'),'1');
    d.querySelector('[data-jqol-clear]').click();await pause();assert.equal(changes,1);assert.equal(d.querySelector('input').checked,false);assert.equal(d.querySelector('.btnFilter').hasAttribute('data-jqol-filter-warning'),false);
});
test('re-injection is idempotent, retains reduced-motion styles and does not continuously mutate the page',async t=>{
    const {w,d}=fixture(t,icon(true));await pause();w.eval(code);await pause();assert.equal(d.querySelectorAll('#jelly-qol-filters-style').length,1);
    assert.match(d.querySelector('style').textContent,/prefers-reduced-motion/);
    let mutations=0;const observer=new w.MutationObserver(records=>{mutations+=records.length});observer.observe(d.body,{attributes:true,childList:true,subtree:true});await pause(650);observer.disconnect();assert.equal(mutations,0);
});
test('malformed or blocked storage does not break live native warnings',async t=>{
    const {w,d}=fixture(t,icon(true)+'<div id="filter-popover">'+section('filtersGenres')+'</div>');w.localStorage.setItem('movies - A','invalid');await pause();
    assert.equal(d.querySelector('#filter').getAttribute('data-jqol-filter-warning'),'Active filters');
});
test('QoL switches remove warnings and animation immediately without altering native filter state',async t=>{
    const {w,d}=fixture(t,icon(true)+'<div id="filter-popover">'+section('filtersStatus',check)+'</div>');await pause();
    w.dispatchEvent(new w.CustomEvent('jellyqol:features',{detail:{EnableFilterWarnings:false,AnimateFilterWarnings:false}}));await pause();
    assert.equal(d.querySelector('#filter').hasAttribute('data-jqol-filter-warning'),false);assert.equal(d.querySelector('input').checked,true);
    assert.equal(d.documentElement.getAttribute('data-jqol-filter-animation'),'off');
    assert.equal(d.documentElement.hasAttribute('data-jqol-filters-enabled'),false);
    w.dispatchEvent(new w.CustomEvent('jellyqol:features',{detail:{EnableFilterWarnings:true,AnimateFilterWarnings:false}}));await pause();
    assert.ok(d.querySelector('#filter').hasAttribute('data-jqol-filter-warning'));
});
test('server feature settings load from the injected script base URL and survive refresh',async t=>{
    const {w,d}=fixture(t,icon(true));let url;
    w.fetch=async value=>{url=value;return{ok:true,json:async()=>({EnableFilterWarnings:false,AnimateFilterWarnings:true})}};
    // DOMContentLoaded runs after the fixture has supplied the browser API.
    await pause();assert.equal(url,'https://jellyfin.test/MediaHider/Features');assert.equal(d.querySelector('#filter').hasAttribute('data-jqol-filter-warning'),false);
});
test('committed Jellyfin settings take precedence over a transient checkbox property',async t=>{
    const {d}=fixture(t,icon(true)+'<div id="filter-popover">'+section('filtersStatus','<input type="checkbox">')+'</div>',{filters:{Status:['IsPlayed']}});await pause();
    assert.equal(d.querySelector('#filtersStatus-header').getAttribute('data-jqol-filter-count'),'1');
});