const DATA=window.__DATA;
const DAYS=['L','M','X','J','V'], DAYN={L:'lunes',M:'martes',X:'miércoles',J:'jueves',V:'viernes'};
const CALS=['Confirmada con dirección','Confirmada: centro sin dirección','Confirmada: solo población','Sin verificar: dato original con dirección','Sin verificar: dato original sin dirección'];
const RESULTS=['Presentado DOLNER','Interesado','Muestras entregadas','Ya prescribe','No estaba','No interesado','Ya no pasa consulta aquí'];
const norm=s=>(s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const $=id=>document.getElementById(id);
const esc=s=>(s??'').toString().replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uniq=a=>[...new Set(a.filter(Boolean))].sort((x,y)=>x.localeCompare(y,'es'));
const cnt=arr=>{const m=new Map();arr.forEach(x=>x&&m.set(x,(m.get(x)||0)+1));return m};
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=s=>s?s.split('-').reverse().join('/'):'';
const BYCODE=new Map(DATA.map(d=>[d.c,d]));

const OPT={prov:uniq(DATA.flatMap(d=>d.cons.map(c=>c.p).concat(d.p))),area:uniq(DATA.map(d=>d.a)),esp:uniq(DATA.map(d=>d.e)),tipo:['Persona','Centro']};
const grupoCount=cnt(DATA.flatMap(d=>[...new Set(d.cons.map(c=>c.g))]));
OPT.grupo=[...grupoCount.entries()].filter(([g,n])=>n>=3).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);

const S={prov:'',muni:'',grupo:'',centro:'',area:'',esp:'',dias:[],cal:[],tipo:'',texto:'',seg:'',agr:'grupo',privada:false,tab:'H',limit:100,rlimit:40,open:new Set(),route:null,areaSel:(localStorage.getItem('dlc_area')||'loc'),picks:new Set(),top:false,corDay:null,near:null,est:'',map:false,issue:''};

/* ---------- seguimiento (db) ---------- */
const SEG=new Map(); let DB=null;
const segOf=code=>SEG.get(code);
function daysFor(d,c){const s=segOf(d.c);return DAYS.map((k,i)=>(c&&c.dy[i])||(s&&s.horario&&s.horario[k]&&(!s.ce||!c||s.ce===c.ce)?s.horario[k]:'')||'')}

/* ---------- priority ---------- */
const ESPW={'Traumatología':3,'Medicina del dolor':3,'Reumatología':3,'Rehabilitación':2,'Medicina del deporte':2};
function prio(d){
  let s=(ESPW[d.e]||1)+(d.q==='Confirmada con dirección'?2:d.q.startsWith('Confirmada')?1:0)+(/jefe|director|coordinador/i.test(d.car)?1:0);
  return s>=5?'A':s>=3?'B':'C';
}
const PRIO_ORD={A:0,B:1,C:2};

/* ---------- filters (explorer) ---------- */
function fillSelect(el,opts,all){el.innerHTML=`<option value="">${all}</option>`+opts.map(o=>`<option>${esc(o)}</option>`).join('')}
function munisFor(prov){return uniq(DATA.flatMap(d=>d.cons.filter(c=>!prov||c.p===prov).map(c=>c.m)))}
function consMatch(c,ignoreCentre){
  if(S.prov&&c.p!==S.prov)return false;
  if(S.muni&&c.m!==S.muni)return false;
  if(!ignoreCentre){if(S.grupo&&c.g!==S.grupo)return false;if(S.centro&&!norm(c.ce).includes(norm(S.centro)))return false;}
  if(S.dias.length&&!S.dias.some(k=>c.dy[DAYS.indexOf(k)]))return false;
  return true;
}
function docMatch(d){
  if(S.area&&d.a!==S.area)return false; if(S.esp&&d.e!==S.esp)return false; if(S.tipo&&d.t!==S.tipo)return false;
  if(S.top&&!d.top)return false;
  if(S.est&&estadoDe(d)!==S.est)return false;
  if(S.issue){const it=ISSUES.find(x=>x[0]===S.issue);if(!it||!enPool(d)||!it[2](d))return false}
  if(S.cal.length&&!S.cal.includes(d.q))return false; if(S.texto&&!norm(d.n).includes(norm(S.texto)))return false;
  const s=segOf(d.c);
  if(S.seg==='sin'&&s&&s.ultima)return false; if(S.seg==='vis'&&!(s&&s.ultima))return false; if(S.seg==='prox'&&!(s&&s.prox))return false;
  return true;
}
function filtered(){const out=[];for(const d of DATA){if(!docMatch(d))continue;const c=d.cons.find(c=>consMatch(c,false));if(c)out.push([d,c])}
  if(S.near){const me=S.near;const res=[];for(const [d] of out){let best=null,bc=null;for(const c of d.cons){const xy=xyOf(c);if(!xy)continue;const k=hav(me,xy);if(best==null||k<best){best=k;bc=c}}d._km=best;d._kx=!!(bc&&bc.lat);if(best!=null&&best<=25)res.push([d,bc])}
    res.sort((a,b)=>a[0]._km-b[0]._km);return res}
  DATA.forEach(d=>{if(d._km!=null)d._km=null});return out}
function ranking(){
  const m=new Map();
  for(const d of DATA){
    if(!docMatch(d))continue; const seen=new Set();
    for(const c of d.cons){
      if(!c.ce||!consMatch(c,true))continue; if(!S.privada&&c.ce==='CONSULTA PRIVADA')continue;
      if(S.grupo&&c.g!==S.grupo)continue; if(S.centro&&!norm(c.ce).includes(norm(S.centro)))continue;
      const key=S.agr==='grupo'?c.g:c.ce+'|'+c.m; if(seen.has(key))continue; seen.add(key);
      let r=m.get(key); if(!r){r={key,name:S.agr==='grupo'?c.g:c.ce,muni:S.agr==='grupo'?new Set():c.m,n:0,cf:0,ce:c.ce,g:c.g};m.set(key,r)}
      r.n++; if(c.cf)r.cf++; if(S.agr==='grupo')r.muni.add(c.m);
    }
  }
  return [...m.values()].sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name,'es'));
}

/* ---------- routes ---------- */
const BCN='BARCELONA';
const TOPROUTES=[
 {id:'TU',top:true,dyn:true,name:'Urgentes · todos los pendientes',blocks:[{t:'Por zona',dyn:true}]},
 {id:'T1',top:true,name:'Urgente 1 · Zona alta (martes)',blocks:[
   {t:'Mañana',h:'9:30-13:30',zones:['d:Les Corts','d:Sarrià-Sant Gervasi'],stops:[
     {ce:'HOSPITAL UNIVERSITARI DEXEUS',m:BCN,label:'Dexeus · Unidad del dolor (1ª planta) e ICATME',codes:[1698,90001,841,3274,3538,3931]},
     {ce:'CLINICA SAGRADA FAMILIA',m:BCN,codes:[387,143,1782]}]},
   {t:'Tarde',h:'15:30-19:30',zones:['d:Sarrià-Sant Gervasi','d:Eixample'],stops:[
     {ce:'CLINICA CORACHAN',m:BCN,label:'Corachan · martes tarde: Solsona (15:30-19:00), Marta Franco y Forés',codes:[394,90005,90002]},
     {ce:'CLINICUM',m:BCN,q:'Clinicum, Passeig de Gràcia, Barcelona',label:'Clinicum · Passeig de Gràcia (número por confirmar)',codes:[35]}]}]},
 {id:'T3',top:true,cor:true,name:'Urgente 3 · Corachan por visitar',blocks:[{t:'Mañana',h:'9:30-13:30',cor:'M'},{t:'Tarde',h:'15:30-19:30',cor:'T'}]},
 {id:'T2',top:true,name:'Urgente 2 · Sants y Sant Andreu',blocks:[
   {t:'Mañana',h:'9:30-13:30',zones:['d:Sants-Montjuïc','d:Eixample'],stops:[
     {ce:'CENTRO MEDICO HOSTAFRANC',m:BCN,codes:[3128,10002]},
     {ce:'CENTRE MEDIC CATALUNYA',m:BCN,q:'Centre Mèdic Catalunya, Barcelona',label:'C.M. Catalunya (dirección por confirmar)',codes:[193]}]},
   {t:'Tarde',h:'16:00-19:30',zones:['d:Sant Andreu','d:Nou Barris'],stops:[
     {ce:'CLINICA SANT JORDI',m:BCN,label:'Clínica Sant Jordi (HM) · Sant Andreu',codes:[2411,60]}]}]},
];
const BASEROUTES=[
 {id:'R1',name:'Sant Cugat y Teknon',blocks:[
   {t:'Mañana',h:'9:30-13:30',anchors:[['HOSPITAL GENERAL DE CATALUNYA','SANT CUGAT DEL VALLES'],['CENTRE MEDIC CAN MORA','SANT CUGAT DEL VALLES']],zones:['m:SANT CUGAT DEL VALLES','m:RUBI','m:SANT QUIRZE DEL VALLES','m:VALLDOREIX']},
   {t:'Tarde',h:'16:00-19:30',anchors:[['CENTRO MEDICO TEKNON',BCN]],zones:['d:Sarrià-Sant Gervasi']}]},
 {id:'R2',name:'Zona alta: Quirónsalud, CIMA, Dexeus',blocks:[
   {t:'Mañana',h:'9:30-13:30',anchors:[['QUIRONSALUD',BCN],['CLINICA TRES TORRES',BCN]],zones:['d:Sarrià-Sant Gervasi','d:Gràcia']},
   {t:'Tarde',h:'16:00-19:30',anchors:[['HOSPITAL UNIVERSITARI DEXEUS',BCN],['CIMA',BCN]],zones:['d:Les Corts']}]},
 {id:'R3',name:'Corachan y El Pilar',blocks:[
   {t:'Mañana',h:'9:30-13:30',anchors:[['CLINICA CORACHAN',BCN]],zones:['d:Sarrià-Sant Gervasi']},
   {t:'Tarde',h:'16:00-19:30',anchors:[['CLINICA DEL PILAR',BCN],['CENTRE MEDIC QUIRONSALUD ARIBAU',BCN]],zones:['d:Sarrià-Sant Gervasi','d:Eixample']}]},
 {id:'R4',name:'Barcelona centro',blocks:[
   {t:'Mañana',h:'9:30-13:30',anchors:[['HOSPITAL SAGRAT COR',BCN],['HOSPITAL CLINIC',BCN]],zones:['d:Eixample','d:Sants-Montjuïc','d:Ciutat Vella']},
   {t:'Tarde',h:'16:00-19:30',anchors:[['CLINICA SAGRADA FAMILIA',BCN],['CLINICA DEL REMEI',BCN]],zones:['d:Gràcia']}]},
 {id:'R5',name:'Sabadell y Barcelona norte',blocks:[
   {t:'Mañana',h:'9:30-13:30',anchors:[['PARC TAULI','SABADELL'],['HOSPITAL QUIRONSALUD DEL VALLES','SABADELL']],zones:['m:SABADELL','m:BARBERA DEL VALLES','m:CERDANYOLA DEL VALLES','m:RIPOLLET','m:MONTCADA I REIXAC','m:BADIA DEL VALLES']},
   {t:'Tarde',h:'16:00-19:30',anchors:[["HOSPITAL VALL D'HEBRON",BCN],['HOSPITAL DE SANT PAU',BCN]],zones:['d:Horta-Guinardó','d:Nou Barris','d:Sant Andreu','d:Sant Martí']}]},
 {id:'R6',name:'Corredor Manresa y Terrassa',blocks:[
   {t:'Mañana',h:'9:30-13:30',anchors:[['ALTHAIA','MANRESA'],['CIMETIR','MANRESA']],zones:['m:MANRESA','m:SANTPEDOR','m:NAVARCLES','m:SANT FRUITOS DE BAGES','m:SANT VICENC DE CASTELLET']},
   {t:'Tarde',h:'16:00-19:30',anchors:[['MUTUA TERRASSA','TERRASSA'],['APTIMA','TERRASSA']],zones:['m:TERRASSA','m:OLESA DE MONTSERRAT','m:ESPARREGUERA','m:VILADECAVALLS','m:MATADEPERA']}]},
];
const ROUTES=TOPROUTES.concat(BASEROUTES);
const ANCHORKEYS=new Set(BASEROUTES.flatMap(r=>r.blocks.flatMap(b=>b.anchors.map(a=>a.join('|')))));
const zoneOf=c=>c.m===BCN?(c.di?'d:'+c.di:null):'m:'+c.m;
const CORD=DATA.filter(d=>d.cor);
function corSlots(d){
  const out=d.sl.map(([day,f,n])=>({day,f,n,src:'nota'}));
  const c=d.cons.find(c=>c.ce==='CLINICA CORACHAN');
  if(c)c.dy.forEach((t,i)=>{if(!t)return;['M','T'].forEach(f=>{if((f==='M'&&/mañana/i.test(t))||(f==='T'&&/tarde/i.test(t))){if(!out.some(o=>o.day===i&&o.f===f))out.push({day:i,f,n:t,src:'web'})}})});
  return out;
}
function corBestDay(){const n=[0,0,0,0,0];CORD.forEach(d=>{const ds=new Set(corSlots(d).map(x=>x.day));ds.forEach(i=>n[i]++)});return n.indexOf(Math.max(...n))}
function routeDocs(b){
  if(b.dyn){ // urgentes pendientes, agrupados por centro y zona
    const m=new Map();
    DATA.forEach(d=>{if(!d.top||(segOf(d.c)&&segOf(d.c).ultima))return;const c=d.cons.find(x=>x.d||(x.ce&&x.ce!=='CONSULTA PRIVADA'))||d.cons[0];
      const k=(c.ce||'Sin centro')+'|'+c.m;let a=m.get(k);if(!a){a={ce:c.ce||'Sin centro',m:c.m,addr:c.d||'',z:(c.m===BCN?'0'+(c.di||'zzz'):'1'+c.m),docs:[]};m.set(k,a)}if(!a.addr&&c.d)a.addr=c.d;a.docs.push([d,c])});
    const anchors=[...m.values()].sort((a,b)=>a.z.localeCompare(b.z)||b.docs.length-a.docs.length);
    return {anchors,fill:[],same:true};
  }
  if(b.cor){
    if(S.corDay==null)S.corDay=corBestDay();
    const docs=[];CORD.forEach(d=>{const sl=corSlots(d).find(x=>x.day===S.corDay&&x.f===b.cor);if(sl)docs.push([Object.assign({},d,{slot:sl}),d.cons.find(c=>c.ce==='CLINICA CORACHAN')||d.cons[0]])});
    docs.sort(sortDocs);
    const fill=b.cor==='M'?CORD.filter(d=>!corSlots(d).length).map(d=>[d,d.cons.find(c=>c.ce==='CLINICA CORACHAN')||d.cons[0]]).sort(sortDocs):[];
    return {anchors:[{ce:`Corachan · ${DAYN[DAYS[S.corDay]]} por la ${b.t==='Mañana'?'mañana':'tarde'}`,m:BCN,addr:'C/ Buïgas, 19',docs}],fill,same:true,
      fillLabel:'Contactos sin horario conocido',fillSub:'Pregunta en recepción qué días pasan consulta'};
  }
  if(b.stops){
    const anchors=b.stops.map(s=>{const docs=s.codes.map(c=>BYCODE.get(c)).filter(d=>d&&d.top).map(d=>[d,d.cons.find(c=>c.ce===s.ce)||d.cons[0]]);
      const addr=(docs.find(([d,c])=>c.d&&c.ce===s.ce)||[])[1]?.d||'';return {ce:s.label||s.ce,m:s.m,addr:s.q?'':addr,q:s.q,docs}});
    const inA=new Set(anchors.flatMap(a=>a.docs.map(([d])=>d.c)));const fill=[];
    for(const d of DATA){if(!areaOk(d))continue;if(inA.has(d.c))continue;const ces=new Set(b.stops.map(s=>s.ce));const c=d.cons.find(c=>ces.has(c.ce)&&c.m===BCN);if(c)fill.push([d,c])}
    fill.sort(sortDocs);return {anchors,fill,same:true};
  }
  const anchors=b.anchors.map(([ce,m])=>{
    const docs=[]; let addr='';
    for(const d of DATA){ if(!areaOk(d))continue;
      const c=d.cons.find(c=>c.ce===ce&&c.m===m); if(c){docs.push([d,c]); if(!addr&&c.d)addr=c.d;} }
    docs.sort(sortDocs); return {ce,m,addr,docs};
  });
  const inAnchor=new Set(anchors.flatMap(a=>a.docs.map(([d])=>d.c)));
  const fill=[];
  for(const d of DATA){ if(!areaOk(d))continue; if(inAnchor.has(d.c))continue;
    const c=d.cons.find(c=>b.zones.includes(zoneOf(c))&&!ANCHORKEYS.has(c.ce+'|'+c.m)&&(c.d||(c.ce&&c.ce!=='CONSULTA PRIVADA')));
    if(c)fill.push([d,c]); }
  fill.sort(sortDocs); return {anchors,fill};
}
function sortDocs([a],[b]){const va=segOf(a.c)?.ultima?1:0,vb=segOf(b.c)?.ultima?1:0;return va-vb||PRIO_ORD[prio(a)]-PRIO_ORD[prio(b)]||a.n.localeCompare(b.n,'es')}
function routeStats(r){
  const codes=new Set();
  if(r.dyn){const all=DATA.filter(d=>d.top);const v=all.filter(d=>segOf(d.c)&&segOf(d.c).ultima).length;return {n:all.length,v,last:''};}
  if(r.cor){CORD.forEach(d=>codes.add(d.c));let v=0,last='';codes.forEach(c=>{const s=segOf(c);if(s&&s.ultima){v++;if(s.ultima>last)last=s.ultima}});return {n:codes.size,v,last};} r.blocks.forEach(b=>{const x=routeDocs(b);x.anchors.forEach(a=>a.docs.forEach(([d])=>codes.add(d.c)));});
  let v=0,last='';codes.forEach(c=>{const s=segOf(c);if(s&&s.ultima){v++;if(s.ultima>last)last=s.ultima}});
  return {n:codes.size,v,last};
}
function mapsUrl(stops){
  const s=stops.slice(0,9).map(x=>x.replace(/\|/g,' ')).join('|');
  return 'https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent('Santpedor')+'&destination='+encodeURIComponent('Santpedor')+'&travelmode=driving'+(s?'&waypoints='+encodeURIComponent(s):'');
}
const place=(ce,m,addr)=>addr?`${addr}, ${m}`:`${ce}, ${m}`;

/* ---------- render ---------- */
function renderFilters(){
  $('fProv').value=S.prov; fillSelect($('fMuni'),munisFor(S.prov),'Todos'); $('fMuni').value=S.muni;
  $('fGrupo').value=S.grupo;$('fCentro').value=S.centro;$('fArea').value=S.area;$('fEsp').value=S.esp;$('fTipo').value=S.tipo;$('fTexto').value=S.texto;$('fSeg').value=S.seg;$('fTop').checked=S.top;$('fEst').value=S.est;
  [...$('fDias').children].forEach(b=>b.setAttribute('aria-pressed',S.dias.includes(b.dataset.d)));
  [...$('fCal').querySelectorAll('input')].forEach(i=>i.checked=S.cal.includes(i.value));
  document.querySelectorAll('input[name=agr]').forEach(r=>r.checked=r.value===S.agr); $('privada').checked=S.privada;
  const chips=[],add=(k,l)=>chips.push(`<button class="chip" data-k="${k}">${esc(l)}</button>`);
  if(S.prov)add('prov',S.prov);if(S.muni)add('muni',S.muni);if(S.grupo)add('grupo',S.grupo);if(S.centro)add('centro','Centro: '+S.centro);
  if(S.area)add('area',S.area);if(S.esp)add('esp',S.esp);if(S.dias.length)add('dias','Pasa consulta: '+S.dias.map(d=>DAYN[d]).join(' o '));
  if(S.cal.length)add('cal',S.cal.length===1?S.cal[0]:S.cal.length+' calidades');if(S.tipo)add('tipo',S.tipo);if(S.texto)add('texto','Nombre: '+S.texto);
  if(S.top)add('top','Solo urgentes');
  if(S.near)add('near','Cerca de mí');
  if(S.est)add('est','Estado: '+S.est);
  if(S.issue)add('issue','Revisar: '+(ISSUES.find(x=>x[0]===S.issue)||['',''])[1]);
  if(S.seg)add('seg',{sin:'Sin visitar',vis:'Visitados',prox:'Con próxima acción'}[S.seg]);
  $('chips').innerHTML=S.tab==='C'||S.tab==='M'?chips.join(''):'';
}
function visitCell(d){const s=segOf(d.c);if(!s||!s.ultima)return '<span class="sm">Sin visitar</span>';return `<span class="vis">${esc(s.res||'Visitado')}</span><div class="sm">${fmtDate(s.ultima)}</div>`}
function render(){
  renderFilters();
  for(const [k,id] of [['H','tabH'],['C','tabC'],['M','tabM'],['P','tabP'],['R','tabR'],['S','tabS']]){$(id).setAttribute('aria-selected',S.tab===k);$('view'+k).hidden=S.tab!==k;}
  const noF=(S.tab==='R'||S.tab==='S'||S.tab==='P'||S.tab==='H');document.querySelector('aside').style.display=noF?'none':'';$('fBtn').style.visibility=noF?'hidden':'';
  document.querySelectorAll('#bnav [data-tab]').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===S.tab));
  const nf=[S.prov,S.muni,S.grupo,S.centro,S.area,S.esp,S.tipo,S.texto,S.seg,S.est,S.issue].filter(Boolean).length+(S.dias.length?1:0)+(S.cal.length?1:0)+(S.top?1:0);$('fBtn').textContent=nf?`Filtros · ${nf}`:'Filtros';$('fBtn').classList.toggle('on',!!nf);
  document.querySelector('.layout').style.gridTemplateColumns=(noF||isMob())?'1fr':'';
  if(S.tab==='H')renderH(); else if(S.tab==='C')renderC(); else if(S.tab==='M')renderM(); else if(S.tab==='P')renderP(); else if(S.tab==='R')renderR(); else renderS();
  chkBar();
  $('foot').textContent=datosTxt();
  $('fBtn').style.display=noF?'none':'';$('count').parentElement.classList.toggle('noinfo',!$('count').textContent.trim()&&noF);
}
function renderC(){
  const f=filtered(),r=ranking(),max=r[0]?r[0].n:1;
  $('count').innerHTML=`<b>${r.length.toLocaleString('es')}</b> ${S.agr==='grupo'?'grupos y centros':'centros'} · ${f.length.toLocaleString('es')} médicos`;
  $('rank').innerHTML=r.length?r.slice(0,S.rlimit).map((x,i)=>{const sub=S.agr==='grupo'?([...x.muni].length>1?[...x.muni].length+' municipios':[...x.muni][0]||''):x.muni;
    return `<li><button data-i="${i}" title="Ver sus médicos"><span class="pos">${i+1}</span><span><div class="rname">${esc(x.name)}</div><div class="rsub">${esc(sub)} · ${x.cf} con ubicación confirmada</div><div class="track"><span class="c" style="width:${x.cf/max*100}%"></span><span class="u" style="width:${(x.n-x.cf)/max*100}%"></span></div></span><span class="num">${x.n}</span></button></li>`}).join('')
    :`<li class="empty">Ningún centro cumple estos filtros. Quita alguno para ver resultados.</li>`;
  $('rankMore').hidden=r.length<=S.rlimit;
  $('rank').onclick=e=>{const b=e.target.closest('button');if(!b)return;const x=r[+b.dataset.i];
    if(S.agr==='grupo'){S.grupo=x.g;S.centro='';}else{S.centro=x.ce;S.grupo='';if(x.muni)S.muni=x.muni;} S.tab='M';S.limit=100;render();window.scrollTo({top:0});};
}
function dayBadges(dy){return `<div class="dy">${DAYS.map((k,i)=>`<span class="${dy[i]?'on':''}" title="${dy[i]?esc(DAYN[k]+': '+dy[i]):''}">${k}</span>`).join('')}</div>`}
function renderM(){
  const f=filtered();
  $('count').innerHTML=`<b>${f.length.toLocaleString('es')}</b> médicos`;
  $('mNote').textContent=S.near?'Ordenados por distancia a tu posición (aproximada, hasta 25 km)':`${f.filter(([d,c])=>daysFor(d,c).some(Boolean)).length} con días de consulta conocidos · ordenados por provincia, municipio y centro`;
  $('tbody').innerHTML=f.slice(0,S.limit).map(([d,c])=>{
    const qc=d.q.startsWith('Confirmada con')?'ok':d.q.startsWith('Confirmada')?'mid':'';
    let h=`<tr class="row" data-c="${d.c}"><td><div class="nm">${d.top?'<span class="topb">Urgente</span> ':''}${esc(d.n)}${d.ed?' <span class="edb">editada</span>':''}</div><div class="sm">${esc(d.e||'Sin especialidad')}${d.t==='Centro'?' · centro':''}${d.top?' · '+esc(d.top):''}</div></td><td>${esc(c.ce||'Sin centro')}<div class="sm">${c.g&&c.g!==c.ce?esc(c.g):''}</div></td><td>${esc(c.m||'')}</td><td>${esc(c.d||'')}</td><td style="white-space:nowrap">${esc(c.tel||'')}</td><td>${dayBadges(daysFor(d,c))}</td><td><span class="q ${qc}">${esc(d.q.replace('Sin verificar: dato original','Sin verificar').replace('Confirmada: ','Confirmada, '))}</span></td><td>${visitCell(d)}</td></tr>`;
    if(S.open.has(d.c))h+=detailRow(d,8);
    return h;}).join('')||`<tr><td colspan="8" class="empty">Ningún médico cumple estos filtros. Quita alguno para ver resultados.</td></tr>`;
  if(S.map){$('viewM').querySelector('.tablewrap').style.display='none';$('mcards').style.display='none';$('more').hidden=true;renderMap(f);$('mapBtn').textContent='Ver lista';return}
  $('mapWrap').hidden=true;$('viewM').querySelector('.tablewrap').style.display='';$('mcards').style.display='';$('mapBtn').textContent='Ver mapa';
  $('mcards').innerHTML=isMob()?(f.slice(0,S.limit).map(([d,c])=>cardHTML(d,c)).join('')||'<div class="empty">Ningún médico cumple estos filtros.</div>'):'';
  $('more').hidden=f.length<=S.limit;
}
function detailRow(d,cols){
  const s=segOf(d.c);
  return `<tr class="det"><td colspan="${cols}"><b>${d.cons.length} ${d.cons.length===1?'consulta':'consultas'}</b><ul>${d.cons.map(x=>`<li>${esc(x.ce||'Sin centro')} · ${esc(x.m||'')}${x.d?' · '+esc(x.d):''}${x.tel?' · '+esc(x.tel):''}${x.dy.some(Boolean)?' · '+DAYS.map((k,i)=>x.dy[i]?k+' '+esc(x.dy[i]):'').filter(Boolean).join(', '):''}${x.cf?'':' (sin verificar)'}</li>`).join('')}</ul>
  Código ${d.c}${d.car?' · '+esc(d.car):''} · Búsqueda: ${esc(d.st)}${d.url?` · <a href="${esc(d.url)}" target="_blank" rel="noopener">Ficha web</a>`:''}
  ${s&&s.visitas?`<div style="margin-top:6px"><b>Visitas:</b> ${s.visitas.map(v=>`${fmtDate(v.f)} ${esc(v.res)}${v.nota?' ('+esc(v.nota)+')':''}`).join(' · ')}</div>`:''}
  ${actBtns(d,d.cons[0])}</td></tr>`;
}
function renderR(){
  if($('areaSel'))$('areaSel').value=S.areaSel;
  $('count').innerHTML='';
  const stats=ROUTES.map(r=>({r,...routeStats(r)}));
  const sug=stats.find(x=>x.r.top&&x.v<x.n)||[...stats].filter(x=>!x.r.top).sort((a,b)=>(a.v/a.n)-(b.v/b.n)||(a.last||'').localeCompare(b.last||''))[0];
  if(!S.route)S.route=sug.r.id;
  const cardFn=x=>`<button class="rcard${x.r.top?' topr':''}" data-r="${x.r.id}" aria-pressed="${S.route===x.r.id}"><h3>${esc(x.r.name)}${x===sug?'<span class="sug">siguiente</span>':''}</h3>
    <div class="sm">${x.n} médicos ${x.r.top?'urgentes':'en sus centros'} · ${x.v} visitados${x.last?' · última '+fmtDate(x.last):''}</div><div class="prog"><span style="width:${x.n?x.v/x.n*100:0}%"></span></div></button>`;
  $('routes').innerHTML=`<div class="rsec urg"><h3>Rutas urgentes</h3><p class="sm">Urgentes (marcados en la app o en la lista) y contactos de Corachan. Van antes que el ciclo hasta completarlas.</p></div>`+stats.filter(x=>x.r.top).map(cardFn).join('')+`<div class="rsec"><h3>Ciclo de rutas</h3><p class="sm">6 días que se repiten cada dos semanas (3 días por semana).</p></div>`+stats.filter(x=>!x.r.top).map(cardFn).join('');
  const r=ROUTES.find(x=>x.id===S.route); const blocks=r.blocks.map(b=>({b,...routeDocs(b)}));
  const stops=[];
  blocks.forEach(x=>{x.anchors.forEach(a=>stops.push(a.q||place(a.ce,a.m,a.addr)));x.fill.forEach(([d,c])=>{if(S.picks.has(d.c))stops.push(place(c.ce,c.m,c.d))});});
  const ustops=[...new Set(stops)];
  let h=`<div class="dayhead"><h3>${esc(r.name)}</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" target="_blank" rel="noopener" href="${esc(mapsUrl(ustops))}">Abrir recorrido en Google Maps</a></div></div>
   <div class="sm">${ustops.length} paradas${ustops.length>9?' (Google Maps admite 9: se abren las 9 primeras)':''}. Marca médicos de "cerca" para añadir su consulta al recorrido.</div>`;
  if(r.cor)h+=corAgenda();
  blocks.forEach(x=>{
    h+=`<div class="block"><h4>${x.b.t}</h4>`;
    x.anchors.forEach(a=>{
      const v=a.docs.filter(([d])=>segOf(d.c)?.ultima).length;
      h+=`<details class="anchor"><summary><span><span class="an">${esc(a.ce)}</span><div class="sm">${esc(a.addr||'Dirección por confirmar')} · ${esc(a.m)}</div></span><span class="ac">${a.docs.length} ${a.docs.length===1?'médico':'médicos'} · ${v} visitados</span></summary><ul class="plist">${a.docs.map(([d,c])=>pItem(d,c,false)).join('')||'<li class="sm">Sin médicos con estos filtros</li>'}</ul></details>`;
    });
    if(x.b.cor==='T'&&!x.fill.length){h+='</div>';return;}
    const fl=x.fill.slice(0,x.b.cor?50:15);
    h+=`<details class="anchor"><summary><span><span class="an">${x.fillLabel||(x.same?'Otros médicos en estos centros':'Cerca, en la misma zona')}</span><div class="sm">${x.fillSub?x.fillSub:x.same?'Para aprovechar la visita: ordenados por prioridad':'Consultas y centros pequeños para completar '+(x.b.t==='Mañana'?'la mañana':'la tarde')}</div></span><span class="ac">${x.fill.length} ${x.fill.length===1?'médico':'médicos'}</span></summary><ul class="plist">${fl.map(([d,c])=>pItem(d,c,true)).join('')||'<li class="sm">Nada más en esta zona</li>'}</ul></details></div>`;
  });
  $('day').innerHTML=h;
}
function corAgenda(){
  const cell=(i,f)=>CORD.map(d=>({d,sl:corSlots(d).find(x=>x.day===i&&x.f===f)})).filter(x=>x.sl);
  const short=n=>{const [a,b]=n.split(',');return (b?b.trim().split(' ')[0][0]+'. ':'')+a.split(' ')[0]};
  let h=`<div class="agenda"><div class="sm" style="margin:10px 0 6px">Agenda de los ${CORD.length} contactos de Corachan. Elige el día para ver su ruta; en negrita, lo que sale de tus notas.</div><div class="tablewrap"><table class="ag"><thead><tr><th></th>${DAYS.map((k,i)=>`<th><button class="agd" data-cd="${i}" aria-pressed="${S.corDay===i}">${DAYN[k]} · ${new Set(cell(i,'M').concat(cell(i,'T')).map(x=>x.d.c)).size}</button></th>`).join('')}</tr></thead><tbody>`;
  for(const [f,lab] of [['M','Mañana'],['T','Tarde']])h+=`<tr><th>${lab}</th>${DAYS.map((k,i)=>`<td>${cell(i,f).map(x=>`<div class="${x.sl.src==='nota'?'agn':''}" title="${esc(x.d.n+': '+x.sl.n)}">${esc(short(x.d.n))}${x.sl.src==='nota'&&x.sl.n?' <span class="sm">('+esc(x.sl.n)+')</span>':''}</div>`).join('')}</td>`).join('')}</tr>`;
  return h+`</tbody></table></div></div>`;
}
function pItem(d,c,pick){
  const s=segOf(d.c),p=prio(d),dy=daysFor(d,c);
  return `<li><span class="pri ${p}" title="Prioridad ${p}">${p}</span><span><div class="nm">${d.top?'<span class="topb">Urgente</span> ':''}${esc(d.n)}</div><div class="sm">${esc(d.e||'')}${d.top?' · '+esc(d.top):''}${d.vn?' · Cuándo: '+esc(d.vn):d.slot&&d.slot.src==='web'?' · '+esc(d.slot.n):''}${pick?' · '+esc(c.ce||'')+' · '+esc(c.d||c.m):''}${dy.some(Boolean)?' · '+DAYS.map((k,i)=>dy[i]?k+' '+esc(dy[i]):'').filter(Boolean).join(', '):''}</div>${s&&s.ultima?`<div class="vis">${esc(s.res)} · ${fmtDate(s.ultima)}${s.prox?' · '+esc(s.prox):''}</div>`:''}</span>
   <span style="display:flex;gap:8px;align-items:center">${pick?`<label class="addchk"><input type="checkbox" data-pick="${d.c}" ${S.picks.has(d.c)?'checked':''}> ruta</label>`:''}<button class="reg" data-edit="${d.c}">Editar ficha</button><button class="reg" data-reg="${d.c}" data-ce="${esc(c.ce||'')}">Registrar</button></span></li>`;
}
function renderS(){
  $('count').innerHTML='';
  renderFunnel();renderQuality();
  renderFichas();
  const rows=[...SEG.values()].filter(s=>BYCODE.has(s.c));
  const wk=new Date();wk.setDate(wk.getDate()+7);const wks=wk.toISOString().slice(0,10);
  $('stats').innerHTML=kpi(rows.length,'médicos visitados','user')+kpi(rows.filter(s=>['Interesado','Muestras entregadas','Ya prescribe'].includes(s.res)).length,'interesados o prescriben','star','k-ok')+kpi(rows.filter(s=>s.horario&&Object.values(s.horario).some(Boolean)).length,'con horario captado','clock')+kpi(rows.filter(s=>s.prox_f&&s.prox_f<=wks).length,'acciones en los próximos 7 días','task');
  rows.sort((a,b)=>(a.prox_f||'9999').localeCompare(b.prox_f||'9999')||(b.ultima||'').localeCompare(a.ultima||''));
  $('sbody').innerHTML=rows.map(s=>{const d=BYCODE.get(s.c);return `<tr class="row" data-c="${d.c}"><td><div class="nm">${esc(d.n)}</div><div class="sm">${esc(d.e)} · ${esc(s.ce||d.ce)}</div></td><td>${fmtDate(s.ultima)}</td><td>${esc(s.res||'')}</td><td>${DAYS.map(k=>s.horario&&s.horario[k]?k+' '+esc(s.horario[k]):'').filter(Boolean).join('<br>')}</td><td>${esc(s.contacto||'')}</td><td>${esc(s.prox||'')}${s.prox_f?`<div class="sm">${fmtDate(s.prox_f)}</div>`:''}</td></tr>`+(S.open.has(d.c)?detailRow(d,6):'')}).join('')
    ||`<tr><td colspan="6" class="empty">${DB?'Aún no hay visitas registradas. Empieza por la pestaña Rutas.':'El seguimiento solo está disponible abriendo el explorador desde su enlace de Claude.'}</td></tr>`;
}

/* ---------- visit dialog ---------- */
let DLGCODE=null;
function openDlg(code,ce){
  if($('qdlg').open)$('qdlg').close();
  const d=BYCODE.get(code),s=segOf(code)||{};DLGCODE=code;
  $('dlgTitle').textContent=d.n;$('dlgSub').textContent=d.e+(DB?'':' · Registro no disponible fuera de Claude');
  $('vFecha').value=today();fillSelect($('vRes'),RESULTS,'Elige resultado');$('vRes').value='';$('vMu').value='';$('vCal').checked=false;
  $('vResB').innerHTML=RESULTS.map(r=>`<button type="button" data-res="${esc(r)}" aria-pressed="false">${esc(r)}</button>`).join('');
  const ces=uniq(d.cons.map(c=>c.ce).concat(ce||[]));$('vCentro').innerHTML=ces.map(x=>`<option>${esc(x)}</option>`).join('');$('vCentro').value=ce||s.ce||ces[0]||'';
  const c=d.cons.find(x=>x.ce===$('vCentro').value)||d.cons[0];
  $('vDias').innerHTML=DAYS.map((k,i)=>`<input aria-label="${DAYN[k]}" placeholder="${DAYN[k][0].toUpperCase()+DAYN[k].slice(1)}: p. ej. Mañana 9-13" data-k="${k}" value="${esc((s.horario&&s.horario[k])||(c&&c.dy[i])||'')}">`).join('');
  $('vContacto').value=s.contacto||'';$('vNota').value='';$('vProx').value=s.prox||'';$('vProxF').value=s.prox_f||'';$('dlgMsg').textContent='';
  $('dlgSave').disabled=!DB; $('dlg').showModal();
}
async function saveDlg(){
  if(!DB||!DLGCODE)return;
  const d=BYCODE.get(DLGCODE),prev=segOf(DLGCODE)||{},res=$('vRes').value;
  if(!res){$('dlgMsg').textContent='Elige un resultado para guardar la visita.';return false}
  const horario={};$('vDias').querySelectorAll('input').forEach(i=>{if(i.value.trim())horario[i.dataset.k]=i.value.trim()});
  const f=$('vFecha').value||today(),ce=$('vCentro').value;
  const mu=Math.max(0,parseInt($('vMu').value,10)||0);
  {const ne=estadoDeRes(res),ord=['Sin contactar','Presentado','Interesado','Prescribe'];if(d.est&&ne&&ne!=='No interesado'&&ord.indexOf(ne)>ord.indexOf(d.est))d.est=ne;}
  const visitas=(prev.visitas||[]).concat([{f,res,ce,nota:$('vNota').value.trim(),mu}]).slice(-20);
  const doc={c:d.c,n:d.n,ce,ultima:(prev.ultima&&prev.ultima>f)?prev.ultima:f,res:(prev.ultima&&prev.ultima>f)?prev.res:res,horario,contacto:$('vContacto').value.trim(),prox:$('vProx').value.trim(),prox_f:$('vProxF').value||'',visitas};
  $('dlgSave').disabled=true;$('dlgMsg').textContent='Guardando…';
  try{await DB.collection('seguimiento').doc(String(d.c)).set(doc);SEG.set(d.c,doc);if(Object.keys(horario).length)await saveScheduleFromVisit(d.c,ce,horario);$('dlg').close();
    if($('vCal').checked&&doc.prox_f)icsDownload(`${doc.prox||'Seguimiento'} · ${d.n}`,doc.prox_f,'09:00','09:30',`${d.e||''}\n${(d.cons.find(x=>x.ce===ce)||d.cons[0]).d||''}`,[ce,(d.cons.find(x=>x.ce===ce)||d.cons[0]).m].filter(Boolean).join(', '));
    afterEdit();toast('Visita guardada');}
  catch(e){$('dlgMsg').textContent=e.code==='quota_exceeded'?'No caben más registros en el explorador. Pídeme que archive las visitas antiguas.':'No se ha podido guardar ('+(e.code||'error')+'). Inténtalo de nuevo.';$('dlgSave').disabled=false}
  return false;
}

/* ---------- init ---------- */
function init(){
  fillSelect($('fProv'),OPT.prov,'Todas');fillSelect($('fGrupo'),OPT.grupo,'Todos');fillSelect($('fArea'),OPT.area,'Todas');fillSelect($('fEsp'),OPT.esp,'Todas');fillSelect($('fTipo'),OPT.tipo,'Todos');
  $('fDias').innerHTML=DAYS.map(d=>`<button type="button" data-d="${d}" aria-pressed="false" title="${DAYN[d]}">${d}</button>`).join('');
  $('fCal').innerHTML=CALS.map(c=>`<label><input type="checkbox" value="${esc(c)}"> ${esc(c)}</label>`).join('');
  $('sub').textContent=`${DATA.length.toLocaleString('es')} registros · ${DATA.filter(d=>d.q==='Confirmada con dirección').length} con dirección confirmada`;
  const on=(id,ev,fn)=>$(id).addEventListener(ev,fn);
  on('fProv','change',e=>{S.prov=e.target.value;S.muni='';reset0()});on('fMuni','change',e=>{S.muni=e.target.value;reset0()});
  on('fGrupo','change',e=>{S.grupo=e.target.value;reset0()});on('fArea','change',e=>{S.area=e.target.value;reset0()});
  on('fEsp','change',e=>{S.esp=e.target.value;reset0()});on('fTipo','change',e=>{S.tipo=e.target.value;reset0()});on('fSeg','change',e=>{S.seg=e.target.value;reset0()});on('fTop','change',e=>{S.top=e.target.checked;reset0()});on('fEst','change',e=>{S.est=e.target.value;reset0()});
  let t;const deb=fn=>{clearTimeout(t);t=setTimeout(fn,200)};
  on('fCentro','input',e=>deb(()=>{S.centro=e.target.value;reset0()}));on('fTexto','input',e=>deb(()=>{S.texto=e.target.value;reset0()}));
  on('fDias','click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset.d;S.dias=S.dias.includes(d)?S.dias.filter(x=>x!==d):[...S.dias,d];reset0()});
  on('fCal','change',()=>{S.cal=[...$('fCal').querySelectorAll('input:checked')].map(i=>i.value);reset0()});
  document.querySelectorAll('input[name=agr]').forEach(r=>r.addEventListener('change',e=>{S.agr=e.target.value;reset0()}));
  on('privada','change',e=>{S.privada=e.target.checked;reset0()});on('areaSel','change',e=>{setArea(e.target.value)});
  on('reset','click',()=>{clearFilters();reset0()});
  on('chips','click',e=>{const b=e.target.closest('.chip');if(!b)return;const k=b.dataset.k;S[k]=k==='near'?null:(Array.isArray(S[k])?[]:(typeof S[k]==='boolean'?false:''));if(k==='prov')S.muni='';reset0()});
  for(const [k,id] of [['H','tabH'],['C','tabC'],['M','tabM'],['P','tabP'],['R','tabR'],['S','tabS']])on(id,'click',()=>{S.tab=k;render()});
  on('bnav','click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;S.tab=b.dataset.tab;$('aside').classList.remove('open');render();window.scrollTo({top:0})});
  on('fBtn','click',()=>{$('aside').classList.add('open')});on('fClose','click',()=>{$('aside').classList.remove('open');window.scrollTo({top:0})});
  on('dlx','click',e=>downloadXlsx(filtered(),'medicos_filtrados.xlsx',e.target));
  on('nearBtn','click',e=>nearMe(e.target));
  on('mapBtn','click',e=>{S.map=!S.map;if(S.map&&!window.L)busy(e.target,()=>loadLeaflet().catch(()=>{}),'Cargando el mapa…').then(()=>render());else render()});
  on('quality','click',e=>{const b=e.target.closest('[data-issue]');if(!b)return;clearFilters();S.issue=b.dataset.issue;S.tab='M';S.limit=100;render();window.scrollTo({top:0})});
  on('funnel','click',e=>{const b=e.target.closest('[data-est]');if(!b)return;clearFilters();S.est=b.dataset.est;S.tab='M';S.limit=100;render();window.scrollTo({top:0})});
  document.addEventListener('change',e=>{const q=e.target.closest('[data-qest]');if(q)setEstado(+q.dataset.qest,q.value)});
  document.addEventListener('click',e=>{const a=e.target.closest('[data-qopen]');if(a){e.preventDefault();openQuick(+a.dataset.qopen);return}const du=e.target.closest('[data-dupopen]');if(du){e.preventDefault();$('edlg').close();openQuick(+du.dataset.dupopen)}});on('newBtn','click',openNew);on('shareBtn','click',shareWeek);
  let qt;on('qs','input',e=>{clearTimeout(qt);qt=setTimeout(()=>quickSearch(e.target.value),150)});
  on('qs','focus',e=>quickSearch(e.target.value));
  document.addEventListener('click',e=>{if(!e.target.closest('.qs'))$('qsr').hidden=true});
  on('qsr','click',e=>{const b=e.target.closest('[data-q]');if(!b)return;$('qsr').hidden=true;$('qs').blur();openQuick(+b.dataset.q)});
  on('qClose','click',()=>$('qdlg').close());
  on('vResB','click',e=>{const b=e.target.closest('[data-res]');if(!b)return;$('vRes').value=b.dataset.res;$('vResB').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b))});
  document.addEventListener('click',e=>{const u=e.target.closest('[data-urg]');if(u){e.preventDefault();const d=BYCODE.get(+u.dataset.urg);if(!d)return;
      if(d.top){if(confirm('¿Quitar a '+d.n+' de urgentes?'))setUrgent(d.c,false)}else{const m=prompt('Motivo para marcar como urgente (opcional):','');if(m!==null)setUrgent(d.c,true,m.trim())}return}
    const c=e.target.closest('[data-cal]');if(c){const s=segOf(+c.dataset.cal),d=BYCODE.get(+c.dataset.cal);if(s&&s.prox_f){const cc=d.cons.find(x=>x.ce===s.ce)||d.cons[0];icsDownload(`${s.prox||'Seguimiento'} · ${d.n}`,s.prox_f,'09:00','09:30',d.e||'',[cc.ce,cc.d,cc.m].filter(Boolean).join(', '))}}});
  on('hoy','click',e=>{const hb=e.target.closest('[data-h]');if(hb){const k=hb.dataset.h;if(k==='near')nearMe(hb);else if(k==='new')openNew();else if(k==='calidad'){S.tab='S';render();setTimeout(()=>$('quality').scrollIntoView({behavior:'smooth'}),50)}else shareWeek();return}
    const g=e.target.closest('[data-goroute]');if(g){S.route=g.dataset.goroute;S.tab='R';render();window.scrollTo({top:0});return}
    const p=e.target.closest('[data-plantoday]');if(p){const d=new Date();while([0,6].includes(d.getDay()))d.setDate(d.getDate()+1);P.fecha=d.toISOString().slice(0,10);P.foco=p.dataset.plantoday;busy(p,()=>{P.plan=buildPlan();S.tab='P';render();window.scrollTo({top:0})},'Calculando la ruta…')}});
  try{window.matchMedia('(max-width:760px)').addEventListener('change',()=>render())}catch(e){}
  on('more','click',()=>{S.limit+=100;render()});on('rankMore','click',()=>{S.rlimit+=40;render()});
  const toggle=e=>{if(e.target.closest('a,button,input,label'))return;const tr=e.target.closest('tr.row');if(!tr)return;const c=+tr.dataset.c;S.open.has(c)?S.open.delete(c):S.open.add(c);render()};
  on('tbody','click',toggle);on('sbody','click',toggle);
  document.addEventListener('click',e=>{const b=e.target.closest('[data-reg]');if(b){e.preventDefault();openDlg(+b.dataset.reg,b.dataset.ce||'')}});
  on('routes','click',e=>{const b=e.target.closest('.rcard');if(b){S.route=b.dataset.r;render()}});
  on('day','click',e=>{const b=e.target.closest('[data-cd]');if(b){S.corDay=+b.dataset.cd;render()}});
  on('plan','change',e=>{if(e.target.id==='pAr')setArea(e.target.value)});
  on('plan','click',e=>{if(e.target.id==='pUseMin'){e.preventDefault();$('pM').value=minPorMedico();return}const ci=e.target.closest('[data-chkin]');if(ci){checkIn(ci.dataset.chkin,ci.dataset.chkm);return}if(e.target.closest('[data-chkout]')){checkOut();return}if(e.target.id==='pCal'){planToCalendar();return}if(e.target.id==='pGo'){busy(e.target,()=>runPlan(),'Calculando la ruta…');return}if(e.target.id==='pClr'){P.excl.clear();runPlan();return}const x=e.target.closest('[data-ex]');if(x){P.excl.add(+x.dataset.ex);runPlan()}});
  on('day','change',e=>{const i=e.target.closest('[data-pick]');if(!i)return;const c=+i.dataset.pick;i.checked?S.picks.add(c):S.picks.delete(c);render()});
  on('dlgCancel','click',()=>$('dlg').close());
  on('dlgForm','submit',e=>{e.preventDefault();saveDlg()});
  on('vCentro','change',()=>{const d=BYCODE.get(DLGCODE),c=d.cons.find(x=>x.ce===$('vCentro').value);if(c)$('vDias').querySelectorAll('input').forEach((i,ix)=>{if(!i.value)i.value=c.dy[ix]||''})});
  setupEdit();setupShare();setupV133();render();setupDownload();setupDb();
}
function reset0(){S.limit=100;S.rlimit=40;render()}
function clearFilters(){Object.assign(S,{prov:'',muni:'',grupo:'',centro:'',area:'',esp:'',dias:[],cal:[],tipo:'',texto:'',seg:'',top:false,est:'',issue:''})}

async function setupDb(){
  if(!window.claude){$('dbWarn').hidden=false;return}
  DB=await claude.use('db'); if(!DB){$('dbWarn').hidden=false;return}
  const fcol=DB.collection('fichas');
  [[0,1500],[1500,3000],[3000,1e9]].forEach(([a,b])=>fcol.where('c','>=',a).where('c','<',b).limit(1000).onSnapshot(snap=>{
    for(const ch of snap.docChanges()){const v=ch.doc.data();if(!v)continue;const c=+v.c;if(ch.type==='removed')FICHA.delete(c);else FICHA.set(c,v);applyFicha(c)}
    if(!$('dlg').open&&!$('edlg').open)render();
  },()=>{}));
  const col=DB.collection('seguimiento');
  const ranges=[[0,1500],[1500,3000],[3000,1e9]];
  ranges.forEach(([a,b])=>{
    col.where('c','>=',a).where('c','<',b).limit(1000).onSnapshot(snap=>{
      for(const ch of snap.docChanges()){const v=ch.doc.data();if(!v)continue;const c=+v.c;if(ch.type==='removed')SEG.delete(c);else SEG.set(c,v)}
      if(!$('dlg').open&&!$('edlg').open)render();
    },()=>{});
  });
}
async function setupDownload(){
  if(!window.claude)return;const dl=await claude.use('downloads');if(!dl)return;
  $('dl').hidden=false;$('dlSeg').hidden=false;
  const q=v=>`"${(v??'').toString().replace(/"/g,'""')}"`;
  const save=async(name,lines)=>{try{await dl.save({filename:name,data:'\ufeff'+lines.join('\r\n')})}catch(e){}};
  $('dl').onclick=()=>{const f=filtered();const head=['CÓDIGO','NOMBRE','ESPECIALIDAD','ÁREA','CENTRO','GRUPO','MUNICIPIO','PROVINCIA','DIRECCIÓN','TELÉFONO',...DAYS,'CALIDAD','Nº CONSULTAS','ÚLTIMA VISITA','RESULTADO'];
    save('medicos_filtrados.csv',[head.map(q).join(';'),...f.map(([d,c])=>{const s=segOf(d.c)||{};return [d.c,d.n,d.e,d.a,c.ce,c.g,c.m,c.p,c.d,c.tel,...daysFor(d,c),d.q,d.cons.length,fmtDate(s.ultima),s.res].map(q).join(';')})])};
  $('dlFich').hidden=false;
  $('dlFich').onclick=()=>{const head=['CÓDIGO','NOMBRE','FECHA CAMBIO','ESPECIALIDAD','TELÉFONO','CONTACTO','NOTA','CONSULTA','CENTRO','DIRECCIÓN','CP','MUNICIPIO','TELÉFONO CONSULTA',...DAYS];const lines=[head.map(q).join(';')];
    [...FICHA.values()].forEach(f=>(f.cons||[]).forEach((c,i)=>lines.push([f.c,f.n,fmtDate(f.upd),f.e,f.tel,f.contacto,f.nota,i+1,c.ce,c.d,c.cp,c.m,c.tel,...DAYS.map((k,j)=>(c.dy||[])[j]||'')].map(q).join(';'))));save('fichas_editadas.csv',lines)};
  $('dlSeg').onclick=()=>{const head=['CÓDIGO','NOMBRE','CENTRO','ÚLTIMA VISITA','RESULTADO',...DAYS,'CONTACTO','PRÓXIMA ACCIÓN','FECHA PRÓXIMA','HISTORIAL'];
    save('seguimiento_visitas.csv',[head.map(q).join(';'),...[...SEG.values()].map(s=>[s.c,s.n,s.ce,fmtDate(s.ultima),s.res,...DAYS.map(k=>s.horario?.[k]||''),s.contacto,s.prox,fmtDate(s.prox_f),(s.visitas||[]).map(v=>fmtDate(v.f)+' '+v.res).join(' | ')].map(q).join(';'))])};
}

/* ---------- ask Claude ---------- */
function pickOption(val,opts,field){if(val==null||val==='')return '';const v=norm(val);const hit=opts.find(o=>norm(o)===v)||opts.find(o=>norm(o).includes(v))||opts.find(o=>v.includes(norm(o)));if(!hit)throw new Error(`Valor no válido para ${field}: "${val}". Opciones: ${opts.slice(0,60).join(', ')}`);return hit}
function dayCodes(v){const map={lunes:'L',martes:'M',miercoles:'X',jueves:'J',viernes:'V',l:'L',m:'M',x:'X',j:'J',v:'V'};return (Array.isArray(v)?v:v?[v]:[]).map(x=>map[norm(x)]).filter(Boolean)}
function applyInput(inp){
  clearFilters();S.prov=pickOption(inp.provincia,OPT.prov,'provincia');if(inp.municipio)S.muni=pickOption(inp.municipio,munisFor(S.prov),'municipio');
  S.grupo=pickOption(inp.grupo,OPT.grupo,'grupo');S.centro=inp.centro?String(inp.centro):'';S.area=pickOption(inp.area,OPT.area,'area');S.esp=pickOption(inp.especialidad,OPT.esp,'especialidad');
  S.tipo=pickOption(inp.tipo,OPT.tipo,'tipo');S.texto=inp.nombre?String(inp.nombre):'';S.dias=dayCodes(inp.dias);
  S.cal=(Array.isArray(inp.calidad)?inp.calidad:inp.calidad?[inp.calidad]:[]).map(c=>pickOption(c,CALS,'calidad'));
  S.seg=({sin_visitar:'sin',visitados:'vis',con_proxima_accion:'prox'})[inp.seguimiento]||'';S.top=!!inp.top;S.limit=100;S.rlimit=40;
}
const FILTER_PROPS={provincia:{type:'string',description:'BARCELONA, GIRONA, LLEIDA o TARRAGONA'},municipio:{type:'string',description:'Municipio en mayúsculas sin tildes, p. ej. SABADELL'},
  grupo:{type:'string',description:'Grupo de centro, p. ej. Grupo Quirónsalud'},centro:{type:'string',description:'Texto que contiene el nombre del centro, p. ej. TEKNON'},
  area:{type:'string'},especialidad:{type:'string'},dias:{type:'array',items:{type:'string'},description:'Días de consulta: L, M, X, J, V (cualquiera de ellos)'},
  calidad:{type:'array',items:{type:'string'}},tipo:{type:'string',description:'Persona o Centro'},nombre:{type:'string'},
  seguimiento:{type:'string',enum:['sin_visitar','visitados','con_proxima_accion']},top:{type:'boolean',description:'Solo médicos urgentes (lista prioritaria)'}};
let ctl=null;
async function setupAsk(){
  if(!window.claude)return;const sample=await claude.use('sample');if(!sample)return;
  $('ask').hidden=false;
  const ex=['Centros con más médicos','Médicos que pasan consulta los lunes','Top 10 centros de traumatología en Barcelona','Traumatólogos sin visitar en Sant Cugat','¿Qué ruta toca hoy?'];
  $('examples').innerHTML=ex.map(x=>`<button type="button">${esc(x)}</button>`).join('');
  $('examples').onclick=e=>{const b=e.target.closest('button');if(b){$('askInput').value=b.textContent;$('askForm').requestSubmit()}};
  const tools=[
    {name:'ranking_centros',description:'Aplica filtros, muestra en pantalla el ranking de centros o grupos por número de médicos y devuelve los primeros. Para preguntas sobre qué centros o grupos tienen más médicos.',
     inputSchema:{type:'object',properties:{agrupar:{type:'string',enum:['grupo','centro']},incluir_consulta_privada:{type:'boolean'},top:{type:'number'},...FILTER_PROPS}},
     execute:inp=>{applyInput(inp);S.agr=inp.agrupar==='centro'?'centro':'grupo';S.privada=!!inp.incluir_consulta_privada;S.tab='C';render();const r=ranking(),top=Math.min(Math.max(+inp.top||15,1),50);
       return {total_centros:r.length,medicos_filtrados:filtered().length,ranking:r.slice(0,top).map(x=>({nombre:x.name,municipio:S.agr==='grupo'?[...x.muni].slice(0,5).join(', '):x.muni,medicos:x.n,confirmados:x.cf}))}}},
    {name:'filtrar_medicos',description:'Aplica filtros, muestra en pantalla la lista de médicos y devuelve el total y los primeros 25. Para buscar o contar médicos, también por seguimiento de visitas.',
     inputSchema:{type:'object',properties:FILTER_PROPS},
     execute:inp=>{applyInput(inp);S.tab='M';render();const f=filtered();
       return {total:f.length,con_dias_conocidos:f.filter(([d,c])=>daysFor(d,c).some(Boolean)).length,primeros:f.slice(0,25).map(([d,c])=>({nombre:d.n,especialidad:d.e,centro:c.ce,municipio:c.m,dias:DAYS.map((k,i)=>daysFor(d,c)[i]?k+' '+daysFor(d,c)[i]:'').filter(Boolean).join(', '),ubicacion:d.q,ultima_visita:segOf(d.c)?.ultima||''}))}}},
    {name:'planificar_dia',description:'Genera en pantalla la ruta de un día concreto con horario de salida y vuelta a Santpedor, y devuelve las paradas, médicos y hora de vuelta. Usa foco auto o un id de ruta (T1,T2,T3,R1-R6).',
     inputSchema:{type:'object',properties:{fecha:{type:'string',description:'AAAA-MM-DD'},salida:{type:'string',description:'HH:MM, por defecto 08:00'},vuelta:{type:'string',description:'HH:MM, por defecto 19:00'},visitas_desde:{type:'string'},visitas_hasta:{type:'string'},foco:{type:'string'}},required:['fecha']},
     execute:inp=>{P.fecha=String(inp.fecha);if(inp.salida)P.salida=inp.salida;if(inp.vuelta)P.vuelta=inp.vuelta;if(inp.visitas_desde)P.ini=inp.visitas_desde;if(inp.visitas_hasta)P.fin=inp.visitas_hasta;P.foco=inp.foco&&ROUTES.find(r=>r.id===inp.foco)?inp.foco:'auto';S.tab='P';P.plan=buildPlan();render();const pl=P.plan;if(pl.error)throw new Error(pl.error);
       return {medicos:pl.visitas,paradas:pl.stops.filter(s=>!s.lunch).map(s=>({hora:hm(s.arr),centro:s.ct.ce,municipio:s.ct.m,medicos:s.seq.map(x=>x.d.n)})),vuelta_estimada:hm(pl.llegada),prioritarios_fuera:pl.miss.length}}},
    {name:'rutas',description:'Muestra la pestaña Rutas y devuelve las rutas urgentes (T1, T2) y las 6 del ciclo con médicos, visitados y la ruta sugerida (la menos trabajada). Si se pasa id (T1, T2, T3, R1-R6) la abre.',
     inputSchema:{type:'object',properties:{id:{type:'string'}}},
     execute:inp=>{S.tab='R';if(inp.id&&ROUTES.find(r=>r.id===inp.id))S.route=inp.id;render();const st=ROUTES.map(r=>({id:r.id,nombre:r.name,...routeStats(r)}));
       const sug=[...st].sort((a,b)=>(a.v/a.n)-(b.v/b.n)||(a.last||'').localeCompare(b.last||''))[0];
       return {sugerida:sug.id,rutas:st.map(x=>({id:x.id,nombre:x.nombre,medicos:x.n,visitados:x.v,ultima_visita:x.last})),abierta:S.route}}}
  ];
  const vocab=`Datos: ${DATA.length} registros (médicos y algunos centros) de Cataluña. Cada médico tiene una o varias consultas (centro, municipio, dirección, días L-V).
Provincias: ${OPT.prov.join(', ')}.
Áreas: ${OPT.area.join(', ')}.
Especialidades: ${OPT.esp.join(', ')}.
Grupos de centro principales: ${OPT.grupo.slice(0,45).join(', ')}.
Calidad de la ubicación: ${CALS.join(' | ')}.
Médicos urgentes: 16 médicos prioritarios (campo top), con rutas urgentes T1 (zona alta, martes), T3 (Corachan por visitar: 31 contactos con agenda por día) y T2 (Sants y Sant Andreu), que van antes del ciclo.
Horario general: salida de Santpedor desde las 8:00, visitas de 9:00 a 18:00, vuelta como tarde a las 19:00; el usuario puede fijar otra salida y vuelta para un día concreto (herramienta planificar_dia, pestaña Plan del día). Hoy es ${today()}. Rutas del ciclo (3 días por semana, en coche): ${ROUTES.map(r=>r.id+' '+r.name).join('; ')}.
Visitas registradas: ${SEG.size}. Fichas editadas por el usuario: ${FICHA.size}. Solo algunos médicos tienen días de consulta conocidos; si preguntan por días, dilo.`;
  $('askForm').onsubmit=async e=>{
    e.preventDefault();const q=$('askInput').value.trim();if(!q)return;if(ctl)ctl.abort();ctl=new AbortController();
    $('answer').classList.add('on');$('answerTools').textContent='';$('answerText').textContent='Pensando…';$('askBtn').disabled=true;
    const wrapped=tools.map(t=>({...t,execute:(inp,ctx)=>{$('answerTools').textContent='Aplicando en pantalla…';return t.execute(inp,ctx)}}));
    const prompt=`Eres el asistente de un explorador de médicos para planificar visitas comerciales (DOLNER, DLC Health Group).
${vocab.replace(/Visitas registradas: \d+/,'Visitas registradas: '+SEG.size)}
Usa las herramientas: aplican los filtros en la pantalla del usuario. Centros o grupos: ranking_centros. Médicos: filtrar_medicos. Rutas o qué visitar: rutas. Llama a una sola herramienta salvo que haga falta otra.
Responde en español, breve (máximo 8 líneas), con las cifras clave. Sin markdown con almohadillas ni negritas. Di qué has mostrado en pantalla.
Pregunta: ${q}`;
    try{const {text}=await sample(prompt,{tools:wrapped,signal:ctl.signal,cache:false,modelTier:'default',onText:({text})=>{$('answerText').textContent=text}});$('answerText').textContent=text;$('answerTools').textContent='';}
    catch(err){const msg={not_granted:'Para usar las preguntas hay que permitir el acceso a Claude. Los filtros funcionan sin él.',rate_limited:'Demasiadas preguntas seguidas. Espera un momento y vuelve a preguntar.',cancelled:''}[err.code];
      $('answerText').textContent=(err.text||'')+(msg!==undefined?(msg?'\n'+msg:''):'\nNo se ha podido responder ('+(err.code||'error')+'). Prueba a reformular la pregunta.');if(err.code==='not_granted')$('ask').hidden=true;}
    finally{$('askBtn').disabled=false}
  };
}

/* ---------- v1.1: utilidades móvil ---------- */
const isMob=()=>!!(window.matchMedia&&window.matchMedia('(max-width:760px)').matches);
function telHref(t){const d=String(t||'').split(/[\/;,]| o /)[0].replace(/[^\d+]/g,'');if(d.length<9)return '';return 'tel:'+(d.startsWith('+')?d:(d.length===9?'+34'+d:d))}
function mapsHref(c){const q=c.d?`${c.d}, ${c.m}`:(c.ce&&c.ce!=='CONSULTA PRIVADA'?`${c.ce}, ${c.m}`:'');if(!q)return '';const e=encodeURIComponent(q);
  return (localStorage.getItem('dlc_maps')==='apple')?`https://maps.apple.com/?daddr=${e}&dirflg=d`:`https://www.google.com/maps/dir/?api=1&destination=${e}&travelmode=driving`}
function actBtns(d,c,extra){const t=telHref(c.tel||d.tel),m=mapsHref(c);
  return `<div class="acts2"><button type="button" class="act urg ${d.top?'on':''}" data-urg="${d.c}">${d.top?'★ Urgente':'☆ Urgente'}</button>${t?`<a class="act" href="${t}">Llamar</a>`:''}${m?`<a class="act" href="${esc(m)}" target="_blank" rel="noopener">Cómo llegar</a>`:''}<button type="button" class="act" data-edit="${d.c}">Editar ficha</button><button type="button" class="act pri2" data-reg="${d.c}" data-ce="${esc(c.ce||'')}">Registrar</button>${extra||''}</div>`}
function cardHTML(d,c){const qc=d.q.startsWith('Confirmada con')?'ok':d.q.startsWith('Confirmada')?'mid':'';const dy=daysFor(d,c);
  return `<div class="card"><div class="nm">${d.top?'<span class="topb">Urgente</span> ':''}${esc(d.n)}${d.ed?' <span class="edb">editada</span>':''}</div>
  <div class="sm">${esc(d.e||'Sin especialidad')}${d.top?' · '+esc(d.top):''}${d._km!=null?` · <span class="dist">a ${d._km<1?'menos de 1':d._km.toFixed(1).replace('.',',')} km${d._kx?'':' (aprox.)'}</span>`:''}</div>
  <div style="margin-top:6px">${esc(c.ce||'Sin centro')}${c.g&&c.g!==c.ce?` <span class="sm">· ${esc(c.g)}</span>`:''}</div>
  <div class="sm">${esc([c.d,c.m].filter(Boolean).join(' · '))}${d.cons.length>1?` · ${d.cons.length} consultas`:''}</div>
  <div class="row2">${dayBadges(dy)}<span class="q ${qc}" style="font-size:12.5px">${esc(d.q.replace('Sin verificar: dato original','Sin verificar').replace('Confirmada: ','Confirmada, '))}</span></div>
  ${dy.some(Boolean)?`<div class="sm" style="margin-top:4px">${DAYS.map((k,i)=>dy[i]?k+' '+esc(dy[i]):'').filter(Boolean).join(' · ')}</div>`:''}
  ${d.vn?`<div class="sm">Cuándo: ${esc(d.vn)}</div>`:''}
  <div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="estb" data-e="${estadoDe(d)}">${esc(estadoDe(d))}</span>${visitCell(d)}</div>${actBtns(d,c)}</div>`}
/* ---------- Hoy ---------- */
function renderH(){
  $('count').innerHTML='';
  const td=today(),wk=new Date();wk.setDate(wk.getDate()+7);const wks=wk.toISOString().slice(0,10);
  const segs=[...SEG.values()].filter(s=>BYCODE.has(s.c));
  const due=segs.filter(s=>s.prox_f&&s.prox_f<=wks).sort((a,b)=>a.prox_f.localeCompare(b.prox_f));
  const urg=DATA.filter(d=>d.top&&!(segOf(d.c)&&segOf(d.c).ultima));
  const monday=new Date();monday.setDate(monday.getDate()-((monday.getDay()+6)%7));const ms=monday.toISOString().slice(0,10);
  const weekV=segs.reduce((n,s)=>n+(s.visitas||[]).filter(v=>v.f>=ms).length,0);
  const pend=(typeof obxGet==='function')?obxGet().length:0;
  const stats=ROUTES.map(r=>({r,...routeStats(r)}));
  const sug=stats.find(x=>x.r.top&&x.v<x.n)||[...stats].filter(x=>!x.r.top).sort((a,b)=>(a.v/a.n)-(b.v/b.n)||(a.last||'').localeCompare(b.last||''))[0];
  const weekMu=segs.reduce((n,s)=>n+(s.visitas||[]).filter(v=>v.f>=ms).reduce((m,v)=>m+(+v.mu||0),0),0);
  let h=`<div class="acts2" style="margin:0 0 14px"><button type="button" class="act" data-h="near">Cerca de mí</button><button type="button" class="act" data-h="new">+ Nuevo médico</button><button type="button" class="act" data-h="share">Compartir semana</button></div><div class="kpis">${kpi(weekV,'visitas esta semana','visit')}${kpi(weekMu,'muestras de DOLNER esta semana','sample')}${kpi(due.filter(s=>s.prox_f<=td).length,'acciones para hoy o atrasadas','task',due.filter(s=>s.prox_f<=td).length?'k-warn':'')}${kpi(urg.length,'urgentes sin visitar','urg',urg.length?'k-warn':'k-ok')}${kpi(pend,pend===1?'cambio pendiente de enviar':'cambios pendientes de enviar','sync',pend?'k-warn':'k-ok')}${(()=>{const q=calidad();return kpi(q.pct+'%','fichas completas · ver qué falta','data','',`<div class="kbar"><i style="width:${q.pct}%"></i></div>`,'data-h="calidad" role="button" tabindex="0" style="cursor:pointer"')})()}</div>`;
  h+=`<div class="hsec"><h3>Siguiente ruta sugerida</h3><div class="card" style="border:1px solid var(--line);border-radius:12px"><div class="nm">${esc(sug.r.name)}</div><div class="sm">${sug.n} médicos · ${sug.v} visitados</div>
     <div class="acts2"><button type="button" class="act" data-goroute="${sug.r.id}">Ver ruta</button><button type="button" class="act pri2" data-plantoday="${sug.r.top?sug.r.id:'auto'}">Planificar ${new Date().getDay()%6===0?'el próximo día laborable':'hoy'}</button></div></div></div>`;
  h+=`<div class="hsec"><h3>Próximas acciones (7 días)</h3>${due.length?due.slice(0,30).map(s=>{const d=BYCODE.get(s.c);const c=d.cons.find(x=>x.ce===s.ce)||d.cons[0];
     return `<div class="card" style="border:1px solid var(--line);border-radius:12px;margin-bottom:8px"><div class="nm">${esc(d.n)}</div><div class="sm"><b style="color:${s.prox_f<td?'var(--warn)':'var(--navy)'}">${fmtDate(s.prox_f)}</b> · ${esc(s.prox||'Seguimiento')} · última visita ${fmtDate(s.ultima)} (${esc(s.res||'')})</div>${actBtns(d,c,`<button type="button" class="act" data-cal="${d.c}">Al calendario</button>`)}</div>`}).join(''):'<p class="sm">No hay acciones con fecha en los próximos 7 días.</p>'}</div>`;
  h+=`<div class="hsec"><h3>Urgentes sin visitar</h3>${urg.length?urg.map(d=>{const c=d.cons[0];return `<div class="card" style="border:1px solid var(--line);border-radius:12px;margin-bottom:8px"><div class="nm">${esc(d.n)}</div><div class="sm">${esc(d.top)} · ${esc(c.ce||'')}${d.vn?' · '+esc(d.vn):''}</div>${actBtns(d,c)}</div>`}).join(''):'<p class="sm">Todos los urgentes están visitados.</p>'}</div>`;
  $('hoy').innerHTML=h;
}
/* ---------- Excel ---------- */
let XLSXP=null;
function loadXLSX(){if(window.XLSX)return Promise.resolve(window.XLSX);if(XLSXP)return XLSXP;XLSXP=new Promise((res,rej)=>{const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';sc.onload=()=>res(window.XLSX);sc.onerror=()=>{XLSXP=null;rej(new Error('sin conexión'))};document.head.appendChild(sc)});return XLSXP}
async function downloadXlsx(rows,name,btn){return busy(btn,()=>downloadXlsx_(rows,name),'Preparando el Excel…')}
async function downloadXlsx_(rows,name){const btn=null;const old='';
  try{const X=await loadXLSX();
    const head=['CÓDIGO','NOMBRE','ESPECIALIDAD','ÁREA','PRIORIDAD','CENTRO','GRUPO','DIRECCIÓN','CP','MUNICIPIO','PROVINCIA','TELÉFONO',...DAYS,'CALIDAD UBICACIÓN','Nº CONSULTAS','OTRAS CONSULTAS','ÚLTIMA VISITA','RESULTADO','PRÓXIMA ACCIÓN','FECHA PRÓXIMA','CONTACTO'];
    const data=[head,...rows.map(([d,c])=>{const s=segOf(d.c)||{};return [d.c,d.n,d.e,d.a,d.top?'Urgente · '+d.top:(d.cor?'Corachan · por visitar':''),c.ce,c.g,c.d,c.cp,c.m,c.p,c.tel||d.tel,...daysFor(d,c),d.q,d.cons.length,
      d.cons.filter(x=>x!==c).map(x=>[x.ce,x.d,x.m].filter(Boolean).join(', ')).join(' | '),fmtDate(s.ultima),s.res||'',s.prox||'',fmtDate(s.prox_f),s.contacto||'']})];
    const ws=X.utils.aoa_to_sheet(data);ws['!cols']=head.map((h,i)=>({wch:[8,32,20,20,26,30,22,30,7,20,12,14][i]||16}));ws['!autofilter']={ref:X.utils.encode_range({s:{r:0,c:0},e:{r:data.length-1,c:head.length-1}})};
    const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,'MEDICOS');X.writeFile(wb,name);toast('Excel descargado');
  }catch(e){alert('No se ha podido crear el Excel: '+e.message+'. Hace falta conexión la primera vez.')}
  finally{}
}

/* ---------- v1.2: búsqueda, ficha rápida, cerca de mí, resumen, calendario ---------- */
function openQuick(code){const d=BYCODE.get(code);if(!d)return;const s=segOf(code);
  $('qbody').innerHTML=cardHTML(d,d.cons[0]).replace('class="card"','class="card" style="padding:0;border:0"')+
   `<div style="margin-top:12px"><label class="sm" for="qEst">Estado comercial</label><select id="qEst" data-qest="${d.c}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--bg)">${ESTADOS.map(e=>`<option ${estadoDe(d)===e?'selected':''}>${e}</option>`).join('')}</select><div class="sm">${d.est?'Fijado a mano':'Calculado según las visitas'}</div></div>`+
   (d.cons.length>1?`<h4 style="margin:14px 0 6px">Consultas</h4>${d.cons.map(c=>`<div class="sm" style="margin-bottom:6px"><b>${esc(c.ce||'Sin centro')}</b> · ${esc([c.d,c.m].filter(Boolean).join(', '))}${c.dy.some(Boolean)?' · '+DAYS.map((k,i)=>c.dy[i]?k+' '+esc(c.dy[i]):'').filter(Boolean).join(', '):''}${mapsHref(c)?` · <a href="${esc(mapsHref(c))}" target="_blank" rel="noopener">Cómo llegar</a>`:''}</div>`).join('')}`:'')+
   (s&&s.visitas&&s.visitas.length?`<h4 style="margin:14px 0 6px">Visitas</h4>${s.visitas.slice().reverse().map(v=>`<div class="sm" style="margin-bottom:4px">${fmtDate(v.f)} · <b>${esc(v.res)}</b>${v.mu?` · ${v.mu} muestras`:''}${v.nota?' · '+esc(v.nota):''}</div>`).join('')}`:'')+
   (s&&s.prox?`<p class="sm" style="margin-top:10px">Próxima acción: <b>${esc(s.prox)}</b> ${fmtDate(s.prox_f)}</p>`:'')+
   (d.url?`<p class="sm"><a href="${esc(d.url)}" target="_blank" rel="noopener">Ficha web</a></p>`:'');
  if(!$('qdlg').open)$('qdlg').showModal();}
function quickSearch(q){const n=norm(q);if(n.length<2){$('qsr').hidden=true;return}
  const r=[];for(const d of DATA){if(norm(d.n).includes(n)||d.cons.some(c=>norm(c.ce).includes(n)||norm(c.m).includes(n)))r.push(d);if(r.length>=40)break}
  $('qsr').innerHTML=r.length?r.map(d=>`<button type="button" data-q="${d.c}"><div class="nm">${d.top?'<span class="topb">Urgente</span> ':''}${esc(d.n)}</div><div class="sm">${esc(d.e||'')} · ${esc(d.cons[0].ce||'')} · ${esc(d.cons[0].m||'')}</div></button>`).join(''):'<div class="sm" style="padding:12px">Sin resultados</div>';
  $('qsr').hidden=false;}
function nearMe(btn){if(!navigator.geolocation){toast('Este dispositivo no permite obtener la ubicación',true);return}
  const b=btn||$('nearBtn');return busy(b,()=>new Promise(done=>nearMe_(done)),'Buscando tu ubicación…')}
function nearMe_(done){const b=null;
  navigator.geolocation.getCurrentPosition(p=>{S.near=[p.coords.latitude,p.coords.longitude];S.tab='M';S.limit=100;done();render();window.scrollTo({top:0})},
    e=>{done();alert(e.code===1?'Para usar "Cerca de mí", permite el acceso a la ubicación en los ajustes del navegador.':'No se ha podido obtener la ubicación. Inténtalo de nuevo.')},{enableHighAccuracy:true,timeout:15000,maximumAge:60000});}
function weekSummary(){
  const monday=new Date();monday.setDate(monday.getDate()-((monday.getDay()+6)%7));const ms=monday.toISOString().slice(0,10);
  const vs=[];SEG.forEach(s=>(s.visitas||[]).forEach(v=>{if(v.f>=ms)vs.push({...v,c:s.c})}));
  const byRes={};vs.forEach(v=>byRes[v.res]=(byRes[v.res]||0)+1);const mu=vs.reduce((n,v)=>n+(+v.mu||0),0);
  const inter=vs.filter(v=>['Interesado','Muestras entregadas','Ya prescribe'].includes(v.res)).map(v=>BYCODE.get(v.c)).filter(Boolean);
  const wk=new Date();wk.setDate(wk.getDate()+7);const wks=wk.toISOString().slice(0,10);
  const prox=[...SEG.values()].filter(s=>s.prox_f&&s.prox_f>=today()&&s.prox_f<=wks).sort((a,b)=>a.prox_f.localeCompare(b.prox_f));
  let t=`DLC · Resumen de la semana (desde el ${fmtDate(ms)})\n\nVisitas: ${vs.length}\n`+Object.entries(byRes).map(([k,n])=>`· ${k}: ${n}`).join('\n')+`\nMuestras de DOLNER entregadas: ${mu}\n`;
  if(inter.length)t+=`\nInteresados o prescriben:\n`+[...new Set(inter)].map(d=>`· ${d.n} (${d.e||''})`).join('\n')+'\n';
  if(prox.length)t+=`\nPróximas acciones (7 días):\n`+prox.map(s=>`· ${fmtDate(s.prox_f)} ${BYCODE.get(s.c)?.n||s.n}: ${s.prox||'seguimiento'}`).join('\n')+'\n';
  return t;}
function icsDownload(title,date,hIni,hFin,desc,loc){
  const z=x=>String(x).padStart(2,'0');const dt=(d,h)=>d.replace(/-/g,'')+'T'+h.replace(':','')+'00';
  const esc2=x=>String(x||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const now=new Date();const stamp=now.getUTCFullYear()+z(now.getUTCMonth()+1)+z(now.getUTCDate())+'T'+z(now.getUTCHours())+z(now.getUTCMinutes())+'00Z';
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//DLC OS//ES','BEGIN:VEVENT','UID:'+Date.now()+'@dlc-os','DTSTAMP:'+stamp,'DTSTART;TZID=Europe/Madrid:'+dt(date,hIni),'DTEND;TZID=Europe/Madrid:'+dt(date,hFin),
    'SUMMARY:'+esc2(title),'DESCRIPTION:'+esc2(desc),'LOCATION:'+esc2(loc),'BEGIN:VALARM','TRIGGER:-PT30M','ACTION:DISPLAY','DESCRIPTION:'+esc2(title),'END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const a=document.createElement('a');a.href='data:text/calendar;charset=utf-8,'+encodeURIComponent(ics);a.download='dlc-evento.ics';document.body.appendChild(a);a.click();setTimeout(()=>a.remove(),500);}
function planToCalendar(){const pl=P.plan;if(!pl||pl.error||!pl.stops.length)return;
  const lines=pl.stops.map(s=>s.lunch?`${hm(s.arr)} Pausa para comer`:`${hm(s.arr)} ${s.ct.ce==='CONSULTA PRIVADA'?'Consulta privada':s.ct.ce} (${s.ct.m}): ${s.seq.map(x=>x.d.n).join('; ')}`);
  icsDownload('Ruta de visitas DLC',P.fecha,P.salida,hm(pl.llegada),lines.join('\n'),'Santpedor');}

/* ---------- v1.3: estado comercial ---------- */
const ESTADOS=['Sin contactar','Presentado','Interesado','Prescribe','No interesado'];
function estadoDeRes(r){return r==='Ya prescribe'?'Prescribe':(r==='Interesado'||r==='Muestras entregadas')?'Interesado':r==='Presentado DOLNER'?'Presentado':r==='No interesado'?'No interesado':''}
function estadoDe(d){if(d.est)return d.est;const s=segOf(d.c);let best='';const ord=['Sin contactar','Presentado','Interesado','Prescribe'];
  (s&&s.visitas||[]).forEach(v=>{const e=estadoDeRes(v.res);if(e==='No interesado'){if(ord.indexOf(best)<2)best=e}else if(e&&ord.indexOf(e)>ord.indexOf(best))best=e});
  return best||'Sin contactar'}
function setEstado(code,estado){const d=BYCODE.get(code);if(!d)return;d.est=estado;queueOp('estado',{c:code,estado},'c');render();toast('Estado: '+estado);if($('qdlg').open)openQuick(code)}
function renderFunnel(){
  const pool=DATA.filter(d=>d.a==='Aparato locomotor y dolor'||d.top||d.est||(segOf(d.c)&&segOf(d.c).ultima));
  const cnt={};ESTADOS.forEach(e=>cnt[e]=0);pool.forEach(d=>cnt[estadoDe(d)]++);const max=Math.max(1,...ESTADOS.slice(1).map(e=>cnt[e]));
  $('funnel').innerHTML=`<h3>Estado comercial</h3><p class="sm" style="margin:0 0 8px">Médicos de aparato locomotor y dolor, urgentes y visitados (${pool.length}). Toca una fase para ver la lista.</p>`+
    ESTADOS.map(e=>`<button type="button" class="fstep" data-est="${e}"><span class="estb" data-e="${e}">${e}</span><span class="fb"><span style="width:${e==='Sin contactar'?100:cnt[e]/max*100}%;${e==='Sin contactar'?'opacity:.25':''}"></span></span><b>${cnt[e].toLocaleString('es')}</b></button>`).join('');
}
function posiblesDuplicados(n){const tk=x=>norm(x).replace(/[^a-z ,]/g,' ').split(/[ ,]+/).filter(t=>t.length>2);const a=tk(n);if(!a.length)return [];
  const sur=tk(n.split(',')[0]);return DATA.filter(d=>{const b=new Set(tk(d.n));const hitS=sur.filter(t=>b.has(t)).length;const hitA=a.filter(t=>b.has(t)).length;return (sur.length&&hitS>=Math.min(2,sur.length))||hitA>=Math.max(2,a.length-1)}).slice(0,5)}
/* ---------- v1.3: mapa ---------- */
let LMAP=null,LLAYER=null,LP=null;
function loadLeaflet(){if(window.L)return Promise.resolve();if(LP)return LP;LP=new Promise((res,rej)=>{const l=document.createElement('link');l.rel='stylesheet';l.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';document.head.appendChild(l);
  const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';sc.onload=()=>res();sc.onerror=()=>{LP=null;rej(new Error('sin conexión'))};document.head.appendChild(sc)});return LP}
function colorDe(d){if(d.top&&!(segOf(d.c)&&segOf(d.c).ultima))return '#D97706';const e=estadoDe(d);return e==='Prescribe'?'#1F8A5B':e==='Interesado'?'#B7791F':e==='Presentado'?'#2B6CB0':e==='No interesado'?'#9B2C2C':'#123A63'}
async function renderMap(f){
  $('mapWrap').hidden=false;
  try{await loadLeaflet()}catch(e){$('map').innerHTML='<div class="empty">El mapa necesita conexión a internet.</div>';return}
  if(!LMAP){LMAP=L.map('map',{preferCanvas:true}).setView([41.40,2.15],11);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(LMAP)}
  setTimeout(()=>LMAP.invalidateSize(),50);
  if(LLAYER)LLAYER.remove();LLAYER=L.layerGroup().addTo(LMAP);
  const pts=[];let ex=0,ap=0;
  for(const [d,c] of f){const xy=xyOf(c);if(!xy)continue;const exact=!!c.lat;exact?ex++:ap++;
    const mk=L.circleMarker(xy,{radius:exact?7:5,color:'#fff',weight:1.5,fillColor:colorDe(d),fillOpacity:exact?.95:.45});
    mk.bindPopup(`<b>${esc(d.n)}</b><br>${esc(d.e||'')}<br>${esc(c.ce||'')}${c.d?'<br>'+esc(c.d):''}<br><span class="estb" data-e="${estadoDe(d)}">${esc(estadoDe(d))}</span>${exact?'':' <i>(ubicación aproximada)</i>'}<br><a href="#" data-qopen="${d.c}">Abrir ficha</a>`);
    mk.addTo(LLAYER);pts.push(xy)}
  if(S.near){L.circleMarker(S.near,{radius:9,color:'#fff',weight:3,fillColor:'#E53E3E',fillOpacity:1}).addTo(LLAYER).bindPopup('Estás aquí');pts.push(S.near)}
  if(pts.length)LMAP.fitBounds(pts,{padding:[30,30],maxZoom:15});
  $('mapLeg').innerHTML=[['#D97706','Urgente sin visitar'],['#123A63','Sin contactar'],['#2B6CB0','Presentado'],['#B7791F','Interesado'],['#1F8A5B','Prescribe'],['#9B2C2C','No interesado']].map(([c,t])=>`<span><i style="background:${c}"></i>${t}</span>`).join('')+`<span>${ex} con dirección exacta · ${ap} aproximados (más pequeños y claros)</span>`;
}
/* ---------- v1.3: check-in y tiempos reales ---------- */
function chkGet(){try{return JSON.parse(localStorage.getItem('dlc_chk')||'null')}catch(e){return null}}
function nowHM(){const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function checkIn(ce,m){localStorage.setItem('dlc_chk',JSON.stringify({ce,m,f:today(),ini:nowHM(),id:'t-'+Date.now()}));render();toast('Llegada registrada a las '+nowHM())}
function checkOut(){const k=chkGet();if(!k)return;const fin=nowHM();const min=Math.max(1,toMin(fin)-toMin(k.ini));
  let n=0;SEG.forEach(s=>(s.visitas||[]).forEach(v=>{if(v.f===k.f&&v.ce===k.ce)n++}));
  queueOp('tiempo',{id:k.id,f:k.f,ce:k.ce,m:k.m,ini:k.ini,fin,min,n});
  const loc=JSON.parse(localStorage.getItem('dlc_tiempos')||'[]');loc.push({min,n});localStorage.setItem('dlc_tiempos',JSON.stringify(loc.slice(-200)));
  localStorage.removeItem('dlc_chk');render();toast(`${k.ce}: ${min} min${n?` · ${n} ${n===1?'médico':'médicos'}`:''}`)}
function chkBar(){const k=chkGet();const el=$('chkBar');if(!k||k.f!==today()){el.hidden=true;if(k&&k.f!==today())localStorage.removeItem('dlc_chk');return}
  el.hidden=false;el.innerHTML=`<span>En ${esc(k.ce)} desde las ${k.ini}</span><button type="button" class="btn" id="chkOut">Termino aquí</button>`;$('chkOut').onclick=checkOut}
function minPorMedico(){const rows=[];const T=(window.__RAWJ||{}).TIEMPOS;if(T){const I={};T.h.forEach((h,i)=>I[h]=i);T.rows.forEach(r=>{const m=+r[I['MINUTOS']],n=+r[I['MÉDICOS VISITADOS']];if(m&&n)rows.push({min:m,n})})}
  JSON.parse(localStorage.getItem('dlc_tiempos')||'[]').forEach(x=>{if(x.n)rows.push(x)});
  const ok=rows.filter(r=>r.min/r.n<=120);if(ok.length<3)return null;const t=ok.reduce((a,r)=>a+r.min,0),n=ok.reduce((a,r)=>a+r.n,0);return Math.round(t/n)}

/* ---------- v1.3.1: calidad de los datos ---------- */
const enPool=d=>d.a==='Aparato locomotor y dolor'||!!d.top||!!d.cor;
const ISSUES=[
 ['sindir','Sin dirección de consulta',d=>!d.cons.some(c=>c.d)],
 ['sinverif','Ubicación sin verificar',d=>String(d.q||'').startsWith('Sin verificar')],
 ['sintel','Sin teléfono',d=>!d.tel&&!d.cons.some(c=>c.tel)],
 ['sindias','Sin días de consulta',d=>!d.cons.some(c=>daysFor(d,c).some(Boolean))&&!(d.sl&&d.sl.length)],
 ['sinesp','Sin especialidad',d=>!d.e],
 ['sincoord','Con dirección pero sin coordenadas exactas',d=>d.cons.some(c=>c.d)&&!d.cons.some(c=>c.lat)],
 ['urgsindir','Urgentes sin dirección',d=>!!d.top&&!d.cons.some(c=>c.d)],
];
function calidad(){const pool=DATA.filter(enPool);const res=ISSUES.map(([k,t,f])=>({k,t,n:pool.filter(f).length}));
  const core=ISSUES.filter(x=>['sindir','sintel','sindias','sinesp'].includes(x[0]));const ok=pool.filter(d=>!core.some(x=>x[2](d))).length;
  return {pool:pool.length,res,pct:pool.length?Math.round(ok/pool.length*100):0,ok}}
function renderQuality(){const q=calidad();const max=Math.max(1,q.pool);
  $('quality').innerHTML=`<h3>Calidad de los datos</h3><p class="sm" style="margin:0 0 8px"><b>${q.pct}%</b> de fichas completas (${q.ok.toLocaleString('es')} de ${q.pool.toLocaleString('es')}): con dirección, teléfono, días de consulta y especialidad. Toca un punto para ver a quién le falta.</p>`+
    q.res.map(r=>`<button type="button" class="fstep" data-issue="${r.k}"><span class="sm" style="color:var(--ink)">${esc(r.t)}</span><span class="fb"><span style="width:${r.n/max*100}%;background:var(--warn)"></span></span><b>${r.n.toLocaleString('es')}</b></button>`).join('');}

/* ---------- v1.3.2: avisos, carga, área, compartir ---------- */
let TOASTT=null;
function toast(msg,err){const t=$('toast');const info=err==='info';t.className='toast'+(err===true?' err':'')+(info?' info':'');t.innerHTML=(info?'':err?'⚠ ':'✓ ')+esc(msg);t.hidden=false;clearTimeout(TOASTT);TOASTT=setTimeout(()=>{t.hidden=true},2400)}
async function busy(btn,fn,label){if(!btn)return fn();if(btn.classList.contains('busy'))return;const old=btn.innerHTML;btn.classList.add('busy');btn.innerHTML='<span class="spin"></span> '+esc(label||btn.textContent.trim());
  await new Promise(r=>setTimeout(r,40));try{return await fn()}finally{btn.classList.remove('busy');if(document.body.contains(btn))btn.innerHTML=old}}
function areaOk(d){const a=S.areaSel;return a==='all'?true:a==='ap'?d.a==='Atención primaria':a==='otras'?(d.a!=='Aparato locomotor y dolor'&&d.a!=='Atención primaria'):d.a==='Aparato locomotor y dolor'}
function setArea(v){S.areaSel=v;localStorage.setItem('dlc_area',v);if(P.plan)P.plan=buildPlan();render();toast('Médicos a incluir: '+({loc:'Aparato locomotor y dolor',all:'Todas las áreas',ap:'Atención primaria',otras:'Otras especialidades'})[v])}
const ICO={visit:'<path d="M5 12l4 4L19 6"/>',sample:'<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6"/>',task:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',urg:'<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.6 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  sync:'<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M20 4v5h-5M4 20v-5h5"/>',data:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/>',star:'<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.6 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',clock:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'};
const icoStyle=(k,c)=>`--ico:url(&quot;data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${c||'#123A63'}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${ICO[k]}</svg>`)}&quot;)`;
function kpi(n,label,ico,cls,extra,attrs){return `<div class="kpi ${cls||''}" style="${icoStyle(ico,cls==='k-warn'?'#B45309':cls==='k-ok'?'#1F6F4A':'#123A63')}" ${attrs||''}><b>${n}</b><span>${label}</span>${extra||''}</div>`}
function shareWeek(){$('shText').value=weekSummary();$('shTo').value=localStorage.getItem('dlc_shto')||'';$('shdlg').showModal()}
function setupShare(){
  $('shClose').onclick=()=>$('shdlg').close();
  $('shCopy').onclick=async()=>{const t=$('shText').value;try{await navigator.clipboard.writeText(t);toast('Texto copiado')}catch(e){$('shText').select();document.execCommand&&document.execCommand('copy');toast('Texto copiado')}};
  $('shMail').onclick=()=>{const to=$('shTo').value.trim();localStorage.setItem('dlc_shto',to);location.href='mailto:'+encodeURIComponent(to)+'?subject='+encodeURIComponent('DLC · Resumen de la semana')+'&body='+encodeURIComponent($('shText').value)};
  $('shWa').onclick=()=>{window.open('https://wa.me/?text='+encodeURIComponent($('shText').value),'_blank','noopener')};
}

/* ---------- v1.3.3: versión, actualizaciones, cerrar ventanas ---------- */
function datosTxt(){const h=window.__RAWJ&&window.__RAWJ.hora;return h?'Datos actualizados el '+new Date(h).toLocaleString('es',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'}):''}
function urgSeg(){const on=$('eUrg').checked;$('eUrgSeg').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.u==='1')===on)));$('eUrgM').disabled=!on;if(!on)$('eUrgM').placeholder='Solo si es urgente';else $('eUrgM').placeholder='Motivo de la urgencia (opcional)'}
async function checkVersion(manual){
  if(!navigator.onLine)return;
  try{const r=await fetch('version.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)return;const j=await r.json();
    if(j.v&&j.v!==window.__APPVER){$('updBar').hidden=false;$('updBar').innerHTML=`<span>Hay una versión nueva de DLC OS (${esc(j.v)}). Tienes la ${esc(window.__APPVER)}.</span><button type="button" id="updGo">Actualizar ahora</button>`;$('updGo').onclick=e=>busy(e.target,updateNow,'Actualizando…')}
    else if(manual)toast('Tienes la última versión ('+window.__APPVER+')');}catch(e){}
}
async function updateNow(){
  if(obxGet().length){await flush();if(obxGet().length&&!confirm('Hay cambios sin enviar. Se conservarán en este dispositivo. ¿Actualizar igualmente?'))return}
  try{const rs=await navigator.serviceWorker.getRegistrations();for(const r of rs)await r.update()}catch(e){}
  try{const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)))}catch(e){}
  location.replace(location.pathname+'?v='+Date.now());
}
function setupV133(){
  document.querySelector('.logo').addEventListener('click',()=>{toast(`DLC OS · versión ${window.__APPVER}${datosTxt()?' · '+datosTxt().toLowerCase():''}`,'info');checkVersion(false)});
  $('eUrgSeg').addEventListener('click',e=>{const b=e.target.closest('[data-u]');if(!b)return;$('eUrg').checked=b.dataset.u==='1';urgSeg();if($('eUrg').checked)$('eUrgM').focus()});
  ['edlg','dlg','qdlg','shdlg','cfgDlg'].forEach(id=>{const dl=$(id);if(!dl)return;dl.addEventListener('mousedown',e=>{dl._down=e.target===dl});dl.addEventListener('click',e=>{if(e.target===dl&&dl._down)dl.close()})});
  checkVersion(false);setInterval(()=>checkVersion(false),30*60*1000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkVersion(false)});
}

/* ================= Plan del día ================= */
const HOME={n:'Santpedor',lat:41.7833,lon:1.8414};
const MUNI_XY={'SANTPEDOR':[41.7833,1.8414],'MANRESA':[41.7251,1.8266],'SANT FRUITOS DE BAGES':[41.7486,1.8736],'NAVARCLES':[41.752,1.9026],'SANT VICENC DE CASTELLET':[41.6667,1.8633],
 'TERRASSA':[41.561,2.01],'RUBI':[41.4933,2.0325],'SANT CUGAT DEL VALLES':[41.4722,2.0864],'SANT QUIRZE DEL VALLES':[41.5319,2.0775],'VALLDOREIX':[41.47,2.06],'SABADELL':[41.5463,2.1086],
 'CERDANYOLA DEL VALLES':[41.4917,2.1408],'BARBERA DEL VALLES':[41.5159,2.1246],'RIPOLLET':[41.4969,2.1575],'MONTCADA I REIXAC':[41.4833,2.1833],'BADIA DEL VALLES':[41.51,2.115],
 'OLESA DE MONTSERRAT':[41.545,1.8942],'ESPARREGUERA':[41.536,1.87],'VILADECAVALLS':[41.558,1.954],'MATADEPERA':[41.603,2.024],'ESPLUGUES DE LLOBREGAT':[41.3767,2.088],
 "L'HOSPITALET DE LLOBREGAT":[41.3597,2.1003],'CORNELLA DE LLOBREGAT':[41.357,2.074],'SANT JOAN DESPI':[41.368,2.057],'SANT JUST DESVERN':[41.383,2.075],'SANT BOI DE LLOBREGAT':[41.343,2.036],
 'VILADECANS':[41.315,2.014],'GAVA':[41.305,2.001],'CASTELLDEFELS':[41.28,1.977],'EL PRAT DE LLOBREGAT':[41.327,2.095],'BADALONA':[41.45,2.2474],'SANTA COLOMA DE GRAMENET':[41.4515,2.208],
 'MOLLET DEL VALLES':[41.54,2.213],'GRANOLLERS':[41.608,2.287],'MARTORELL':[41.474,1.931],'MOLINS DE REI':[41.414,2.016],'SANT FELIU DE LLOBREGAT':[41.383,2.045],'MATARO':[41.54,2.444],'IGUALADA':[41.579,1.617],'VIC':[41.93,2.254]};
const DIST_XY={'Ciutat Vella':[41.382,2.177],'Eixample':[41.392,2.162],'Sants-Montjuïc':[41.373,2.14],'Les Corts':[41.385,2.13],'Sarrià-Sant Gervasi':[41.401,2.133],'Gràcia':[41.404,2.156],
 'Horta-Guinardó':[41.418,2.168],'Nou Barris':[41.44,2.177],'Sant Andreu':[41.435,2.19],'Sant Martí':[41.41,2.199]};
const CENTRE_XY={'CENTRO MEDICO TEKNON':[41.4062,2.1195],'QUIRONSALUD|BARCELONA':[41.413,2.133],'HOSPITAL UNIVERSITARI DEXEUS':[41.3897,2.1256],'CIMA':[41.3905,2.1215],'CLINICA TRES TORRES':[41.399,2.135],
 'CLINICA CORACHAN':[41.3967,2.1297],'CLINICA DEL PILAR':[41.3985,2.1478],'CENTRE MEDIC QUIRONSALUD ARIBAU':[41.393,2.152],'HOSPITAL SAGRAT COR':[41.384,2.145],'HOSPITAL CLINIC|BARCELONA':[41.389,2.152],
 'CLINICA SAGRADA FAMILIA|BARCELONA':[41.4095,2.1395],'CLINICA DEL REMEI|BARCELONA':[41.413,2.16],"HOSPITAL VALL D'HEBRON":[41.427,2.142],'HOSPITAL DE SANT PAU':[41.413,2.174],
 'CLINICA SANT JORDI|BARCELONA':[41.436,2.19],'CENTRO MEDICO HOSTAFRANC':[41.376,2.144],'CENTRE MEDIC BALMES':[41.392,2.159],'CLINICUM':[41.395,2.161],
 'HOSPITAL GENERAL DE CATALUNYA':[41.4868,2.0664],'CENTRE MEDIC CAN MORA':[41.474,2.086],'PARC TAULI':[41.557,2.112],'HOSPITAL QUIRONSALUD DEL VALLES':[41.548,2.103],
 'MUTUA TERRASSA|TERRASSA':[41.564,2.015],'APTIMA|TERRASSA':[41.558,2.006],'ALTHAIA':[41.731,1.827],'CIMETIR':[41.725,1.826],'CLINICA DIAGONAL':[41.3775,2.0915]};
function xyOf(c){
  if(c&&c.lat&&c.lon)return [c.lat,c.lon];
  if(!c||!c.m)return null;
  const k1=c.ce+'|'+c.m; if(CENTRE_XY[k1])return CENTRE_XY[k1]; if(c.ce&&CENTRE_XY[c.ce]&&c.m===BCN)return CENTRE_XY[c.ce];
  if(c.ce&&CENTRE_XY[c.ce]&&!/\|/.test(c.ce)&&['HOSPITAL GENERAL DE CATALUNYA','CENTRE MEDIC CAN MORA','PARC TAULI','HOSPITAL QUIRONSALUD DEL VALLES','ALTHAIA','CIMETIR','CLINICA DIAGONAL'].includes(c.ce))return CENTRE_XY[c.ce];
  if(c.m===BCN)return c.di&&DIST_XY[c.di]?DIST_XY[c.di]:null;
  return MUNI_XY[c.m]||null;
}
function hav(a,b){const R=6371,t=x=>x*Math.PI/180;const dl=t(b[0]-a[0]),dn=t(b[1]-a[1]);const h=Math.sin(dl/2)**2+Math.cos(t(a[0]))*Math.cos(t(b[0]))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
function travel(a,b,aBcn,bBcn){ // minutos en coche, estimación
  const d=hav(a,b); if(d<0.05)return 0;
  if(aBcn&&bBcn)return Math.round(d*1.4/18*60+8);
  return Math.round(d*1.3/65*60+12);
}
const hm=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(Math.round(m%60)).padStart(2,'0')}`;
const toMin=s=>{const [h,m]=(s||'0:0').split(':').map(Number);return h*60+(m||0)};
function parseWin(t){
  const out=[];if(!t)return out;
  const re=/(\d{1,2})[:.h]?(\d{2})?\s*-\s*(\d{1,2})[:.h]?(\d{2})?/g;let m;
  while((m=re.exec(t)))out.push([+m[1]*60+(+m[2]||0),+m[3]*60+(+m[4]||0)]);
  if(!out.length){if(/mañana|mati/i.test(t))out.push([540,840]);if(/tarde|tarda/i.test(t))out.push([900,1170]);}
  const desde=/desde las? (\d{1,2})|a partir de las? (\d{1,2})|desde (\d{1,2}) ?h/i.exec(t); if(desde){const h=+(desde[1]||desde[2]||desde[3]);out.forEach(w=>w[0]=Math.max(w[0],h*60));}
  return out;
}
function windowsFor(d,c,di){ // null = no pasa ese día; [] no pasa; [[a,b]]
  const s=segOf(d.c); const known=c.dy.some(Boolean)||(d.sl&&d.sl.length&&c.ce==='CLINICA CORACHAN')||(s&&s.horario&&Object.values(s.horario).some(Boolean)&&(!s.ce||s.ce===c.ce));
  const w=[];
  if(c.dy[di])w.push(...parseWin(c.dy[di]));
  if(s&&s.horario&&s.horario[DAYS[di]]&&(!s.ce||s.ce===c.ce))w.push(...parseWin(s.horario[DAYS[di]]));
  if(d.sl&&c.ce==='CLINICA CORACHAN')d.sl.filter(x=>x[0]===di).forEach(([,f,n])=>{const base=f==='M'?[540,840]:[900,1170];const p=parseWin(n);w.push(p.length?[Math.max(base[0],p[0][0]),base[1]]:base)});
  if(!known)return {known:false,w:[[0,1440]]};
  return {known:true,w};
}
const P={fecha:'',salida:'08:00',vuelta:'19:00',ini:'09:00',fin:'18:00',min:15,cap:6,comer:false,cIni:'14:00',cDur:45,foco:'auto',loc:true,excl:new Set(),plan:null};
try{const sv=JSON.parse(localStorage.getItem('plandia')||'{}');['salida','vuelta','ini','fin','min','foco','cap','comer','cIni','cDur'].forEach(k=>{if(sv[k]!=null)P[k]=sv[k]})}catch(e){}
function nextWorkday(){const d=new Date();d.setDate(d.getDate()+1);while([0,6].includes(d.getDay()))d.setDate(d.getDate()+1);return d.toISOString().slice(0,10)}
function focusCodes(){
  if(P.foco==='auto')return null;
  const r=ROUTES.find(x=>x.id===P.foco); if(!r)return null; const set=new Set();
  if(r.dyn){DATA.forEach(d=>{if(d.top)set.add(d.c)});return set}
  if(r.cor){CORD.forEach(d=>set.add(d.c));return set}
  r.blocks.forEach(b=>{const x=routeDocs(b);x.anchors.forEach(a=>a.docs.forEach(([d])=>set.add(d.c)));if(!b.stops)x.fill.forEach(([d])=>set.add(d.c))});
  return set;
}
function scoreDoc(d,wk){
  let s={A:30,B:20,C:10}[prio(d)];
  if(d.top)s+=100; if(d.cor)s+=60;
  const sg=segOf(d.c);
  if(sg&&sg.prox_f===P.fecha)s+=120; else if(sg&&sg.ultima)s-=45;
  if(wk.known)s+=40;
  return s;
}
function buildPlan(){
  const di=new Date(P.fecha+'T12:00').getDay()-1;
  if(di<0||di>4)return {error:'Elige un día de lunes a viernes.'};
  const fc=focusCodes();
  const centres=new Map(); const skipped=[];
  for(const d of DATA){
    if(P.excl.has(d.c))continue;
    if(fc&&!fc.has(d.c))continue;
    if(!fc&&!areaOk(d)&&!d.top&&!d.cor)continue;
    let placed=false,reason='sin ubicación en la zona',opt=[];
    for(const c of d.cons){
      if(P.foco==='T3'&&c.ce!=='CLINICA CORACHAN')continue;
      const xy=xyOf(c); if(!xy)continue;
      if(!c.d&&(!c.ce||c.ce==='CONSULTA PRIVADA'))continue;
      const wk=windowsFor(d,c,di);
      if(wk.known&&!wk.w.length){reason='no pasa consulta ese día';continue;}
      opt.push({c,xy,wk});
    }
    opt.sort((a,b)=>(b.wk.known?1:0)-(a.wk.known?1:0));
    if(opt.length){const {c,xy,wk}=opt[0];
      const key=(c.ce==='CONSULTA PRIVADA'||!c.ce)?'addr|'+c.d+'|'+c.m:c.ce+'|'+c.m;
      let ct=centres.get(key); if(!ct){ct={key,ce:c.ce,m:c.m,d:c.d,xy,bcn:c.m===BCN,docs:[]};centres.set(key,ct)} if(!ct.d&&c.d)ct.d=c.d;
      ct.docs.push({d,c,w:wk.w,known:wk.known,score:scoreDoc(d,wk)}); placed=true;}
    if(!placed&&(d.top||d.cor))skipped.push({d,reason});
  }
  const C=[...centres.values()];
  const start=toMin(P.salida),back=toMin(P.vuelta),vIni=toMin(P.ini),vFin=toMin(P.fin),vis=Math.max(5,+P.min||15),OVER=10,MAXWAIT=40;
  const cap=P.foco==='T3'?40:Math.max(1,+P.cap||6); C.forEach(ct=>ct.used=null);
  let t=start,pos=[HOME.lat,HOME.lon],posB=false; const stops=[]; const done=new Set(); let lunched=!P.comer; const lIni=toMin(P.cIni),lDur=Math.max(15,+P.cDur||45);
  for(let guard=0;guard<40;guard++){
    if(!lunched&&t>=lIni){stops.push({lunch:true,arr:t,end:t+lDur});t+=lDur;lunched=true}
    let best=null;
    for(const ct of C){
      const docs=ct.docs.filter(x=>!done.has(x.d.c)); if(!docs.length)continue;
      const tr=travel(pos,ct.xy,posB,ct.bcn); let arr=Math.max(t+tr,vIni); if(arr>=vFin)continue;
      if(ct.used!=null&&arr<ct.used+120)continue;
      let tt=arr+OVER; const seq=[]; let val=0;
      for(const x of [...docs].sort((a,b)=>b.score-a.score)){
        let win=null; for(const w of x.w){const st=Math.max(tt,w[0],vIni);if(st-tt<=MAXWAIT&&st+vis<=Math.min(w[1],vFin)){win=st;break}}
        if(win==null)continue; seq.push({...x,at:win}); tt=win+vis; val+=x.score*x.score; if(seq.length>=cap)break;
      }
      if(!seq.length)continue;
      const home=travel(ct.xy,[HOME.lat,HOME.lon],ct.bcn,false); if(tt+home>back)continue;
      const ratio=val/((tt-t)+1);
      if(!best||ratio>best.ratio)best={ct,arr,tr,end:tt,seq,ratio};
    }
    if(!best)break;
    if(!lunched&&best.arr>lIni+30&&t<lIni+60){stops.push({lunch:true,arr:Math.max(t,lIni),end:Math.max(t,lIni)+lDur});t=Math.max(t,lIni)+lDur;lunched=true;continue}
    best.seq.forEach(x=>done.add(x.d.c)); best.ct.used=best.end; stops.push(best); t=best.end; pos=best.ct.xy; posB=best.ct.bcn;
  }
  const home=travel(pos,[HOME.lat,HOME.lon],posB,false);
  const missed=[];
  for(const ct of C)for(const x of ct.docs)if((x.d.top||x.d.cor)&&!done.has(x.d.c))missed.push({d:x.d,reason:'no cabe en el horario de hoy'});
  const seen=new Set(); const miss=[...skipped,...missed].filter(x=>{if(seen.has(x.d.c)||done.has(x.d.c))return false;seen.add(x.d.c);return true});
  return {di,stops,llegada:t+home,home,visitas:done.size,miss};
}
function renderP(){
  $('count').innerHTML='';
  if(!P.fecha)P.fecha=nextWorkday();
  const opts=[['auto','Automático: urgentes y prioridad']].concat(ROUTES.map(r=>[r.id,r.name]));
  let h=`<div class="pform">
   <div><label for="pF">Día</label><input type="date" id="pF" value="${P.fecha}"></div>
   <div><label for="pS">Salida de Santpedor</label><input type="time" id="pS" value="${P.salida}"></div>
   <div><label for="pV">Vuelta a Santpedor como tarde</label><input type="time" id="pV" value="${P.vuelta}"></div>
   <div><label for="pI">Visitas desde</label><input type="time" id="pI" value="${P.ini}"></div>
   <div><label for="pE">Visitas hasta</label><input type="time" id="pE" value="${P.fin}"></div>
   <div><label for="pM">Minutos por médico</label><input type="number" id="pM" min="5" max="60" value="${P.min}">${minPorMedico()?`<div class="hint">Según tus visitas: ${minPorMedico()} min <a href="#" id="pUseMin">usar</a></div>`:''}</div>
   <div><label for="pC">Máx. médicos por parada</label><input type="number" id="pC" min="1" max="30" value="${P.cap}"></div>
   <div><label for="pCo">Pausa para comer</label><select id="pCo"><option value="0" ${P.comer?'':'selected'}>No</option><option value="1" ${P.comer?'selected':''}>Sí</option></select></div>
   <div><label for="pCi">Comer a partir de</label><input type="time" id="pCi" value="${P.cIni}"></div>
   <div><label for="pCd">Minutos para comer</label><input type="number" id="pCd" min="15" max="120" value="${P.cDur}"></div>
   <div class="wide"><label for="pAr">Médicos a incluir</label><select id="pAr"><option value="loc" ${S.areaSel==='loc'?'selected':''}>Aparato locomotor y dolor</option><option value="all" ${S.areaSel==='all'?'selected':''}>Todas las áreas</option><option value="ap" ${S.areaSel==='ap'?'selected':''}>Atención primaria</option><option value="otras" ${S.areaSel==='otras'?'selected':''}>Otras especialidades</option></select><div class="sm">Los urgentes y los contactos de Corachan entran siempre.</div></div>
   <div class="wide"><label for="pFo">Qué visitar</label><select id="pFo">${opts.map(([v,l])=>`<option value="${v}" ${P.foco===v?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
   <div class="wide"><button class="btn" id="pGo">Generar ruta del día</button></div></div>`;
  const pl=P.plan;
  if(pl&&pl.error)h+=`<div class="warn">${esc(pl.error)}</div>`;
  else if(pl){
    const dname=DAYN[DAYS[pl.di]];
    h+=`<div class="psum"><b>${pl.visitas}</b> médicos en <b>${pl.stops.filter(s=>!s.lunch).length}</b> paradas · ${dname} ${fmtDate(P.fecha)} · salida ${P.salida} · vuelta estimada <b>${hm(pl.llegada)}</b></div>`;
    if(!pl.stops.length)h+=`<div class="warn">No cabe ninguna visita con este horario. Amplía la hora de vuelta o cambia lo que quieres visitar.</div>`;
    const real=pl.stops.filter(s=>!s.lunch);const places=real.map(s=>s.ct.d?`${s.ct.d}, ${s.ct.m}`:`${s.ct.ce}, ${s.ct.m}`);
    const nowM=new Date().getHours()*60+new Date().getMinutes();const isToday=P.fecha===today();const nextI=isToday?pl.stops.findIndex(s=>!s.lunch&&s.end>=nowM):-1;
    const links=[];for(let i=0;i<places.length;i+=8){const part=places.slice(i,i+8);const o=i===0?'Santpedor':places[i-1];const dst=i+8>=places.length?'Santpedor':part[part.length-1];const wp=i+8>=places.length?part:part.slice(0,-1);
      links.push('https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(o)+'&destination='+encodeURIComponent(dst)+'&travelmode=driving'+(wp.length?'&waypoints='+encodeURIComponent(wp.join('|')):''))}
    if(links.length)h+=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><button type="button" class="btn sec" id="pCal">Añadir al calendario</button>${links.map((u,i)=>`<a class="btn" target="_blank" rel="noopener" href="${esc(u)}">Abrir en Google Maps${links.length>1?' ('+(i+1)+'/'+links.length+')':''}</a>`).join('')}</div>`;
    h+=`<ol class="tl"><li class="tlh"><span class="tt">${P.salida}</span> Salida de Santpedor</li>`;
    pl.stops.forEach((s,si)=>{
      if(s.lunch){h+=`<li class="lunch"><span class="tt">${hm(s.arr)}</span><div><div class="an">Pausa para comer</div><div class="sm">Hasta las ${hm(s.end)}</div></div></li>`;return}
      const cc={ce:s.ct.ce,d:s.ct.d,m:s.ct.m};const mh=mapsHref(cc);
      h+=`<li class="${si===nextI?'now':''}"><span class="tt">${hm(s.arr)}</span><div>${si===nextI?'<div class="sm" style="font-weight:700;color:var(--navy)">Siguiente parada</div>':''}<div class="an">${esc(s.ct.ce==='CONSULTA PRIVADA'||!s.ct.ce?'Consulta privada':s.ct.ce)}</div><div class="sm">${esc(s.ct.d||'Dirección por confirmar')} · ${esc(s.ct.m)} · ${s.tr} min de trayecto</div><div class="acts2" style="margin-top:6px">${mh?`<a class="act pri2" href="${esc(mh)}" target="_blank" rel="noopener">Ir a esta parada</a>`:''}${P.fecha===today()?(chkGet()&&chkGet().ce===(s.ct.ce||'Consulta privada')?`<button type="button" class="act" data-chkout="1">Termino aquí</button>`:`<button type="button" class="act" data-chkin="${esc(s.ct.ce||'Consulta privada')}" data-chkm="${esc(s.ct.m)}">Estoy aquí</button>`):''}</div>
       <ul class="plist">${s.seq.map(x=>`<li><span class="pri ${prio(x.d)}">${prio(x.d)}</span><span><div class="nm">${x.d.top?'<span class="topb">Urgente</span> ':''}${esc(x.d.n)}</div><div class="sm">${hm(x.at)} · ${esc(x.d.e||'')}${x.known?' · pasa consulta hoy':''}${x.d.vn?' · '+esc(x.d.vn):''}</div></span>
       <span style="display:flex;gap:6px">${telHref(x.c.tel||x.d.tel)?`<a class="reg" href="${telHref(x.c.tel||x.d.tel)}">Llamar</a>`:''}<button class="reg" data-edit="${x.d.c}">Editar</button><button class="reg" data-reg="${x.d.c}" data-ce="${esc(x.c.ce||'')}">Registrar</button><button class="reg" data-ex="${x.d.c}" title="Quitar y volver a calcular">Quitar</button></span></li>`).join('')}</ul></div></li>`;
    });
    h+=`<li class="tlh"><span class="tt">${hm(pl.llegada)}</span> Llegada a Santpedor (${pl.home} min de vuelta)</li></ol>`;
    if(pl.miss.length)h+=`<details class="anchor"><summary><span><span class="an">Prioritarios que no entran este día</span><div class="sm">Urgentes y contactos de Corachan, con el motivo</div></span><span class="ac">${pl.miss.length}</span></summary><ul class="plist">${pl.miss.slice(0,60).map(x=>`<li><span class="pri ${prio(x.d)}">${prio(x.d)}</span><span><div class="nm">${esc(x.d.n)}</div><div class="sm">${esc(x.reason)}${x.d.vn?' · '+esc(x.d.vn):''}</div></span><span></span></li>`).join('')}</ul></details>`;
    if(P.excl.size)h+=`<p class="sm">${P.excl.size} quitados a mano. <button class="reg" id="pClr">Volver a incluirlos</button></p>`;
    h+=`<p class="sm">${P.comer?'Incluye pausa para comer. ':''}Tiempos estimados en coche (sin tráfico real) y ${P.min} min por médico, 10 min por parada y como máximo ${P.foco==='T3'?'todos los contactos':P.cap+' médicos'} por parada (si quedan más, se vuelve por la tarde). Los médicos con días conocidos solo se proponen el día y la franja en que pasan consulta; los demás, en cualquier hora de visita.</p>`;
  }
  $('plan').innerHTML=h;
}
function runPlan(){
  P.fecha=$('pF').value;P.salida=$('pS').value||'08:00';P.vuelta=$('pV').value||'19:00';P.ini=$('pI').value||'09:00';P.fin=$('pE').value||'18:00';P.min=+$('pM').value||15;P.cap=+$('pC').value||6;P.foco=$('pFo').value;P.comer=$('pCo').value==='1';P.cIni=$('pCi').value||'14:00';P.cDur=+$('pCd').value||45;
  try{localStorage.setItem('plandia',JSON.stringify({salida:P.salida,vuelta:P.vuelta,ini:P.ini,fin:P.fin,min:P.min,foco:P.foco,cap:P.cap,comer:P.comer,cIni:P.cIni,cDur:P.cDur}))}catch(e){}
  P.plan=buildPlan(); renderP();
}


/* ================= Editar ficha ================= */
const CPD={'08001':'Ciutat Vella','08002':'Ciutat Vella','08003':'Ciutat Vella','08004':'Sants-Montjuïc','08005':'Sant Martí','08006':'Sarrià-Sant Gervasi','08007':'Eixample','08008':'Eixample','08009':'Eixample','08010':'Eixample','08011':'Eixample','08012':'Gràcia','08013':'Eixample','08014':'Sants-Montjuïc','08015':'Eixample','08016':'Nou Barris','08017':'Sarrià-Sant Gervasi','08018':'Sant Martí','08019':'Sant Martí','08020':'Sant Martí','08021':'Sarrià-Sant Gervasi','08022':'Sarrià-Sant Gervasi','08023':'Gràcia','08024':'Gràcia','08025':'Eixample','08026':'Sant Martí','08027':'Sant Andreu','08028':'Les Corts','08029':'Eixample','08030':'Sant Andreu','08031':'Nou Barris','08032':'Horta-Guinardó','08033':'Nou Barris','08034':'Sarrià-Sant Gervasi','08035':'Horta-Guinardó','08036':'Eixample','08037':'Gràcia','08038':'Sants-Montjuïc','08039':'Ciutat Vella','08040':'Sants-Montjuïc','08041':'Horta-Guinardó','08042':'Nou Barris'};
const FICHA=new Map();
const ORIG=new Map(DATA.map(d=>[d.c,JSON.stringify({cons:d.cons,e:d.e,tel:d.tel,q:d.q,a:d.a})]));
const upperNoAcc=s=>(s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
function applyFicha(code){
  const d=BYCODE.get(code); if(!d)return; const o=JSON.parse(ORIG.get(code)); Object.assign(d,o); d.ed=null;
  const f=FICHA.get(code); if(!f)return;
  if(f.e)d.e=f.e; if(f.tel)d.tel=f.tel;
  if(Array.isArray(f.cons)&&f.cons.length){
    d.cons=f.cons.map(c=>{const m=upperNoAcc(c.m)||BCN; const cp=(c.cp||'').trim();
      const di=m===BCN?(c.di||CPD[cp]||null):null;
      return {ce:upperNoAcc(c.ce)||null,g:grupo(upperNoAcc(c.ce)),m,p:c.p||(m===BCN?'BARCELONA':(d.p||'BARCELONA')),d:c.d||null,di,cp,tel:c.tel||null,dy:DAYS.map((k,i)=>(c.dy&&c.dy[i])||''),cf:true}});
    const m0=d.cons[0]; d.ce=m0.ce||''; d.m=m0.m; d.d=m0.d||''; if(m0.d)d.q='Confirmada con dirección';
  }
  d.ed=f.upd||'sí';
}
function grupo(c){ // misma lógica que el Excel para centros nuevos
  if(!c)return null; const G=[[/TEKNON|DEXEUS|CLINICA DEL PILAR|HOSPITAL GENERAL DE CATALUNYA|SAGRAT COR|QUIRON/,'Grupo Quirónsalud'],[/CLINICA DIAGONAL|CENTRO MEDICO CORSEGA|CENTRO MEDICO TARRADELLAS|CENTRO MEDICO VILANOVA/,'Grupo Clínica Diagonal'],[/\bCIMA\b|SANITAS/,'Grupo Sanitas'],[/APTIMA|MUTUA TERRASSA/,'Grupo Mútua Terrassa'],[/CORACHAN/,'Clínica Corachan'],[/SAGRADA FAMILIA/,'Clínica Sagrada Família'],[/^CONSULTA PRIVADA$/,'Consulta privada']];
  for(const [r,g] of G)if(r.test(c))return g; return c;
}
let EDCODE=null;
function consRow(c,i){
  return `<fieldset class="ecr" data-i="${i}"><legend>${i===0?'Consulta principal':'Consulta '+(i+1)}${i>0?` <button type="button" class="rmx" data-rm="${i}">✕ Quitar</button>`:''}</legend>
   <div class="grid2"><div><label>Centro</label><div class="cbw"><input data-f="ce" data-cb="ce" autocomplete="off" value="${esc(c.ce||'')}" placeholder="Escribe o elige"><button type="button" class="cbt" tabindex="-1" aria-label="Ver lista">▾</button></div></div>
   <div><label>Municipio</label><div class="cbw"><input data-f="m" data-cb="muni" autocomplete="off" value="${esc(c.m||'')}"><button type="button" class="cbt" tabindex="-1" aria-label="Ver lista">▾</button></div></div></div>
   <div class="grid2"><div><label>Dirección</label><input data-f="d" value="${esc(c.d||'')}"></div><div><label>CP</label><input data-f="cp" value="${esc(c.cp||'')}" inputmode="numeric"></div></div>
   <label>Días y horario de consulta</label>
   <div class="grid5">${DAYS.map((k,j)=>`<div><div class="sm">${DAYN[k]}</div><input data-dy="${j}" value="${esc(c.dy[j]||'')}" placeholder="9-13 / 16-19"></div>`).join('')}</div>
   <div class="qk">${DAYS.map((k,j)=>`<span>${k}</span><button type="button" data-q="${j}|Mañana">M</button><button type="button" data-q="${j}|Tarde">T</button>`).join('')}</div>
   <div class="grid2"><div><label>Teléfono de esta consulta</label><input data-f="tel" value="${esc(c.tel||'')}" inputmode="tel"></div>
   <div style="display:flex;align-items:end;justify-content:flex-end"></div></div></fieldset>`;
}
let NEWD=null;
function openEdit(code,nd){
  delete $('eForm').dataset.dupok;
  if($('qdlg').open)$('qdlg').close();
  const d=nd||BYCODE.get(code); EDCODE=code; NEWD=nd||null; const f=FICHA.get(code)||{};
  $('eNewRow').hidden=!nd; $('eName').value=''; $('eArea').value=d.a||'Aparato locomotor y dolor';
  $('eUrg').checked=!!d.top; $('eUrgM').value=d.top&&d.top!=='Marcado desde la app'?d.top:''; urgSeg();
  $('eTitle').textContent=nd?'Nuevo médico':d.n; $('eSub').textContent=nd?'Se añadirá a tu hoja de Google':(d.ed?'Editada por ti el '+fmtDate(d.ed)+' · ':'')+'Código '+d.c;
  $('eEsp').value=d.e||''; $('eTel').value=d.tel||''; $('eCont').value=f.contacto||segOf(code)?.contacto||''; $('eNota').value=f.nota||'';
  $('eCons').innerHTML=d.cons.map((c,i)=>consRow(c,i)).join('');
  $('eMsg').textContent=DB?'':'Para guardar, abre el explorador desde su enlace de Claude.'; $('eSave').disabled=!DB;
  $('edlg').showModal();
}
function readEdit(){
  const cons=[...$('eCons').querySelectorAll('fieldset')].map(fs=>{const g=f=>fs.querySelector(`[data-f="${f}"]`).value.trim();
    return {ce:g('ce'),m:g('m')||'BARCELONA',d:g('d'),cp:g('cp'),tel:g('tel'),dy:[...fs.querySelectorAll('[data-dy]')].map(i=>i.value.trim())}}).filter(c=>c.ce||c.d);
  return {c:EDCODE,n:NEWD?upperNoAcc($('eName').value).replace(/\s*,\s*/,', '):BYCODE.get(EDCODE).n,e:$('eEsp').value.trim(),tel:$('eTel').value.trim(),contacto:$('eCont').value.trim(),nota:$('eNota').value.trim(),cons,upd:today()};
}
async function saveEdit(){
  if(!DB||!EDCODE)return; const doc=readEdit();
  if(NEWD&&!/,/.test(doc.n)){$('eMsg').textContent='Escribe el nombre como APELLIDOS, NOMBRE (con coma).';return}
  if(NEWD&&!$('eForm').dataset.dupok){const dup=posiblesDuplicados(doc.n);if(dup.length){$('eMsg').innerHTML='Posible duplicado: '+dup.map(d=>`<a href="#" data-dupopen="${d.c}">${esc(d.n)}</a> (${esc(d.e||'')}, ${esc(d.cons[0].ce||d.cons[0].m||'')})`).join(' · ')+'. Si es otra persona, pulsa otra vez Guardar.';$('eForm').dataset.dupok='1';return}}
  if(!doc.cons.length){$('eMsg').textContent='Deja al menos una consulta con centro o dirección.';return}
  const urgOn=$('eUrg').checked, motivo=$('eUrgM').value.trim();
  if(NEWD){doc.nuevo=true;doc.a=$('eArea').value;if(urgOn)doc.prioridad='Urgente · '+(motivo||'Marcado desde la app');
    const nd={...NEWD,n:doc.n,e:doc.e,a:doc.a,tel:doc.tel,top:urgOn?(motivo||'Marcado desde la app'):''};addDoctor(nd);}
  else{const d=BYCODE.get(EDCODE);const want=urgOn?(motivo||'Marcado desde la app'):'';if(want!==(d.top||''))setUrgent(d.c,urgOn,motivo);}
  $('eSave').disabled=true;$('eMsg').textContent='Guardando…';
  try{await DB.collection('fichas').doc(String(EDCODE)).set(doc);FICHA.set(EDCODE,doc);applyFicha(EDCODE);$('edlg').close();afterEdit();toast(NEWD?'Médico añadido':'Ficha guardada');}
  catch(e){$('eMsg').textContent=e.code==='quota_exceeded'?'No caben más fichas editadas. Pídeme que las pase al Excel y las archive.':'No se ha podido guardar ('+(e.code||'error')+'). Inténtalo de nuevo.';$('eSave').disabled=false}
}
function addDoctor(nd){DATA.push(nd);BYCODE.set(nd.c,nd);ORIG.set(nd.c,JSON.stringify({cons:nd.cons,e:nd.e,tel:nd.tel,q:nd.q,a:nd.a}))}
function newDoctorObj(code){return {c:code,t:'Persona',n:'',e:'',a:'Aparato locomotor y dolor',car:'',eq:'',ub:'',p:'BARCELONA',m:'BARCELONA',ce:'',g:'',d:'',cp:'',di:'',tel:'',q:'Confirmada con dirección',st:'Dónde confirmado',url:'',
  cons:[{ce:'',g:'',m:'BARCELONA',p:'BARCELONA',d:'',di:null,cp:'',tel:'',dy:['','','','',''],cf:true}],top:'',cor:0,vn:'',sl:[],ed:'',contacto:'',nota:'',nuevo:true}}
function openNew(){const c=Number('9'+String(Date.now()).slice(-10));openEdit(c,newDoctorObj(c))}
function setUrgent(code,on,motivo){const d=BYCODE.get(code);if(!d)return;
  d.top=on?(motivo||'Marcado desde la app'):'';
  const pr=on?'Urgente · '+d.top:(d.cor?'Corachan · por visitar':'');
  if(typeof queueOp==='function')queueOp('prioridad',{c:code,prioridad:pr},'c');render();toast(on?'Marcado como urgente':'Quitado de urgentes');
  if($('qdlg').open)openQuick(code);}
function afterEdit(){ if(S.tab==='P'&&P.plan){P.plan=buildPlan();} render(); }
async function saveScheduleFromVisit(code,ce,horario){ // el horario captado en una visita también actualiza la ficha
  if(!DB)return; const d=BYCODE.get(code); const base=FICHA.get(code);
  const cons=(base&&base.cons?JSON.parse(JSON.stringify(base.cons)):d.cons.map(c=>({ce:c.ce,m:c.m,d:c.d,cp:c.cp,tel:c.tel,dy:[...c.dy]})));
  let c=cons.find(x=>upperNoAcc(x.ce)===upperNoAcc(ce)); if(!c){c={ce,m:BCN,d:'',cp:'',tel:'',dy:['','','','','']};cons.push(c)}
  DAYS.forEach((k,i)=>{if(horario[k])c.dy[i]=horario[k]});
  const doc={...(base||{c:code,n:d.n,e:'',tel:'',contacto:'',nota:''}),cons,upd:today()};
  try{await DB.collection('fichas').doc(String(code)).set(doc);FICHA.set(code,doc);applyFicha(code)}catch(e){}
}
function setupEdit(){
  setupCombos();
  $('eAdd').onclick=()=>{const n=$('eCons').querySelectorAll('fieldset').length;$('eCons').insertAdjacentHTML('beforeend',consRow({ce:'',m:'BARCELONA',d:'',cp:'',tel:'',dy:['','','','','']},n))};
  $('eCons').addEventListener('click',e=>{const q=e.target.closest('[data-q]');if(q){const [j,t]=q.dataset.q.split('|');const inp=q.closest('fieldset').querySelector(`[data-dy="${j}"]`);inp.value=inp.value&&!inp.value.includes(t)?inp.value+'; '+t:t;inp.focus();return}
    const r=e.target.closest('[data-rm]');if(r){const lg=r.parentElement;r.hidden=true;const q=document.createElement('span');q.className='rmq';q.innerHTML='¿Quitar esta consulta? <button type="button" class="yes">Sí, quitar</button><button type="button" class="no">No</button>';lg.appendChild(q);return}
    const y=e.target.closest('.rmq .yes');if(y){y.closest('fieldset').remove();toast('Consulta quitada (se aplica al guardar la ficha)');return}
    const n=e.target.closest('.rmq .no');if(n){const lg=n.closest('legend');lg.querySelector('[data-rm]').hidden=false;n.closest('.rmq').remove()}});
  $('eCancel').onclick=()=>$('edlg').close(); $('eForm').onsubmit=e=>{e.preventDefault();saveEdit()};
  document.addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(b){e.preventDefault();openEdit(+b.dataset.edit)}});
}

/* ---- desplegables propios (sustituyen a datalist, que no funciona en todos los visores) ---- */
const CB_OPTS={esp:()=>OPT.esp,muni:()=>uniq(DATA.flatMap(d=>d.cons.map(c=>c.m))),ce:()=>uniq(DATA.flatMap(d=>d.cons.map(c=>c.ce)).filter(c=>c&&c!=='CONSULTA PRIVADA'))};
const CB_CACHE={};
function cbOptions(k){return CB_CACHE[k]||(CB_CACHE[k]=CB_OPTS[k]())}
let cbOpen=null;
function cbClose(){if(cbOpen){cbOpen.box.remove();cbOpen=null}}
function cbShow(inp,all){
  const k=inp.dataset.cb; const q=all?'':norm(inp.value); let opts=cbOptions(k);
  if(q)opts=opts.filter(o=>norm(o).includes(q)).sort((a,b)=>norm(a).indexOf(q)-norm(b).indexOf(q));
  opts=opts.slice(0,40);
  cbClose(); if(!opts.length)return;
  const box=document.createElement('div');box.className='cbx';box.setAttribute('role','listbox');
  box.innerHTML=opts.map((o,i)=>`<div role="option" data-v="${esc(o)}" class="${i===0?'on':''}">${esc(o)}</div>`).join('');
  inp.parentElement.appendChild(box); cbOpen={inp,box,i:0};
  box.addEventListener('mousedown',e=>{const o=e.target.closest('[data-v]');if(o){e.preventDefault();inp.value=o.dataset.v;cbClose();inp.dispatchEvent(new Event('change',{bubbles:true}))}});
}
function setupCombos(){
  const root=$('edlg');
  root.addEventListener('focusin',e=>{const i=e.target.closest('[data-cb]');if(i)cbShow(i,false)});
  root.addEventListener('input',e=>{const i=e.target.closest('[data-cb]');if(i)cbShow(i,false)});
  root.addEventListener('click',e=>{const b=e.target.closest('.cbt');if(b){const i=b.parentElement.querySelector('[data-cb]');if(cbOpen&&cbOpen.inp===i){cbClose()}else{i.focus();cbShow(i,true)}}});
  root.addEventListener('focusout',e=>{if(e.target.closest('[data-cb]'))setTimeout(()=>{if(cbOpen&&document.activeElement!==cbOpen.inp)cbClose()},150)});
  root.addEventListener('keydown',e=>{if(!cbOpen||e.target!==cbOpen.inp)return;const items=[...cbOpen.box.children];
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();items[cbOpen.i].classList.remove('on');cbOpen.i=(cbOpen.i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[cbOpen.i].classList.add('on');items[cbOpen.i].scrollIntoView({block:'nearest'})}
    else if(e.key==='Enter'){e.preventDefault();cbOpen.inp.value=items[cbOpen.i].dataset.v;cbClose()}
    else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cbClose()}});
  root.addEventListener('close',cbClose);
}
function renderFichas(){
  const rows=[...FICHA.values()].filter(f=>BYCODE.has(f.c)).sort((a,b)=>(b.upd||'').localeCompare(a.upd||''));
  $('fbody').innerHTML=rows.map(f=>{const d=BYCODE.get(f.c);return `<tr><td><div class="nm">${esc(d.n)}</div><div class="sm">${esc(d.e)}</div></td><td>${fmtDate(f.upd)}</td><td>${(f.cons||[]).map(c=>`${esc(c.ce||'')}${c.d?' · '+esc(c.d):''}${c.dy&&c.dy.some(Boolean)?' · '+DAYS.map((k,i)=>c.dy[i]?k+' '+esc(c.dy[i]):'').filter(Boolean).join(', '):''}`).join('<br>')}</td><td>${esc([f.tel,f.contacto,f.nota].filter(Boolean).join(' · '))}</td><td><button class="reg" data-edit="${d.c}">Editar ficha</button></td></tr>`}).join('')
    ||`<tr><td colspan="5" class="empty">Aún no has editado ninguna ficha. Usa "Editar ficha" en cualquier médico.</td></tr>`;
  $('fcount').textContent=rows.length;
}


/* ================= Sincronización con la hoja de Google ================= */
const CFG=JSON.parse(localStorage.getItem('dlc_cfg')||'{}');
const OBX_KEY='dlc_outbox';
function obxGet(){try{return JSON.parse(localStorage.getItem(OBX_KEY)||'[]')}catch(e){return []}}
function obxSet(a){localStorage.setItem(OBX_KEY,JSON.stringify(a));syncUI()}
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
function enqueue(name,id,v){
  const box=obxGet();
  if(name==='fichas'){
    const i=box.findIndex(o=>o.tipo==='ficha'&&String(o.data.c)===String(id)); const op={id:'f-'+uid(),tipo:'ficha',data:v,at:Date.now()};
    if(i>=0)box[i]=op; else box.push(op);
  }else if(name==='seguimiento'){
    const last=(v.visitas||[])[v.visitas.length-1]||{};
    box.push({id:'v-'+uid(),tipo:'visita',at:Date.now(),data:{id:'v-'+uid(),f:last.f||v.ultima,c:v.c,n:v.n,ce:last.ce||v.ce,res:last.res||v.res,horario:v.horario||{},contacto:v.contacto||'',nota:last.nota||'',prox:v.prox||'',prox_f:v.prox_f||'',muestras:last.mu||0}});
  }
  obxSet(box); flush();
}
DB={collection:(name)=>({doc:(id)=>({set:async(v)=>enqueue(name,id,v)})})};
function queueOp(tipo,data,key){const box=obxGet();const op={id:tipo[0]+'-'+uid(),tipo,data,at:Date.now()};
  const i=key?box.findIndex(o=>o.tipo===tipo&&String(o.data[key])===String(data[key])):-1; if(i>=0)box[i]=op; else box.push(op); obxSet(box); flush();}
let flushing=false,lastSync=localStorage.getItem('dlc_lastsync')||'';
async function flush(){
  if(flushing||!navigator.onLine||!CFG.url)return; const box=obxGet(); if(!box.length){syncUI();return}
  flushing=true;syncUI();
  const okIds=new Set();
  try{
    if(localStorage.getItem('dlc_mode')!=='jsonp'){
      try{
        const r=await fetch(CFG.url,{method:'POST',credentials:'omit',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({t:CFG.t,a:'batch',ops:box.map(o=>({id:o.id,tipo:o.tipo,data:o.data}))})});
        const j=JSON.parse(await r.text()); if(j.ok)j.results.filter(x=>x.ok).forEach(x=>okIds.add(x.id));
      }catch(e){console.warn('POST no disponible, uso el método alternativo',e)}
    }
    for(const o of box){ // método alternativo (y comprobación de lo que el POST no confirmó)
      if(okIds.has(o.id))continue;
      const d=JSON.stringify({ops:[{id:o.id,tipo:o.tipo,data:o.data}]});
      const j=await window.__jsonp(CFG.url+'?t='+encodeURIComponent(CFG.t)+'&a=op&d='+encodeURIComponent(d),60000);
      if(j&&j.ok)j.results.filter(x=>x.ok).forEach(x=>okIds.add(x.id));
    }
  }catch(e){console.warn('Sin sincronizar',e)}
  finally{
    if(okIds.size){obxSet(obxGet().filter(o=>!okIds.has(o.id)));lastSync=new Date().toISOString();localStorage.setItem('dlc_lastsync',lastSync)}
    flushing=false;syncUI()}
}
function syncUI(){
  const el=$('syncState'); if(!el)return; const n=obxGet().length;
  if(flushing){el.textContent='Sincronizando…';el.className='sync busy';return}
  if(n){el.textContent=`${n} ${n===1?'cambio pendiente':'cambios pendientes'}${navigator.onLine?'':' · sin conexión'}`;el.className='sync pend';return}
  el.textContent=(navigator.onLine?'Sincronizado':'Sin conexión')+(lastSync?' · '+new Date(lastSync).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}):'');el.className='sync ok';
}
/* estado inicial desde la hoja */
function buildFromSheet(){
  const raw=window.__RAWJ||{}; const V=raw.VISITAS||{h:[],rows:[]}; const I={};V.h.forEach((h,i)=>I[h]=i);
  const by=new Map();
  for(const r of V.rows){if(r[I['CÓDIGO']]==='')continue;const c=+r[I['CÓDIGO']];(by.get(c)||by.set(c,[]).get(c)).push(r)}
  by.forEach((rows,c)=>{
    rows.sort((a,b)=>String(a[I['FECHA']]).localeCompare(String(b[I['FECHA']])));
    const last=rows[rows.length-1]; const horario={};
    rows.forEach(r=>DAYS.forEach(k=>{if(r[I[k]])horario[k]=r[I[k]]}));
    const d=BYCODE.get(c);
    SEG.set(c,{c,n:d?d.n:last[I['NOMBRE']],ce:last[I['CENTRO']],ultima:last[I['FECHA']],res:last[I['RESULTADO']],horario,
      contacto:(rows.map(r=>r[I['CONTACTO']]).filter(Boolean).pop())||(d&&d.contacto)||'',prox:last[I['PRÓXIMA ACCIÓN']],prox_f:last[I['FECHA PRÓXIMA ACCIÓN']],
      visitas:rows.map(r=>({f:r[I['FECHA']],res:r[I['RESULTADO']],ce:r[I['CENTRO']],nota:r[I['NOTA']],mu:+(I['MUESTRAS']!==undefined?r[I['MUESTRAS']]:0)||0}))});
  });
  DATA.forEach(d=>{if(d.ed)FICHA.set(d.c,{c:d.c,n:d.n,e:d.e,tel:d.tel,contacto:d.contacto||'',nota:d.nota||'',upd:d.ed,cons:d.cons.map(x=>({ce:x.ce,m:x.m,d:x.d,cp:x.cp,tel:x.tel,dy:[...x.dy]}))})});
  // reaplicar lo pendiente de enviar
  for(const o of obxGet()){
    if(o.tipo==='prioridad'){const d=BYCODE.get(+o.data.c);if(d){const p=o.data.prioridad||'';d.top=p.startsWith('Urgente · ')?p.slice(10):''}continue}
    if(o.tipo==='ficha'&&o.data.nuevo&&!BYCODE.has(+o.data.c)){const nd=newDoctorObj(+o.data.c);Object.assign(nd,{n:o.data.n,e:o.data.e||'',a:o.data.a||nd.a,tel:o.data.tel||'',top:(o.data.prioridad||'').startsWith('Urgente · ')?o.data.prioridad.slice(10):''});addDoctor(nd)}
    if(o.tipo==='ficha'){FICHA.set(+o.data.c,o.data);applyFicha(+o.data.c)}
    else{const v=o.data,c=+v.c,prev=SEG.get(c)||{c,n:v.n,visitas:[]};const vis=(prev.visitas||[]).concat([{f:v.f,res:v.res,ce:v.ce,nota:v.nota,mu:v.muestras||0}]);
      SEG.set(c,{...prev,ce:v.ce,ultima:(prev.ultima&&prev.ultima>v.f)?prev.ultima:v.f,res:(prev.ultima&&prev.ultima>v.f)?prev.res:v.res,horario:{...(prev.horario||{}),...(v.horario||{})},contacto:v.contacto||prev.contacto,prox:v.prox,prox_f:v.prox_f,visitas:vis})}
  }
}
async function setupDb(){
  buildFromSheet(); render(); syncUI(); flush();
  window.addEventListener('online',()=>{syncUI();flush();checkUpdates()}); window.addEventListener('offline',syncUI);
  setInterval(flush,60000);
  $('syncBtn').onclick=e=>busy(e.target,async()=>{await flush();await checkUpdates();toast(obxGet().length?'Quedan cambios pendientes: sin conexión':'Todo sincronizado',!!obxGet().length)},'Sincronizando…');
  $('cfgBtn').onclick=()=>{$('cfgMaps').value=localStorage.getItem('dlc_maps')||'google';$('cfgUrl').value=CFG.url||'';$('cfgT').value=CFG.t||'';$('cfgMsg').innerHTML=`DLC OS · versión ${esc(window.__APPVER||'')} · ${esc(datosTxt()||'sin datos')} · <a href="#" id="cfgVer">Buscar actualizaciones</a>`;$('cfgVer').onclick=ev=>{ev.preventDefault();checkVersion(true)};$('cfgDlg').showModal()};
  $('cfgClose').onclick=()=>{localStorage.setItem('dlc_maps',$('cfgMaps').value);$('cfgDlg').close();render()};
  $('cfgXlsx').onclick=e=>downloadXlsx(DATA.map(d=>[d,d.cons[0]]),'DLC_medicos_completo.xlsx',e.target);
  $('cfgSave').onclick=()=>{const u=$('cfgUrl').value.trim();if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(u)){$('cfgMsg').textContent='La dirección debe empezar por https://script.google.com/macros/s/ y acabar en /exec.';return}localStorage.setItem('dlc_cfg',JSON.stringify({url:u,t:$('cfgT').value.trim()}));location.reload()};
  $('cfgReload').onclick=e=>busy(e.target,async()=>{if(obxGet().length){await flush()} if(obxGet().length){$('cfgMsg').textContent='Hay cambios sin enviar. Conéctate a internet y vuelve a intentarlo.';return} await (window.__reloadData&&window.__reloadData())},'Descargando…');
  $('newDataBtn').onclick=()=>location.reload();
  checkUpdates();
}
async function checkUpdates(){
  if(!navigator.onLine||!window.__refreshData)return;
  try{const changed=await window.__refreshData(); if(changed&&!obxGet().length)$('newData').hidden=false;}catch(e){}
}
/* descargas sin Claude: archivo generado en el propio dispositivo */
async function setupDownload(){
  const q=v=>`"${(v??'').toString().replace(/"/g,'""')}"`;
  const save=(name,lines)=>{const b=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)};
  $('dl').hidden=false;$('dlSeg').hidden=false;$('dlFich').hidden=false;
  $('dl').onclick=()=>{const f=filtered();const head=['CÓDIGO','NOMBRE','ESPECIALIDAD','ÁREA','CENTRO','GRUPO','MUNICIPIO','PROVINCIA','DIRECCIÓN','TELÉFONO',...DAYS,'CALIDAD','Nº CONSULTAS','ÚLTIMA VISITA','RESULTADO'];
    save('medicos_filtrados.csv',[head.map(q).join(';'),...f.map(([d,c])=>{const s=segOf(d.c)||{};return [d.c,d.n,d.e,d.a,c.ce,c.g,c.m,c.p,c.d,c.tel,...daysFor(d,c),d.q,d.cons.length,fmtDate(s.ultima),s.res].map(q).join(';')})])};
  $('dlSeg').onclick=()=>{const head=['CÓDIGO','NOMBRE','CENTRO','ÚLTIMA VISITA','RESULTADO',...DAYS,'CONTACTO','PRÓXIMA ACCIÓN','FECHA PRÓXIMA','HISTORIAL'];
    save('seguimiento_visitas.csv',[head.map(q).join(';'),...[...SEG.values()].map(s=>[s.c,s.n,s.ce,fmtDate(s.ultima),s.res,...DAYS.map(k=>s.horario?.[k]||''),s.contacto,s.prox,fmtDate(s.prox_f),(s.visitas||[]).map(v=>fmtDate(v.f)+' '+v.res).join(' | ')].map(q).join(';'))])};
  $('dlFich').onclick=()=>{const head=['CÓDIGO','NOMBRE','FECHA CAMBIO','ESPECIALIDAD','TELÉFONO','CONTACTO','NOTA','CONSULTA','CENTRO','DIRECCIÓN','CP','MUNICIPIO','TELÉFONO CONSULTA',...DAYS];const lines=[head.map(q).join(';')];
    [...FICHA.values()].forEach(f=>(f.cons||[]).forEach((c,i)=>lines.push([f.c,f.n,fmtDate(f.upd),f.e,f.tel,f.contacto,f.nota,i+1,c.ce,c.d,c.cp,c.m,c.tel,...DAYS.map((k,j)=>(c.dy||[])[j]||'')].map(q).join(';'))));save('fichas_editadas.csv',lines)};
}

init();
