(function () {
    'use strict';
    if (window.JellyQoLNotifications) return;
    const pl = () => /^pl/i.test(document.documentElement.lang || navigator.language);
    const labels = {
        en: {notifications:'Notifications',history:'History',about:'About',close:'Close',back:'Back',save:'Save',saved:'Saved.',error:'Could not load or save notifications. Try again.',enabled:'Enable notifications',popups:'Show a popup when entering Jellyfin',seerr:'Completed Seerr requests',library:'New Jellyfin media',movies:'Movies',series:'Series',episodes:'Episodes',own:'Only my Seerr requests',unlinked:'Your account has not yet been linked to a Seerr request. Include the requesting Jellyfin user ID in the webhook, or ask an administrator to map the accounts. This filter applies only to Seerr; library news is separate.',empty:'No notifications.',open:'Open',read:'Mark as read',readAll:'Mark displayed items as read',later:'Remind me in one hour',newMedia:'Newly available',request:'Requested media is available',episodeCount:'episodes',notRead:'Unread',seen:'Shown',unseen:'Not shown',more:'Load more',disabled:'Notifications are disabled by the administrator.',prefsHelp:'Preferences and read status follow your account across browsers. Click the bell to view notifications. Both sources are enabled by default.',aboutText:'Jelly QoL for Jellyfin 12.1. Notifications respect your library access and Media Hider restrictions.',admin:'Notifications',global:'Enable notification integration',days:'Keep notifications for this many days',secret:'Webhook secret',rotate:'Generate / replace secret',rotateConfirm:'Replace the secret? Update it in Seerr afterwards.',url:'Webhook URL',header:'Authorization header in Seerr',template:'JSON payload in Seerr — enable Request Available events',mapping:'Optional account mapping: Seerr username → Jellyfin user ID (JSON object)',diagnostics:'Diagnostics',refresh:'Refresh',test:'Test',testHint:'Preview only; no history or counters are changed.',testMessage:'This is a notification preview.',ready:'Ready',waiting:'Waiting for a Jellyfin match',none:'No webhook received',received:'Webhook received',testStatus:'Test received',adminHelp:'Only events received after enabling are collected. No existing-library backfill. Users choose their sources in profile → Jelly QoL. Changes apply to new events; retained history remains subject to current settings.',copied:'Copied',copy:'Copy',readState:'Read',load:'Loading…',settings:'Settings'},
        pl: {notifications:'Powiadomienia',history:'Historia',about:'O wtyczce',close:'Zamknij',back:'Wstecz',save:'Zapisz',saved:'Zapisano.',error:'Nie udało się pobrać lub zapisać powiadomień. Spróbuj ponownie.',enabled:'Włącz powiadomienia',popups:'Pokazuj pop-up przy wejściu do Jellyfin',seerr:'Zrealizowane prośby Seerr',library:'Nowości w Jellyfin',movies:'Filmy',series:'Seriale',episodes:'Odcinki',own:'Tylko moje prośby Seerr',unlinked:'Nie rozpoznano jeszcze powiązania z kontem Seerr. Webhook powinien zawierać identyfikator Jellyfin osoby zamawiającej; administrator może też powiązać konta ręcznie. Ten filtr dotyczy tylko Seerr — nowości biblioteki są osobnym źródłem.',empty:'Brak powiadomień.',open:'Otwórz',read:'Oznacz jako przeczytane',readAll:'Oznacz wyświetlone jako przeczytane',later:'Przypomnij za godzinę',newMedia:'Już dostępne',request:'Zamówiony materiał jest już dostępny',episodeCount:'odcinków',notRead:'Nieprzeczytane',seen:'Pokazano',unseen:'Nie pokazano',more:'Wczytaj więcej',disabled:'Administrator wyłączył powiadomienia.',prefsHelp:'Preferencje i stan przeczytania są wspólne dla Twojego konta we wszystkich przeglądarkach. Powiadomienia otwierasz dzwonkiem. Oba źródła są domyślnie włączone.',aboutText:'Jelly QoL dla Jellyfin 12.1. Powiadomienia uwzględniają dostęp do bibliotek i ograniczenia Media Hider.',admin:'Powiadomienia',global:'Włącz integrację powiadomień',days:'Przechowuj powiadomienia przez tyle dni',secret:'Sekret webhooka',rotate:'Wygeneruj / zmień sekret',rotateConfirm:'Zmienić sekret? Następnie trzeba go zaktualizować w Seerr.',url:'Adres webhooka',header:'Nagłówek Authorization w Seerr',template:'Treść JSON w Seerr — włącz zdarzenie Request Available',mapping:'Opcjonalne powiązania: nazwa konta Seerr → ID użytkownika Jellyfin (obiekt JSON)',diagnostics:'Diagnostyka',refresh:'Odśwież',test:'Test',testHint:'Tylko podgląd — bez zapisywania historii i zmiany liczników.',testMessage:'To jest podgląd powiadomienia.',ready:'Gotowe',waiting:'Oczekuje na dopasowanie w Jellyfin',none:'Nie odebrano webhooka',received:'Odebrano webhook',testStatus:'Odebrano test',adminHelp:'Zbierane są zdarzenia od momentu włączenia. Istniejąca biblioteka nie zostanie rozesłana. Użytkownik wybiera źródła w menu profilu → Jelly QoL. Zmiany dotyczą nowych zdarzeń; dostępna historia uwzględnia bieżące ustawienia.',copied:'Skopiowano',copy:'Kopiuj',readState:'Przeczytane',load:'Ładowanie…',settings:'Ustawienia'}
    };
    const t = key => labels[pl() ? 'pl' : 'en'][key] || key;
    const e = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
    const icon = name => { const n = e('span', name, 'material-icons'); n.setAttribute('aria-hidden','true'); return n; };
    const button = (text, action, cls='jqn-button') => { const n=e('button',text,cls); n.type='button';n.addEventListener('click',action);return n; };
    const publicPage = () => /^\/?(?:login|selectserver|addserver|forgotpassword|forgotpasswordpin|quickconnect|wizard|disclaimer)(?:\b|\/)/i.test(location.hash.replace(/^#!?\/?/,''));
    const identity = () => !publicPage() && window.ApiClient?.getCurrentUserId?.() ? window.ApiClient.serverAddress() + ':' + window.ApiClient.getCurrentUserId() : '';
    let user='', feed=null, dialog=null, popup=null, timer=null, polling=false, pageOffset=0, historyItems=[], mutationScheduled=false;
    const api = async (path='', data) => {
        const key=identity(); if (!key) throw new Error('Authentication required');
        const value=await window.ApiClient.ajax({type:data===undefined?'GET':'POST',url:window.ApiClient.getUrl('MediaHider/Notifications'+path),dataType:data===undefined||['/Actions','/Secret','/Test'].includes(path)?'json':undefined,...(data===undefined?{}:{contentType:'application/json',data:JSON.stringify(data)})});
        if (key!==identity()) throw new Error('Account changed'); return value;
    };
    const validId = value => /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(value || '');
    const status = (root,message,error=false) => { const n=root.querySelector('.jqn-status'); if(n){n.textContent=message;n.classList.toggle('jqn-error',error);} };
    function modal(id, title, blocking=true) {
        const previous=document.activeElement, overlay=e('div',null,blocking?'jqn-overlay':'jqn-overlay jqn-corner');overlay.id=id;
        const box=e('div',null,'jqn-dialog');box.setAttribute('role','dialog');box.setAttribute('aria-modal',String(blocking));box.setAttribute('aria-labelledby',id+'-title');box.tabIndex=-1;
        const header=e('header');const h=e('h2',title);h.id=id+'-title';const close=button('',()=>remove());close.append(icon('close'));close.setAttribute('aria-label',t('close'));header.append(h,close);box.append(header);overlay.append(box);
        function remove(){overlay.remove();if(dialog===overlay)dialog=null;if(popup===overlay){popup=null;document.getElementById('jqn-bell')?.setAttribute('aria-expanded','false');}if(previous?.isConnected)previous.focus();}
        overlay.addEventListener('click',event=>{if(event.target===overlay)remove();});
        overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();remove();}if(blocking&&event.key==='Tab'){const nodes=Array.from(box.querySelectorAll('button,a,input,select,textarea,[tabindex="0"]')).filter(x=>!x.disabled&&!x.closest('[hidden]'));const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===box)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
        document.body.append(overlay);box.focus();return {overlay,box,remove};
    }
    function toggle(parent,key,label,value) { const row=e('label',null,'jqn-toggle');const input=e('input');input.type='checkbox';input.name=key;input.checked=Boolean(value);row.append(e('span',label),input);parent.append(row);return input; }
    async function action(ids,kind) { const result=[];for(let i=0;i<ids.length;i+=1000){const value=await api('/Actions',{Ids:ids.slice(i,i+1000),Action:kind});if(Array.isArray(value))result.push(...value);}return result; }
    function card(item,container,preview=false) {
        const row=e('article',null,'jqn-card');
        if(validId(item.ImageItemId)){const image=e('img');image.alt='';image.loading='lazy';image.src=window.ApiClient.getImageUrl(item.ImageItemId,{type:'Primary',maxWidth:180});image.addEventListener('error',()=>image.remove(),{once:true});row.append(image);}
        const body=e('div',null,'jqn-card-body');const tag=e('small',preview?t('testMessage'):item.Seerr?t('request'):t('newMedia'));const title=e('h3',item.Name);body.append(tag,title);
        if(item.Type==='Episode'||item.Type==='Series')body.append(e('p',item.Count+' '+t('episodeCount')));
        if(item.Created)body.append(e('time',new Date(item.Created).toLocaleString()));
        if(!preview)body.append(e('p',`${item.Read?t('readState'):t('notRead')} · ${item.Shown?t('seen'):t('unseen')}`,'jqn-muted'));
        const actions=e('div',null,'jqn-actions');
        if(validId(item.ItemId)){const link=e('a',t('open'),'jqn-primary');link.href='#/details?id='+encodeURIComponent(item.ItemId);link.addEventListener('click',()=>{action(item.Ids,'read').catch(()=>{});dialog?.remove();dialog=null;popup?.remove();popup=null;});actions.append(link);}
        if(!preview&&!item.Read) actions.append(button(t('read'),async event=>{const b=event.currentTarget;b.disabled=true;try{await action(item.Ids,'read');item.Read=true;row.classList.add('jqn-read');b.remove();await refresh();}catch(_){b.disabled=false;status(container,t('error'),true);}}));
        body.append(actions);row.append(body);container.append(row);
    }
    async function showPreview(items) {
        if(dialog||!identity())return;
        popup?.remove();popup=null;
        const m=modal('jqn-popup',t('test'),false);popup=m.overlay;
        const body=e('div',null,'jqn-popup-body');items.forEach(item=>card(item,body,true));m.box.append(body);
    }
    async function openNotifications() {
        if(!identity())return;
        if(popup){popup.remove();popup=null;document.getElementById('jqn-bell')?.setAttribute('aria-expanded','false');return;}
        if(dialog)return;
        const key=identity(),m=modal('jqn-popup',t('notifications'),false);popup=m.overlay;
        document.getElementById('jqn-bell')?.setAttribute('aria-expanded','true');
        const body=e('div',null,'jqn-popup-body'),state=e('p',t('load'),'jqn-status'),list=e('div');state.setAttribute('role','status');body.append(state,list);m.box.append(body);
        let offset=0,loaded=[];
        const more=button(t('more'),()=>load());more.hidden=true;body.append(more);
        const footer=e('footer',null,'jqn-actions'),readAll=button(t('readAll'),async()=>{
            readAll.disabled=true;
            try{await action(loaded.flatMap(x=>x.Ids),'read');if(!m.overlay.isConnected)return;offset=0;loaded=[];list.replaceChildren();await load();await refresh();}
            catch(_){status(body,t('error'),true);}finally{readAll.disabled=false;}
        });readAll.hidden=true;footer.append(readAll);m.box.append(footer);
        async function load(){
            more.disabled=true;status(body,t('load'));
            try{
                const data=await api('?offset='+offset);if(!m.overlay.isConnected||key!==identity())return;
                await action(data.Items.flatMap(x=>x.Ids),'shown');if(!m.overlay.isConnected||key!==identity())return;
                feed=data;mountMenu();status(body,'');offset+=data.Items.length;loaded.push(...data.Items);
                if(!loaded.length)list.append(e('p',data.Available?t('empty'):t('disabled'),'jqn-muted'));
                data.Items.forEach(item=>card({...item,Shown:true},list));more.hidden=data.Items.length<50;readAll.hidden=!loaded.length;
            }catch(_){if(m.overlay.isConnected){status(body,t('error'),true);more.hidden=false;}}
            finally{more.disabled=false;}
        }
        await load();
    }
    async function openPanel(section='notifications') {
        if(dialog||!identity())return;popup?.remove();popup=null;const key=identity();const m=modal('jqn-settings','Jelly QoL');dialog=m.overlay;
        const body=e('div',null,'jqn-panel-body'),nav=e('nav'),main=e('main'),state=e('p',t('load'),'jqn-status');state.setAttribute('role','status');main.append(state);body.append(nav,main);m.box.append(body);
        let current=section;
        const show=async name=>{
            current=name;body.classList.add('jqn-pane-open');main.replaceChildren();nav.querySelectorAll('button').forEach(n=>n.setAttribute('aria-current',n.dataset.section===name?'page':'false'));
            const back=button(t('back'),()=>body.classList.remove('jqn-pane-open'),'jqn-button jqn-back');const heading=e('h3',t(name));main.append(back,heading,state);state.textContent='';
            if(name==='about'){main.append(e('p',t('aboutText')));return;}
            try{
                const data=await api(name==='history'?'?offset=0':'');if(!m.overlay.isConnected||key!==identity()||current!==name)return;feed=data;
                if(!data.Available)main.append(e('p',t('disabled'),'jqn-muted'));
                if(name==='notifications'){
                    main.append(e('p',t('prefsHelp'),'jqn-muted'));const form=e('form');const prefs=data.Preferences;
                    for(const [field,label] of [['Enabled','enabled'],['Seerr','seerr'],['Library','library'],['Movies','movies'],['Series','series'],['Episodes','episodes'],['OnlyOwnRequests','own']])toggle(form,field,t(label),prefs[field]);
                    if(!data.OwnRequestsLinked)form.append(e('p',t('unlinked'),'jqn-muted'));
                    const save=button(t('save'),()=>{} ,'jqn-button jqn-primary');save.type='submit';form.append(save);form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{const value={...prefs};for(const input of form.querySelectorAll('input'))value[input.name]=input.checked;await api('/Preferences',value);status(main,t('saved'));await refresh();}catch(_){status(main,t('error'),true);}finally{save.disabled=false;}});main.append(form);
                }else{
                    pageOffset=data.Items.length;historyItems=data.Items;const list=e('div');main.append(list);if(!data.Items.length)list.append(e('p',t('empty')));data.Items.forEach(x=>card(x,list));
                    const more=button(t('more'),async()=>{more.disabled=true;try{const next=await api('?offset='+pageOffset);if(current!==name||!m.overlay.isConnected)return;pageOffset+=next.Items.length;historyItems.push(...next.Items);next.Items.forEach(x=>card(x,list));more.hidden=next.Items.length<50;}catch(_){status(main,t('error'),true);}finally{more.disabled=false;}});more.hidden=data.Items.length<50;main.append(more);
                    main.append(button(t('readAll'),async event=>{event.currentTarget.disabled=true;try{for(let i=0;i<historyItems.length;i+=20)await action(historyItems.slice(i,i+20).flatMap(x=>x.Ids),'read');await show('history');await refresh();}catch(_){status(main,t('error'),true);event.currentTarget.disabled=false;}}));
                }
            }catch(_){status(main,t('error'),true);}
        };
        for(const [name,symbol]of[['notifications','notifications'],['history','history'],['about','info']]){const b=button('',()=>show(name));b.dataset.section=name;b.append(icon(symbol),e('span',t(name)));nav.append(b);}
        await show(section);
    }
    function mountMenu() {
        const menus=Array.from(document.querySelectorAll('[role="menu"]')).filter(x=>x.querySelector('a[href*="mypreferencesmenu"]'));
        for(const menu of menus){if(menu.querySelector('[data-jqn-user-menu]'))continue;const reference=menu.querySelector('a[href*="mypreferencesmenu"]');const link=e('a');link.href='#';link.className=reference.className;link.setAttribute('role','menuitem');link.tabIndex=-1;link.dataset.jqnUserMenu='';
            const iconWrap=e('div',null,reference.querySelector('div')?.className);iconWrap.append(icon('tune'));const text=reference.querySelector('.MuiListItemText-root')?.cloneNode(false)||e('div');text.append(e('span','Jelly QoL',reference.querySelector('span')?.className));link.append(iconWrap,text);link.addEventListener('click',event=>{event.preventDefault();menu.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));setTimeout(()=>openPanel(),0);});reference.after(link);
        }
        const visible=n=>n.getClientRects().length&&!n.closest('.hide,[hidden]');
        const sync=Array.from(document.querySelectorAll('.MuiToolbar-root [aria-controls="app-sync-play-menu"]')).find(visible);
        const avatar=Array.from(document.querySelectorAll('.MuiToolbar-root [aria-controls="app-user-menu"]')).find(visible);
        const host=sync?.parentElement||avatar?.closest('.MuiToolbar-root')||Array.from(document.querySelectorAll('.headerRight')).find(visible);
        let reference=sync||avatar;
        while(reference&&reference.parentElement!==host)reference=reference.parentElement;
        let bell=document.getElementById('jqn-bell');
        if(host&&!bell){bell=button('',()=>openNotifications(),'jqn-bell');bell.id='jqn-bell';bell.append(icon('notifications'),e('span','','jqn-badge'));host.insertBefore(bell,reference||host.firstChild);}
        if(bell){if(host&&bell.parentElement!==host)host.insertBefore(bell,reference||host.firstChild);bell.setAttribute('aria-label',t('notifications')+(feed?.Unread?' ('+feed.Unread+')':''));bell.title=t('notifications');bell.setAttribute('aria-haspopup','dialog');bell.setAttribute('aria-controls','jqn-popup');bell.setAttribute('aria-expanded',String(Boolean(popup)));const badge=bell.querySelector('.jqn-badge');const count=feed?.Unread>99?'99+':String(feed?.Unread||'');if(badge.textContent!==count)badge.textContent=count;badge.hidden=!feed?.Unread;}
    }
    async function refresh(){if(polling||!identity())return;polling=true;const key=identity();try{const value=await api();if(key!==identity())return;feed=value;mountMenu();}catch(_){/* Retry on the next poll without opening a panel. */}finally{polling=false;}}
    const payload = {notification_type:'{{notification_type}}',mediaType:'{{media_type}}',tmdbId:'{{media_tmdbid}}',tvdbId:'{{media_tvdbid}}',jellyfinMediaId:'{{media_jellyfinMediaId}}',request_id:'{{request_id}}',requestedBy_jellyfinUserId:'{{requestedBy_jellyfinUserId}}',requestedBy_username:'{{requestedBy_username}}','{{extra}}':[]};
    async function adminPanel(page){
        if(page.querySelector('#jqnAdminTab')||!page.dataset.mediahiderReady||!page.querySelector('#jqMediaTab'))return;
        const tab=button(t('admin'),()=>{} ,'emby-button');tab.id='jqnAdminTab';tab.setAttribute('role','tab');tab.setAttribute('aria-selected','false');tab.setAttribute('aria-controls','jqnAdminPanel');tab.tabIndex=-1;
        const panel=e('section');panel.id='jqnAdminPanel';panel.hidden=true;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);page.querySelector('[role=tablist]').append(tab);page.querySelector('.content-primary').append(panel);
        const oldTabs=Array.from(page.querySelectorAll('[role=tab]')).filter(x=>x!==tab);oldTabs.forEach(n=>n.addEventListener('click',()=>{panel.hidden=true;tab.setAttribute('aria-selected','false');tab.tabIndex=-1;}));
        tab.addEventListener('click',()=>{oldTabs.forEach(n=>{n.setAttribute('aria-selected','false');n.tabIndex=-1;page.querySelector('#'+n.getAttribute('aria-controls')).hidden=true;});panel.hidden=false;tab.setAttribute('aria-selected','true');tab.tabIndex=0;load();});
        oldTabs.forEach((n,index)=>n.addEventListener('keydown',event=>{if(event.key==='End'||event.key==='ArrowRight'&&index===oldTabs.length-1||event.key==='ArrowLeft'&&index===0){event.preventDefault();event.stopImmediatePropagation();tab.click();tab.focus();}},true));
        tab.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='Home'){event.preventDefault();oldTabs[0].click();oldTabs[0].focus();}if(event.key==='ArrowLeft'){event.preventDefault();oldTabs.at(-1).click();oldTabs.at(-1).focus();}});
        async function load(){panel.replaceChildren(e('h2',t('admin')),e('p',t('adminHelp')));const message=e('p','','jqn-status');message.setAttribute('role','status');panel.append(message);try{
            const data=await api('/Admin');if(!panel.isConnected)return;const form=e('form',null,'jqn-admin-form');panel.append(form);const o=data.Options;
            toggle(form,'Enabled',t('global'),o.Enabled);toggle(form,'Seerr',t('seerr'),o.Seerr);toggle(form,'Library',t('library'),o.Library);
            function field(label,value,type='text',readOnly=false){const wrap=e('label',null,'jqn-field');wrap.append(e('span',label));const input=e(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value;input.readOnly=readOnly;wrap.append(input);form.append(wrap);return input;}
            const days=field(t('days'),o.RetentionDays,'number');days.min='1';days.max='365';const mapping=field(t('mapping'),JSON.stringify(o.AccountMappings||{},null,2),'textarea');
            field(t('url'),window.ApiClient.getUrl('MediaHider/Notifications/Webhook'),'text',true);
            const secret=field(t('header'),o.Secret?'Bearer '+o.Secret:'','password',true);const copy=button(t('copy'),async()=>{try{await navigator.clipboard.writeText(secret.value);status(panel,t('copied'));}catch(_){secret.type='text';secret.select();}});form.append(copy);
            form.append(button(t('rotate'),async event=>{if(o.Secret&&!window.confirm(t('rotateConfirm')))return;event.currentTarget.disabled=true;try{const v=await api('/Secret',{});o.Secret=v.Secret;secret.value='Bearer '+v.Secret;}catch(_){status(panel,t('error'),true);}finally{event.currentTarget.disabled=false;}}));
            field(t('template'),JSON.stringify(payload,null,2),'textarea',true);
            const save=button(t('save'),()=>{},'jqn-button jqn-primary');save.type='submit';form.append(save);form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{const value={...o,RetentionDays:Number(days.value),AccountMappings:JSON.parse(mapping.value.trim()||'{}')};for(const input of form.querySelectorAll('input[type=checkbox]'))value[input.name]=input.checked;await api('/Admin',value);o.Secret=(await api('/Admin')).Options.Secret;secret.value='Bearer '+o.Secret;status(panel,t('saved'));await refresh();}catch(_){status(panel,t('error'),true);}finally{save.disabled=false;}});
            form.append(button(t('test'),async()=>{try{await api('/Test',{});await showPreview([{Ids:[],Name:'Jelly QoL',Type:'Movie',Count:1}]);}catch(_){status(panel,t('error'),true);}}),e('p',t('testHint'),'jqn-muted'));
            const diagnostic=e('section');diagnostic.append(e('h3',t('diagnostics')));const output=e('pre');const render=d=>{output.textContent=JSON.stringify({...d,LastWebhookStatus:t(({ready:'ready',waiting:'waiting',test:'testStatus',received:'received',none:'none'})[d.LastWebhookStatus]||'error')},null,2);};render(data.Diagnostics);diagnostic.append(output,button(t('refresh'),async()=>{try{render((await api('/Admin')).Diagnostics);}catch(_){status(panel,t('error'),true);}}));panel.append(diagnostic);
        }catch(_){status(panel,t('error'),true);}}
    }
    function cleanup(){dialog?.remove();popup?.remove();dialog=null;popup=null;feed=null;document.querySelectorAll('#jqn-bell,[data-jqn-user-menu],#jqnAdminTab,#jqnAdminPanel').forEach(n=>n.remove());}
    function sync(){const key=identity();if(key!==user){user=key;cleanup();if(key)refresh();}if(!key)return;mountMenu();const page=document.querySelector('#mediaHiderPage');if(page)adminPanel(page);}
    window.JellyQoLNotifications={open:openPanel,refresh:()=>refresh()};
    const style=e('style');style.id='jqn-style';style.textContent=`
.jqn-overlay{position:fixed;inset:0;z-index:1000000;background:#0009;backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}.jqn-dialog{width:min(1000px,94vw);height:min(700px,90dvh);background:#181a20;color:#f2f4fa;border:1px solid #ffffff1c;border-radius:18px;box-shadow:0 24px 80px #0009;display:flex;flex-direction:column;overflow:hidden;font:14px/1.6 system-ui,sans-serif}.jqn-dialog *{box-sizing:border-box}.jqn-dialog:focus{outline:none}.jqn-dialog header{display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid #ffffff13;background:#14161b}.jqn-dialog h2{margin:0;font-size:21px}.jqn-dialog h3{font-size:19px;margin:10px 0 14px}.jqn-dialog header h2{color:#75cffa}.jqn-dialog header button{padding:6px;line-height:1;display:flex}.jqn-panel-body{display:grid;grid-template-columns:230px minmax(0,1fr);min-height:0;flex:1}.jqn-panel-body nav{padding:16px 12px;background:#10121766;border-right:1px solid #ffffff12;display:flex;flex-direction:column;gap:5px}.jqn-panel-body nav button{display:flex;align-items:center;gap:12px;text-align:left;border:0;background:transparent;color:#bac2cf;padding:13px;border-radius:9px}.jqn-panel-body nav button[aria-current=page]{background:#37b4ed16;color:#75cffa;box-shadow:inset 3px 0 #42b9f1}.jqn-panel-body main{padding:20px 26px;overflow:auto;min-width:0}.jqn-button,.jqn-primary,.jqn-bell{font:inherit;cursor:pointer;color:inherit;background:#ffffff0d;border:1px solid #ffffff18;border-radius:9px;padding:9px 13px;text-decoration:none}.jqn-button:hover{background:#ffffff19}.jqn-button:disabled{opacity:.5;cursor:default}.jqn-primary{background:#127cad;color:#fff;border-color:transparent;display:inline-block}.jqn-dialog :focus-visible,#jqn-bell:focus-visible{outline:2px solid #75cffa;outline-offset:3px}.jqn-toggle{display:flex;gap:20px;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid #ffffff0d}.jqn-toggle input{appearance:auto;width:20px;height:20px;accent-color:#38b7ed;flex-shrink:0}.jqn-dialog form>.jqn-button{margin-top:20px}.jqn-muted{opacity:.65;font-size:13px}.jqn-status{white-space:pre-wrap;color:#78d2ac}.jqn-error{color:#ffb3af}.jqn-back{display:none}.jqn-card{display:flex;gap:16px;padding:16px 0;border-bottom:1px solid #ffffff15}.jqn-card>img{width:74px;height:111px;object-fit:cover;border-radius:8px;flex-shrink:0;background:#ffffff08}.jqn-card-body{min-width:0;flex:1}.jqn-card h3{font-size:17px;margin:3px 0;overflow-wrap:anywhere}.jqn-card small{color:#75cffa}.jqn-card p{margin:5px 0}.jqn-card time{font-size:11px;opacity:.6}.jqn-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px}.jqn-actions button,.jqn-actions a{font-size:12px}.jqn-read{opacity:.6}.jqn-popup-body{overflow:auto;min-height:0;padding:0 24px 20px}.jqn-dialog footer{padding:14px 22px;border-top:1px solid #ffffff13;flex-shrink:0}#jqn-popup .jqn-dialog{height:auto;max-height:85dvh;width:min(640px,94vw)}.jqn-bell{position:relative;box-sizing:border-box;width:44px;height:44px;min-width:44px;max-height:44px;flex:0 0 44px;align-self:center;justify-content:center;vertical-align:middle;margin:0;background:transparent;border:0;display:inline-flex;align-items:center;padding:10px;line-height:1}.jqn-badge{position:absolute;top:1px;right:0;background:#1499cb;border-radius:12px;font-size:10px;padding:0 5px;line-height:17px;color:white}.jqn-badge[hidden]{display:none}.jqn-admin-form{max-width:760px}.jqn-field{display:flex;flex-direction:column;gap:7px;margin:20px 0}.jqn-field input,.jqn-field textarea{font:inherit;background:#1b1b1b;color:#fff;border:1px solid #ffffff30;border-radius:7px;padding:12px;box-sizing:border-box;max-width:100%;width:100%}.jqn-field textarea{min-height:130px;font-family:monospace;font-size:12px}.jqn-admin-form button{margin-right:10px}#jqnAdminPanel pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0003;padding:16px;border-radius:10px}
@media(max-width:760px){.jqn-overlay{padding:0}.jqn-dialog{height:100dvh;width:100vw;border:0;border-radius:0}.jqn-panel-body{display:block;position:relative;overflow:hidden}.jqn-panel-body nav{position:absolute;inset:0}.jqn-panel-body main{position:absolute;inset:0;background:#181a20;display:none;padding:16px 20px}.jqn-pane-open main{display:block}.jqn-back{display:inline-block}.jqn-dialog header{padding:12px 18px}#jqn-popup{padding:12px}#jqn-popup .jqn-dialog{border:1px solid #ffffff18;border-radius:16px}.jqn-card>img{width:60px;height:90px}.jqn-card{gap:12px}}
.jqn-overlay.jqn-corner{inset:auto;top:max(64px,env(safe-area-inset-top));right:max(16px,env(safe-area-inset-right));bottom:auto;left:auto;display:block;padding:0!important;background:transparent;backdrop-filter:none;pointer-events:none;width:min(440px,calc(100vw - 24px));height:auto;max-height:calc(100dvh - 88px)}.jqn-corner .jqn-dialog{pointer-events:auto;box-sizing:border-box;width:100%!important;height:auto!important;max-height:min(600px,calc(100dvh - 88px))!important;border:1px solid #ffffff22!important;border-radius:16px!important;box-shadow:0 16px 48px #0007}.jqn-corner .jqn-dialog header{padding:12px 16px;flex-shrink:0}.jqn-corner .jqn-dialog h2{font-size:17px}.jqn-corner .jqn-popup-body{padding:0 16px 14px}.jqn-corner .jqn-dialog footer{padding:10px 16px;margin:0}.jqn-corner .jqn-card{gap:12px}.jqn-corner .jqn-card>img{width:52px;height:78px}.jqn-corner .jqn-card h3{font-size:15px}.jqn-corner .jqn-actions{gap:6px}@media(max-width:760px){.jqn-overlay.jqn-corner{top:max(60px,env(safe-area-inset-top));right:12px;max-height:calc(100dvh - 80px)}.jqn-corner .jqn-dialog{max-height:calc(100dvh - 80px)!important}}
@media(prefers-reduced-motion:reduce){.jqn-overlay *{scroll-behavior:auto}}
`;
    document.head.append(style);
    const observer=new MutationObserver(()=>{if(!mutationScheduled){mutationScheduled=true;clearTimeout(timer);timer=setTimeout(()=>{mutationScheduled=false;sync();},80);}});observer.observe(document.body,{childList:true,subtree:true});
    setInterval(sync,2000);setInterval(()=>{if(!document.hidden)refresh();},30000);window.addEventListener('hashchange',()=>{if(popup){popup.remove();popup=null;}sync();});window.addEventListener('pageshow',()=>{sync();});sync();
})();
