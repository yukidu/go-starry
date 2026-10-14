import { appJs as baseAppJs, styles as baseStyles } from "./uiV9";

const dialogPrelude = `
let starryDialogTail=Promise.resolve();
function starryDialogTitle(message,confirmMode){
  const text=String(message||'');
  if(confirmMode&&/(刪除|移除|清除|永久)/.test(text))return '確認刪除';
  return confirmMode?'請確認':'提示';
}
function showStarryDialog({message,confirmMode=false}){
  return new Promise(resolve=>{
    const backdrop=document.createElement('div');
    backdrop.className='starry-dialog-backdrop';
    const card=document.createElement('section');
    card.className='starry-dialog-card';
    card.setAttribute('role','dialog');
    card.setAttribute('aria-modal','true');
    const danger=confirmMode&&/(刪除|移除|清除|永久)/.test(String(message||''));
    const icon=document.createElement('div');
    icon.className='starry-dialog-icon'+(danger?' danger':'');
    icon.textContent=danger?'!':'✦';
    const title=document.createElement('h3');
    title.className='starry-dialog-title';
    title.textContent=starryDialogTitle(message,confirmMode);
    const body=document.createElement('div');
    body.className='starry-dialog-message';
    body.textContent=String(message??'');
    const actions=document.createElement('div');
    actions.className='starry-dialog-actions';
    let settled=false;
    const finish=value=>{
      if(settled)return;
      settled=true;
      document.removeEventListener('keydown',onKey,true);
      backdrop.classList.remove('open');
      setTimeout(()=>backdrop.remove(),140);
      resolve(value);
    };
    const onKey=e=>{
      if(e.key==='Escape'){e.preventDefault();finish(confirmMode?false:true)}
    };
    if(confirmMode){
      const cancel=document.createElement('button');
      cancel.type='button';
      cancel.className='starry-dialog-btn secondary';
      cancel.textContent='取消';
      cancel.addEventListener('click',()=>finish(false));
      actions.appendChild(cancel);
    }
    const ok=document.createElement('button');
    ok.type='button';
    ok.className='starry-dialog-btn '+(danger?'danger':'primary');
    ok.textContent=confirmMode?'確定':'知道了';
    ok.addEventListener('click',()=>finish(true));
    actions.appendChild(ok);
    card.append(icon,title,body,actions);
    backdrop.appendChild(card);
    backdrop.addEventListener('click',e=>{if(e.target===backdrop)finish(confirmMode?false:true)});
    document.addEventListener('keydown',onKey,true);
    document.body.appendChild(backdrop);
    requestAnimationFrame(()=>backdrop.classList.add('open'));
    setTimeout(()=>ok.focus(),30);
  });
}
function enqueueStarryDialog(options){
  const run=()=>showStarryDialog(options);
  const result=starryDialogTail.then(run,run);
  starryDialogTail=result.then(()=>undefined,()=>undefined);
  return result;
}
function starryAlert(message){return enqueueStarryDialog({message,confirmMode:false})}
function starryConfirm(message){return enqueueStarryDialog({message,confirmMode:true})}
window.alert=message=>{void starryAlert(message)};
`;

function replaceNativeDialogs(script: string): string {
  return script.replaceAll("confirm(", "await starryConfirm(");
}

const dropdownAndValidation = `
(function initStarryExperience(){
  const selectMap=new WeakMap();
  const closeAllSelects=except=>{
    document.querySelectorAll('.starry-select-shell.open').forEach(shell=>{
      if(shell===except)return;
      shell.classList.remove('open');
      shell.querySelector('.starry-select-trigger')?.setAttribute('aria-expanded','false');
    });
  };

  function enhanceSelect(select){
    if(!(select instanceof HTMLSelectElement)||select.multiple||selectMap.has(select))return;
    select.classList.add('starry-native-select');
    select.tabIndex=-1;
    const shell=document.createElement('div');
    shell.className='starry-select-shell';
    const trigger=document.createElement('button');
    trigger.type='button';
    trigger.className='starry-select-trigger';
    trigger.setAttribute('aria-haspopup','listbox');
    trigger.setAttribute('aria-expanded','false');
    const label=document.createElement('span');
    label.className='starry-select-value';
    const caret=document.createElement('span');
    caret.className='starry-select-caret';
    caret.textContent='⌄';
    trigger.append(label,caret);
    const menu=document.createElement('div');
    menu.className='starry-select-menu';
    menu.setAttribute('role','listbox');
    shell.append(trigger,menu);
    select.insertAdjacentElement('afterend',shell);

    const refresh=()=>{
      trigger.disabled=select.disabled;
      shell.classList.toggle('disabled',select.disabled);
      const current=select.options[select.selectedIndex]||select.options[0];
      label.textContent=current?.textContent?.trim()||'請選擇';
      menu.innerHTML='';
      for(const option of Array.from(select.options)){
        const item=document.createElement('button');
        item.type='button';
        item.className='starry-select-option';
        item.setAttribute('role','option');
        item.setAttribute('aria-selected',option.value===select.value?'true':'false');
        item.disabled=option.disabled;
        const text=document.createElement('span');
        text.textContent=option.textContent||option.value;
        const mark=document.createElement('span');
        mark.className='starry-select-check';
        mark.textContent=option.value===select.value?'✓':'';
        item.append(text,mark);
        item.addEventListener('click',()=>{
          if(option.disabled)return;
          select.value=option.value;
          select.dispatchEvent(new Event('input',{bubbles:true}));
          select.dispatchEvent(new Event('change',{bubbles:true}));
          refresh();
          shell.classList.remove('open');
          trigger.setAttribute('aria-expanded','false');
          trigger.focus();
        });
        menu.appendChild(item);
      }
    };

    trigger.addEventListener('click',()=>{
      if(select.disabled)return;
      refresh();
      const opening=!shell.classList.contains('open');
      closeAllSelects(shell);
      shell.classList.toggle('open',opening);
      trigger.setAttribute('aria-expanded',opening?'true':'false');
    });
    select.addEventListener('change',refresh);
    new MutationObserver(refresh).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
    selectMap.set(select,{shell,refresh});
    refresh();
  }

  function scanSelects(root=document){
    if(root instanceof HTMLSelectElement)enhanceSelect(root);
    root.querySelectorAll?.('select').forEach(enhanceSelect);
  }
  scanSelects();
  new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(node instanceof Element)scanSelects(node);
      }
    }
  }).observe(document.documentElement,{childList:true,subtree:true});

  document.addEventListener('click',e=>{
    if(!(e.target instanceof Element)||!e.target.closest('.starry-select-shell'))closeAllSelects();
  },true);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape')closeAllSelects();
  },true);
  window.addEventListener('scroll',()=>closeAllSelects(),{passive:true});

  let invalidPending=false;
  document.addEventListener('invalid',e=>{
    e.preventDefault();
    const field=e.target;
    if(invalidPending||!(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement||field instanceof HTMLSelectElement))return;
    invalidPending=true;
    let message='請確認欄位內容是否正確。';
    if(field.validity.valueMissing)message='請先填寫這個欄位。';
    else if(field.validity.typeMismatch&&field.type==='url')message='請輸入完整網址，例如 https://example.com';
    else if(field.validity.tooShort)message='輸入內容太短，請再補充。';
    else if(field.validity.tooLong)message='輸入內容太長，請縮短後再試。';
    void starryAlert(message).finally(()=>{invalidPending=false;field.focus()});
  },true);
})();
`;

export const styles = `${baseStyles}
/* v10：統一自訂提示視窗與下拉選單 */
.modal-backdrop{background:rgb(15 23 42/.52);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.modal-card{border:1px solid rgb(255 255 255/.82);border-radius:26px;background:linear-gradient(180deg,rgba(255,255,255,.995),rgba(248,250,255,.985));box-shadow:0 30px 90px rgb(15 23 42/.28),0 2px 8px rgb(15 23 42/.08);padding:22px}
.modal-head h3{font-weight:950;letter-spacing:-.025em}.icon-btn{border:1px solid #e8ebf2;background:#f3f5f9;color:#475569;transition:transform .15s ease,background .15s ease}.icon-btn:hover{background:#e9edf5}.icon-btn:active{transform:scale(.94)}
.starry-dialog-backdrop{position:fixed;inset:0;z-index:3600;display:grid;place-items:center;padding:18px;background:rgba(15,23,42,.52);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);opacity:0;transition:opacity .14s ease}.starry-dialog-backdrop.open{opacity:1}.starry-dialog-card{width:min(100%,410px);border:1px solid rgba(255,255,255,.86);border-radius:28px;background:linear-gradient(180deg,#fff 0%,#f8faff 100%);box-shadow:0 34px 100px rgba(15,23,42,.32),0 2px 10px rgba(15,23,42,.08);padding:25px 23px 21px;text-align:center;transform:translateY(10px) scale(.97);transition:transform .16s ease}.starry-dialog-backdrop.open .starry-dialog-card{transform:none}.starry-dialog-icon{width:54px;height:54px;margin:0 auto 14px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,#111a35,#314c86);color:#ffe58f;font-size:24px;font-weight:950;box-shadow:0 12px 30px rgba(42,63,110,.22)}.starry-dialog-icon.danger{background:linear-gradient(135deg,#9f1239,#e11d48);color:#fff}.starry-dialog-title{margin:0;font-size:21px;font-weight:950;letter-spacing:-.025em;color:#182033}.starry-dialog-message{margin:10px auto 0;max-width:34ch;color:#626b7c;font-size:14px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}.starry-dialog-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:21px}.starry-dialog-actions:has(.starry-dialog-btn:only-child){grid-template-columns:1fr}.starry-dialog-btn{appearance:none;border:0;border-radius:14px;min-height:46px;padding:11px 16px;font:inherit;font-weight:900;cursor:pointer;transition:transform .14s ease,box-shadow .14s ease,filter .14s ease}.starry-dialog-btn:active{transform:scale(.97)}.starry-dialog-btn.primary{background:linear-gradient(135deg,#a75d78,#c98598);color:#fff;box-shadow:0 10px 24px rgba(192,108,132,.24)}.starry-dialog-btn.secondary{background:#edf1f7;color:#334155}.starry-dialog-btn.danger{background:linear-gradient(135deg,#be123c,#e11d48);color:#fff;box-shadow:0 10px 24px rgba(190,18,60,.22)}
.starry-native-select{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important;padding:0!important;border:0!important;margin:0!important}.starry-select-shell{position:relative;width:100%;font:inherit}.starry-select-trigger{appearance:none;width:100%;min-height:46px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border:1px solid #d8dce7;border-radius:13px;background:linear-gradient(180deg,#fff,#fafbfe);color:#1f2937;font:inherit;font-weight:750;text-align:left;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.03);transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease}.starry-select-trigger:hover{border-color:#c5cada}.starry-select-trigger:focus-visible{outline:none;border-color:#c98598;box-shadow:0 0 0 4px rgba(192,108,132,.13)}.starry-select-trigger:active{transform:scale(.995)}.starry-select-shell.disabled .starry-select-trigger{opacity:.55;cursor:not-allowed;background:#f3f4f6}.starry-select-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.starry-select-caret{flex:0 0 auto;width:24px;height:24px;border-radius:8px;display:grid;place-items:center;background:#eef1f7;color:#697386;font-size:17px;transition:transform .16s ease}.starry-select-shell.open .starry-select-caret{transform:rotate(180deg)}.starry-select-menu{position:absolute;z-index:2800;left:0;right:0;top:calc(100% + 7px);display:none;max-height:min(300px,48vh);overflow:auto;padding:7px;border:1px solid #e2e6ef;border-radius:16px;background:rgba(255,255,255,.99);box-shadow:0 20px 55px rgba(15,23,42,.22),0 2px 8px rgba(15,23,42,.06);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);overscroll-behavior:contain}.starry-select-shell.open .starry-select-menu{display:grid;gap:3px;animation:starrySelectIn .14s ease-out}@keyframes starrySelectIn{from{opacity:0;transform:translateY(-5px) scale(.985)}to{opacity:1;transform:none}}.starry-select-option{appearance:none;width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;border:0;border-radius:11px;background:transparent;color:#334155;padding:10px 11px;font:inherit;font-size:14px;font-weight:750;text-align:left;cursor:pointer}.starry-select-option:hover{background:#f2f5fa}.starry-select-option[aria-selected="true"]{background:#fff3f7;color:#8f3f5d;font-weight:900}.starry-select-option:disabled{opacity:.45;cursor:not-allowed}.starry-select-check{color:#b85f7b;font-weight:950}.modal-card .starry-select-menu{z-index:3700}
@media(max-width:520px){.starry-dialog-card{border-radius:24px;padding:22px 18px 18px}.starry-dialog-actions{gap:8px}.starry-select-menu{max-height:42vh}.starry-select-trigger{min-height:44px}.modal-card{border-radius:22px}}
`;

export const appJs = dialogPrelude + replaceNativeDialogs(baseAppJs) + dropdownAndValidation;
