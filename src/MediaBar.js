(function () {
    'use strict';
    if (window.JellyQoLMediaBar) return;
    const api = () => window.ApiClient;
    const lang = () => /^pl/i.test(document.documentElement.lang || navigator.language);
    const words = () => lang() ? {featured:'Polecane z Twojej biblioteki',play:'Odtwórz',details:'Szczegóły',previous:'Poprzedni tytuł',next:'Następny tytuł',pause:'Wstrzymaj zmianę slajdów',resume:'Wznów zmianę slajdów',settings:'Ustawienia Media Bar',movie:'Film',series:'Serial',slide:'Tytuł'} : {featured:'Featured from your library',play:'Play',details:'Details',previous:'Previous title',next:'Next title',pause:'Pause slideshow',resume:'Resume slideshow',settings:'Media Bar settings',movie:'Movie',series:'Series',slide:'Title'};
    const normalize = value => String(value || '').replace(/-/g,'').toLowerCase();
    const validId = value => /^[a-f0-9]{32}$/i.test(normalize(value));
    const currentIdentity = () => {
        const route=location.hash.replace(/^#!?\/?/,'');
        return api()?.getCurrentUserId?.() && !/^(?:login|wizard|selectserver|addserver|quickconnect|forgotpassword|disclaimer)(?:\b|\/)/i.test(route) ? api().serverAddress()+':'+api().getCurrentUserId() : '';
    };
    const visible = node => Boolean(node && node.getClientRects().length && !node.closest('.hide,[hidden]'));
    const home = () => {
        const hash=location.hash.replace(/^#!?\/?/,'');const [route,query]=hash.split('?');
        if(route && route!=='home')return null;
        const tab=new URLSearchParams(query||'').get('tab');if(tab&&tab!=='0')return null;
        const node=document.querySelector('#homeTab');return visible(node)?node:null;
    };
    function otherBar() {
        return Array.from(document.querySelectorAll('#slides-container,#slidesContainer,#slideshow-container,#featuredContent,#featured-content,#featuredContentContainer,.featured-content-bar,[data-media-bar]')).some(visible);
    }
    let identity='',generation=0,loading=false,nextLoad=0,host=null,shadow=null,nodes=null,items=[],settings=null,current=0,lastRotation=0,paused=false,hovered=false,disposed=false,pendingPlay=null,scheduleTimer=null,prefSignature='',renderSignature='';
    let trailer=null,trailerPlayer=null,trailerTimer=null,trailerPoll=null,trailerSerial=0,trailersEnabled=false,trailerSignature='';
    const intervals=[],listeners=[];
    const e=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;};
    function icon(name) {
        const paths={play:'M8 5v14l11-7z',previous:'m15 5-7 7 7 7',next:'m9 5 7 7-7 7',pause:'M8 5v14M16 5v14',settings:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',info:'M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z'};
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
        const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]);path.setAttribute('fill',name==='play'||name==='star'?'currentColor':'none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.8');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;
    }
    function button(symbol,label,action) {const node=e('button');node.type='button';node.append(icon(symbol));node.setAttribute('aria-label',label);node.title=label;node.addEventListener('click',action);return node;}
    function remove() {stopTrailer();host?.remove();host=null;shadow=null;nodes=null;renderSignature='';hovered=false;}
    function reset() {generation++;loading=false;nextLoad=0;settings=null;items=[];current=0;paused=false;pendingPlay=null;prefSignature='';remove();}
    function imageUrl(id,type,width) {return api().getImageUrl(id,{type,maxWidth:width,quality:90});}
    function mount(pane) {
        if(host?.isConnected)return;
        remove();host=e('jelly-qol-media-bar');host.id='jelly-qol-media-bar';host.style.cssText='display:block!important;position:relative!important;isolation:isolate!important;box-sizing:border-box!important;min-width:0!important;width:100%!important;margin:16px 0 24px!important;z-index:0!important';
        shadow=host.attachShadow({mode:'open'});const style=e('style');style.textContent=css;shadow.append(style);
        const section=e('section');section.setAttribute('aria-roledescription','carousel');section.setAttribute('aria-label',words().featured);
        const backdrop=e('img',null,'backdrop');backdrop.alt='';backdrop.decoding='async';backdrop.draggable=false;
        const shade=e('div',null,'shade'),content=e('div',null,'content'),eyebrow=e('p',words().featured,'eyebrow'),logo=e('img',null,'logo');logo.alt='';logo.hidden=true;
        const title=e('h2'),meta=e('div',null,'meta'),overview=e('p',null,'overview'),actions=e('div',null,'actions');
        const play=e('button',null,'primary');play.type='button';play.append(icon('play'),e('span',words().play));play.addEventListener('click',()=>startPlayback());
        const details=e('a',null,'secondary');details.append(icon('info'),e('span',words().details));actions.append(play,details);
        content.append(eyebrow,logo,title,meta,overview,actions);
        const controls=e('div',null,'controls'),previous=button('previous',words().previous,()=>move(-1)),next=button('next',words().next,()=>move(1)),pause=button('pause',words().pause,()=>{paused=!paused;updatePause();lastRotation=Date.now();}),preferences=button('settings',words().settings,()=>window.JellyQoLNotifications?.open('appearance'));
        const count=e('span',null,'count');controls.append(previous,count,next,pause,preferences);
        const dots=e('div',null,'dots');dots.setAttribute('role','group');dots.setAttribute('aria-label',words().featured);
        const announcement=e('span',null,'sr-only');announcement.setAttribute('aria-live','polite');announcement.setAttribute('aria-atomic','true');
        section.append(backdrop,shade,content,controls,dots,announcement);shadow.append(section);pane.prepend(host);
        nodes={section,backdrop,logo,title,meta,overview,details,play,previous,next,pause,count,dots,announcement};
        section.addEventListener('pointerenter',()=>{hovered=true;});section.addEventListener('pointerleave',()=>{hovered=false;lastRotation=Date.now();});
        section.addEventListener('focusout',()=>{lastRotation=Date.now();});
        section.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();move(event.key==='ArrowLeft'?-1:1);}});
        render(true);
    }
    function updatePause() {
        if(!nodes)return;const stopped=paused||!settings?.AutoRotate;
        nodes.pause.replaceChildren(icon(stopped?'play':'pause'));nodes.pause.setAttribute('aria-label',stopped?words().resume:words().pause);nodes.pause.title=stopped?words().resume:words().pause;nodes.pause.setAttribute('aria-pressed',String(stopped));
    }
    function render(force=false) {
        if(!nodes||!items.length)return;
        const item=items[current],signature=JSON.stringify([item,settings,items.map(x=>x.Id),trailersEnabled,lang()]);if(!force&&signature===renderSignature)return;renderSignature=signature;
        nodes.section.classList.toggle('compact',Boolean(settings.Compact));nodes.section.setAttribute('aria-label',words().featured);
        const url=imageUrl(item.Id,'Backdrop',1920);nodes.backdrop.hidden=true;nodes.backdrop.onload=()=>{if(nodes?.backdrop.getAttribute('src')===url)nodes.backdrop.hidden=false;};nodes.backdrop.onerror=()=>{};nodes.backdrop.src=url;
        nodes.logo.hidden=true;nodes.title.hidden=false;
        if(item.HasLogo){const logoUrl=imageUrl(item.Id,'Logo',500);nodes.logo.onload=()=>{if(nodes?.logo.getAttribute('src')===logoUrl){nodes.logo.hidden=false;nodes.title.hidden=true;}};nodes.logo.onerror=()=>{if(nodes){nodes.logo.hidden=true;nodes.title.hidden=false;}};nodes.logo.src=logoUrl;}else nodes.logo.removeAttribute('src');
        nodes.title.textContent=item.Name;nodes.logo.alt=item.Name;nodes.meta.replaceChildren();
        const bits=[item.Type==='Series'?words().series:words().movie,item.Year,item.OfficialRating];
        for(const value of bits.filter(value=>value!=null&&value!==''))nodes.meta.append(e('span',String(value)));
        if(Number.isFinite(item.CommunityRating)&&item.CommunityRating>0){const rating=e('span',null,'rating');rating.append(icon('star'),e('span',item.CommunityRating.toFixed(1)));nodes.meta.append(rating);}
        if(Array.isArray(item.Genres))for(const genre of item.Genres.slice(0,2))nodes.meta.append(e('span',genre,'genre'));
        nodes.overview.textContent=item.Overview||'';nodes.overview.hidden=!settings.ShowOverview||!item.Overview;
        nodes.details.href='#/details?id='+encodeURIComponent(item.Id);
        nodes.count.textContent=(current+1)+' / '+items.length;nodes.previous.disabled=nodes.next.disabled=items.length<2;nodes.pause.hidden=items.length<2||!settings.AutoRotate;
        nodes.dots.replaceChildren();items.forEach((entry,index)=>{const dot=e('button');dot.type='button';dot.setAttribute('aria-label',words().slide+' '+(index+1)+': '+entry.Name);dot.setAttribute('aria-pressed',String(index===current));dot.addEventListener('click',()=>{current=index;lastRotation=Date.now();render();nodes.announcement.textContent=entry.Name;});nodes.dots.append(dot);});
        updatePause();lastRotation=Date.now();startTrailer(item);
    }
    function stopTrailer(){
        trailerSerial++;clearTimeout(trailerTimer);clearTimeout(trailerPoll);trailerTimer=trailerPoll=null;trailerSignature='';
        if(trailerPlayer){try{trailerPlayer.destroy();}catch(_){}trailerPlayer=null;}
        if(trailer?.tagName==='VIDEO'){try{trailer.pause();trailer.removeAttribute('src');trailer.load();}catch(_){}}
        trailer?.remove();trailer=null;
    }
    function startTrailer(item){
        const signature=JSON.stringify([item.Id,item.Trailer,trailersEnabled]);if(signature===trailerSignature)return;
        stopTrailer();trailerSignature=signature;
        if(!trailersEnabled||!item.Trailer||document.hidden||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
        const serial=trailerSerial,key=currentIdentity();
        const current=()=>!disposed&&serial===trailerSerial&&key===currentIdentity()&&nodes&&home();
        trailerTimer=setTimeout(()=>{
            if(!current())return;
            const descriptor=item.Trailer;
            if(descriptor.Kind==='local'&&validId(descriptor.ItemId)){
                const token=api().accessToken?.()||api().getAccessToken?.();if(!token)return;
                const video=e('video',null,'preview');trailer=video;video.muted=true;video.autoplay=true;video.playsInline=true;video.preload='none';video.setAttribute('aria-hidden','true');video.tabIndex=-1;
                video.addEventListener('playing',()=>{if(current())video.classList.add('playing');});video.addEventListener('ended',()=>{if(current())stopTrailer();});video.addEventListener('error',()=>{if(current())stopTrailer();});
                video.src=api().getUrl('Videos/'+descriptor.ItemId+'/stream',{Static:true,api_key:token});nodes.section.prepend(video);
                const promise=video.play();promise?.catch(()=>{if(current())stopTrailer();});
            }else if(descriptor.Kind==='youtube'&&/^[A-Za-z0-9_-]{11}$/.test(descriptor.YouTubeId||'')){
                const wrapper=e('div',null,'preview'),mount=e('div');wrapper.append(mount);trailer=wrapper;nodes.section.prepend(wrapper);
                // Reuse the standard SDK without replacing another plugin's global ready callback.
                if(!window.YT?.Player&&!document.querySelector('script[src*="youtube.com/iframe_api"],script[src*="youtube.com/player_api"]')){
                    const loader=e('script');loader.src='https://www.youtube.com/iframe_api';loader.async=true;loader.id='jqmb-youtube-api';document.head.append(loader);
                }
                const expires=Date.now()+12000;
                const ready=()=>{
                    if(!current())return;
                    if(window.YT?.Player){try{
                        trailerPlayer=new window.YT.Player(mount,{host:'https://www.youtube-nocookie.com',videoId:descriptor.YouTubeId,width:'100%',height:'100%',
                            playerVars:{autoplay:1,mute:1,controls:0,disablekb:1,playsinline:1,enablejsapi:1,origin:location.origin,rel:0},
                            events:{onReady:event=>{if(current()){event.target.mute();event.target.playVideo();}},onStateChange:event=>{if(!current())return;if(event.data===1)wrapper.classList.add('playing');if(event.data===0)stopTrailer();},onError:()=>{if(current())stopTrailer();}}});
                    }catch(_){if(current())stopTrailer();}}
                    else if(Date.now()<expires)trailerPoll=setTimeout(ready,100);
                    else stopTrailer();
                };ready();
            }
        },1200);
    }
    function move(direction,automatic=false) {if(items.length<2)return;current=(current+direction+items.length)%items.length;render();if(!automatic&&nodes)nodes.announcement.textContent=items[current].Name;}
    function startPlayback() {
        const item=items[current];if(!item||!currentIdentity())return;
        pendingPlay={id:normalize(item.Id),identity:currentIdentity(),expires:Date.now()+10000};location.hash='/details?id='+encodeURIComponent(item.Id);schedule();
    }
    function nativePlayback() {
        if(!pendingPlay)return;
        const hash=location.hash.replace(/^#!?\/?/,''),target=new URLSearchParams(hash.split('?')[1]||'').get('id');
        if(Date.now()>pendingPlay.expires||pendingPlay.identity!==currentIdentity()||!hash.startsWith('details?')||normalize(target)!==pendingPlay.id){pendingPlay=null;return;}
        const page=document.querySelector('#itemDetailPage');if(!visible(page))return;
        const bound=page.querySelector('.btnPlaystate[data-id]'),play=page.querySelector('button.btnPlay');
        if(normalize(bound?.dataset.id)!==pendingPlay.id||!visible(play)||play.disabled)return;
        pendingPlay=null;play.click();
    }
    async function load() {
        const pane=home(),key=currentIdentity();if(!pane||!key||loading||otherBar())return;
        loading=true;const requestGeneration=generation;nextLoad=Date.now()+30000;
        try{
            const data=await api().ajax({type:'GET',url:api().getUrl('MediaHider/Notifications/MediaBar'),dataType:'json'});
            if(disposed||key!==currentIdentity()||requestGeneration!==generation)return;
            const oldId=normalize(items[current]?.Id);settings=data.Settings||{};trailersEnabled=Boolean(data.TrailersEnabled);prefSignature=JSON.stringify(settings);
            items=Array.isArray(data.Items)?data.Items.filter(item=>validId(item.Id)&&['Movie','Series'].includes(item.Type)&&typeof item.Name==='string').slice(0,20):[];
            current=Math.max(0,items.findIndex(item=>normalize(item.Id)===oldId));
            if(!home()||otherBar()||!settings.Enabled||!items.length){remove();return;}
            mount(home());render();
        }catch(_){if(key===currentIdentity()&&requestGeneration===generation)remove();}
        finally{if(requestGeneration===generation)loading=false;}
    }
    function invalidate(){generation++;loading=false;nextLoad=0;settings=null;items=[];remove();schedule();}
    function update() {
        if(disposed)return;const key=currentIdentity();if(key!==identity){reset();identity=key;}if(!key)return;
        nativePlayback();const pane=home();
        if(!pane||otherBar()){remove();return;}
        if(Date.now()>=nextLoad&&!loading)load();
        if(settings?.Enabled&&items.length){mount(pane);render();}
        const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if(nodes&&settings?.AutoRotate&&!paused&&!hovered&&!document.hidden&&!reduced&&!shadow.activeElement&&Date.now()-lastRotation>=Math.max(5,settings.IntervalSeconds||10)*1000){
            const rect=host.getBoundingClientRect();if(rect.bottom>0&&rect.top<innerHeight)move(1,true);
        }
    }
    function schedule(){if(disposed||scheduleTimer)return;scheduleTimer=setTimeout(()=>{scheduleTimer=null;update();},60);}
    function listen(target,type,handler){target.addEventListener(type,handler);listeners.push([target,type,handler]);}
    const observer=new MutationObserver(schedule);
    const css=`
:host{color:#f6f7fa;font-family:Inter,system-ui,-apple-system,sans-serif}*{box-sizing:border-box}section{position:relative;display:block;isolation:isolate;min-width:0;min-height:390px;height:clamp(390px,36vw,520px);overflow:hidden;border-radius:18px;background:#15171d;border:1px solid #ffffff14;box-shadow:0 14px 38px #0003;color:#f6f7fa}section.compact{height:330px;min-height:330px}.preview{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;opacity:0;pointer-events:none;transition:opacity .35s;background:#090b10}.preview.playing{opacity:1}.preview iframe{width:100%;height:100%;border:0}.backdrop{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:65% 35%;z-index:-3}.shade{position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,#0a0c12f0 0%,#0a0c12b8 36%,#0a0c1233 75%),linear-gradient(0deg,#080a11cc,transparent 65%)}.content{position:absolute;left:clamp(24px,4vw,60px);right:38%;bottom:86px;max-width:650px}.eyebrow{font-size:11px;font-weight:650;letter-spacing:.12em;text-transform:uppercase;color:#e3e7edbb;margin:0 0 18px}.logo{display:block;max-width:min(330px,100%);max-height:100px;object-fit:contain;object-position:left center;margin-bottom:20px;filter:drop-shadow(0 3px 8px #0009)}h2{font-size:clamp(27px,3vw,46px);font-weight:750;line-height:1.1;letter-spacing:-.025em;margin:0 0 16px;text-shadow:0 3px 12px #0005;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 14px;font-size:12px;font-weight:550;color:#d7dce7}.meta>span{display:inline-flex;align-items:center;gap:4px}.meta .rating{color:#ffdc80}.meta .genre{border-left:1px solid #ffffff40;padding-left:12px}.meta svg{width:14px;height:14px}.overview{color:#e2e5ed;font-size:14px;line-height:1.65;margin:0 0 22px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;text-shadow:0 2px 6px #0005}button,a{font:inherit;-webkit-tap-highlight-color:transparent}button{cursor:pointer}.actions{display:flex;gap:10px;flex-wrap:wrap}.actions a,.actions button{display:inline-flex;gap:8px;align-items:center;justify-content:center;border-radius:9px;padding:11px 17px;min-height:44px;color:#fff;text-decoration:none;font-size:13px;font-weight:650;border:1px solid #ffffff22;background:#ffffff13;backdrop-filter:blur(8px);cursor:pointer}.actions .primary{background:var(--accentColor,#087fb4);border-color:transparent;box-shadow:0 5px 16px #0002}.actions a:hover,.actions button:hover{filter:brightness(1.18)}svg{display:block;width:20px;height:20px;flex-shrink:0}.controls{position:absolute;bottom:24px;left:clamp(24px,4vw,60px);display:flex;align-items:center;gap:8px}.controls button{display:flex;align-items:center;justify-content:center;width:36px;height:36px;padding:8px;border:1px solid #ffffff24;border-radius:50%;background:#0a0c1255;backdrop-filter:blur(8px);color:#f6f7fa}.controls button:hover:not(:disabled){background:#ffffff20}.controls button:disabled{opacity:.3;cursor:default}.controls .count{font-size:12px;min-width:40px;text-align:center;font-variant-numeric:tabular-nums;color:#e0e3ea}.dots{position:absolute;right:30px;bottom:37px;display:flex;gap:7px;align-items:center;max-width:40%;flex-wrap:wrap;justify-content:flex-end}.dots button{display:block;width:7px;height:7px;min-height:7px;border:0;border-radius:9px;padding:0;background:#ffffff55;transition:width .2s,background .2s}.dots button[aria-pressed=true]{width:24px;background:#fff}.dots button:hover{background:#fff}:focus-visible{outline:2px solid #fff;outline-offset:4px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}[hidden]{display:none!important}
@media(max-width:760px){section,section.compact{height:470px;min-height:470px;border-radius:14px}.backdrop{object-position:65% top}.shade{background:linear-gradient(0deg,#0a0c12f5 0%,#0a0c12c9 42%,#0a0c1222 100%)}.content{left:22px;right:22px;bottom:80px}.eyebrow{font-size:9px;margin-bottom:12px}.logo{max-width:230px;max-height:75px;margin-bottom:14px}h2{font-size:28px;margin-bottom:12px}.meta{font-size:11px;gap:6px 9px;margin-bottom:12px}.meta .genre{display:none}.overview{font-size:12px;line-height:1.6;-webkit-line-clamp:3;margin-bottom:16px}.actions a,.actions button{padding:10px 14px;min-height:42px;font-size:12px}.controls{left:22px;bottom:22px;gap:5px}.controls button{width:32px;height:32px;padding:7px}.controls .count{font-size:11px;min-width:33px}.dots{right:20px;bottom:35px;max-width:25%;gap:5px}.dots button{width:5px;height:5px;min-height:5px}.dots button[aria-pressed=true]{width:15px}}@media(max-width:360px){.dots{display:none}.meta{font-size:10px}.content{left:18px;right:18px}.controls{left:18px}}@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;
    function dispose(){disposed=true;clearTimeout(scheduleTimer);intervals.forEach(clearInterval);listeners.forEach(([target,type,handler])=>target.removeEventListener(type,handler));observer.disconnect();reset();}
    window.JellyQoLMediaBar={refresh:invalidate,dispose};
    observer.observe(document.body,{childList:true,subtree:true});
    listen(window,'hashchange',schedule);listen(window,'popstate',schedule);listen(window,'pageshow',schedule);listen(window,'resize',schedule);listen(document,'visibilitychange',()=>{if(document.hidden)stopTrailer();else if(nodes&&items.length)startTrailer(items[current]);schedule();});listen(document,'mediahider:changed',invalidate);
    listen(window,'jellyqol:features',event=>{if(currentIdentity()&&JSON.stringify(event.detail?.MediaBar||{})!==prefSignature)invalidate();});
    listen(window,'jellyqol:preferences',event=>{if(!currentIdentity())return;const enabled=Boolean(event.detail?.MediaBarTrailers);if(enabled!==trailersEnabled)invalidate();});
    intervals.push(setInterval(update,1000));schedule();
})();
