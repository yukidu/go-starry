import {
  appJs as baseAppJs,
  homePage as baseHomePage,
  simplePage as baseSimplePage,
  styles as baseStyles
} from "./uiV6";

const MENU_INSTALL = `<button class="menu-item" data-install><span class="menu-icon">⇩</span><span data-install-label>安裝到桌面</span></button>`;
const MENU_V9 = `<a id="menuRanking" class="menu-item" href="/ranking" hidden><span class="menu-icon">🏆</span>排行榜</a><a id="menuPersonalizationAdmin" class="menu-item" href="/admin/personalization" hidden><span class="menu-icon">⚙</span>個人化管理</a>${MENU_INSTALL}`;
const LINKS_HEADING = `<section id="linksSection" class="card link-list"><h2 class="section-title">我的連結</h2><div id="links"></div></section>`;
const LINKS_WITH_FILTER = `<section id="linksSection" class="card link-list"><div class="section-head-v9"><h2 class="section-title">我的連結</h2><div id="linkFilterWrap" class="link-filter-v9" hidden><label for="linkAliasFilter">篩選個人化網址</label><select id="linkAliasFilter"><option value="all">全部</option></select></div></div><div id="links"></div></section>`;

function enhanceV9(markup: string): string {
  return markup
    .replace(MENU_INSTALL, MENU_V9)
    .replace(LINKS_HEADING, LINKS_WITH_FILTER);
}

export const styles = `${baseStyles}
.section-head-v9{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap}.section-head-v9 .section-title{margin-bottom:0}.link-filter-v9{min-width:min(280px,100%)}.link-filter-v9 label{font-size:11px}.alias-fixed-v9{font-weight:900;color:#39445c}.ranking-list-v9{display:grid;gap:10px;margin-top:16px}.ranking-row-v9{display:grid;grid-template-columns:52px minmax(0,1fr) auto;align-items:center;gap:12px;padding:14px 16px;border:1px solid #e7e9f0;border-radius:16px;background:#fff}.ranking-pos-v9{font-size:17px;font-weight:950;color:#8a90a0}.ranking-alias-v9{font-size:17px;font-weight:950;overflow-wrap:anywhere}.ranking-count-v9{font-size:14px;font-weight:900;color:var(--accent);white-space:nowrap}.admin-grid-v9{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}.admin-panel-v9{border:1px solid #e5e7ef;border-radius:16px;padding:16px;background:#fafbfe}.admin-panel-v9 h3{margin:0 0 10px}.rule-list-v9{margin:8px 0 0;padding-left:20px;line-height:1.75}.reserved-row-v9{display:flex;align-items:center;gap:10px;justify-content:space-between;border-top:1px solid #eceef3;padding:12px 0}.reserved-row-v9:first-child{border-top:0}.reserved-name-v9{font-weight:900}.reserved-note-v9{font-size:12px;color:#73788a;margin-top:3px}.danger-text-v9{font-size:12px;color:#be123c;font-weight:800}.btn:disabled{opacity:.5;cursor:not-allowed;transform:none}@media(max-width:680px){.section-head-v9{align-items:stretch}.link-filter-v9{width:100%}.admin-grid-v9{grid-template-columns:1fr}.ranking-row-v9{grid-template-columns:40px minmax(0,1fr) auto;padding:12px}.ranking-alias-v9{font-size:15px}}
`;

export const appJs = baseAppJs + `
let isSuperAdminV9=false;
let linkAliasFilterV9='all';

function setMenuAccessV9(user){
  const ranking=document.querySelector('#menuRanking');
  const admin=document.querySelector('#menuPersonalizationAdmin');
  if(ranking)ranking.hidden=!user;
  if(admin)admin.hidden=!(user&&user.is_super_admin);
}

renderAliasOptions=function(select,current=''){
  if(!select)return;
  const none=isSuperAdminV9?'<option value="">不使用個人化網址（超級管理員）</option>':'';
  select.innerHTML=none+currentAliases.map(a=>'<option value="'+esc(a.slug)+'">'+(a.kind==='starry'?'★ Starry 身份網址 · ':'')+esc(a.slug)+'</option>').join('');
  if(currentAliases.some(a=>a.slug===current))select.value=current;
  else if(isSuperAdminV9)select.value='';
  else if(currentAliases.length)select.value=currentAliases[0].slug;
};

updateCreatePreview=function(){
  const box=document.querySelector('#aliasPreview');
  if(!box)return;
  if(selectedAlias)box.innerHTML='<span class="alias-fixed-v9">產生格式：go.starry.phd/'+esc(selectedAlias)+'/短碼</span>';
  else if(isSuperAdminV9)box.textContent='超級管理員模式：可建立 go.starry.phd/短碼';
  else box.textContent='必須先有一組可用的個人化網址才能建立短網址。';
};

loadAliases=async function(){
  const data=await api('/api/aliases');
  currentAliases=data.aliases||[];
  isSuperAdminV9=Boolean(data.is_super_admin);
  setMenuAccessV9({is_super_admin:isSuperAdminV9});

  if(!isSuperAdminV9){
    if(!selectedAlias||!currentAliases.some(a=>a.slug===selectedAlias))selectedAlias=currentAliases[0]?.slug||'';
  }else if(selectedAlias&&!currentAliases.some(a=>a.slug===selectedAlias)){
    selectedAlias='';
  }
  storageSet('starry-anywhere-alias',selectedAlias);

  const select=document.querySelector('#aliasSelect');
  renderAliasOptions(select,selectedAlias);
  if(select){
    select.disabled=!isSuperAdminV9&&currentAliases.length<=1;
    const holder=select.closest('div');
    if(holder)holder.hidden=!isSuperAdminV9&&currentAliases.length===1;
  }
  updateCreatePreview();

  const createButton=document.querySelector('#createForm button[type="submit"]');
  if(createButton)createButton.disabled=!isSuperAdminV9&&!selectedAlias;

  const box=document.querySelector('#aliasList');
  if(box)box.innerHTML=currentAliases.map(a=>'<span class="alias-chip '+(a.kind==='starry'?'starry':'')+'">'+(a.kind==='starry'?'★ ':'')+esc(a.slug)+(a.kind==='custom'?'<button type="button" aria-label="刪除 '+esc(a.slug)+'" data-alias-delete="'+esc(a.id)+'">×</button>':'')+'</span>').join('')||'<span class="muted" style="font-size:13px">尚無個人化網址</span>';
  const hint=document.querySelector('#aliasLimit');
  if(hint){const n=currentAliases.filter(a=>a.kind==='custom').length;hint.textContent='自訂 '+n+'/4 組，加上 Starry 身份網址最多共 5 組。';}
  updateLinkFilterV9();
};

function updateLinkFilterV9(){
  const wrap=document.querySelector('#linkFilterWrap');
  const select=document.querySelector('#linkAliasFilter');
  if(!wrap||!select)return;
  const shouldShow=currentAliases.length>=2;
  wrap.hidden=!shouldShow;
  if(!shouldShow){linkAliasFilterV9='all';return;}
  const slugs=[];
  for(const a of currentAliases)if(a.slug&&!slugs.includes(a.slug))slugs.push(a.slug);
  for(const l of currentLinks)if(l.namespace_slug&&!slugs.includes(l.namespace_slug))slugs.push(l.namespace_slug);
  let options='<option value="all">全部</option>'+slugs.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
  if(isSuperAdminV9&&currentLinks.some(l=>!l.namespace_slug))options+='<option value="__none">無個人化網址</option>';
  select.innerHTML=options;
  const valid=[...slugs,'all','__none'];
  if(!valid.includes(linkAliasFilterV9))linkAliasFilterV9='all';
  select.value=linkAliasFilterV9;
}

function renderLinksV9(list){
  const box=document.querySelector('#links');
  if(!box)return;
  if(!list.length){box.innerHTML='<div class="empty">'+(currentLinks.length?'這個篩選條件目前沒有連結。':'你還沒有任意門連結。建立第一個吧！')+'</div>';return;}
  box.innerHTML=list.map(x=>{
    const image=x.preview_image_url?'<img class="preview-image" src="'+esc(x.preview_image_url)+'" alt="原網址預覽圖" loading="lazy" referrerpolicy="no-referrer">':'<div class="preview-placeholder"><img src="/icon.svg" alt=""></div>';
    const userTitle=x.title?'<div class="link-title">'+esc(x.title)+'</div>':'';
    const originalTitle=x.preview_title?'<div class="preview-title">原頁標題：'+esc(x.preview_title)+'</div>':'<div class="preview-title muted">原頁標題：讀取中或網站未提供</div>';
    return '<div class="link"><div class="link-main"><div class="preview-layout">'+image+'<div><div class="row"><span class="short">'+esc(displayShortUrl(x))+'</span></div>'+userTitle+originalTitle+'<div class="dest">'+esc(x.destination_url)+'</div><div class="muted" style="font-size:12px;margin-top:6px">點擊 '+x.click_count+' 次'+(x.last_clicked_at?' · 最近 '+esc(x.last_clicked_at):'')+'</div></div></div></div><div class="row actions"><button class="btn secondary small" data-copy="'+esc(shortUrl(x))+'">複製</button><button class="btn secondary small" data-qr="'+esc(x.id)+'">QR</button><button class="btn secondary small" data-edit="'+esc(x.id)+'">修改</button><button class="btn danger small" data-del="'+esc(x.id)+'">刪除</button></div></div>';
  }).join('');
}

links=async function(){
  const data=await api('/api/links');
  currentLinks=data.links||[];
  updateLinkFilterV9();
  const filtered=linkAliasFilterV9==='all'?currentLinks:linkAliasFilterV9==='__none'?currentLinks.filter(x=>!x.namespace_slug):currentLinks.filter(x=>x.namespace_slug===linkAliasFilterV9);
  renderLinksV9(filtered);
  const missing=currentLinks.filter(x=>!x.metadata_checked_at).slice(0,6);
  if(missing.length&&!metadataRefreshing){metadataRefreshing=true;Promise.allSettled(missing.map(x=>api('/api/links/'+x.id+'/metadata',{method:'POST'}))).finally(async()=>{metadataRefreshing=false;await links()});}
};

document.querySelector('#linkAliasFilter')?.addEventListener('change',e=>{linkAliasFilterV9=e.currentTarget.value||'all';const filtered=linkAliasFilterV9==='all'?currentLinks:linkAliasFilterV9==='__none'?currentLinks.filter(x=>!x.namespace_slug):currentLinks.filter(x=>x.namespace_slug===linkAliasFilterV9);renderLinksV9(filtered)});

async function hydrateMenuV9(){
  try{
    const me=await api('/api/me');
    if(!me.user){setMenuAccessV9(null);return;}
    setMenuAccessV9(me.user);
    const name=document.querySelector('#menuName');if(name)name.textContent=me.user.display_name||me.user.email||'Starry 會員';
    const rank=document.querySelector('#menuRank');if(rank){rank.textContent=me.user.starry_rank||'';rank.hidden=!me.user.starry_rank;}
    const avatar=document.querySelector('#menuAvatar');if(avatar&&me.user.avatar_url)avatar.src=me.user.avatar_url;
  }catch{}
}

async function initRankingV9(){
  const box=document.querySelector('#rankingListV9');
  if(!box)return;
  try{
    const data=await api('/api/ranking');
    const rows=data.ranking||[];
    if(!rows.length){box.innerHTML='<div class="empty">目前還沒有可列入排行榜的個人化網址。</div>';return;}
    box.innerHTML=rows.map((r,i)=>'<div class="ranking-row-v9"><div class="ranking-pos-v9">#'+(i+1)+'</div><div class="ranking-alias-v9">'+esc(r.slug)+'</div><div class="ranking-count-v9">'+Number(r.short_count||0)+' 個短網址</div></div>').join('');
  }catch(err){box.innerHTML='<div class="notice">排行榜讀取失敗：'+esc(err.message)+'</div>';}
}

async function loadAdminPersonalizationV9(){
  const root=document.querySelector('#adminPersonalizationV9');
  if(!root)return;
  try{
    const data=await api('/api/admin/personalization');
    const rule=data.short_code_rule||{};
    const ruleBox=document.querySelector('#shortCodeRuleV9');
    if(ruleBox)ruleBox.innerHTML='<div><b>短碼長度：</b>'+esc(rule.length)+'</div><div><b>可用字元：</b><code>'+esc(rule.alphabet)+'</code></div><div><b>可用字元數：</b>'+esc(rule.alphabet_count)+'</div><div><b>每組個人化網址容量：</b>'+Number(rule.combinations_per_personalized_url||0).toLocaleString()+' 組</div><div><b>大小寫：</b>不分大小寫</div><div><b>容量範圍：</b>'+esc(rule.scope||'')+'</div><div><b>規避原則：</b>'+esc(rule.excluded_reason||'')+'</div>';
    const custom=document.querySelector('#customAliasRulesV9');
    if(custom)custom.innerHTML=(data.custom_alias_rules||[]).map(x=>'<li>'+esc(x)+'</li>').join('');
    const list=document.querySelector('#reservedAliasesV9');
    const rows=data.reserved_aliases||[];
    if(list)list.innerHTML=rows.length?rows.map(r=>'<div class="reserved-row-v9"><div><div class="reserved-name-v9">'+esc(r.slug)+'</div>'+(r.note?'<div class="reserved-note-v9">'+esc(r.note)+'</div>':'')+(r.occupied?'<div class="danger-text-v9">目前已被會員使用</div>':'')+'</div><button class="btn danger small" data-reserved-delete="'+esc(r.slug)+'">移除保留</button></div>').join(''):'<div class="empty">目前沒有額外保留名稱。</div>';
  }catch(err){root.innerHTML='<div class="notice">個人化管理讀取失敗：'+esc(err.message)+'</div>';}
}

document.querySelector('#reserveAliasFormV9')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const slug=form.querySelector('[name="slug"]')?.value||'';const note=form.querySelector('[name="note"]')?.value||'';try{await api('/api/admin/personalization/reserved',{method:'POST',body:JSON.stringify({slug,note})});form.reset();await loadAdminPersonalizationV9()}catch(err){alert(err.message)}});
document.addEventListener('click',async e=>{const target=e.target;if(!(target instanceof Element))return;const b=target.closest('[data-reserved-delete]');if(!b)return;if(!confirm('移除這組管理員保留名稱？'))return;try{await api('/api/admin/personalization/reserved/'+encodeURIComponent(b.dataset.reservedDelete),{method:'DELETE'});await loadAdminPersonalizationV9()}catch(err){alert(err.message)}});

hydrateMenuV9();
initRankingV9();
loadAdminPersonalizationV9();
`;

export function homePage(): string {
  return enhanceV9(baseHomePage());
}

export function rankingPage(): string {
  return enhanceV9(baseSimplePage("個人化網址排行榜", `<p class="muted">依目前仍存在的短網址數量排序。只顯示個人化網址，不顯示會員姓名或其他個人資料；短網址數量為 0 不列入。</p><div id="rankingListV9" class="ranking-list-v9"><div class="empty">讀取排行榜中…</div></div>`));
}

export function adminPersonalizationPage(): string {
  return enhanceV9(baseSimplePage("個人化管理", `<div id="adminPersonalizationV9"><div class="admin-grid-v9"><section class="admin-panel-v9"><h3>短碼產生規則</h3><div id="shortCodeRuleV9" class="muted">讀取中…</div></section><section class="admin-panel-v9"><h3>個人化網址限制</h3><ul id="customAliasRulesV9" class="rule-list-v9"></ul></section></div><section class="admin-panel-v9"><h3>管理員保留的個人化網址</h3><p class="muted">保留後，一般會員不能用這個名稱建立自訂個人化網址。已經被會員使用中的名稱不能強制收回。</p><form id="reserveAliasFormV9" class="grid"><div><label>保留名稱</label><input name="slug" minlength="2" maxlength="32" required placeholder="例如 official"></div><div><label>備註（選填）</label><input name="note" maxlength="120" placeholder="例如官方活動專用"></div><div><button class="btn accent" type="submit">加入保留</button></div></form><div id="reservedAliasesV9" style="margin-top:14px"><div class="empty">讀取中…</div></div></section></div>`));
}
