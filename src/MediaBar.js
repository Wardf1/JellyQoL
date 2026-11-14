(function () {
    'use strict';
    if (window.JellyQoLMediaBar) return;
    const api = () => window.ApiClient;
    const lang = () => /^pl/i.test(document.documentElement.lang || navigator.language);
    const words = () => lang() ? {trailer:'Uruchom trailer',stopTrailer:'Zatrzymaj trailer',sound:'Włącz dźwięk trailera',mute:'Wycisz trailer',featured:'Polecane z Twojej biblioteki',play:'Odtwórz',details:'Szczegóły',previous:'Poprzedni tytuł',next:'Następny tytuł',pause:'Wstrzymaj zmianę slajdów',resume:'Wznów zmianę slajdów',settings:'Ustawienia Media Bar',movie:'Film',series:'Serial',slide:'Tytuł'} : {trailer:'Play trailer',stopTrailer:'Stop trailer',sound:'Enable trailer sound',mute:'Mute trailer',featured:'Featured from your library',play:'Play',details:'Details',previous:'Previous title',next:'Next title',pause:'Pause slideshow',resume:'Resume slideshow',settings:'Media Bar settings',movie:'Movie',series:'Series',slide:'Title'};
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
    let trailer=null,trailerPlayer=null,trailerTimer=null,trailerPoll=null,trailerSerial=0,trailersEnabled=false,trailerSignature='',trailerAutoplay=true,trailerDelay=2,trailerFrame=null,trailerPlaying=false,trailerMuted=true,trailerActive=false,trailerWatchdog=null,trailerSizeObserver=null,trailerSound=false,preloaded=[],outgoing=null,transitionTimer=null,transitionSerial=0,lastItemId='',transitionDirection=1;
    const intervals=[],listeners=[];
    const e=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;};
    function icon(name) {
        const paths={play:'M8 5v14l11-7z',trailer:'M4 4h16v16H4zM4 9h16M8 4l3 5m3-5 3 5M10 12v5l4-2.5z',sound:'M4 9h4l5-4v14l-5-4H4zM17 8q6 4 0 8',muted:'M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6',stop:'M6 6h12v12H6z',previous:'m15 5-7 7 7 7',next:'m9 5 7 7-7 7',pause:'M8 5v14M16 5v14',settings:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',info:'M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z'};
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
        const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]);path.setAttribute('fill',name==='play'||name==='star'?'currentColor':'none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.8');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;
    }
    function button(symbol,label,action) {const node=e('button');node.type='button';node.append(icon(symbol));node.setAttribute('aria-label',label);node.title=label;node.addEventListener('click',action);return node;}
    function remove() {clearOutgoing();lastItemId='';stopTrailer();host?.remove();host=null;shadow=null;nodes=null;renderSignature='';hovered=false;}
    function reset() {generation++;loading=false;nextLoad=0;settings=null;items=[];current=0;paused=false;pendingPlay=null;prefSignature='';remove();}
    function imageUrl(id,type,width) {return api().getImageUrl(id,{type,maxWidth:width,quality:90});}
    function mount(pane) {
        if(host?.isConnected)return;
        remove();host=e('jelly-qol-media-bar');host.id='jelly-qol-media-bar';host.style.cssText='display:block!important;position:relative!important;isolation:isolate!important;box-sizing:border-box!important;min-width:0!important;width:100%!important;margin:16px 0 24px!important;z-index:0!important';
        shadow=host.attachShadow({mode:'open'});const style=e('style');style.textContent=css;shadow.append(style);
        const section=e('section');section.setAttribute('aria-roledescription','carousel');section.setAttribute('aria-label',words().featured);
        const backdrop=e('img',null,'backdrop');backdrop.alt='';backdrop.decoding='async';backdrop.draggable=false;
        const scene=e('div',null,'scene'),artwork=e('div',null,'artwork'),soften=e('div',null,'soften'),blend=e('div',null,'blend'),shade=e('div',null,'shade'),content=e('div',null,'content'),eyebrow=e('p',words().featured,'eyebrow'),logo=e('img',null,'logo');logo.alt='';logo.hidden=true;
        const title=e('h2'),meta=e('div',null,'meta'),overview=e('p',null,'overview'),actions=e('div',null,'actions');
        const play=e('button',null,'primary');play.type='button';play.append(icon('play'),e('span',words().play));play.addEventListener('click',()=>startPlayback());
        const details=e('a',null,'secondary');details.append(icon('info'),e('span',words().details));actions.append(play,details);
        content.append(eyebrow,logo,title,meta,overview,actions);
        const controls=e('div',null,'controls'),previous=button('previous',words().previous,()=>move(-1)),next=button('next',words().next,()=>move(1)),pause=button('pause',words().pause,()=>{paused=!paused;updatePause();lastRotation=Date.now();}),preferences=button('settings',words().settings,()=>window.JellyQoLNotifications?.open('appearance'));
        const count=e('span',null,'count');const preview=button('trailer',words().trailer,()=>{if(trailerActive){stopTrailer();}else startTrailer(items[current],true);}),sound=button('sound',words().sound,()=>{
            trailerMuted=!trailerMuted;if(trailer?.tagName==='VIDEO')trailer.muted=trailerMuted;
            if(trailerPlayer){try{trailerMuted?trailerPlayer.mute():trailerPlayer.unMute();trailerPlayer.playVideo();}catch(_){}}
            sound.title=trailerMuted?words().sound:words().mute;sound.setAttribute('aria-label',sound.title);sound.setAttribute('aria-pressed',String(!trailerMuted));sound.replaceChildren(icon(trailerMuted?'muted':'sound'));
        });preview.hidden=sound.hidden=true;controls.append(previous,count,next,pause,preview,sound,preferences);
        const dots=e('div',null,'dots');dots.setAttribute('role','group');dots.setAttribute('aria-label',words().featured);
        const announcement=e('span',null,'sr-only');announcement.setAttribute('aria-live','polite');announcement.setAttribute('aria-atomic','true');
        artwork.append(backdrop);scene.append(artwork,soften,shade,blend);section.append(scene,content,controls,dots,announcement);
        const spacing=e('style');spacing.textContent='#homeTab > #jelly-qol-media-bar + .homeSectionsContainer{padding-top:12px!important;margin-top:0!important}#homeTab > #jelly-qol-media-bar + .homeSectionsContainer > :first-child{margin-top:0!important;padding-top:0!important}';host.append(spacing);shadow.append(section);pane.prepend(host);
        nodes={section,scene,content,backdrop,logo,title,meta,overview,details,play,previous,next,pause,preview,sound,count,dots,announcement};
        section.addEventListener('pointerenter',()=>{hovered=true;});section.addEventListener('pointerleave',()=>{hovered=false;lastRotation=Date.now();});
        section.addEventListener('focusout',()=>{lastRotation=Date.now();});
        section.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();move(event.key==='ArrowLeft'?-1:1);}});
        let touch=null;
        section.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')touch={x:event.clientX,y:event.clientY};});
        section.addEventListener('pointerup',event=>{if(!touch)return;const dx=event.clientX-touch.x,dy=event.clientY-touch.y;touch=null;if(Math.abs(dx)>=settings.MinSwipeDistance&&Math.abs(dx)>Math.abs(dy)*1.4)move(dx<0?1:-1);});
        section.addEventListener('pointercancel',()=>{touch=null;});
        render(true);
    }
    function updatePause() {
        if(!nodes)return;const stopped=paused||!settings?.AutoRotate;
        nodes.pause.replaceChildren(icon(stopped?'play':'pause'));nodes.pause.setAttribute('aria-label',stopped?words().resume:words().pause);nodes.pause.title=stopped?words().resume:words().pause;nodes.pause.setAttribute('aria-pressed',String(stopped));
    }
    function render(force=false) {
        if(!nodes||!items.length)return;
        const item=items[current],signature=JSON.stringify([item,settings,items.map(x=>x.Id),trailersEnabled,trailerAutoplay,trailerDelay,trailerSound,lang()]);if(!force&&signature===renderSignature)return;renderSignature=signature;
        prepareTransition(item.Id);
        const banner=settings.Layout!=='card';nodes.section.classList.toggle('banner',banner);
        host.style.setProperty('margin',banner?'calc(-1 * var(--jqmb-header-height,0px)) 0 0':'16px 0 0','important');alignHeader();
        nodes.section.style.setProperty('--banner-height',(settings.Height||78)+'svh');
        nodes.section.style.setProperty('--backdrop-position','center '+({top:'top',center:'center',bottom:'bottom'}[settings.BackdropPosition]||'top'));
        nodes.section.style.setProperty('--fade-duration','1400ms');
        nodes.overview.style.webkitLineClamp=String(settings.OverviewLines||3);
        nodes.dots.hidden=settings.ShowDots===false;nodes.play.parentElement.hidden=settings.ShowButtons===false;
        nodes.section.classList.toggle('compact',Boolean(settings.Compact));nodes.section.setAttribute('aria-label',words().featured);
        const url=imageUrl(item.Id,'Backdrop',1920),image=nodes.backdrop;
        image.onload=()=>{if(nodes?.backdrop!==image)return;image.hidden=false;revealTransition();};image.onerror=()=>{if(nodes?.backdrop===image)revealTransition();};
        if(image.getAttribute('src')!==url){image.hidden=true;image.src=url;}
        else if(image.complete&&image.naturalWidth){image.hidden=false;revealTransition();}
        nodes.logo.hidden=true;nodes.title.hidden=false;
        if(item.HasLogo&&settings.ShowLogo!==false){const logoUrl=imageUrl(item.Id,'Logo',500);nodes.logo.onload=()=>{if(nodes?.logo.getAttribute('src')===logoUrl){nodes.logo.hidden=false;nodes.title.hidden=true;}};nodes.logo.onerror=()=>{if(nodes){nodes.logo.hidden=true;nodes.title.hidden=false;}};nodes.logo.src=logoUrl;}else nodes.logo.removeAttribute('src');
        nodes.title.textContent=item.Name;nodes.logo.alt=item.Name;nodes.meta.replaceChildren();
        const bits=[item.Type==='Series'?words().series:words().movie,item.Year,item.OfficialRating];
        for(const value of bits.filter(value=>value!=null&&value!==''))nodes.meta.append(e('span',String(value)));
        if(settings.ShowRating!==false&&Number.isFinite(item.CommunityRating)&&item.CommunityRating>0){const rating=e('span',null,'rating');rating.append(icon('star'),e('span',item.CommunityRating.toFixed(1)));nodes.meta.append(rating);}
        if(settings.ShowGenres!==false&&Array.isArray(item.Genres))for(const genre of item.Genres.slice(0,2))nodes.meta.append(e('span',genre,'genre'));
        nodes.overview.textContent=item.Overview||'';nodes.overview.hidden=!settings.ShowOverview||!item.Overview;
        nodes.details.href='#/details?id='+encodeURIComponent(item.Id);
        nodes.count.textContent=(current+1)+' / '+items.length;nodes.previous.disabled=nodes.next.disabled=items.length<2;nodes.pause.hidden=items.length<2||!settings.AutoRotate;
        nodes.dots.replaceChildren();items.forEach((entry,index)=>{const dot=e('button');dot.type='button';dot.setAttribute('aria-label',words().slide+' '+(index+1)+': '+entry.Name);dot.setAttribute('aria-pressed',String(index===current));dot.addEventListener('click',()=>{transitionDirection=index>=current?1:-1;current=index;lastRotation=Date.now();render();nodes.announcement.textContent=entry.Name;});nodes.dots.append(dot);});
        nodes.preview.hidden=!trailersEnabled||!item.Trailer;
        preloaded=[];for(let n=1;n<=Math.min(settings.PreloadCount??2,items.length-1);n++){const img=new Image();img.src=imageUrl(items[(current+n)%items.length].Id,'Backdrop',1920);preloaded.push(img);}
        updatePause();lastRotation=Date.now();startTrailer(item);
    }
    function clearOutgoing(){
        transitionSerial++;clearTimeout(transitionTimer);transitionTimer=null;
        if(outgoing){outgoing.observer?.disconnect();try{outgoing.player?.destroy();}catch(_){}
            if(outgoing.video?.tagName==='VIDEO'){try{outgoing.video.pause();outgoing.video.removeAttribute('src');outgoing.video.load();}catch(_){}}
            outgoing.frame?.remove();outgoing.scene.remove();outgoing.content.remove();outgoing=null;}
        if(nodes){nodes.scene.style.opacity='1';nodes.content.style.opacity='1';nodes.content.style.pointerEvents='';nodes.scene.style.transform=nodes.content.style.transform='';nodes.scene.style.transition=nodes.content.style.transition='none';}
    }
    function prepareTransition(id){
        const changed=lastItemId&&normalize(id)!==lastItemId;lastItemId=normalize(id);if(!changed||!nodes)return;
        // Keep the last rendered image available during rapid navigation or slow image loads.
        if(outgoing&&(!nodes.backdrop.complete||!nodes.backdrop.naturalWidth)){
            const old=outgoing.scene.querySelector('.backdrop');if(old?.getAttribute('src')){nodes.backdrop.src=old.getAttribute('src');nodes.backdrop.hidden=false;}
        }
        clearOutgoing();
        const scene=nodes.scene,content=nodes.content.cloneNode(true),frame=trailerFrame,player=trailerPlayer,video=trailer,observer=trailerSizeObserver;
        const shifted=scene.classList.contains('has-trailer');
        if(video?.tagName==='VIDEO'){try{video.muted=true;video.pause();}catch(_){}}
        try{player?.mute();}catch(_){}
        trailer=null;trailerFrame=null;trailerPlayer=null;trailerSizeObserver=null;stopTrailer();
        scene.classList.toggle('has-trailer',shifted);
        content.inert=true;content.setAttribute('aria-hidden','true');content.style.pointerEvents='none';content.classList.add('outgoing-content');nodes.section.append(content);
        const next=e('div',null,'scene'),backdrop=nodes.backdrop.cloneNode(false);backdrop.onload=backdrop.onerror=null;
        const artwork=e('div',null,'artwork');artwork.append(backdrop);next.append(artwork,scene.querySelector('.soften').cloneNode(false),scene.querySelector('.shade').cloneNode(false),scene.querySelector('.blend').cloneNode(false));scene.after(next);
        outgoing={scene,content,frame,player,video,observer};nodes.scene=next;nodes.backdrop=backdrop;
        next.style.opacity='0';next.style.transform='translateX('+(transitionDirection*4)+'%)';nodes.content.style.opacity='0';nodes.content.style.transform='translateX('+(transitionDirection*16)+'px)';nodes.content.style.pointerEvents='none';
    }
    function revealTransition(){
        if(!outgoing||!nodes)return;const serial=transitionSerial;
        const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,duration=reduced?0:1400;
        const incoming=nodes.scene,content=nodes.content,old=outgoing;
        // Flush the starting opacity before changing it, even for cached artwork.
        incoming.getBoundingClientRect();
        for(const node of [incoming,old.scene])node.style.transition='opacity '+duration+'ms ease-in-out,transform '+duration+'ms cubic-bezier(.22,.61,.36,1)';
        content.style.transition=reduced?'none':'opacity 700ms ease-out 350ms,transform 1050ms cubic-bezier(.22,.61,.36,1) 200ms';
        old.content.style.transition=reduced?'none':'opacity 350ms ease-out,transform 700ms ease-out';
        incoming.style.opacity='1';content.style.opacity='1';incoming.style.transform=content.style.transform='translateX(0)';old.scene.style.transform='translateX('+(-transitionDirection*4)+'%)';old.content.style.transform='translateX('+(-transitionDirection*16)+'px)';content.style.pointerEvents='';old.scene.style.opacity='0';old.content.style.opacity='0';
        clearTimeout(transitionTimer);transitionTimer=setTimeout(()=>{if(serial===transitionSerial)clearOutgoing();},duration+40);
    }
    function stopTrailer(){
        nodes?.scene.classList.remove('has-trailer');trailerActive=false;trailerPlaying=false;trailerMuted=true;clearTimeout(trailerWatchdog);trailerWatchdog=null;trailerSizeObserver?.disconnect();trailerSizeObserver=null;if(nodes){nodes.sound.hidden=true;nodes.sound.replaceChildren(icon('muted'));nodes.sound.setAttribute('aria-pressed','false');nodes.sound.title=words().sound;nodes.sound.setAttribute('aria-label',words().sound);nodes.preview.replaceChildren(icon('trailer'));nodes.preview.title=words().trailer;nodes.preview.setAttribute('aria-label',words().trailer);}lastRotation=Date.now();
        trailerFrame?.remove();trailerFrame=null;
        trailerSerial++;clearTimeout(trailerTimer);clearTimeout(trailerPoll);trailerTimer=trailerPoll=null;trailerSignature='';
        if(trailerPlayer){try{trailerPlayer.destroy();}catch(_){}trailerPlayer=null;}
        if(trailer?.tagName==='VIDEO'){try{trailer.pause();trailer.removeAttribute('src');trailer.load();}catch(_){}}
        trailer?.remove();trailer=null;
    }
    function startTrailer(item,manual=false){
        const signature=JSON.stringify([item.Id,item.Trailer,trailersEnabled,trailerAutoplay,trailerDelay,trailerSound]);if(!manual&&signature===trailerSignature)return;
        stopTrailer();trailerSignature=signature;
        if(!trailersEnabled||!item.Trailer||document.hidden||(!manual&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches))return;
        trailerActive=true;const serial=trailerSerial,key=currentIdentity();
        const playing=()=>{nodes?.scene.classList.add('has-trailer');if(outgoing)revealTransition();trailerPlaying=true;clearTimeout(trailerWatchdog);if(nodes){nodes.sound.replaceChildren(icon(trailerMuted?'muted':'sound'));nodes.sound.hidden=false;nodes.preview.title=words().stopTrailer;nodes.preview.setAttribute('aria-label',words().stopTrailer);}};
        if(nodes){nodes.preview.replaceChildren(icon('stop'));nodes.preview.title=words().stopTrailer;nodes.preview.setAttribute('aria-label',words().stopTrailer);}
        const current=()=>!disposed&&serial===trailerSerial&&key===currentIdentity()&&nodes&&home();
        trailerTimer=setTimeout(()=>{
            if(!current())return;
            trailerWatchdog=setTimeout(()=>{if(current()&&!trailerPlaying)stopTrailer();},20000);
            const descriptor=item.Trailer;
            if(descriptor.Kind==='local'&&validId(descriptor.ItemId)){
                const token=api().accessToken?.()||api().getAccessToken?.();if(!token){stopTrailer();return;}
                const video=e('video',null,'preview');trailer=video;video.muted=!trailerSound;trailerMuted=video.muted;video.autoplay=true;video.playsInline=true;video.preload='none';video.setAttribute('aria-hidden','true');video.tabIndex=-1;
                video.addEventListener('playing',()=>{if(current()){video.classList.add('playing');playing();}});video.addEventListener('ended',()=>{if(current())stopTrailer();});video.addEventListener('error',()=>{if(current())stopTrailer();});
                video.src=api().getUrl('Videos/'+descriptor.ItemId+'/stream',{Static:true,api_key:token});nodes.scene.prepend(video);
                video.addEventListener('loadedmetadata',()=>{for(const track of Array.from(video.textTracks||[]))track.mode='disabled';});video.textTracks?.addEventListener?.('addtrack',event=>{event.track.mode='disabled';});
                const promise=video.play();promise?.catch(()=>{if(!current())return;if(!video.muted){video.muted=true;trailerMuted=true;video.play()?.catch(()=>{if(current())stopTrailer();});}else stopTrailer();});
            }else if(descriptor.Kind==='youtube'&&/^[A-Za-z0-9_-]{11}$/.test(descriptor.YouTubeId||'')){
                const wrapper=e('div',null,'preview'),slot=e('slot');slot.name='youtube-preview-'+serial;wrapper.append(slot);trailer=wrapper;nodes.scene.prepend(wrapper);
                // The SDK resolves iframe IDs through document, so keep the iframe in the light DOM.
                const frame=e('iframe');frame.id='jqmb-yt-'+serial;frame.slot=slot.name;frame.title=words().trailer;
                frame.allow='autoplay; encrypted-media; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';
                frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
                frame.style.cssText='display:block!important;position:absolute!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;border:0!important;pointer-events:none!important';
                const fit=()=>{const rect=wrapper.getBoundingClientRect(),width=rect.width||1,height=rect.height||1;frame.style.setProperty('width',Math.max(width,height*16/9)+'px','important');frame.style.setProperty('height',Math.max(height,width*9/16)+'px','important');};
                if(window.ResizeObserver){trailerSizeObserver=new ResizeObserver(fit);trailerSizeObserver.observe(wrapper);}fit();
                const params=new URLSearchParams({autoplay:'1',mute:'1',controls:'0',cc_load_policy:'0',fs:'0',iv_load_policy:'3',disablekb:'1',playsinline:'1',enablejsapi:'1',origin:location.origin,rel:'0'});
                frame.src='https://www.youtube-nocookie.com/embed/'+descriptor.YouTubeId+'?'+params;
                trailerFrame=frame;host.append(frame);
                // Reuse the standard SDK without replacing another plugin's global ready callback.
                if(!window.YT?.Player&&!document.querySelector('script[src*="youtube.com/iframe_api"],script[src*="youtube.com/player_api"]')){
                    const loader=e('script');loader.src='https://www.youtube.com/iframe_api';loader.async=true;loader.id='jqmb-youtube-api';document.head.append(loader);
                }
                let soundFallbackUsed=false;
                const soundFallback=target=>{if(!current()||soundFallbackUsed||!trailerSound||trailerMuted)return;soundFallbackUsed=true;trailerMuted=true;try{target.mute();target.playVideo();}catch(_){}if(trailerPlaying)playing();};
                const expires=Date.now()+12000;
                const ready=()=>{
                    if(!current())return;
                    if(window.YT?.Player){try{
                        trailerPlayer=new window.YT.Player(frame,{host:'https://www.youtube-nocookie.com',videoId:descriptor.YouTubeId,width:'100%',height:'100%',
                            playerVars:{autoplay:1,mute:1,controls:0,cc_load_policy:0,fs:0,iv_load_policy:3,disablekb:1,playsinline:1,enablejsapi:1,origin:location.origin,rel:0},
                            events:{onAutoplayBlocked:event=>soundFallback(event.target),onApiChange:event=>{if(current())disableCaptions(event.target);},onReady:event=>{if(current()){disableCaptions(event.target);event.target.mute();if(trailerSound){trailerMuted=false;event.target.unMute();}event.target.playVideo();}},onStateChange:event=>{if(!current())return;if(event.data===1){disableCaptions(event.target||trailerPlayer);wrapper.classList.add('playing');playing();}if(event.data===2||event.data===3)wrapper.classList.remove('playing');if(event.data===2)soundFallback(event.target||trailerPlayer);if(event.data===0)stopTrailer();},onError:()=>{if(current())stopTrailer();}}});
                    }catch(_){if(current())stopTrailer();}}
                    else if(Date.now()<expires)trailerPoll=setTimeout(ready,100);
                    else stopTrailer();
                };ready();
            }
        },manual?0:trailerDelay*1000);
    }
    const captionsDisabled=new WeakSet();
    function disableCaptions(player){
        if(!player||captionsDisabled.has(player))return;
        try{if(player.getOptions&&!player.getOptions().includes('captions'))return;}catch(_){}
        captionsDisabled.add(player);
        try{player?.setOption?.('captions','track',{});}catch(_){}
        try{player?.unloadModule?.('captions');}catch(_){}
    }
    function move(direction,automatic=false) {if(items.length<2)return;transitionDirection=direction>=0?1:-1;current=(current+direction+items.length)%items.length;render();if(!automatic&&nodes)nodes.announcement.textContent=items[current].Name;}
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
            const oldId=normalize(items[current]?.Id);settings=data.Settings||{};trailersEnabled=Boolean(data.TrailersEnabled);trailerAutoplay=true;trailerSound=Boolean(data.TrailerSound);trailerDelay=Number.isFinite(data.TrailerDelay)?data.TrailerDelay:2;prefSignature=JSON.stringify(settings);
            items=Array.isArray(data.Items)?data.Items.filter(item=>validId(item.Id)&&['Movie','Series'].includes(item.Type)&&typeof item.Name==='string').slice(0,20):[];
            current=Math.max(0,items.findIndex(item=>normalize(item.Id)===oldId));
            if(!home()||otherBar()||!settings.Enabled||!items.length){remove();return;}
            mount(home());render();
        }catch(_){if(key===currentIdentity()&&requestGeneration===generation)remove();}
        finally{if(requestGeneration===generation)loading=false;}
    }
    function invalidate(){generation++;loading=false;nextLoad=0;settings=null;items=[];remove();schedule();}
    function alignHeader(){
        if(!host||settings?.Layout==='card')return;
        const header=document.querySelector('header.MuiAppBar-root.MuiAppBar-positionFixed');
        const height=header?.querySelector('.MuiToolbar-root.padded-left.padded-right')?Math.ceil(header.getBoundingClientRect().height):0;
        const value=height+'px';if(host.style.getPropertyValue('--jqmb-header-height')!==value)host.style.setProperty('--jqmb-header-height',value);
    }
    function update() {
        if(disposed)return;const key=currentIdentity();if(key!==identity){reset();identity=key;}if(!key)return;
        nativePlayback();const pane=home();
        if(!pane||otherBar()){remove();return;}
        if(Date.now()>=nextLoad&&!loading)load();
        if(settings?.Enabled&&items.length){mount(pane);render();alignHeader();}
        const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if(nodes&&settings?.AutoRotate&&!trailerActive&&!paused&&!hovered&&!document.hidden&&!reduced&&!shadow.activeElement&&Date.now()-lastRotation>=Math.max(5,settings.IntervalSeconds||10)*1000){
            const rect=host.getBoundingClientRect();if(rect.bottom>0&&rect.top<innerHeight)move(1,true);
        }
    }
    function schedule(){if(disposed||scheduleTimer)return;scheduleTimer=setTimeout(()=>{scheduleTimer=null;update();},60);}
    function listen(target,type,handler){target.addEventListener(type,handler);listeners.push([target,type,handler]);}
    try{window.CSS?.registerProperty?.({name:'--jqmb-photo-cut',syntax:'<number>',inherits:false,initialValue:'0'});}catch(_){}
    const observer=new MutationObserver(schedule);
    const css=`
:host{color:#f6f7fa;font-family:Inter,system-ui,-apple-system,sans-serif}*{box-sizing:border-box}section{position:relative;display:block;isolation:isolate;min-width:0;min-height:390px;height:clamp(390px,36vw,520px);overflow:hidden;border-radius:18px;background:#15171d;border:1px solid #ffffff14;box-shadow:0 14px 38px #0003;color:#f6f7fa}section.compact{height:330px;min-height:330px}.preview{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;opacity:0;pointer-events:none;transition:opacity .35s;background:#090b10}.preview.playing{opacity:1}.preview iframe{width:100%;height:100%;border:0}.backdrop{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:65% 35%;z-index:-3}.shade{position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,#0a0c12f0 0%,#0a0c12b8 36%,#0a0c1233 75%),linear-gradient(0deg,#080a11cc,transparent 65%)}.content{position:absolute;left:clamp(24px,4vw,60px);right:38%;bottom:86px;max-width:650px}.eyebrow{font-size:11px;font-weight:650;letter-spacing:.12em;text-transform:uppercase;color:#e3e7edbb;margin:0 0 18px}.logo{display:block;max-width:min(330px,100%);max-height:100px;object-fit:contain;object-position:left center;margin-bottom:20px;filter:drop-shadow(0 3px 8px #0009)}h2{font-size:clamp(27px,3vw,46px);font-weight:750;line-height:1.1;letter-spacing:-.025em;margin:0 0 16px;text-shadow:0 3px 12px #0005;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 14px;font-size:12px;font-weight:550;color:#d7dce7}.meta>span{display:inline-flex;align-items:center;gap:4px}.meta .rating{color:#ffdc80}.meta .genre{border-left:1px solid #ffffff40;padding-left:12px}.meta svg{width:14px;height:14px}.overview{color:#e2e5ed;font-size:14px;line-height:1.65;margin:0 0 22px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;text-shadow:0 2px 6px #0005}button,a{font:inherit;-webkit-tap-highlight-color:transparent}button{cursor:pointer}.actions{display:flex;gap:10px;flex-wrap:wrap}.actions a,.actions button{display:inline-flex;gap:8px;align-items:center;justify-content:center;border-radius:9px;padding:11px 17px;min-height:44px;color:#fff;text-decoration:none;font-size:13px;font-weight:650;border:1px solid #ffffff22;background:#ffffff13;backdrop-filter:blur(8px);cursor:pointer}.actions .primary{background:var(--accentColor,#087fb4);border-color:transparent;box-shadow:0 5px 16px #0002}.actions a:hover,.actions button:hover{filter:brightness(1.18)}svg{display:block;width:20px;height:20px;flex-shrink:0}.controls{position:absolute;bottom:24px;left:clamp(24px,4vw,60px);display:flex;align-items:center;gap:8px}.controls button{display:flex;align-items:center;justify-content:center;width:36px;height:36px;padding:8px;border:1px solid #ffffff24;border-radius:50%;background:#0a0c1255;backdrop-filter:blur(8px);color:#f6f7fa}.controls button:hover:not(:disabled){background:#ffffff20}.controls button:disabled{opacity:.3;cursor:default}.controls .count{font-size:12px;min-width:40px;text-align:center;font-variant-numeric:tabular-nums;color:#e0e3ea}.dots{position:absolute;right:30px;bottom:37px;display:flex;gap:7px;align-items:center;max-width:40%;flex-wrap:wrap;justify-content:flex-end}.dots button{display:block;width:7px;height:7px;min-height:7px;border:0;border-radius:9px;padding:0;background:#ffffff55;transition:width .2s,background .2s}.dots button[aria-pressed=true]{width:24px;background:#fff}.dots button:hover{background:#fff}:focus-visible{outline:2px solid #fff;outline-offset:4px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}[hidden]{display:none!important}
section.banner{height:clamp(470px,var(--banner-height,78svh),1000px);min-height:470px;border:0;border-radius:0;box-shadow:none;background:transparent}section.banner.compact{height:clamp(400px,60svh,680px);min-height:400px}.banner .content{bottom:110px;right:42%;max-width:740px}.banner .logo{max-width:min(420px,100%);max-height:150px}.banner .controls{bottom:42px}.banner .dots{bottom:55px}.banner .shade{background:linear-gradient(90deg,#080a11d9 0%,#080a1199 35%,#080a1111 80%),linear-gradient(0deg,#080a11e6 0%,transparent 40%)}.backdrop{object-position:var(--backdrop-position,center top);transition:opacity var(--fade-duration,350ms)}.backdrop[hidden]{display:block!important;opacity:0}.backdrop:not([hidden]){opacity:1}.preview{transition-duration:var(--fade-duration,350ms)}.preview slot{display:block;width:100%;height:100%}section{touch-action:pan-y}
@media(max-width:760px){section,section.compact{height:470px;min-height:470px;border-radius:14px}.backdrop{object-position:65% top}.shade{background:linear-gradient(0deg,#0a0c12f5 0%,#0a0c12c9 42%,#0a0c1222 100%)}.content{left:22px;right:22px;bottom:80px}.eyebrow{font-size:9px;margin-bottom:12px}.logo{max-width:230px;max-height:75px;margin-bottom:14px}h2{font-size:28px;margin-bottom:12px}.meta{font-size:11px;gap:6px 9px;margin-bottom:12px}.meta .genre{display:none}.overview{font-size:12px;line-height:1.6;-webkit-line-clamp:3;margin-bottom:16px}.actions a,.actions button{padding:10px 14px;min-height:42px;font-size:12px}.controls{left:22px;bottom:22px;gap:5px}.controls button{width:32px;height:32px;padding:7px}.controls .count{font-size:11px;min-width:33px}.dots{right:20px;bottom:35px;max-width:25%;gap:5px}.dots button{width:5px;height:5px;min-height:5px}.dots button[aria-pressed=true]{width:15px}}@media(max-width:760px){section.banner,section.banner.compact{height:clamp(460px,var(--banner-height,78svh),850px);min-height:460px;border-radius:0}.banner .content{left:22px;right:22px;bottom:92px}.banner .controls{bottom:26px}.banner .dots{bottom:39px}.banner .logo{max-width:270px;max-height:100px}.banner .shade{background:linear-gradient(0deg,#080a11f5 0%,#080a11bb 42%,#080a1122 100%)}.controls{max-width:calc(100% - 40px);gap:4px}.dots{max-width:17%}}

/* Keep visual blending inside the carousel; native page backgrounds remain visible. */
.scene{position:absolute;inset:0;isolation:isolate;z-index:0;overflow:hidden;mask-image:linear-gradient(to bottom,#000 0%,#000 74%,#000c 86%,transparent 100%);-webkit-mask-image:linear-gradient(to bottom,#000 0%,#000 74%,#000c 86%,transparent 100%)}
.scene .artwork{position:absolute;inset:0;z-index:0;--jqmb-photo-cut:0;transition:--jqmb-photo-cut 1s ease-in-out;mask-image:linear-gradient(rgb(0 0 0 / calc(1 - var(--jqmb-photo-cut))),rgb(0 0 0 / calc(1 - var(--jqmb-photo-cut)))),url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%3Cfilter%20id%3D%22s%22%20x%3D%22-30%25%22%20y%3D%22-30%25%22%20width%3D%22160%25%22%20height%3D%22160%25%22%3E%3CfeGaussianBlur%20stdDeviation%3D%221.8%22%2F%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%3Cpath%20d%3D%22M-20%20-20H35V0C35%2035%2043%2075%2055%20100L65%20120H-20Z%22%20fill%3D%22white%22%20filter%3D%22url(%23s)%22%2F%3E%3C%2Fsvg%3E");mask-size:100% 100%,100% 100%;mask-repeat:no-repeat;mask-composite:add}.scene.has-trailer .artwork{--jqmb-photo-cut:1}
.scene .backdrop{z-index:0;filter:brightness(.85);width:125%;max-width:none;transform:translateX(0);transition:opacity var(--fade-duration,350ms) ease,transform 1s ease-in-out}.scene.has-trailer .backdrop{transform:translateX(-16%)}.scene .preview{transition:opacity 1s ease-in-out}
.scene .preview{z-index:1;left:0;right:0;top:0;bottom:0;width:100%;height:100%;object-position:right center;background:transparent;overflow:hidden;mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%3Cfilter%20id%3D%22s%22%20x%3D%22-30%25%22%20y%3D%22-30%25%22%20width%3D%22160%25%22%20height%3D%22160%25%22%3E%3CfeGaussianBlur%20stdDeviation%3D%221.8%22%2F%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%3Cpath%20d%3D%22M35%20-20V0C35%2035%2043%2075%2055%20100L65%20120H120V-20Z%22%20fill%3D%22white%22%20filter%3D%22url(%23s)%22%2F%3E%3C%2Fsvg%3E"),linear-gradient(to bottom,#000 0%,#000 70%,transparent 100%);mask-size:100% 100%,100% 100%;mask-repeat:no-repeat;mask-composite:intersect;-webkit-mask-composite:source-in}
.scene .soften{position:absolute;inset:0;z-index:2;pointer-events:none;backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);mask-image:radial-gradient(ellipse 72% 120% at 0% 45%,#000 20%,#000b 54%,transparent 100%)}
.scene .shade,.banner .scene .shade{z-index:3;background:radial-gradient(ellipse 90% 140% at 0% 45%,#080a11e6 0%,#080a11aa 40%,#080a1144 67%,transparent 95%)}
.scene .blend{position:absolute;left:0;right:0;bottom:-12px;height:150px;z-index:4;pointer-events:none;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);mask-image:linear-gradient(transparent,#000 65%)}
.content{z-index:2}.controls,.dots{z-index:3}
.banner .content{bottom:100px}.banner .controls{bottom:34px}.banner .dots{bottom:47px}
@media(max-width:760px){.scene .preview{left:0;width:100%;height:70%;bottom:auto}.scene .soften{backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);mask-image:radial-gradient(ellipse 75% 100% at 0% 45%,#0006,transparent)}.banner .scene .shade,.scene .shade{background:linear-gradient(0deg,#080a11e6 0%,#080a1199 30%,transparent 72%),radial-gradient(ellipse 110% 130% at 0% 40%,#080a1166,transparent 80%)}.banner .content{bottom:90px}.banner .controls{bottom:26px}.banner .dots{bottom:39px}}
@media(max-width:360px){.dots{display:none}.meta{font-size:10px}.content{left:18px;right:18px}.controls{left:18px}}@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;
    function dispose(){disposed=true;clearTimeout(scheduleTimer);intervals.forEach(clearInterval);listeners.forEach(([target,type,handler])=>target.removeEventListener(type,handler));observer.disconnect();reset();}
    window.JellyQoLMediaBar={refresh:invalidate,dispose};
    observer.observe(document.body,{childList:true,subtree:true});
    listen(window,'hashchange',schedule);listen(window,'popstate',schedule);listen(window,'pageshow',schedule);listen(window,'resize',schedule);listen(document,'visibilitychange',()=>{if(document.hidden)stopTrailer();else if(nodes&&items.length)startTrailer(items[current]);schedule();});listen(document,'mediahider:changed',invalidate);
    let globalSignature='';listen(window,'jellyqol:features',event=>{const signature=JSON.stringify(event.detail?.MediaBar||{});if(currentIdentity()&&signature!==globalSignature){globalSignature=signature;invalidate();}});
    let personalSignature='';listen(window,'jellyqol:preferences',event=>{if(!currentIdentity())return;const p=event.detail||{},signature=JSON.stringify([p.MediaBarTrailers,p.MediaBarTrailerSound]);if(signature!==personalSignature){personalSignature=signature;invalidate();}});
    intervals.push(setInterval(update,1000));schedule();
})();
