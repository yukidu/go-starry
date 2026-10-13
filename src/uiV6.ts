import {
  appJs as baseAppJs,
  homePage as baseHomePage,
  simplePage as baseSimplePage,
  styles as baseStyles
} from "./ui";

const OLD_TOP_ACTIONS = `<div class="nav-toolbar"><button class="nav-action" data-scroll="createSection" aria-label="建立任意門">✦ <span>建立</span></button><button class="nav-action" data-scroll="linksSection" aria-label="我的連結">↗ <span>連結</span></button><button class="nav-action" data-scroll="aliasSection" aria-label="個人化網址">@ <span>個人化</span></button></div>`;

const MEMBER_TOP = `<a id="navMemberLink" class="nav-member" hidden><img id="navAvatar" class="nav-member-avatar" src="/icon.svg" alt="會員頭像"><span class="nav-member-copy"><span id="navName" class="nav-member-name">Starry 會員</span><span id="navRank" class="nav-member-rank" hidden></span></span></a>`;

const OLD_ALIAS_HELP = `<p class="muted" style="margin-top:-7px">可選擇 Starry 公開頁編號，或建立最多 4 組自訂帳號。建立短網址時可隨時從下拉選單切換。</p>`;

const OLD_URL_FIELD = `<div><label>原始網址</label><input name="destination_url" type="url" required placeholder="https://example.com/very-long-url"></div>`;
const NEW_URL_FIELD = `<div><label>原始網址</label><div class="url-input-row"><input id="destinationUrl" name="destination_url" type="url" required inputmode="url" placeholder="https://example.com/very-long-url"><button id="pasteUrl" class="btn secondary paste-url-btn" type="button">貼上網址</button></div></div>`;

function enhanceMarkup(markup: string): string {
  return markup
    .replace(OLD_TOP_ACTIONS, MEMBER_TOP)
    .replace(OLD_ALIAS_HELP, "")
    .replace(OLD_URL_FIELD, NEW_URL_FIELD);
}

export const styles = `${baseStyles}
.nav-member{margin-left:auto;min-width:0;max-width:min(240px,36vw);display:flex;align-items:center;gap:8px;padding:4px 7px;border-radius:14px;text-decoration:none;color:#1f2937;transition:background-color .15s ease,transform .15s ease}.nav-member[hidden]{display:none}.nav-member:hover{background:#f1f5f9}.nav-member:active{transform:scale(.98)}.nav-member-avatar{width:34px;height:34px;flex:0 0 34px;border-radius:50%;object-fit:cover;background:#eef1f7;box-shadow:0 0 0 1px #e5e7eb}.nav-member-copy{display:flex;min-width:0;flex-direction:column;align-items:flex-start;line-height:1.08}.nav-member-name,.nav-member-rank{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nav-member-name{font-size:13px;font-weight:900}.nav-member-rank{margin-top:3px;font-size:10px;font-weight:850;color:var(--accent)}.hamburger{margin-left:2px}.url-input-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:stretch}.url-input-row input{min-width:0}.paste-url-btn{white-space:nowrap;padding-inline:14px}@media(max-width:680px){.nav-row{gap:6px}.brand-domain{display:none}.nav-member{margin-left:auto;max-width:155px;padding:3px 4px;gap:6px}.nav-member-avatar{width:32px;height:32px;flex-basis:32px}.nav-member-name{font-size:12px}.nav-member-rank{font-size:9px}.nav-member-copy{max-width:105px}.hamburger{width:42px;flex-basis:42px}}@media(max-width:390px){.brand-name{font-size:14px}.brand-logo{width:33px;height:33px}.brand-link{gap:7px}.nav-member{max-width:128px}.nav-member-copy{max-width:82px}.nav-member-avatar{width:30px;height:30px;flex-basis:30px}.paste-url-btn{padding-inline:11px}}
`;

export const appJs = baseAppJs + `
async function hydrateTopMemberV6(){
  const wrap=document.querySelector('#navMemberLink');
  if(!wrap)return;
  try{
    const me=await api('/api/me');
    if(!me.user){wrap.hidden=true;return;}
    const user=me.user;
    const name=document.querySelector('#navName');
    const rank=document.querySelector('#navRank');
    const avatar=document.querySelector('#navAvatar');
    if(name)name.textContent=user.display_name||user.email||'Starry 會員';
    if(rank){rank.textContent=user.starry_rank||'';rank.hidden=!user.starry_rank;}
    if(avatar)avatar.src=user.avatar_url||'/icon.svg';
    if(user.starry_profile_url){wrap.href=user.starry_profile_url;wrap.title='查看 Starry ID 個人公開頁';}
    else{wrap.removeAttribute('href');wrap.removeAttribute('title');}
    wrap.hidden=false;
  }catch(error){console.warn('頂部會員資料載入失敗',error);wrap.hidden=true;}
}
async function pasteDestinationUrlV6(){
  const input=document.querySelector('#destinationUrl');
  if(!input)return;
  try{
    if(!navigator.clipboard||typeof navigator.clipboard.readText!=='function')throw new Error('clipboard_unavailable');
    const value=(await navigator.clipboard.readText()).trim();
    if(!value){alert('剪貼簿目前沒有網址。');input.focus();return;}
    input.value=value;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.focus();
  }catch(error){
    input.focus();
    alert('瀏覽器未允許直接讀取剪貼簿，請長按網址欄貼上。');
  }
}
function isYoutubeUrlV6(value){
  try{const host=new URL(value).hostname.toLowerCase().replace(/^www\\./,'');return host==='youtu.be'||host==='youtube.com'||host==='m.youtube.com'||host==='youtube-nocookie.com';}catch{return false;}
}
async function refreshExistingYoutubePreviewsV6(){
  for(let attempt=0;attempt<12&&(!Array.isArray(currentLinks)||currentLinks.length===0);attempt++)await new Promise(resolve=>setTimeout(resolve,250));
  if(!Array.isArray(currentLinks)||!currentLinks.length)return;
  const targets=currentLinks.filter(x=>isYoutubeUrlV6(x.destination_url)&&(!x.preview_title||!x.preview_image_url)).slice(0,8);
  if(!targets.length)return;
  await Promise.allSettled(targets.map(x=>api('/api/links/'+x.id+'/metadata',{method:'POST'})));
  await links();
}
document.querySelector('#pasteUrl')?.addEventListener('click',pasteDestinationUrlV6);
hydrateTopMemberV6();
refreshExistingYoutubePreviewsV6().catch(error=>console.warn('YouTube 預覽補抓失敗',error));
`;

export function homePage(): string {
  return enhanceMarkup(baseHomePage());
}

export function simplePage(title: string, content: string): string {
  return enhanceMarkup(baseSimplePage(title, content));
}
