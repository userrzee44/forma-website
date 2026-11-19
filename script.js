const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeImage = value => { try { const u = new URL(value); return u.protocol === 'https:' && /(^|\.)rbxcdn\.com$/.test(u.hostname) ? escapeHTML(u.href) : ''; } catch { return ''; } };
const number = value => typeof value === 'number' ? new Intl.NumberFormat('en').format(value) : 'Unavailable';
const compact = value => typeof value === 'number' ? new Intl.NumberFormat('en', { notation:'compact',maximumFractionDigits:1 }).format(value) : '—';
const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}) : 'Unavailable';
const image = (url,alt,cls='') => safeImage(url) ? `<img class="${cls}" src="${safeImage(url)}" alt="${escapeHTML(alt)}" loading="lazy" referrerpolicy="no-referrer">` : `<span class="tile-placeholder ${cls}" aria-label="Image unavailable">▣</span>`;
const loading = '<div class="loading" role="status"><span class="spinner"></span>Connecting to Roblox…</div>';
let currentId = null, currentProfile = null, activeTab = 'overview', routeVersion = 0, panelVersion = 0, searchAbort, searchTimer, searchSequence = 0;
let sectionCache = new Map();
const sectionRequests = new Map(), sectionCooldowns = new Map(), sectionRetries = new Set();
let sectionRetryTimer;
const searchMemory = new Map();
let profileRetryTimer;
let autoRetriedId = null;
const profileMemory = new Map();
const tabs = [ ['overview','◈','Overview'],['avatar','♧','Current avatar'],['outfits','▧','Saved outfits'],['friends','◎','Friends'],['followers','↙','Followers'],['following','↗','Following'],['groups','◇','Groups'],['badges','✦','Badges'],['games','▣','Created games'],['favorites','♡','Favourite games'],['inventory','▥','Inventory'],['names','↺','Username history'] ];
async function api(kind, args = {}, signal) {
  const response = await fetch(`/api/roblox?${new URLSearchParams({kind,...args})}`, { signal: signal || AbortSignal.timeout(22000) });
  let data;
  try { data = await response.json(); } catch { throw new Error('The player service could not be reached. Please try again.'); }
  if (!response.ok) { const e = new Error(data.error || 'Unable to load Roblox data.'); e.status = response.status; e.retryAfter = Number(data.retryAfter || response.headers.get('retry-after')) || 30; throw e; }
  return data;
}
function errorText(error) { return error.name === 'TimeoutError' || error.name === 'AbortError' ? 'The request took too long. Please try again.' : error.message || 'Something went wrong. Please try again.'; }
function message(title,text,retry=false) { return `<div class="section-message"><span class="message-icon">${retry?'↻':'◈'}</span><h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p>${retry?'<button class="button" data-retry>Try again ↻</button>':''}</div>`; }
function mountSearch(profile=false) {
  clearTimeout(searchTimer); searchAbort?.abort(); searchSequence++;
  $('#search-mount-home').replaceChildren(); $('#search-mount-profile').replaceChildren();
  const mount = $(profile ? '#search-mount-profile' : '#search-mount-home');
  mount.append($('#search-template').content.cloneNode(true));
  const input = mount.querySelector('input'), results = mount.querySelector('.search-results'), hint = mount.querySelector('.search-hint');
  let matches = [], selected = -1;
  const close = () => { results.hidden = true; input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant'); };
  const select = i => {
    selected = i;
    results.querySelectorAll('[role="option"]').forEach((el,n) => { el.classList.toggle('selected',n===i); el.setAttribute('aria-selected',String(n===i)); });
    if (i>=0) { input.setAttribute('aria-activedescendant',`result-${i}`); results.querySelector(`#result-${i}`)?.scrollIntoView({block:'nearest'}); }
    else input.removeAttribute('aria-activedescendant');
  };
  async function search() {
    const q = input.value.trim();
    clearTimeout(searchTimer); searchAbort?.abort(); const seq = ++searchSequence;
    matches=[]; selected=-1;
    if (q.length < 3 && !/^\d+$/.test(q)) { close(); hint.textContent='Type at least 3 characters to find a player.'; return; }
    searchAbort = new AbortController();
    results.hidden=false; input.setAttribute('aria-expanded','true'); results.innerHTML='<div class="dropdown-message"><span class="spinner"></span> Searching Roblox…</div>'; hint.textContent='Searching live player profiles…';
    try {
      const cached=searchMemory.get(q.toLowerCase());
      const data=cached && Date.now()-cached.time<120000?cached.data:await api('search',{q},searchAbort.signal);
      if(searchMemory.size>50)searchMemory.delete(searchMemory.keys().next().value);
      searchMemory.set(q.toLowerCase(),{data,time:Date.now()});
      if (seq !== searchSequence) return;
      matches=data.data || [];
      results.innerHTML=matches.length ? matches.map((u,i)=>`<button type="button" class="search-option" id="result-${i}" role="option" aria-selected="false" data-result="${i}">${image(u.image,u.displayName,'user-image')}<span><strong>${escapeHTML(u.displayName || u.name)} ${u.hasVerifiedBadge?'<span class="verified" aria-label="Verified">✓</span>':''}</strong><small>@${escapeHTML(u.name)}</small></span><span class="result-id">${u.id}</span></button>`).join('') : '<div class="dropdown-message">No players found. Try their exact username or numeric player ID.</div>';
      hint.textContent=matches.length ? `${matches.length} matching players. Choose one to explore.` : 'No matching players.';
    } catch(e) { if(seq!==searchSequence || e.name==='AbortError')return; results.innerHTML=`<div class="dropdown-message">${escapeHTML(errorText(e))}</div>`; hint.textContent='Search unavailable. Submit again to retry.'; }
  }
  input.addEventListener('input',()=>{clearTimeout(searchTimer);searchAbort?.abort();searchSequence++;close();searchTimer=setTimeout(search,700);});
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){close();return;}
    if(!matches.length || results.hidden)return;
    if(e.key==='ArrowDown'){e.preventDefault();select((selected+1)%matches.length);}
    if(e.key==='ArrowUp'){e.preventDefault();select((selected-1+matches.length)%matches.length);}
    if(e.key==='Enter'&&selected>=0){e.preventDefault();openPlayer(matches[selected].id);}
  });
  results.addEventListener('click',e=>{const option=e.target.closest('[data-result]');if(option)openPlayer(matches[Number(option.dataset.result)].id);});
  mount.querySelector('form').addEventListener('submit',e=>{e.preventDefault();search();});
}
function openPlayer(id) { if(String(id)===currentId) { window.scrollTo({top:0,behavior:'smooth'}); return; } location.hash=`player/${id}`; }
function stat(label,result) { return `<div class="stat"><span>${label}</span><strong>${result.ok?compact(result.value?.count):'—'}</strong><small>${result.ok?number(result.value?.count):'Not available from Roblox'}</small></div>`; }
function renderProfile(profile) {
  const { user:u }=profile;
  const age=u.created ? Math.max(0,Math.floor((Date.now()-new Date(u.created).getTime())/86400000)) : null;
  $('#profile-header').innerHTML=`${profile.profileWarning?`<div class="profile-warning" role="status">${escapeHTML(profile.profileWarning)} <button class="button" data-refresh-profile disabled>Retrying shortly…</button></div>`:''}<div class="profile-cover"><div class="profile-intro"><div class="profile-avatar">${image(profile.thumbnail,`${u.displayName}'s current avatar`)}</div><div class="profile-details"><span class="eyebrow">PLAYER PROFILE / ${u.id}</span><h1>${escapeHTML(u.displayName || u.name)} ${u.hasVerifiedBadge?'<span class="verified" aria-label="Verified account">✓</span>':''}</h1><p class="profile-username">@${escapeHTML(u.name)} <span>PLAYER ID ${u.id}</span>${u.isBanned?'<b class="status-badge">Account banned</b>':''}</p><p class="profile-description">${escapeHTML(u.description || (profile.profileWarning ? 'Description temporarily unavailable.' : 'This player hasn’t added a description.'))}</p><div class="profile-actions"><a class="button primary" href="https://www.roblox.com/users/${u.id}/profile" target="_blank" rel="noopener noreferrer">View on Roblox ↗</a><button class="button" data-share>Copy profile link ↗</button></div></div></div><div class="stats-grid"><div class="stat"><span>JOINED ROBLOX</span><strong>${date(u.created)}</strong><small>Account creation date · UTC</small></div><div class="stat"><span>ACCOUNT AGE</span><strong>${age===null?'Unavailable':number(age)+' days'}</strong><small>${age===null?'Waiting for account details':(age/365.2425).toFixed(1)+' years on Roblox'}</small></div>${stat('FRIENDS',profile.friends)}${stat('FOLLOWERS',profile.followers)}${stat('FOLLOWING',profile.following)}</div></div>`;
  $('#profile-main').innerHTML=`<div class="profile-layout"><aside class="sidebar" aria-label="Profile sections"><span class="sidebar-label">EXPLORE THIS PLAYER</span>${tabs.map(([id,icon,label])=>`<button class="tab-button" data-tab="${id}"><span aria-hidden="true">${icon}</span>${label}<span class="tab-arrow">›</span></button>`).join('')}</aside><div><section class="panel" id="data-panel" aria-live="polite"></section><p class="data-time">Retrieved ${date(profile.fetchedAt)} at ${new Date(profile.fetchedAt).toLocaleTimeString('en-GB',{timeZone:'UTC'})} UTC · Cached data may be shown while Roblox is busy. Counts and visibility are controlled by Roblox.</p></div></div>`;
  document.title=`${u.displayName || u.name} (@${u.name}) — Bloxscope`;
  loadTab('overview');
  const presence=document.createElement('section');presence.id='player-presence';presence.className='presence-panel';presence.setAttribute('aria-label','Player online status');
  $('#profile-header').append(presence);loadPresence();
  if (profile.profileWarning) scheduleProfileRetry(profile.retryAfter || 30);
}
let presenceRequestVersion=0, presenceRefreshUntil=0;
async function loadPresence() {
  const panel=$('#player-presence');if(!panel||!currentId)return;
  const id=currentId, version=++presenceRequestVersion;
  panel.innerHTML='<div class="loading" role="status"><span class="spinner"></span>Checking online status…</div>';
  try {
    const p=await api('presence',{id});if(id!==currentId||version!==presenceRequestVersion||!panel.isConnected)return;
    const labels={'online':'Online','in-game':'In a game','in-studio':'In Roblox Studio','offline-or-hidden':'Offline or hidden','unavailable':'Status unavailable'};
    const active=['online','in-game','in-studio'].includes(p.status);
    const exactInstance=p.joinUrl&&/^\d+$/.test(String(p.game?.placeId))&&Number(p.game.placeId)>0&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.game?.instanceId||'');
    const join=exactInstance?`<a class="button primary" href="roblox://placeId=${Number(p.game.placeId)}&amp;gameInstanceId=${encodeURIComponent(p.game.instanceId)}" aria-describedby="join-note">Join exact server</a>`:'<button class="button" disabled aria-describedby="join-note">Exact server unavailable</button>';
    panel.innerHTML=`<div class="presence-details"><div><span class="presence-label">ONLINE STATUS</span><strong><i class="presence-dot${active?' active':''}" aria-hidden="true"></i>${labels[p.status]||'Status unavailable'}</strong><small>${p.game?escapeHTML(p.game.name):p.status==='offline-or-hidden'?'Roblox did not disclose an active status.':'Current status returned by Roblox.'}</small></div></div><div class="presence-actions">${join}<button class="button" data-refresh-presence>Refresh status</button></div><p id="join-note" class="presence-note">${p.joinUrl?'Opens the Roblox app with the exact server ID Roblox disclosed. Requires Roblox installed. The server may be full or closed, and Roblox still checks access.':'Roblox has not shared an exact joinable server. No random-server fallback is used; hidden servers and join restrictions cannot be overridden.'}</p><p class="presence-note">Checked ${escapeHTML(new Date(p.checkedAt).toLocaleTimeString('en-GB',{timeZone:'UTC'}))} UTC. Status is a snapshot; refresh to check again.</p>`;
    presenceRefreshUntil=Date.now()+15000;
  }catch(e){if(id!==currentId||version!==presenceRequestVersion||!panel.isConnected)return;panel.innerHTML='<div class="presence-details"><div><span class="presence-label">ONLINE STATUS</span><strong>Status unavailable</strong><small>'+escapeHTML(errorText(e))+'</small></div></div><div class="presence-actions"><button class="button" disabled>Exact server unavailable</button><button class="button" data-refresh-presence>Retry status</button></div>';presenceRefreshUntil=Date.now()+(e.status===429?e.retryAfter*1000:15000);}
}
function overview() {
  const p=currentProfile, u=p.user;
  const access=p.inventory.ok?(p.inventory.value.canView?'Public':'Private'):'Unavailable';
  return `<div class="panel-header"><div><h2>The story so far.</h2><p>A closer look at @${escapeHTML(u.name)}.</p></div><span class="verified">◈</span></div><div class="info-grid"><div class="info-box"><span>ACCOUNT CREATED</span><strong>${date(u.created)}</strong><small>${u.created?escapeHTML(new Date(u.created).toISOString().replace('T',' ').replace('Z',' UTC')):'Temporarily unavailable from Roblox'}</small></div><div class="info-box"><span>PLAYER ID</span><strong>${u.id}</strong><small>A permanent identifier, even if the username changes.</small></div><div class="info-box"><span>AVATAR TYPE</span><strong>${escapeHTML(p.avatar.value?.playerAvatarType || 'Unavailable')}</strong><small>${p.avatar.ok?`${p.avatar.value.assets?.length || 0} currently equipped items`:'Roblox did not return avatar details.'}</small></div><div class="info-box"><span>INVENTORY VISIBILITY</span><strong>${access}</strong><small>${access==='Public'?'Browse categories in the Inventory tab.':access==='Private'?'This player’s privacy setting is respected.':'Roblox did not return a visibility setting.'}</small></div><div class="info-box"><span>VERIFIED BADGE</span><strong>${u.hasVerifiedBadge===undefined?'Unavailable':u.hasVerifiedBadge?'Verified account':'No verified badge'}</strong><small>Roblox account verification badge status.</small></div><div class="info-box"><span>ACCOUNT STATUS</span><strong>${u.isBanned===undefined?'Unavailable':u.isBanned?'Banned':'Not marked banned'}</strong><small>Public account flag. Does not indicate online status.</small></div></div><h3 class="overview-section-title">Follow your curiosity</h3><div class="overview-chips"><button data-tab="outfits">Saved outfits ↗</button><button data-tab="avatar">What they’re wearing ↗</button><button data-tab="groups">Their communities ↗</button><button data-tab="games">Created experiences ↗</button></div><p class="subtle-note">Bloxscope only displays information returned by Roblox’s public APIs. Private account details, messages, Robux balances, location, and private inventories aren’t available here. A restricted panel doesn’t necessarily mean it is empty.</p>`;
}
const tabDescriptions={avatar:'The items equipped on this player’s current avatar.',outfits:'Saved avatar outfits that Roblox makes available. Select one to inspect its items.',friends:'Publicly available player connections.',followers:'Players following this account, when Roblox permits access.',following:'Accounts this player follows, when Roblox permits access.',groups:'Communities this player belongs to, including their roles.',badges:'Experience badges returned by Roblox, when publicly accessible.',games:'Public experiences created by this account.',favorites:'Experiences this player has marked as favourites.',inventory:'Items in a public inventory, organised by category.',names:'Previous usernames returned by Roblox, newest first.'};
let inventoryType='Hat';
function sectionRequest(tab,args) {
  const key=JSON.stringify([tab,args]);
  if(sectionRequests.has(key))return sectionRequests.get(key);
  const request=api(tab,args).finally(()=>sectionRequests.delete(key));
  sectionRequests.set(key,request);return request;
}
function waitForSection(key,seconds,button,version,retry) {
  clearInterval(sectionRetryTimer);
  const until=sectionCooldowns.get(key)||Date.now()+Math.max(1,Number(seconds)||30)*1000;
  sectionCooldowns.set(key,until);
  const update=()=>{
    if(version!==panelVersion||!button.isConnected){clearInterval(sectionRetryTimer);return;}
    const left=Math.max(0,Math.ceil((until-Date.now())/1000));
    button.disabled=left>0;button.textContent=left>0?`Roblox is busy · ${sectionRetries.has(key)?'retry available':'retrying'} in ${left}s…`:'Try again ↻';
    if(!left){clearInterval(sectionRetryTimer);sectionCooldowns.delete(key);if(!sectionRetries.has(key)){sectionRetries.add(key);retry();}}
  };
  update();if(Date.now()<until)sectionRetryTimer=setInterval(update,1000);
}
async function loadTab(tab, pagination = null) {
  if(!currentProfile)return;
  clearInterval(sectionRetryTimer);
  activeTab=tab;
  const version=++panelVersion, id=currentId;
  document.querySelectorAll('.tab-button').forEach(el=>{el.classList.toggle('active',el.dataset.tab===tab);if(el.dataset.tab===tab)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  const panel=$('#data-panel');
  if(tab==='overview'){panel.innerHTML=overview();return;}
  const title=tabs.find(t=>t[0]===tab)?.[2]||tab;
  const types={Hat:'Hats',HairAccessory:'Hair',FaceAccessory:'Face accessories',NeckAccessory:'Neck accessories',ShoulderAccessory:'Shoulder accessories',FrontAccessory:'Front accessories',BackAccessory:'Back accessories',WaistAccessory:'Waist accessories',Shirt:'Classic shirts',Pants:'Classic pants',TShirt:'Classic T-shirts',Gear:'Gear',Face:'Faces'};
  const header=`<div class="panel-header"><div><h2>${title}</h2><p>${tabDescriptions[tab]}</p></div>${tab==='inventory'?`<select id="inventory-type" aria-label="Inventory category">${Object.entries(types).map(([k,v])=>`<option value="${k}"${k===inventoryType?' selected':''}>${v}</option>`).join('')}</select>`:''}</div>`;
  const args={id,...(tab==='inventory'?{type:inventoryType}:{}),...(pagination||{})};
  const key=`${id}/${tab}/${inventoryType}`, requestKey=JSON.stringify([tab,args]);
  const cached=sectionCache.get(key);
  const previous=pagination?(cached?.items||[]):[];
  const render=(data,items,note='')=>{
    panel.innerHTML=header+note+renderItems(tab,items,data);
    if(data.nextPageCursor||data.nextPage){
      const more=document.createElement('button');more.className='button load-more';more.dataset.more='true';more.textContent='Load more ↓';
      more.addEventListener('click',()=>loadTab(tab,data.nextPageCursor?{cursor:data.nextPageCursor}:{page:data.nextPage}));panel.append(more);
    }
  };
  if(!pagination&&cached&&Date.now()-cached.time<5*60000){render(cached.data,cached.items);return;}
  if(pagination){panel.querySelector('.page-retry')?.remove();const button=panel.querySelector('[data-more]');if(button){button.disabled=true;button.textContent='Loading…';}}
  else panel.innerHTML=header+loading;
  try {
    const until=sectionCooldowns.get(requestKey)||0;
    if(until>Date.now()){const e=new Error('Roblox has temporarily limited this section.');e.status=429;e.retryAfter=Math.ceil((until-Date.now())/1000);throw e;}
    const data=await sectionRequest(tab,args);
    if(version!==panelVersion||id!==currentId)return;
    sectionRetries.delete(requestKey);sectionCooldowns.delete(requestKey);
    const items=pagination?[...previous,...(data.data||[])]:data.data||[];
    const unique=items.filter((item,index,array)=>array.findIndex(x=>(x.id??x.name)===(item.id??item.name))===index);
    const entry={data:{...data,data:unique},items:unique,time:Date.now()};
    if(sectionCache.size>60)sectionCache.delete(sectionCache.keys().next().value);
    sectionCache.set(key,entry);render(data,unique);
  }catch(e){
    if(version!==panelVersion||id!==currentId)return;
    const restricted=[401,403].includes(e.status);
    const canReuse=cached&&Date.now()-cached.time<30*60000&&[429,503].includes(e.status);
    if(canReuse)render(cached.data,cached.items,'<p class="subtle-note">Showing recently loaded results while Roblox is busy.</p>');
    if(pagination||canReuse){
      panel.querySelector('[data-more]')?.remove();panel.querySelector('.page-retry')?.remove();
      const note=document.createElement('div');note.className='page-retry';note.innerHTML=message(e.status===429?'Roblox is temporarily busy':'Couldn’t load the next page',pagination?'Your loaded items are still shown above. We’ll retry after Roblox’s waiting period.':errorText(e));
      const retry=document.createElement('button');retry.className='button load-more';retry.textContent='Retry ↻';
      retry.addEventListener('click',()=>loadTab(tab,pagination));note.append(retry);panel.append(note);
      if(e.status===429)waitForSection(requestKey,e.retryAfter,retry,version,()=>loadTab(tab,pagination));
    }else{
      panel.innerHTML=header+message(restricted?'This information isn’t public right now':e.status===429?'Roblox is temporarily busy':'Couldn’t load this section',e.status===429?(sectionRetries.has(requestKey)?'Roblox is still limiting this section. You can retry after the waiting period.':'Roblox has limited this section. It will retry automatically after the waiting period.'):errorText(e),!restricted)+(restricted?'<p class="subtle-note">Roblox may require authentication, restrict this endpoint, or apply player privacy settings. Bloxscope does not bypass these controls.</p>':'');
      if(e.status===429)waitForSection(requestKey,e.retryAfter,panel.querySelector('[data-retry]'),version,()=>loadTab(tab));
    }
  }
}
function renderItems(tab,items,data) {
  if(data.availability==='roblox-sign-in'&&['friends','followers','following'].includes(tab)){
    const labels={friends:'friends',followers:'followers',following:'accounts followed'};
    const target={friends:'friends',followers:'followers',following:'following'}[tab];
    const count=currentProfile[tab];
    const detail=count?.ok?`Roblox reports ${number(count.value.count)} ${labels[tab]} for this player. `:'';
    return message('View this list on Roblox',detail+'Roblox requires a signed-in session to return the names in this list. This is a Roblox API access restriction, not a claim that this player has hidden their connections.')+`<div class="overview-chips"><a class="button primary" href="https://www.roblox.com/users/${currentId}/friends#!/${target}" target="_blank" rel="noopener noreferrer">Open ${escapeHTML(labels[tab])} on Roblox ↗</a></div><p class="subtle-note">Use your normal Roblox sign-in on roblox.com if prompted. Visitors do not need to provide a Roblox password or session cookie.</p>`;
  }
  if(!items.length&&tab==='outfits'){
    const text=data.availability==='inventory-private'?'Roblox reports this player’s inventory as private and did not expose any saved outfits to this website. They may still have saved outfits that are visible to them or to friends on Roblox.':'Roblox did not expose saved outfits to this website. This does not confirm that the player has none; visibility and public API access can differ from what you see while signed in to Roblox.';
    return message(data.nextPageCursor?'No outfits on this page':'Outfits aren’t publicly available',text)+'<div class="overview-chips"><button data-tab="avatar">View current avatar ↗</button></div>';
  }
  if(!items.length)return message('Nothing to show here',tab==='names'?'Roblox returned no previous usernames for this player.':`Roblox returned no public ${tabs.find(t=>t[0]===tab)?.[2].toLowerCase()} for this player.`);
  if(tab==='names')return `<div class="name-list">${items.map(x=>`<span>${escapeHTML(x.name)}</span>`).join('')}</div>`;
  const people=['friends','followers','following'].includes(tab);
  let content=`<div class="tile-grid${people?' people':''}">${items.map(item=>{
    if(people&&item.unavailable)return '<div class="tile"><span class="tile-placeholder">◈</span><h3>Unavailable player</h3><p>Roblox did not disclose this connection’s identity.</p></div>';
    let sub='',href='',tag='',attrs='',name=item.displayName||item.name||`Item ${item.id}`;
    if(people){sub=`@${item.name || 'Unknown username'}`;attrs=`data-player="${item.id}"`;}
    else if(tab==='outfits'){sub=`Outfit ID ${item.id}`;tag=item.outfitType||'Avatar';attrs=`data-outfit="${item.id}" data-outfit-name="${escapeHTML(name)}"`;}
    else if(tab==='groups'){sub=`${number(item.memberCount)} members`;tag=item.role?.name||'Member';href=`https://www.roblox.com/communities/${item.id}`;}
    else if(tab==='games'||tab==='favorites'){sub=`${number(item.placeVisits)} visits`;tag=item.rootPlace?.id?'Explore experience ↗':'';href=item.rootPlace?.id?`https://www.roblox.com/games/${item.rootPlace.id}`:`https://www.roblox.com/users/${currentId}/profile`;}
    else if(tab==='badges'){sub=item.description||'Experience badge';href=`https://www.roblox.com/badges/${item.id}`;}
    else {sub=item.assetType?.name||`Asset ID ${item.id}`;href=`https://www.roblox.com/catalog/${item.id}`;tag='View item ↗';}
    const body=`${image(item.image,name)}<h3>${escapeHTML(name)} ${item.hasVerifiedBadge?'<span class="verified">✓</span>':''}</h3><p>${escapeHTML(sub)}</p>${tag?`<span class="tile-tag">${escapeHTML(tag)}</span>`:''}`;
    return href?`<a class="tile" href="${href}" target="_blank" rel="noopener noreferrer">${body}</a>`:`<button class="tile" ${attrs}>${body}</button>`;
  }).join('')}</div>`;
  if(data.unavailableCount)content+=`<p class="subtle-note">${data.unavailableCount} connection identities were withheld by Roblox on this page.</p>`;
  if(data.truncated)content+='<p class="subtle-note">Showing the first 50 connections returned by Roblox. This endpoint did not provide further pages.</p>';
  if(tab==='avatar')content+=`<p class="subtle-note">Avatar rig: ${escapeHTML(data.playerAvatarType||'Unknown')}. Items are shown as returned by Roblox; deleted or moderated thumbnails may be unavailable.</p>`;
  if(tab==='groups')content+=`<p class="subtle-note">${number(data.total)} total groups returned by Roblox.</p>`;
  return content;
}
let outfitVersion=0;
async function openOutfit(id,name) {
  const version=++outfitVersion;
  $('#outfit-title').textContent=name;$('#outfit-content').innerHTML=loading;$('#outfit-dialog').showModal();
  try {
    const data=await api('outfit',{id:currentId,outfit:id});
    if(version!==outfitVersion)return;
    $('#outfit-content').innerHTML=`<p class="subtle-note" style="margin:0 0 20px">Outfit ID ${id} · ${escapeHTML(data.playerAvatarType||'Avatar')} · ${data.assets?.length||0} items</p>`+renderItems('avatar',data.data||[],data);
  }catch(e){if(version===outfitVersion)$('#outfit-content').innerHTML=message('Outfit details unavailable',errorText(e));}
}
function scheduleProfileRetry(seconds) {
  clearInterval(profileRetryTimer);
  const id=currentId;
  if(autoRetriedId===id){const button=$('[data-refresh-profile]');if(button){button.disabled=false;button.textContent='Retry account details ↻';}return;}
  let remaining=Math.max(1,Math.min(300,Number(seconds)||30));
  const button=$('[data-refresh-profile]') || $('#profile-header [data-retry]');
  if(!button)return;
  const update=()=>{button.disabled=remaining>0;button.textContent=remaining>0?`Retrying in ${remaining}s…`:'Try again ↻';};
  update();
  profileRetryTimer=setInterval(()=>{
    if(currentId!==id||!button.isConnected){clearInterval(profileRetryTimer);return;}
    remaining--;update();
    if(remaining<=0){clearInterval(profileRetryTimer);autoRetriedId=id;profileMemory.delete(id);route();}
  },1000);
}
async function route() {
  clearInterval(profileRetryTimer);clearInterval(sectionRetryTimer);
  const version=++routeVersion;panelVersion++;searchAbort?.abort();
  const match=location.hash.match(/^#player\/(\d{1,16})$/);
  const id=match?.[1];
  $('#outfit-dialog').close();
  if(!id) {
    currentId=null;currentProfile=null;$('#home').hidden=false;$('#profile-view').hidden=true;mountSearch(false);document.title='Bloxscope — Every player has a story.';
    if(location.hash==='#how-it-works')requestAnimationFrame(()=>$('#how-it-works').scrollIntoView());
    return;
  }
  currentId=id;currentProfile=null;activeTab='overview';inventoryType='Hat';
  $('#home').hidden=true;$('#profile-view').hidden=false;$('#profile-header').innerHTML='<div class="skeleton" role="status" aria-label="Loading player profile"></div>';$('#profile-main').innerHTML=loading;mountSearch(true);window.scrollTo(0,0);
  try {const cached=profileMemory.get(id);const p=cached && Date.now()-cached.time<300000?cached.data:await api('profile',{id});if(version!==routeVersion)return;if(!p.profileWarning)profileMemory.set(id,{data:p,time:Date.now()});currentProfile=p;renderProfile(p);}
  catch(e){if(version!==routeVersion)return;$('#profile-header').innerHTML=`<div class="error-page">${message(e.status===404?'Player not found':'Couldn’t load this player',errorText(e),true)}</div>`;$('#profile-main').innerHTML='';$('#profile-header').querySelector('[data-retry]')?.addEventListener('click',route);if(e.status===429)scheduleProfileRetry(e.retryAfter);}
}
document.addEventListener('click',async e=>{
  if(e.target.closest('[data-refresh-presence]')){
    if(Date.now()<presenceRefreshUntil){const b=e.target.closest('[data-refresh-presence]');b.textContent=`Please wait ${Math.ceil((presenceRefreshUntil-Date.now())/1000)}s`;return;}
    loadPresence();return;
  }
  if(e.target.closest('[data-refresh-profile]')){profileMemory.delete(currentId);route();return;}
  const player=e.target.closest('[data-player]');if(player){openPlayer(player.dataset.player);return;}
  const tab=e.target.closest('[data-tab]');if(tab){loadTab(tab.dataset.tab);return;}
  const outfit=e.target.closest('[data-outfit]');if(outfit){openOutfit(outfit.dataset.outfit,outfit.dataset.outfitName);return;}
  if(e.target.closest('#data-panel [data-retry]')){loadTab(activeTab);return;}
  if(e.target.closest('[data-share]')) {
    const button=e.target.closest('[data-share]');
    try { await navigator.clipboard.writeText(location.href);button.textContent='Link copied ✓';setTimeout(()=>{if(button.isConnected)button.textContent='Copy profile link ↗';},2000); }
    catch {const toast=$('#toast');toast.textContent='Copy the address from your browser to share this profile.';toast.hidden=false;setTimeout(()=>toast.hidden=true,4000);}
  }
  if(!e.target.closest('.search-wrap')){const r=$('.search-results');if(r)r.hidden=true;$('.player-search')?.setAttribute('aria-expanded','false');}
});
document.addEventListener('change',e=>{if(e.target.id==='inventory-type'){inventoryType=e.target.value;loadTab('inventory');}});
$('#close-dialog').addEventListener('click',()=>{$('#outfit-dialog').close();outfitVersion++;});
$('#outfit-dialog').addEventListener('click',e=>{if(e.target===$('#outfit-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
window.addEventListener('hashchange',route);route();
// The homepage needs one thumbnail, not seven full-profile requests.
api('spotlight').then(p=>{
  const img=$('#spotlight-avatar');
  if(safeImage(p.thumbnail)){img.src=p.thumbnail;img.hidden=false;$('#spotlight-placeholder').hidden=true;}
}).catch(()=>{});
