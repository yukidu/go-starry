import { appJs as baseAppJs, styles as baseStyles } from "./uiV10";
import { simplePage as baseSimplePage } from "./uiV6";

const MENU_INSTALL = `<button class="menu-item" data-install><span class="menu-icon">⇩</span><span data-install-label>安裝到桌面</span></button>`;
const MENU_V11 = `<a id="menuRanking" class="menu-item" href="/ranking"><span class="menu-icon">🏆</span>排行榜</a><a id="menuQrGenerator" class="menu-item" href="/qr-generator"><span class="menu-icon">▦</span>QR Code 產生器</a><a id="menuPersonalizationAdmin" class="menu-item" href="/admin/personalization" hidden><span class="menu-icon">⚙</span>個人化管理</a>${MENU_INSTALL}`;

function enhanceMenu(markup: string): string {
  return markup.replace(MENU_INSTALL, MENU_V11);
}

export const styles = `${baseStyles}
.qr-generator-v11{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr);gap:18px;align-items:start}.qr-editor-v11,.qr-preview-panel-v11{border:1px solid #e5e8f0;border-radius:20px;background:#fbfcff;padding:18px}.qr-editor-v11 textarea{min-height:150px;resize:vertical;line-height:1.55}.qr-input-actions-v11{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.qr-settings-v11{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:16px}.qr-char-v11{font-size:12px;color:#8a90a0;text-align:right;margin-top:6px}.qr-generate-v11{width:100%;margin-top:16px;min-height:48px}.qr-preview-panel-v11{text-align:center;position:sticky;top:84px}.qr-placeholder-v11{min-height:320px;border:1px dashed #d8ddea;border-radius:18px;display:grid;place-items:center;background:linear-gradient(145deg,#fff,#f5f7fb);padding:24px}.qr-placeholder-icon-v11{width:74px;height:74px;border-radius:22px;display:grid;place-items:center;margin:0 auto 12px;background:linear-gradient(135deg,#111b38,#2b447d);color:#ffe58f;font-size:34px;box-shadow:0 14px 34px rgba(30,48,88,.2)}.qr-preview-v11{width:min(100%,360px);aspect-ratio:1;object-fit:contain;border-radius:18px;background:#fff;padding:12px;border:1px solid #e5e8f0;box-shadow:0 14px 38px rgba(15,23,42,.08)}.qr-result-v11[hidden]{display:none}.qr-downloads-v11{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.qr-result-note-v11{font-size:12px;color:#7b8495;overflow-wrap:anywhere;margin-top:10px}.qr-help-v11{margin-top:12px;font-size:12px;color:#747d8f;line-height:1.6}@media(max-width:760px){.qr-generator-v11{grid-template-columns:1fr}.qr-preview-panel-v11{position:static}.qr-placeholder-v11{min-height:250px}.qr-downloads-v11{grid-template-columns:1fr 1fr}}@media(max-width:420px){.qr-editor-v11,.qr-preview-panel-v11{padding:14px;border-radius:17px}.qr-downloads-v11{grid-template-columns:1fr}}
`;

export const appJs = baseAppJs + `
let qrSvgBlobV11=null;
let qrSvgUrlV11='';
let qrLastContentV11='';

function qrSetBusyV11(busy){
  const button=document.querySelector('#qrGenerateV11');
  if(!button)return;
  button.disabled=busy;
  button.textContent=busy?'產生中…':'產生 QR Code';
}

function qrUpdateCountV11(){
  const input=document.querySelector('#qrContentV11');
  const count=document.querySelector('#qrCharCountV11');
  if(input&&count)count.textContent=String(input.value.length)+'/2000';
}

function qrClearObjectV11(){
  if(qrSvgUrlV11){URL.revokeObjectURL(qrSvgUrlV11);qrSvgUrlV11='';}
  qrSvgBlobV11=null;
}

function qrShowResultV11(blob,content){
  qrClearObjectV11();
  qrSvgBlobV11=blob;
  qrSvgUrlV11=URL.createObjectURL(blob);
  qrLastContentV11=content;
  const image=document.querySelector('#qrPreviewV11');
  const placeholder=document.querySelector('#qrPlaceholderV11');
  const result=document.querySelector('#qrResultV11');
  const note=document.querySelector('#qrResultNoteV11');
  if(image)image.src=qrSvgUrlV11;
  if(placeholder)placeholder.hidden=true;
  if(result)result.hidden=false;
  if(note)note.textContent=content.length>90?content.slice(0,87)+'…':content;
}

async function qrPasteV11(){
  const input=document.querySelector('#qrContentV11');
  if(!input)return;
  try{
    if(!navigator.clipboard||typeof navigator.clipboard.readText!=='function')throw new Error('clipboard_unavailable');
    const value=(await navigator.clipboard.readText()).trim();
    if(!value){alert('剪貼簿目前沒有內容。');return;}
    input.value=value.slice(0,2000);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.focus();
  }catch{
    alert('瀏覽器未允許讀取剪貼簿，請長按輸入框貼上。');
    input.focus();
  }
}

function qrClearV11(){
  const form=document.querySelector('#qrGeneratorFormV11');
  form?.reset();
  qrClearObjectV11();
  qrLastContentV11='';
  const image=document.querySelector('#qrPreviewV11');
  const placeholder=document.querySelector('#qrPlaceholderV11');
  const result=document.querySelector('#qrResultV11');
  if(image)image.removeAttribute('src');
  if(placeholder)placeholder.hidden=false;
  if(result)result.hidden=true;
  qrUpdateCountV11();
  document.querySelector('#qrContentV11')?.focus();
}

async function qrGenerateV11(event){
  event.preventDefault();
  const input=document.querySelector('#qrContentV11');
  const sizeSelect=document.querySelector('#qrSizeV11');
  if(!input)return;
  const content=input.value.trim();
  if(!content){alert('請先輸入網址或文字。');input.focus();return;}
  qrSetBusyV11(true);
  try{
    const response=await fetch('/api/qr-generator',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content,size:Number(sizeSelect?.value||1024)})});
    if(!response.ok){let message='QR Code 產生失敗';try{const data=await response.json();if(data?.error)message=data.error}catch{}throw new Error(message)}
    qrShowResultV11(await response.blob(),content);
  }catch(error){alert(error?.message||'QR Code 產生失敗，請稍後再試。')}
  finally{qrSetBusyV11(false)}
}

function qrDownloadSvgV11(){
  if(!qrSvgUrlV11)return;
  const a=document.createElement('a');
  a.href=qrSvgUrlV11;
  a.download='starry-qr-code.svg';
  document.body.appendChild(a);a.click();a.remove();
}

async function qrDownloadPngV11(){
  if(!qrSvgUrlV11)return;
  const size=Number(document.querySelector('#qrSizeV11')?.value||1024);
  const image=new Image();
  image.onload=()=>{
    const canvas=document.createElement('canvas');
    canvas.width=size;canvas.height=size;
    const ctx=canvas.getContext('2d');
    if(!ctx){alert('這個瀏覽器無法建立 PNG 圖片。');return;}
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);ctx.drawImage(image,0,0,size,size);
    canvas.toBlob(blob=>{
      if(!blob){alert('PNG 產生失敗。');return;}
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='starry-qr-code.png';document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    },'image/png');
  };
  image.onerror=()=>alert('PNG 轉換失敗，請改下載 SVG。');
  image.src=qrSvgUrlV11;
}

function initQrGeneratorV11(){
  const form=document.querySelector('#qrGeneratorFormV11');
  if(!form)return;
  form.addEventListener('submit',qrGenerateV11);
  document.querySelector('#qrPasteV11')?.addEventListener('click',qrPasteV11);
  document.querySelector('#qrClearV11')?.addEventListener('click',qrClearV11);
  document.querySelector('#qrDownloadSvgV11')?.addEventListener('click',qrDownloadSvgV11);
  document.querySelector('#qrDownloadPngV11')?.addEventListener('click',qrDownloadPngV11);
  document.querySelector('#qrContentV11')?.addEventListener('input',qrUpdateCountV11);
  qrUpdateCountV11();
}

initQrGeneratorV11();
`;

export function qrGeneratorPage(): string {
  return enhanceMenu(baseSimplePage("QR Code 產生器", `<div class="qr-generator-v11"><section class="qr-editor-v11"><form id="qrGeneratorFormV11"><label for="qrContentV11">網址或文字</label><textarea id="qrContentV11" maxlength="2000" required placeholder="貼上網址，或輸入要放進 QR Code 的文字"></textarea><div id="qrCharCountV11" class="qr-char-v11">0/2000</div><div class="qr-input-actions-v11"><button id="qrPasteV11" class="btn secondary small" type="button">貼上</button><button id="qrClearV11" class="btn secondary small" type="button">清空</button></div><div class="qr-settings-v11"><div><label for="qrSizeV11">圖片尺寸</label><select id="qrSizeV11"><option value="512">512 × 512</option><option value="1024" selected>1024 × 1024</option><option value="1536">1536 × 1536</option></select></div></div><button id="qrGenerateV11" class="btn accent qr-generate-v11" type="submit">產生 QR Code</button></form><div class="qr-help-v11">QR Code 只在產生當下建立，不會儲存你輸入的文字或網址。</div></section><section class="qr-preview-panel-v11"><div id="qrPlaceholderV11" class="qr-placeholder-v11"><div><div class="qr-placeholder-icon-v11">▦</div><b>QR Code 預覽</b><div class="muted" style="margin-top:6px">輸入內容後按「產生 QR Code」</div></div></div><div id="qrResultV11" class="qr-result-v11" hidden><img id="qrPreviewV11" class="qr-preview-v11" alt="QR Code 預覽"><div id="qrResultNoteV11" class="qr-result-note-v11"></div><div class="qr-downloads-v11"><button id="qrDownloadPngV11" class="btn accent" type="button">下載 PNG</button><button id="qrDownloadSvgV11" class="btn secondary" type="button">下載 SVG</button></div></div></section></div>`));
}
