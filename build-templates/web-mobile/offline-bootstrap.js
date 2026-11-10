(() => {
  'use strict';
  const emit = (type,detail) => {
    window.__sadnessOffline = {type,detail};
    window.dispatchEvent(new CustomEvent('sadness-offline',{detail:{type,detail}}));
  };
  const safeArea = document.createElement('div');
  safeArea.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(safeArea);
  window.__sadnessSafeArea = () => {const style=getComputedStyle(safeArea);return {top:parseFloat(style.paddingTop)||0,right:parseFloat(style.paddingRight)||0,bottom:parseFloat(style.paddingBottom)||0,left:parseFloat(style.paddingLeft)||0};};
  if (!('serviceWorker' in navigator)) {emit('offline-unavailable');return;}
  navigator.serviceWorker.addEventListener('message',event=>{if(String(event.data?.type).startsWith('offline-'))emit(event.data.type,event.data.detail);});
  window.addEventListener('load',async()=>{
    try {
      const registration=await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});
      // Explicit all-resources verification; no readiness inference from registration alone.
      const ready=await navigator.serviceWorker.ready;
      ready.active?.postMessage({type:'prepare-offline'});
      if(navigator.onLine) registration.update().catch(()=>{});
    } catch(error) {emit('offline-unavailable',String(error));}
  });
})();
