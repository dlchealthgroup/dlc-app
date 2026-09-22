// DLC OS · funcionamiento sin conexión
const CACHE='dlc-os-1.6.0';
const SHELL=['./','./index.html','./app.js?v=1.6.0','./logo.png','./dlc-apple-touch-180.png','./manifest.webmanifest','./dlc-icon-192.png','./dlc-icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request, url=new URL(req.url);
  if(req.method!=='GET')return;
  if(url.hostname.endsWith('script.google.com')||url.hostname.endsWith('googleusercontent.com'))return; // datos: siempre a la red
  if(url.hostname.includes('fonts.g')){e.respondWith(caches.open(CACHE).then(async c=>{const hit=await c.match(req);if(hit)return hit;try{const r=await fetch(req);c.put(req,r.clone());return r}catch(err){return new Response('',{status:504})}}));return}
  if(url.origin!==location.origin)return;
  if(/version\.json/.test(url.pathname))return; // siempre de la red
  if(/manifest\.webmanifest|dlc-icon|apple-touch|logo\.png/.test(url.pathname)){e.respondWith(fetch(req).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp));return r}).catch(()=>caches.match(req)));return}
  if(req.mode==='navigate'){ // página: red primero (para recibir versiones nuevas), sin red la guardada
    e.respondWith(fetch(req).then(r=>{caches.open(CACHE).then(c=>c.put('./index.html',r.clone()));return r}).catch(()=>caches.match('./index.html')));return}
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp));return r})));
});
