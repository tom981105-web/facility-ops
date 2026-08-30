// FACILITY OPS v0.4.3 — FINAL LOGO MOUNT FIX
(function(){
  const STYLE_ID='facilityOpsLogoFinal043';
  let logoData='';
  let loading=false;
  let queued=false;

  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .facility-brand-logo-final{display:block!important;visibility:visible!important;opacity:1!important;object-fit:contain!important;object-position:center!important;flex:0 0 auto!important;transform:none!important;filter:none!important;background:transparent!important}
      .sidebar .brand>.facility-brand-logo-final,.brand>.facility-brand-logo-final{width:72px!important;height:48px!important;max-width:72px!important;min-width:72px!important;margin:0 2px 0 0!important}
      .auth-logo>.facility-brand-logo-final,.auth-card .facility-brand-logo-final{width:106px!important;height:70px!important;max-width:106px!important;margin:0 auto 10px!important}
      .brand>.brand-mark,.auth-logo>.brand-mark{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function extractLogoFromUiSource(text){
    const marker='const LOGO=';
    const start=text.indexOf(marker);
    if(start<0) throw new Error('LOGO declaration not found');
    const end=text.indexOf(';\n',start);
    if(end<0) throw new Error('LOGO declaration end not found');
    const expr=text.slice(start+marker.length,end);
    const parts=[];
    const re=/'([^']*)'/g;
    let m;
    while((m=re.exec(expr))) parts.push(m[1]);
    const result=parts.join('');
    if(!result.startsWith('data:image/')) throw new Error('Invalid logo data');
    return result;
  }

  async function loadLogo(){
    if(logoData||loading) return;
    loading=true;
    try{
      const res=await fetch('v043_ui.js?v=043-logo-source-final',{cache:'no-store'});
      if(!res.ok) throw new Error('UI source '+res.status);
      logoData=extractLogoFromUiSource(await res.text());
      mount();
    }catch(err){
      console.error('[FACILITY OPS logo final]',err);
    }finally{
      loading=false;
    }
  }

  function makeImg(kind){
    const img=document.createElement('img');
    img.className='facility-brand-logo-final';
    img.alt='FACILITY OPS';
    img.decoding='async';
    img.loading='eager';
    img.dataset.logoKind=kind;
    img.src=logoData;
    img.onerror=()=>console.error('[FACILITY OPS] logo image decode failed');
    return img;
  }

  function mountBrand(root){
    if(!root||!logoData) return;
    let img=root.querySelector(':scope > .facility-brand-logo-final');
    if(!img){
      img=makeImg('brand');
      root.prepend(img);
    }else if(img.src!==logoData){
      img.src=logoData;
    }
    const mark=root.querySelector(':scope > .brand-mark');
    if(mark) mark.style.display='none';
  }

  function mountAuth(){
    if(!logoData) return;
    const explicit=document.querySelector('.auth-logo');
    if(explicit){
      let img=explicit.querySelector(':scope > .facility-brand-logo-final');
      if(!img){img=makeImg('auth'); explicit.prepend(img);} else if(img.src!==logoData){img.src=logoData;}
      const mark=explicit.querySelector(':scope > .brand-mark');
      if(mark) mark.style.display='none';
      return;
    }
    const card=document.querySelector('.auth-card');
    if(card&&!card.querySelector(':scope > .facility-brand-logo-final')){
      card.prepend(makeImg('auth'));
    }
  }

  function mount(){
    queued=false;
    ensureStyle();
    if(!logoData){loadLogo();return;}
    document.querySelectorAll('.brand').forEach(mountBrand);
    mountAuth();
    document.documentElement.dataset.facilityLogo='mounted-final';
  }

  function queue(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(mount);
  }

  mount();
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',mount,{once:true});
  }
  window.addEventListener('load',mount,{once:true});
  const observer=new MutationObserver(queue);
  if(document.body) observer.observe(document.body,{childList:true,subtree:true});
  else document.addEventListener('DOMContentLoaded',()=>observer.observe(document.body,{childList:true,subtree:true}),{once:true});
})();
