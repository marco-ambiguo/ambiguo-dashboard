(function () {
  const S = window.AmbiguoStorage;
  let state = S.load();
  let currentView = 'dashboard';
  let sortState = { key: 'name', dir: 'asc' };
  let orderSortState = { key: 'date', dir: 'desc' };
  let searchTerm = '';

  const views = {
    dashboard: document.getElementById('view-dashboard'),
    cantina: document.getElementById('view-cantina'),
    ordini: document.getElementById('view-ordini'),
    vendite: document.getElementById('view-vendite'),
    clienti: document.getElementById('view-clienti'),
    distributori: document.getElementById('view-distributori'),
    impostazioni: document.getElementById('view-impostazioni')
  };
  const titles = { dashboard:'Dashboard', cantina:'Cantina', ordini:'Ordini distributori', vendite:'Ordini clienti', clienti:'Clienti', distributori:'Distributori', impostazioni:'Impostazioni' };
  const TAGS = ['bianco', 'rosso', 'orange', 'rosato', 'bolla'];
  const CUSTOMER_TYPES = ['privato','ristorante','enoteca','azienda','evento','uso interno','altro'];
  const SALE_STATUSES = ['bozza','confermato','pagato','annullato'];
  const DISCOUNT_PRESETS = [
    ['none','Nessuno'],
    ['5','5%'],
    ['6','6%'],
    ['5+6','5% + 6%'],
    ['6+5','6% + 5%'],
    ['5+5','5% + 5%'],
    ['custom','Manuale']
  ];

  function save(){ S.save(state); }
  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function val(id){ return document.getElementById('f_' + id)?.value || ''; }
  function money(v){ return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(v||0)); }
  function number(v){ return new Intl.NumberFormat('it-IT').format(Number(v||0)); }
  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function dateIT(iso){ if(!iso) return '—'; const d=new Date(iso); return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('it-IT'); }
  function round2(v){ return Math.round((Number(v||0)+Number.EPSILON)*100)/100; }
  function norm(v){ return String(v||'').toLowerCase().trim(); }
  function calcVat(net, rate=state.settings.vatRate){ return Number(net||0)*Number(rate||0)/100; }
  function grossFromNet(net, rate=state.settings.vatRate){ return Number(net||0)+calcVat(net,rate); }
  function distributorName(id){ return state.distributors.find(d=>d.id===id)?.name || '—'; }
  function distributorDefaultDiscount(id){ return state.distributors.find(d=>d.id===id)?.discountPreset || 'none'; }
  function customerName(id){ return state.customers.find(c=>c.id===id)?.name || '—'; }
  function getWine(id){ return state.wines.find(w=>w.id===id); }
  function activeDistributors(){ return state.distributors.filter(d=>!d.archived).sort((a,b)=>a.name.localeCompare(b.name)); }
  function activeCustomers(){ return state.customers.filter(c=>!c.archived).sort((a,b)=>a.name.localeCompare(b.name)); }
  function discountPresetValues(preset){
    if(!preset || preset==='none') return [];
    if(preset==='custom') return [];
    return String(preset).split('+').map(v=>Number(v)).filter(v=>!Number.isNaN(v));
  }
  function lineDiscounts(line){
    const preset = line.discountPreset || 'none';
    const base = preset === 'custom' ? [] : discountPresetValues(preset);
    const manual = [line.discount1,line.discount2,line.discount3].map(v=>Number(v||0)).filter(v=>v>0);
    return [...base, ...manual].filter(v=>v>0 && v<100);
  }
  function discountLabel(line){
    const values=lineDiscounts(line);
    return values.length ? values.map(v=>`${number(v)}%`).join(' + ') : '—';
  }
  function applySequentialDiscounts(price, discounts){
    return discounts.reduce((v,d)=>v*(1-Number(d||0)/100), Number(price||0));
  }
  function lineTotals(line){
    const listUnit=Number(line.netUnitPrice||line.unitPrice||0);
    const qty=Number(line.quantity||0);
    const vatRate=Number(line.vatRate ?? state.settings.vatRate);
    const discounts=lineDiscounts(line);
    const netUnit=applySequentialDiscounts(listUnit, discounts);
    const discountUnit=Math.max(0,listUnit-netUnit);
    const vatUnit=calcVat(netUnit,vatRate);
    const grossUnit=netUnit+vatUnit;
    const resaleUnit=Number(line.resalePrice||0);
    return {listUnit,netUnit,discountUnit,vatUnit,grossUnit,resaleUnit,netTotal:netUnit*qty,discountTotal:discountUnit*qty,vatTotal:vatUnit*qty,grossTotal:grossUnit*qty,resaleTotal:resaleUnit*qty};
  }
  function saleLineTotals(line){ const qty=Number(line.quantity||0); const unit=Number(line.unitPrice||0); const discount=Number(line.discount||0); const total=Math.max(0,(unit*qty)-discount); const cost=Number(line.costTotal||0); return { theoretical:unit*qty, total, cost, margin:total-cost }; }
  function wineStatus(w){ if(w.archived) return 'archiviato'; if(Number(w.quantity||0)<=0) return 'esaurito'; if(Number(w.quantity||0)<=Number(state.settings.lowStockThreshold||0)) return 'giacenza bassa'; return 'disponibile'; }
  function nextCode(prefix, arr){ return `${prefix}-${String((arr?.length||0)+1).padStart(3,'0')}`; }

  function filteredWines(){ const q=norm(searchTerm); return state.wines.filter(w=>!q || [w.code,w.name,w.producer,w.vintage,w.size,w.tag,distributorName(w.distributorId)].some(v=>norm(v).includes(q))); }
  function filteredOrders(){ const q=norm(searchTerm); return state.orders.filter(o=>!q || [o.code,distributorName(o.distributorId),customerName(o.customerId),o.date,o.notes].some(v=>norm(v).includes(q)) || o.lines.some(l=>[l.code,l.name,l.producer,l.vintage,l.tag].some(v=>norm(v).includes(q)))); }
  function filteredSales(){ const q=norm(searchTerm); return state.sales.filter(s=>!q || [s.code,customerName(s.customerId),s.date,s.status,s.notes].some(v=>norm(v).includes(q)) || s.lines.some(l=>norm(getWine(l.wineId)?.name).includes(q))); }
  function filteredCustomers(){ const q=norm(searchTerm); return state.customers.filter(c=>!q || [c.name,c.type,c.email,c.phone,c.notes].some(v=>norm(v).includes(q))); }
  function filteredDistributors(){ const q=norm(searchTerm); return state.distributors.filter(d=>!q || [d.name,d.notes].some(v=>norm(v).includes(q))); }

  function stats(){
    const wines=state.wines.filter(w=>!w.archived); const bottles=wines.reduce((s,w)=>s+Number(w.quantity||0),0);
    const netValue=wines.reduce((s,w)=>s+Number(w.netUnitPrice||0)*Number(w.quantity||0),0);
    const grossValue=wines.reduce((s,w)=>s+lineTotals(w).grossTotal,0);
    const resaleValue=wines.reduce((s,w)=>s+Number(w.resalePrice||0)*Number(w.quantity||0),0);
    const ordersGross=state.orders.reduce((s,o)=>s+Number(o.totals?.grossTotal||0),0);
    const salesGross=state.sales.filter(s=>s.status!=='annullato').reduce((s,o)=>s+Number(o.totals?.total||0),0);
    const movementsIn=state.movements.filter(m=>m.quantityChange>0).reduce((s,m)=>s+Number(m.quantityChange),0);
    const movementsOut=Math.abs(state.movements.filter(m=>m.quantityChange<0).reduce((s,m)=>s+Number(m.quantityChange),0));
    return {wines,bottles,netValue,grossValue,resaleValue,potentialValue:resaleValue+salesGross,ordersGross,salesGross,movementsIn,movementsOut,orders:state.orders.length,sales:state.sales.length,customers:state.customers.length};
  }

  function monthlyData(){
    const months=[]; const now=new Date();
    for(let i=5;i>=0;i--){
      const d=new Date(now.getFullYear(),now.getMonth()-i,1);
      const end=new Date(now.getFullYear(),now.getMonth()-i+1,0,23,59,59);
      const key=d.toISOString().slice(0,7);
      months.push({key,label:d.toLocaleDateString('it-IT',{month:'short'}),end,spent:0,sales:0,inQty:0,outQty:0,value:0});
    }
    state.orders.forEach(o=>{ const b=months.find(m=>m.key===String(o.date||'').slice(0,7)); if(b){ b.spent+=Number(o.totals?.grossTotal||0); b.inQty+=Number(o.totals?.quantity||0); }});
    state.sales.filter(s=>s.status!=='annullato').forEach(s=>{ const b=months.find(m=>m.key===String(s.date||'').slice(0,7)); if(b){ b.sales+=Number(s.totals?.total||0); b.outQty+=Number(s.totals?.quantity||0); }});
    months.forEach(m=>{
      const qtyByWine={};
      state.movements.forEach(move=>{
        const md=new Date(move.date||move.createdAt||todayISO());
        if(md<=m.end) qtyByWine[move.wineId]=(qtyByWine[move.wineId]||0)+Number(move.quantityChange||0);
      });
      m.value=Object.entries(qtyByWine).reduce((sum,[wineId,qty])=>{ const w=getWine(wineId); return sum + Math.max(0,qty)*Number(w?.resalePrice||0); },0);
    });
    return months;
  }
  function distributorBreakdown(){ const items=activeDistributors().map(d=>({label:d.name,value:0})); state.orders.forEach(o=>{ const it=items.find(x=>x.label===distributorName(o.distributorId)); if(it) it.value+=Number(o.totals?.grossTotal||0); }); return items.filter(i=>i.value>0); }

  function render(){
    document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));
    Object.entries(views).forEach(([n,el])=>el?.classList.toggle('active',n===currentView));
    document.getElementById('pageTitle').textContent=titles[currentView];
    if(currentView==='dashboard') renderDashboard();
    if(currentView==='cantina') renderCantina();
    if(currentView==='ordini') renderOrdini();
    if(currentView==='vendite') renderVendite();
    if(currentView==='clienti') renderClienti();
    if(currentView==='distributori') renderDistributori();
    if(currentView==='impostazioni') renderImpostazioni();
  }

  function statCard(label,value,note){ return `<div class="card stat-card"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div><div class="stat-note">${esc(note||'')}</div></div>`; }
  function renderDashboard(){
    const st=stats(); const months=monthlyData();
    views.dashboard.innerHTML=`
      <div class="grid cards">
        ${statCard('Bottiglie',number(st.bottles),`${st.wines.length} referenze`)}
        ${statCard('Valore cantina',money(st.resaleValue),'Prezzo resell Ambiguo')}
        ${statCard('Speso',money(st.ordersGross),'Ordini distributori')}
        ${statCard('Incassato',money(st.salesGross),'Ordini clienti')}
        ${statCard('Valore potenziale',money(st.potentialValue),'Incassato + cantina')}
      </div>
      <div class="grid two dashboard-charts"><div class="card chart-card"><h2>Andamento cantina</h2><div class="chart-wrap"><canvas id="chartInventory"></canvas></div></div><div class="card chart-card"><h2>Bottiglie entrate / uscite</h2><div class="chart-wrap"><canvas id="chartBottles"></canvas></div></div></div>
      <div class="grid two dashboard-charts"><div class="card chart-card"><h2>Entrate / uscite €</h2><div class="chart-wrap small"><canvas id="chartCash"></canvas></div></div><div class="card chart-card"><h2>Acquisti per distributore</h2><div class="chart-wrap small"><canvas id="chartDistributor"></canvas></div></div></div>
      <div class="card table-card" style="margin-top:16px"><div class="section-head" style="padding:18px 18px 0"><div><h2>Notifiche</h2><p class="small-muted">Ordini ancora da pagare o da incassare.</p></div></div>${notificationsPanel()}</div>`;
    drawLineChart('chartInventory',months.map(m=>m.label),months.map(m=>m.value), 'Valore cantina');
    drawBarChart('chartBottles',months.map(m=>m.label),[months.map(m=>m.inQty),months.map(m=>m.outQty)],['Entrate','Uscite']);
    drawBarChart('chartCash',months.map(m=>m.label),[months.map(m=>m.spent),months.map(m=>m.sales)],['Spese','Incassi']);
    drawDonutChart('chartDistributor',distributorBreakdown()); bindInlineActions();
  }
  function notificationsPanel(){
    const unpaidOrders=state.orders.filter(o=>(o.paymentStatus||'da pagare')!=='pagato' && o.status!=='annullato');
    const unpaidSales=state.sales.filter(s=>!['pagato','annullato'].includes(s.status));
    const rows=[
      ...unpaidOrders.map(o=>({type:'Da pagare',who:distributorName(o.distributorId),date:o.date,code:o.code,total:o.totals?.grossTotal,action:'edit-order',id:o.id})),
      ...unpaidSales.map(s=>({type:'Da incassare',who:customerName(s.customerId),date:s.date,code:s.code,total:s.totals?.total,action:'edit-sale',id:s.id}))
    ].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
    if(!rows.length) return `<div class="empty">Nessuna notifica: non risultano ordini aperti, da pagare o da incassare.</div>`;
    return `<div class="table-scroll"><table><thead><tr><th>Tipo</th><th>Da chi / a chi</th><th>Codice</th><th>Data</th><th>Importo</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="badge">${esc(r.type)}</span></td><td class="cell-title">${esc(r.who)}</td><td>${esc(r.code)}</td><td>${dateIT(r.date)}</td><td>${money(r.total)}</td><td><button class="btn small secondary" data-action="${r.action}" data-id="${r.id}">Apri</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderCantina(){
    let wines=filteredWines(); wines.sort((a,b)=>sortCompare(a,b));
    views.cantina.innerHTML=`<div class="section-head"><div class="filters"><select id="tagFilter" class="filter"><option value="">Tutti i tag</option>${TAGS.map(t=>`<option value="${t}">${t}</option>`).join('')}</select><select id="distributorFilter" class="filter"><option value="">Tutti i distributori</option>${activeDistributors().map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select><select id="stockFilter" class="filter"><option value="">Tutto lo stock</option><option value="available">Disponibili</option><option value="low">Pochi pezzi</option><option value="empty">Esauriti</option></select><select id="cantinaSort" class="filter"><option value="name:asc">Ordina: nome A-Z</option><option value="lastPurchaseDate:desc">Ordina: data ordine recente</option><option value="tag:asc">Ordina: tipologia vino</option><option value="distributor:asc">Ordina: distributore</option><option value="quantity:desc">Ordina: quantità alta</option><option value="resaleTotal:desc">Ordina: valore resell</option><option value="grossTotal:desc">Ordina: costo stock</option></select></div><div class="actions"><button class="btn secondary" data-action="new-movement">Movimento</button><button class="btn primary" data-action="new-wine">Nuovo vino</button></div></div><div class="card table-card">${wines.length?cantinaTable(wines):`<div class="empty">Cantina vuota.</div>`}</div>`;
    bindCantinaFilters(); bindInlineActions();
  }
  function sortValue(w,key){ const t=lineTotals(w); if(key==='distributor') return distributorName(w.distributorId); if(key==='discount') return discountLabel(w); if(key==='grossUnit') return t.grossUnit; if(key==='netTotal') return t.netTotal; if(key==='grossTotal') return t.grossTotal; if(key==='resaleTotal') return t.resaleTotal; if(key==='status') return wineStatus(w); if(key==='lastPurchaseDate') return w.lastPurchaseDate || w.createdAt || ''; return w[key]; }
  function sortCompare(a,b){ const av=sortValue(a,sortState.key), bv=sortValue(b,sortState.key); const r=(typeof av==='number'||typeof bv==='number')?Number(av||0)-Number(bv||0):String(av||'').localeCompare(String(bv||'')); return sortState.dir==='asc'?r:-r; }
  function cantinaTable(wines){ const headers=[['code','Codice'],['name','Nome vino'],['producer','Cantina'],['vintage','Annata'],['size','Dimensione'],['tag','Tag'],['distributor','Distributore'],['lastPurchaseDate','Data ordine'],['netUnitPrice','Listino no IVA'],['discount','Sconto'],['vatRate','IVA'],['grossUnit','Costo con IVA'],['resalePrice','Resell Ambiguo'],['quantity','Qtà'],['grossTotal','Totale costo'],['resaleTotal','Totale resell'],['status','Stato'],['actions','']]; return `<div class="table-scroll"><table><thead><tr>${headers.map(([k,l])=>`<th class="${k!=='actions'?'sortable':''}" data-sort="${k}">${l}${sortState.key===k?(sortState.dir==='asc'?' ↑':' ↓'):''}</th>`).join('')}</tr></thead><tbody>${wines.map(w=>{const t=lineTotals(w); return `<tr><td class="cell-title">${esc(w.code)}</td><td><div class="cell-title">${esc(w.name)}</div>${w.notes?`<div class="cell-sub">${esc(w.notes)}</div>`:''}</td><td>${esc(w.producer)}</td><td>${esc(w.vintage)}</td><td>${esc(w.size)}</td><td><span class="badge">${esc(w.tag||'—')}</span></td><td>${esc(distributorName(w.distributorId))}</td><td>${dateIT(w.lastPurchaseDate || w.createdAt)}</td><td>${money(w.netUnitPrice)}</td><td>${discountLabel(w)}</td><td>${number(w.vatRate)}%</td><td>${money(t.grossUnit)}</td><td>${money(w.resalePrice)}</td><td><strong>${number(w.quantity)}</strong></td><td>${money(t.grossTotal)}</td><td>${money(t.resaleTotal)}</td><td><span class="badge">${wineStatus(w)}</span></td><td><div class="actions"><button class="btn small secondary" data-action="edit-wine" data-id="${w.id}">Modifica</button><button class="btn small ghost" data-action="wine-history" data-id="${w.id}">Storico</button><button class="btn small danger" data-action="delete-wine" data-id="${w.id}">Elimina</button></div></td></tr>`;}).join('')}</tbody></table></div>`; }
  function bindCantinaFilters(){ const tag=document.getElementById('tagFilter'), dist=document.getElementById('distributorFilter'), stock=document.getElementById('stockFilter'), sort=document.getElementById('cantinaSort'); if(sort) sort.value=`${sortState.key}:${sortState.dir}`; const apply=()=>{ if(sort&&sort.value){ const [key,dir]=sort.value.split(':'); sortState={key,dir}; } let wines=filteredWines().filter(w=>(!tag.value||w.tag===tag.value)&&(!dist.value||w.distributorId===dist.value)); if(stock.value==='available') wines=wines.filter(w=>w.quantity>state.settings.lowStockThreshold); if(stock.value==='low') wines=wines.filter(w=>wineStatus(w)==='giacenza bassa'); if(stock.value==='empty') wines=wines.filter(w=>wineStatus(w)==='esaurito'); wines.sort((a,b)=>sortCompare(a,b)); document.querySelector('#view-cantina .table-card').innerHTML=wines.length?cantinaTable(wines):`<div class="empty">Nessun vino con questi filtri.</div>`; bindInlineActions(); bindSortHeaders(); }; [tag,dist,stock,sort].filter(Boolean).forEach(el=>el.addEventListener('change',apply)); bindSortHeaders(); }
  function bindSortHeaders(){ document.querySelectorAll('th.sortable').forEach(th=>th.addEventListener('click',()=>{ const key=th.dataset.sort; if(sortState.key===key) sortState.dir=sortState.dir==='asc'?'desc':'asc'; else sortState={key,dir:'asc'}; render(); })); }

  function orderSortValue(o,key){ if(key==='distributor') return distributorName(o.distributorId); if(key==='quantity') return Number(o.totals?.quantity||0); if(key==='grossTotal') return Number(o.totals?.grossTotal||0); return o[key] || ''; }
  function orderSortCompare(a,b){ const av=orderSortValue(a,orderSortState.key), bv=orderSortValue(b,orderSortState.key); const r=(typeof av==='number'||typeof bv==='number')?Number(av||0)-Number(bv||0):String(av||'').localeCompare(String(bv||'')); return orderSortState.dir==='asc'?r:-r; }
  function renderOrdini(){
    const orders=filteredOrders().sort((a,b)=>orderSortCompare(a,b));
    views.ordini.innerHTML=`<div class="section-head"><div class="filters"><span class="small-muted">Ordini da distributore, separati ordine per ordine.</span><select id="orderSort" class="filter"><option value="date:desc">Ordina: più recenti</option><option value="date:asc">Ordina: più vecchi</option><option value="distributor:asc">Ordina: distributore</option><option value="quantity:desc">Ordina: più bottiglie</option><option value="grossTotal:desc">Ordina: totale alto</option><option value="status:asc">Ordina: stato</option></select></div><button class="btn primary" data-action="new-order">Nuovo ordine</button></div><div class="order-list">${orders.length?orders.map(orderCard).join(''):`<div class="empty card">Nessun ordine registrato.</div>`}</div>`;
    const select=document.getElementById('orderSort'); if(select){ select.value=`${orderSortState.key}:${orderSortState.dir}`; select.addEventListener('change',()=>{ const [key,dir]=select.value.split(':'); orderSortState={key,dir}; renderOrdini(); }); }
    bindInlineActions();
  }
  function orderCard(o){
    const rows=o.lines.slice(0,5).map(l=>{ const t=lineTotals(l); return `<tr><td class="cell-title">${esc(l.code)}</td><td>${esc(l.name)}</td><td>${esc(l.producer)}</td><td>${esc(l.vintage||'—')}</td><td><span class="badge">${esc(l.tag||'—')}</span></td><td>${number(l.quantity)}</td><td>${money(l.netUnitPrice)}</td><td>${discountLabel(l)}</td><td>${money(l.resalePrice)}</td><td>${money(t.grossTotal)}</td></tr>`; }).join('');
    return `<article class="order-card"><div class="order-card-head"><div><div class="order-date">${dateIT(o.date)}</div><h2>${esc(distributorName(o.distributorId))}</h2><p>${o.customerId?`Cliente ref. ${esc(customerName(o.customerId))}`:'Nessun cliente associato'} · ${esc(o.code)}</p></div><div class="order-total"><strong>${money(o.totals?.grossTotal)}</strong><span>${number(o.totals?.quantity)} bottiglie · ${number(o.lines.length)} referenze</span><span class="badge">${esc(o.status)}</span><span class="badge">${esc(o.paymentStatus||'da pagare')}</span></div></div><div class="table-scroll compact"><table><thead><tr><th>Codice</th><th>Vino</th><th>Cantina</th><th>Annata</th><th>Tag</th><th>Qtà</th><th>Listino</th><th>Sconto</th><th>Resell</th><th>Totale</th></tr></thead><tbody>${rows}${o.lines.length>5?`<tr><td colspan="10" class="small-muted">+ altre ${o.lines.length-5} righe. Apri l’ordine per vederle tutte.</td></tr>`:''}</tbody></table></div><div class="order-card-actions"><button class="btn small secondary" data-action="edit-order" data-id="${o.id}">Modifica dati</button><button class="btn small ghost" data-action="view-order" data-id="${o.id}">Apri dettaglio</button><button class="btn small ghost" data-action="duplicate-order" data-id="${o.id}">Duplica</button><button class="btn small danger" data-action="delete-order" data-id="${o.id}">Elimina</button></div></article>`;
  }

  function renderVendite(){ const sales=filteredSales().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))); views.vendite.innerHTML=`<div class="section-head"><span class="small-muted">Ordini dei clienti, vendite e uscite dalla cantina.</span><button class="btn primary" data-action="new-sale">Nuovo ordine cliente</button></div><div class="card table-card">${sales.length?`<div class="table-scroll"><table><thead><tr><th>Data</th><th>Codice</th><th>Cliente</th><th>Stato</th><th>Bottiglie</th><th>Totale</th><th>Costo bottiglie</th><th>Margine</th><th>Note</th><th></th></tr></thead><tbody>${sales.map(s=>`<tr><td class="cell-title">${dateIT(s.date)}</td><td>${esc(s.code)}</td><td>${esc(customerName(s.customerId))}</td><td><span class="badge">${esc(s.status)}</span></td><td>${number(s.totals?.quantity)}</td><td>${money(s.totals?.total)}</td><td>${money(s.totals?.cost)}</td><td>${money(s.totals?.margin)}</td><td>${esc(s.notes||'—')}</td><td><div class="actions"><button class="btn small secondary" data-action="edit-sale" data-id="${s.id}">Modifica</button><button class="btn small ghost" data-action="duplicate-sale" data-id="${s.id}">Duplica</button><button class="btn small danger" data-action="delete-sale" data-id="${s.id}">Elimina</button></div></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">Nessun ordine cliente registrato.</div>`}</div>`; bindInlineActions(); }

  function renderClienti(){ const customers=filteredCustomers().sort((a,b)=>a.name.localeCompare(b.name)); views.clienti.innerHTML=`<div class="section-head"><span class="small-muted">Lista clienti modificabile.</span><button class="btn primary" data-action="new-customer">Nuovo cliente</button></div><div class="card table-card">${customers.length?`<div class="table-scroll"><table><thead><tr><th>Nome</th><th>Tipologia</th><th>Email</th><th>Telefono</th><th>Ordini</th><th>Bottiglie</th><th>Totale speso</th><th>Note</th><th></th></tr></thead><tbody>${customers.map(c=>{ const sales=state.sales.filter(s=>s.customerId===c.id&&s.status!=='annullato'); const qty=sales.reduce((a,s)=>a+Number(s.totals?.quantity||0),0); const total=sales.reduce((a,s)=>a+Number(s.totals?.total||0),0); return `<tr><td class="cell-title">${esc(c.name)}</td><td>${esc(c.type||'—')}</td><td>${esc(c.email||'—')}</td><td>${esc(c.phone||'—')}</td><td>${number(sales.length)}</td><td>${number(qty)}</td><td>${money(total)}</td><td>${esc(c.notes||'—')}</td><td><button class="btn small secondary" data-action="edit-customer" data-id="${c.id}">Modifica</button><button class="btn small danger" data-action="delete-customer" data-id="${c.id}">Elimina</button></td></tr>`;}).join('')}</tbody></table></div>`:`<div class="empty">Nessun cliente. Puoi aggiungerlo qui o durante un ordine cliente.</div>`}</div>`; bindInlineActions(); }

  function renderDistributori(){ const dists=filteredDistributors().sort((a,b)=>a.name.localeCompare(b.name)); views.distributori.innerHTML=`<div class="section-head"><span class="small-muted">Ogni distributore può avere uno sconto predefinito. È solo una proposta: negli ordini puoi cambiarlo per singola riga.</span><button class="btn primary" data-action="new-distributor">Nuovo distributore</button></div><div class="card table-card">${dists.length?`<div class="table-scroll"><table><thead><tr><th>Nome</th><th>Sconto predefinito</th><th>Ordini</th><th>Bottiglie acquistate</th><th>Totale acquistato</th><th>Note</th><th></th></tr></thead><tbody>${dists.map(d=>{ const orders=state.orders.filter(o=>o.distributorId===d.id); const qty=orders.reduce((s,o)=>s+Number(o.totals?.quantity||0),0); const total=orders.reduce((s,o)=>s+Number(o.totals?.grossTotal||0),0); return `<tr><td class="cell-title">${esc(d.name)}</td><td><span class="badge">${esc(DISCOUNT_PRESETS.find(p=>p[0]===(d.discountPreset||'none'))?.[1]||'Nessuno')}</span></td><td>${number(orders.length)}</td><td>${number(qty)}</td><td>${money(total)}</td><td>${esc(d.notes||'—')}</td><td><button class="btn small secondary" data-action="edit-distributor" data-id="${d.id}">Modifica</button><button class="btn small danger" data-action="delete-distributor" data-id="${d.id}">Elimina</button></td></tr>`;}).join('')}</tbody></table></div>`:`<div class="empty">Nessun distributore trovato.</div>`}</div>`; bindInlineActions(); }

  function renderImpostazioni(){ views.impostazioni.innerHTML=`<div class="grid two"><div class="card"><h2>Impostazioni base</h2><div class="settings-row"><div><strong>Aliquota IVA predefinita</strong><div class="small-muted">Usata quando inserisci nuovi vini o righe ordine.</div></div><input class="filter" id="vatSetting" type="number" step="0.01" value="${state.settings.vatRate}"></div><div class="settings-row"><div><strong>Soglia giacenza bassa</strong><div class="small-muted">Solo per stato cantina, non in homepage.</div></div><input class="filter" id="lowStockSetting" type="number" step="1" value="${state.settings.lowStockThreshold}"></div><div class="settings-row"><div><strong>Giacenza negativa</strong><div class="small-muted">Per ora consigliato: disattivata.</div></div><select class="filter" id="negativeStockSetting"><option value="false">Non consentita</option><option value="true">Consentita</option></select></div><button class="btn primary" id="saveSettingsBtn">Salva impostazioni</button></div><div class="card"><h2>Dati</h2><div class="grid"><button class="btn secondary" id="backupBtn">Scarica backup JSON</button><label class="btn secondary" style="text-align:center">Ripristina backup JSON<input id="restoreInput" type="file" accept="application/json" hidden></label><button class="btn ghost" id="demoBtn">Carica dati demo</button><button class="btn ghost" id="removeDemoBtn">Rimuovi dati demo</button><button class="btn danger" id="resetBtn">Cancella tutti i dati</button></div></div></div>`; document.getElementById('negativeStockSetting').value=String(state.settings.allowNegativeStock); document.getElementById('saveSettingsBtn').addEventListener('click',()=>{ state.settings.vatRate=Number(document.getElementById('vatSetting').value||22); state.settings.lowStockThreshold=Number(document.getElementById('lowStockSetting').value||3); state.settings.allowNegativeStock=document.getElementById('negativeStockSetting').value==='true'; save(); toast('Impostazioni salvate.'); render(); }); document.getElementById('backupBtn').addEventListener('click',downloadBackup); document.getElementById('restoreInput').addEventListener('change',restoreBackup); document.getElementById('demoBtn').addEventListener('click',loadDemoData); document.getElementById('removeDemoBtn').addEventListener('click',removeDemoData); document.getElementById('resetBtn').addEventListener('click',resetAll); }

  function field(label,id,value,type,options=[]){ const htmlId='f_'+id; if(type==='select') return `<div class="field"><label>${esc(label)}</label><select id="${htmlId}">${options.map(o=>`<option value="${esc(o)}" ${String(value)===String(o)?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`; if(type==='selectPairs') return `<div class="field"><label>${esc(label)}</label><select id="${htmlId}">${options.map(([v,lab])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(lab)}</option>`).join('')}</select></div>`; return `<div class="field"><label>${esc(label)}</label><input id="${htmlId}" type="${type}" value="${esc(value??'')}" ${type==='number'?'step="0.01"':''}></div>`; }
  function openModal({title,subtitle='',body,primary='Salva',onPrimary}){ const root=document.getElementById('modalRoot'); root.classList.add('active'); root.innerHTML=`<div class="modal-backdrop" data-close="1"></div><div class="modal"><div class="modal-header"><div><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button class="close" data-close="1">×</button></div><div class="modal-body">${body}</div><div class="modal-footer"><button class="btn secondary" data-close="1">Annulla</button><button class="btn primary" id="modalPrimary">${esc(primary)}</button></div></div>`; root.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',closeModal)); document.getElementById('modalPrimary').addEventListener('click',onPrimary); }
  function closeModal(){ const root=document.getElementById('modalRoot'); root.classList.remove('active'); root.innerHTML=''; }
  function toast(msg){ const root=document.getElementById('toastRoot'); const el=document.createElement('div'); el.className='toast'; el.textContent=msg; root.appendChild(el); setTimeout(()=>el.remove(),3200); }

  function openWineModal(id){ const isEdit=Boolean(id); const w=isEdit?getWine(id):{id:S.uuid(),code:'',name:'',producer:'',vintage:'',size:'0.75',tag:'bianco',netUnitPrice:0,quantity:0,vatRate:state.settings.vatRate,distributorId:activeDistributors()[0]?.id||'',notes:'',archived:false,resalePrice:0,discountPreset:'none',discount1:0,discount2:0,discount3:0}; openModal({title:isEdit?'Modifica vino':'Nuovo vino',subtitle:'Tutti i dati sono modificabili. Se cambi quantità, registro un movimento.',body:wineForm(w),primary:isEdit?'Salva modifiche':'Aggiungi vino',onPrimary:()=>{ const next=readWineForm(w.id); const err=validateWine(next); if(err) return toast(err); if(isEdit){ const before=getWine(id); const delta=Number(next.quantity)-Number(before.quantity||0); Object.assign(before,next,{updatedAt:S.now()}); if(delta!==0) addMovement(before.id,delta,'rettifica inventario',todayISO(),'Modifica quantità da scheda vino'); } else { next.createdAt=S.now(); state.wines.push(next); if(Number(next.quantity)!==0) addMovement(next.id,Number(next.quantity),'carico manuale',todayISO(),'Inserimento manuale vino'); } save(); closeModal(); toast(isEdit?'Vino aggiornato.':'Vino aggiunto.'); render(); }}); bindLiveWineTotals(); }
  function wineForm(w){ return `<div class="form-grid">${field('Codice','code',w.code,'text')}${field('Nome vino','name',w.name,'text')}${field('Cantina','producer',w.producer,'text')}${field('Annata','vintage',w.vintage,'text')}${field('Dimensione','size',w.size,'select',['0.75','1.5l','1l','magnum','altro'])}${field('Tag','tag',w.tag,'select',TAGS)}${field('Distributore','distributorId',w.distributorId,'selectPairs',activeDistributors().map(d=>[d.id,d.name]))}${field('Prezzo no IVA / bottiglia','netUnitPrice',w.netUnitPrice,'number')}${field('Sconto','discountPreset',w.discountPreset||'none','selectPairs',DISCOUNT_PRESETS)}${field('Sconto manuale 1 %','discount1',w.discount1||0,'number')}${field('Sconto manuale 2 %','discount2',w.discount2||0,'number')}${field('Sconto manuale 3 %','discount3',w.discount3||0,'number')}${field('Prezzo resell Ambiguo','resalePrice',w.resalePrice||0,'number')}${field('Quantità','quantity',w.quantity,'number')}${field('IVA %','vatRate',w.vatRate??state.settings.vatRate,'number')}<div class="field" style="grid-column:1/-1"><label>Note</label><textarea id="f_notes">${esc(w.notes||'')}</textarea></div><div class="summary-box" style="grid-column:1/-1" id="wineLiveTotals"></div></div>`; }
  function readWineForm(id){ return {id,code:val('code'),name:val('name'),producer:val('producer'),vintage:val('vintage'),size:val('size'),tag:val('tag'),distributorId:val('distributorId'),netUnitPrice:Number(val('netUnitPrice')||0),discountPreset:val('discountPreset')||'none',discount1:Number(val('discount1')||0),discount2:Number(val('discount2')||0),discount3:Number(val('discount3')||0),resalePrice:Number(val('resalePrice')||0),quantity:Number(val('quantity')||0),vatRate:Number(val('vatRate')||state.settings.vatRate),notes:val('notes'),archived:false}; }
  function validateWine(w){ if(!w.code.trim()) return 'Inserisci il codice.'; if(!w.name.trim()) return 'Inserisci il nome del vino.'; if(!w.producer.trim()) return 'Inserisci la cantina.'; if(!w.distributorId) return 'Seleziona un distributore.'; if(Number.isNaN(w.netUnitPrice)||w.netUnitPrice<0) return 'Prezzo no IVA non valido.'; if(!state.settings.allowNegativeStock&&w.quantity<0) return 'Quantità negativa non consentita.'; return ''; }
  function bindLiveWineTotals(){ ['netUnitPrice','discountPreset','discount1','discount2','discount3','resalePrice','quantity','vatRate'].forEach(id=>document.getElementById('f_'+id)?.addEventListener('input',updateWineTotals)); updateWineTotals(); }
  function updateWineTotals(){ const l={netUnitPrice:Number(val('netUnitPrice')||0),discountPreset:val('discountPreset'),discount1:Number(val('discount1')||0),discount2:Number(val('discount2')||0),discount3:Number(val('discount3')||0),resalePrice:Number(val('resalePrice')||0),quantity:Number(val('quantity')||0),vatRate:Number(val('vatRate')||state.settings.vatRate)}; const t=lineTotals(l); const el=document.getElementById('wineLiveTotals'); if(el) el.innerHTML=`<div class="summary-row"><span>Sconto applicato</span><strong>${discountLabel(l)}</strong></div><div class="summary-row"><span>Costo netto scontato</span><strong>${money(t.netUnit)}</strong></div><div class="summary-row"><span>IVA per bottiglia</span><strong>${money(t.vatUnit)}</strong></div><div class="summary-row"><span>Costo con IVA / bottiglia</span><strong>${money(t.grossUnit)}</strong></div><div class="summary-row"><span>Totale costo con IVA</span><strong>${money(t.grossTotal)}</strong></div><div class="summary-row"><span>Totale resell</span><strong>${money(t.resaleTotal)}</strong></div>`; }

  function openMovementModal(){ openModal({title:'Movimento manuale',subtitle:'Ogni modifica quantità viene tracciata nello storico.',body:`<div class="form-grid">${field('Vino','wineId','', 'selectPairs', state.wines.map(w=>[w.id,`${w.code} — ${w.name} (${w.quantity} disp.)`]))}${field('Tipo movimento','type','scarico manuale','select',['carico manuale','scarico manuale','bottiglia degustata','omaggio','bottiglia danneggiata','rettifica inventario','prelievo personale','reso'])}${field('Quantità','quantity',1,'number')}${field('Data','date',todayISO(),'date')}<div class="field" style="grid-column:1/-1"><label>Motivo / nota</label><textarea id="f_note"></textarea></div></div>`,primary:'Registra movimento',onPrimary:()=>{ const wine=getWine(val('wineId')); if(!wine) return toast('Seleziona un vino.'); const qty=Math.abs(Number(val('quantity')||0)); if(!qty) return toast('Inserisci una quantità valida.'); const type=val('type'), positive=['carico manuale','reso'].includes(type), delta=positive?qty:-qty; if(!state.settings.allowNegativeStock&&Number(wine.quantity||0)+delta<0) return toast('Stock insufficiente.'); wine.quantity=Number(wine.quantity||0)+delta; addMovement(wine.id,delta,type,val('date'),val('note')); save(); closeModal(); toast('Movimento registrato.'); render(); }}); }
  function addMovement(wineId,quantityChange,type,date,note,sourceType='manuale',sourceId=''){ state.movements.push({id:S.uuid(),wineId,quantityChange:Number(quantityChange),type,date:date||todayISO(),note:note||'',sourceType,sourceId,createdAt:S.now()}); }

  function openOrderModal(id, duplicate=false){ const isEdit=Boolean(id)&&!duplicate; const old=id?state.orders.find(o=>o.id===id):null; const order=old?JSON.parse(JSON.stringify(old)):null; const initialLines=order?.lines?.length?order.lines:[emptyOrderLine()]; openModal({title:isEdit?'Modifica ordine distributore':duplicate?'Duplica ordine distributore':'Nuovo ordine distributore',subtitle:'Inserisci prima la data. Non devi scegliere nessun numero ordine: viene creato un codice interno automatico.',body:`<div class="form-grid order-meta-grid">${field('Data ordine','orderDate',order?.date||todayISO(),'date')}<div class="field"><label>Distributore</label><div style="display:flex; gap:8px"><select id="f_orderDistributor">${activeDistributors().map(d=>`<option value="${d.id}" ${order?.distributorId===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select><button class="btn secondary" id="addDistributorInOrder" type="button">+</button></div></div>${field('Sconto ordine proposto','orderDiscountPreset',order?.discountPreset||distributorDefaultDiscount(order?.distributorId||activeDistributors()[0]?.id)||'none','selectPairs',DISCOUNT_PRESETS)}<div class="field"><label>Cliente associato, opzionale</label><div style="display:flex; gap:8px"><select id="f_orderCustomer"><option value="">Nessun cliente</option>${activeCustomers().map(c=>`<option value="${c.id}" ${order?.customerId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select><button class="btn secondary" id="addCustomerInOrder" type="button">+</button></div></div>${field('Stato','orderStatus',order?.status||'ricevuto','select',['bozza','ricevuto'])}${field('Pagamento','orderPaymentStatus',order?.paymentStatus||'da pagare','select',['da pagare','pagato'])}</div><div class="section-head"><h2>Referenze</h2><button class="btn secondary" id="addOrderLineBtn" type="button">Aggiungi riga</button></div><div id="orderLines"></div><div class="summary-box" id="orderTotals" style="margin-top:16px"></div><div class="field" style="margin-top:14px"><label>Note</label><textarea id="f_orderNotes">${esc(order?.notes||'')}</textarea></div>`,primary:isEdit?'Salva modifiche':'Salva ordine',onPrimary:()=>saveOrderFromModal(isEdit?old:null)}); window.__orderLines=initialLines.map(l=>({...emptyOrderLine(),...l})); if(!old){ const preset=val('orderDiscountPreset')||'none'; window.__orderLines=window.__orderLines.map(l=>({...l,discountPreset:preset})); } renderOrderLines(); document.getElementById('addOrderLineBtn').addEventListener('click',()=>{ window.__orderLines.push(emptyOrderLine()); renderOrderLines(); }); document.getElementById('f_orderDistributor').addEventListener('change',()=>{ const preset=distributorDefaultDiscount(val('orderDistributor')); const discountField=document.getElementById('f_orderDiscountPreset'); if(discountField && !isEdit) discountField.value=preset||'none'; }); document.getElementById('f_orderDiscountPreset')?.addEventListener('change',()=>{ syncOrderLinesFromDom(); const preset=val('orderDiscountPreset')||'none'; window.__orderLines=window.__orderLines.map(l=>({...l,discountPreset:preset,discount1:0,discount2:0,discount3:0})); renderOrderLines(); }); document.getElementById('addDistributorInOrder').addEventListener('click',()=>quickAddDistributor((id,name)=>{ const select=document.getElementById('f_orderDistributor'); select.insertAdjacentHTML('beforeend',`<option value="${id}">${esc(name)}</option>`); select.value=id; const df=document.getElementById('f_orderDiscountPreset'); if(df) df.value=distributorDefaultDiscount(id)||'none'; })); document.getElementById('addCustomerInOrder').addEventListener('click',()=>quickAddCustomer((id,name)=>{ const select=document.getElementById('f_orderCustomer'); select.insertAdjacentHTML('beforeend',`<option value="${id}">${esc(name)}</option>`); select.value=id; })); }
  function emptyOrderLine(){ return {code:'',name:'',producer:'',vintage:'',size:'0.75',tag:'bianco',netUnitPrice:0,discountPreset:val('orderDiscountPreset')||'none',discount1:0,discount2:0,discount3:0,resalePrice:0,quantity:1,vatRate:state.settings.vatRate}; }
  function renderOrderLines(){ const root=document.getElementById('orderLines'); root.innerHTML=window.__orderLines.map((l,i)=>`<div class="order-line" data-index="${i}"><div class="line-head"><strong>Riga ${i+1}</strong><div class="actions"><button class="btn small ghost" data-line-action="duplicate" data-index="${i}">Duplica</button><button class="btn small secondary" data-line-action="remove" data-index="${i}">Elimina</button></div></div><div class="order-line-grid">${field('Codice',`l_${i}_code`,l.code,'text')}${field('Nome vino',`l_${i}_name`,l.name,'text')}${field('Cantina',`l_${i}_producer`,l.producer,'text')}${field('Annata',`l_${i}_vintage`,l.vintage,'text')}${field('Dimensione',`l_${i}_size`,l.size,'select',['0.75','1.5l','1l','magnum','altro'])}${field('Tag',`l_${i}_tag`,l.tag,'select',TAGS)}${field('Listino no IVA',`l_${i}_netUnitPrice`,l.netUnitPrice,'number')}${field('Sconto',`l_${i}_discountPreset`,l.discountPreset||'none','selectPairs',DISCOUNT_PRESETS)}${field('Manuale 1 %',`l_${i}_discount1`,l.discount1||0,'number')}${field('Manuale 2 %',`l_${i}_discount2`,l.discount2||0,'number')}${field('Manuale 3 %',`l_${i}_discount3`,l.discount3||0,'number')}${field('Resell Ambiguo',`l_${i}_resalePrice`,l.resalePrice||0,'number')}${field('Quantità',`l_${i}_quantity`,l.quantity,'number')}${field('IVA %',`l_${i}_vatRate`,l.vatRate,'number')}<div class="summary-box line-summary" id="line_total_${i}"></div></div></div>`).join(''); root.querySelectorAll('[data-line-action]').forEach(btn=>btn.addEventListener('click',()=>{ syncOrderLinesFromDom(); const i=Number(btn.dataset.index); if(btn.dataset.lineAction==='remove'&&window.__orderLines.length>1) window.__orderLines.splice(i,1); if(btn.dataset.lineAction==='duplicate') window.__orderLines.splice(i+1,0,{...window.__orderLines[i]}); renderOrderLines(); })); root.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',()=>{ syncOrderLinesFromDom(); updateOrderTotals(); })); updateOrderTotals(); }
  function syncOrderLinesFromDom(){ window.__orderLines=window.__orderLines.map((l,i)=>({code:val(`l_${i}_code`),name:val(`l_${i}_name`),producer:val(`l_${i}_producer`),vintage:val(`l_${i}_vintage`),size:val(`l_${i}_size`),tag:val(`l_${i}_tag`),netUnitPrice:Number(val(`l_${i}_netUnitPrice`)||0),discountPreset:val(`l_${i}_discountPreset`)||'none',discount1:Number(val(`l_${i}_discount1`)||0),discount2:Number(val(`l_${i}_discount2`)||0),discount3:Number(val(`l_${i}_discount3`)||0),resalePrice:Number(val(`l_${i}_resalePrice`)||0),quantity:Number(val(`l_${i}_quantity`)||0),vatRate:Number(val(`l_${i}_vatRate`)||state.settings.vatRate)})); }
  function updateOrderTotals(){ let quantity=0, listTotal=0, discountTotal=0, netTotal=0, vatTotal=0, grossTotal=0, resaleTotal=0; window.__orderLines.forEach((l,i)=>{ const t=lineTotals(l); quantity+=Number(l.quantity||0); listTotal+=t.listUnit*Number(l.quantity||0); discountTotal+=t.discountTotal; netTotal+=t.netTotal; vatTotal+=t.vatTotal; grossTotal+=t.grossTotal; resaleTotal+=t.resaleTotal; const el=document.getElementById(`line_total_${i}`); if(el) el.innerHTML=`<div class="summary-row"><span>Sconto</span><strong>${discountLabel(l)}</strong></div><div class="summary-row"><span>Netto scontato</span><strong>${money(t.netUnit)}</strong></div><div class="summary-row"><span>Con IVA / bottiglia</span><strong>${money(t.grossUnit)}</strong></div><div class="summary-row"><span>Totale riga</span><strong>${money(t.grossTotal)}</strong></div>`; }); const root=document.getElementById('orderTotals'); if(root) root.innerHTML=`<div class="summary-row"><span>Bottiglie</span><strong>${number(quantity)}</strong></div><div class="summary-row"><span>Listino no IVA</span><strong>${money(listTotal)}</strong></div><div class="summary-row"><span>Sconti</span><strong>${money(discountTotal)}</strong></div><div class="summary-row"><span>Totale no IVA</span><strong>${money(netTotal)}</strong></div><div class="summary-row"><span>IVA</span><strong>${money(vatTotal)}</strong></div><div class="summary-row"><span>Totale con IVA</span><strong>${money(grossTotal)}</strong></div><div class="summary-row"><span>Valore resell</span><strong>${money(resaleTotal)}</strong></div>`; }
  function saveOrderFromModal(existing){ syncOrderLinesFromDom(); const lines=window.__orderLines.filter(l=>l.code||l.name||l.producer).map(l=>({...l,id:S.uuid()})); if(!lines.length) return toast('Aggiungi almeno una riga.'); for(const l of lines){ if(!l.code||!l.name||!l.producer) return toast('Ogni riga deve avere codice, nome vino e cantina.'); if(l.quantity<=0) return toast('La quantità deve essere maggiore di zero.'); if(l.netUnitPrice<0||Number.isNaN(l.netUnitPrice)) return toast('Prezzo non valido.'); if([l.discount1,l.discount2,l.discount3].some(d=>Number(d)<0||Number(d)>=100)) return toast('Gli sconti devono essere tra 0 e 99,99%.'); }
    const totals=calculateOrderTotals(lines); if(existing&&existing.status==='ricevuto') reverseOrderStock(existing); const order={id:existing?.id||S.uuid(),code:existing?.code||nextCode('ORD',state.orders),distributorId:val('orderDistributor'),customerId:val('orderCustomer'),date:val('orderDate'),status:val('orderStatus'),paymentStatus:val('orderPaymentStatus'),discountPreset:val('orderDiscountPreset')||'none',notes:val('orderNotes'),lines,totals,createdAt:existing?.createdAt||S.now(),updatedAt:S.now(),demo:existing?.demo||false}; if(existing) Object.assign(existing,order); else state.orders.push(order); if(order.status==='ricevuto') order.lines.forEach(l=>upsertWineFromOrderLine(l,order)); save(); closeModal(); toast(existing?'Ordine aggiornato.':'Ordine salvato.'); render(); }
  function calculateOrderTotals(lines){ return lines.reduce((acc,l)=>{ const t=lineTotals(l); acc.quantity+=Number(l.quantity); acc.listTotal+=t.listUnit*Number(l.quantity||0); acc.discountTotal+=t.discountTotal; acc.netTotal+=t.netTotal; acc.vatTotal+=t.vatTotal; acc.grossTotal+=t.grossTotal; acc.resaleTotal+=t.resaleTotal; return acc; },{quantity:0,listTotal:0,discountTotal:0,netTotal:0,vatTotal:0,grossTotal:0,resaleTotal:0}); }
  function reverseOrderStock(order){ order.lines.forEach(l=>{ const wine=state.wines.find(w=>w.sourceOrderId===order.id&&norm(w.code)===norm(l.code)&&norm(w.name)===norm(l.name)&&norm(w.producer)===norm(l.producer)); if(wine){ wine.quantity=Number(wine.quantity||0)-Number(l.quantity||0); addMovement(wine.id,-Number(l.quantity||0),'rettifica modifica ordine',todayISO(),`Rimozione vecchia riga ordine ${order.code}`,'order',order.id); }}); }
  function upsertWineFromOrderLine(l,order){ const existing=state.wines.find(w=>norm(w.code)===norm(l.code)&&norm(w.name)===norm(l.name)&&norm(w.producer)===norm(l.producer)&&String(w.vintage||'')===String(l.vintage||'')&&String(w.size||'')===String(l.size||'')&&w.distributorId===order.distributorId&&!w.archived); if(existing){ const oldQty=Number(existing.quantity||0); const newQty=oldQty+Number(l.quantity||0); existing.netUnitPrice=Number(l.netUnitPrice||0); existing.discountPreset=l.discountPreset||'none'; existing.discount1=Number(l.discount1||0); existing.discount2=Number(l.discount2||0); existing.discount3=Number(l.discount3||0); existing.resalePrice=Number(l.resalePrice||existing.resalePrice||0); existing.quantity=newQty; existing.vatRate=Number(l.vatRate||state.settings.vatRate); existing.lastOrderDate=order.date; existing.updatedAt=S.now(); addMovement(existing.id,Number(l.quantity),'acquisto',order.date,`Ordine ${order.code}`,'order',order.id); } else { const wine={id:S.uuid(),code:l.code,name:l.name,producer:l.producer,vintage:l.vintage,size:l.size,tag:l.tag,distributorId:order.distributorId,netUnitPrice:Number(l.netUnitPrice||0),discountPreset:l.discountPreset||'none',discount1:Number(l.discount1||0),discount2:Number(l.discount2||0),discount3:Number(l.discount3||0),resalePrice:Number(l.resalePrice||0),quantity:Number(l.quantity||0),vatRate:Number(l.vatRate||state.settings.vatRate),notes:'',archived:false,createdAt:S.now(),sourceOrderId:order.id,lastOrderDate:order.date,demo:order.demo||false}; state.wines.push(wine); addMovement(wine.id,Number(l.quantity),'acquisto',order.date,`Ordine ${order.code}`,'order',order.id); }}
  function openOrderView(id){ const o=state.orders.find(x=>x.id===id); if(!o) return; openModal({title:`Ordine distributore ${o.code}`,subtitle:`${distributorName(o.distributorId)} · ${dateIT(o.date)}`,body:`<div class="card table-card" style="box-shadow:none;border-radius:18px"><div class="table-scroll"><table><thead><tr><th>Codice</th><th>Vino</th><th>Cantina</th><th>Annata</th><th>Tag</th><th>Qtà</th><th>Listino</th><th>Sconto</th><th>Netto</th><th>Con IVA</th><th>Resell</th><th>Totale</th></tr></thead><tbody>${o.lines.map(l=>{const t=lineTotals(l); return `<tr><td class="cell-title">${esc(l.code)}</td><td>${esc(l.name)}</td><td>${esc(l.producer)}</td><td>${esc(l.vintage)}</td><td><span class="badge">${esc(l.tag)}</span></td><td>${number(l.quantity)}</td><td>${money(l.netUnitPrice)}</td><td>${discountLabel(l)}</td><td>${money(t.netUnit)}</td><td>${money(t.grossUnit)}</td><td>${money(l.resalePrice)}</td><td>${money(t.grossTotal)}</td></tr>`;}).join('')}</tbody></table></div></div><div class="summary-box" style="margin-top:16px"><div class="summary-row"><span>Bottiglie</span><strong>${number(o.totals.quantity)}</strong></div><div class="summary-row"><span>Sconti</span><strong>${money(o.totals.discountTotal)}</strong></div><div class="summary-row"><span>Totale no IVA</span><strong>${money(o.totals.netTotal)}</strong></div><div class="summary-row"><span>IVA</span><strong>${money(o.totals.vatTotal)}</strong></div><div class="summary-row"><span>Totale con IVA</span><strong>${money(o.totals.grossTotal)}</strong></div><div class="summary-row"><span>Valore resell</span><strong>${money(o.totals.resaleTotal)}</strong></div></div>${o.notes?`<p class="small-muted">${esc(o.notes)}</p>`:''}`,primary:'Modifica ordine',onPrimary:()=>openOrderModal(id)}); }

  function openSaleModal(id,duplicate=false){ const isEdit=Boolean(id)&&!duplicate; const old=id?state.sales.find(s=>s.id===id):null; const sale=old?JSON.parse(JSON.stringify(old)):null; const lines=sale?.lines?.length?sale.lines:[emptySaleLine()]; openModal({title:isEdit?'Modifica ordine cliente':duplicate?'Duplica ordine cliente':'Nuovo ordine cliente',subtitle:'Seleziona o aggiungi cliente, poi scegli i vini dalla cantina.',body:`<div class="form-grid order-meta-grid">${field('Data','saleDate',sale?.date||todayISO(),'date')}<div class="field"><label>Cliente</label><div style="display:flex;gap:8px"><select id="f_saleCustomer"><option value="">Seleziona cliente</option>${activeCustomers().map(c=>`<option value="${c.id}" ${sale?.customerId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select><button class="btn secondary" id="addCustomerInSale" type="button">+</button></div></div>${field('Stato','saleStatus',sale?.status||'confermato','select',SALE_STATUSES)}</div><div class="section-head"><h2>Vini</h2><button class="btn secondary" id="addSaleLineBtn" type="button">Aggiungi riga</button></div><div id="saleLines"></div><div class="summary-box" id="saleTotals" style="margin-top:16px"></div><div class="field" style="margin-top:14px"><label>Note</label><textarea id="f_saleNotes">${esc(sale?.notes||'')}</textarea></div>`,primary:isEdit?'Salva modifiche':'Salva ordine cliente',onPrimary:()=>saveSaleFromModal(isEdit?old:null)}); window.__saleLines=lines.map(l=>({...emptySaleLine(),...l})); renderSaleLines(); document.getElementById('addSaleLineBtn').addEventListener('click',()=>{ window.__saleLines.push(emptySaleLine()); renderSaleLines(); }); document.getElementById('addCustomerInSale').addEventListener('click',()=>quickAddCustomer((id,name)=>{ const select=document.getElementById('f_saleCustomer'); select.insertAdjacentHTML('beforeend',`<option value="${id}">${esc(name)}</option>`); select.value=id; })); }
  function emptySaleLine(){ return {wineId:'',quantity:1,unitPrice:0,discount:0,costTotal:0,allocations:[]}; }
  function renderSaleLines(){ const root=document.getElementById('saleLines'); const options=state.wines.filter(w=>!w.archived).map(w=>[w.id,`${w.code} — ${w.name} / ${w.producer} (${w.quantity} disp.)`]); root.innerHTML=window.__saleLines.map((l,i)=>`<div class="order-line"><div class="line-head"><strong>Riga ${i+1}</strong><div class="actions"><button class="btn small secondary" data-sale-line-action="remove" data-index="${i}">Elimina</button></div></div><div class="sale-line-grid">${field('Vino',`s_${i}_wineId`,l.wineId,'selectPairs', [['','Seleziona vino'],...options])}${field('Quantità',`s_${i}_quantity`,l.quantity,'number')}${field('Prezzo vendita','s_'+i+'_unitPrice',l.unitPrice,'number')}${field('Sconto €','s_'+i+'_discount',l.discount,'number')}<div class="summary-box line-summary" id="sale_line_total_${i}"></div></div></div>`).join(''); root.querySelectorAll('[data-sale-line-action]').forEach(btn=>btn.addEventListener('click',()=>{ syncSaleLinesFromDom(); const i=Number(btn.dataset.index); if(window.__saleLines.length>1) window.__saleLines.splice(i,1); renderSaleLines(); })); root.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',()=>{ const m=el.id.match(/^f_s_(\d+)_wineId$/); if(m){ const i=Number(m[1]); const w=getWine(el.value); if(w) document.getElementById(`f_s_${i}_unitPrice`).value=round2(Number(w.resalePrice||0)); } syncSaleLinesFromDom(); updateSaleTotals(); })); updateSaleTotals(); }
  function syncSaleLinesFromDom(){ window.__saleLines=window.__saleLines.map((l,i)=>({wineId:val(`s_${i}_wineId`),quantity:Number(val(`s_${i}_quantity`)||0),unitPrice:Number(val(`s_${i}_unitPrice`)||0),discount:Number(val(`s_${i}_discount`)||0),costTotal:Number(l.costTotal||0),allocations:l.allocations||[]})); }
  function updateSaleTotals(){ let quantity=0,theoretical=0,total=0,cost=0,margin=0; window.__saleLines.forEach((l,i)=>{ const t=saleLineTotals(l); quantity+=Number(l.quantity||0); theoretical+=t.theoretical; total+=t.total; cost+=t.cost; margin+=t.margin; const w=getWine(l.wineId); const el=document.getElementById(`sale_line_total_${i}`); if(el) el.innerHTML=`<div class="summary-row"><span>Disponibili</span><strong>${number(w?.quantity||0)}</strong></div><div class="summary-row"><span>Totale riga</span><strong>${money(t.total)}</strong></div><div class="summary-row"><span>Costo storico</span><strong>${money(t.cost)}</strong></div>`; }); const root=document.getElementById('saleTotals'); if(root) root.innerHTML=`<div class="summary-row"><span>Bottiglie</span><strong>${number(quantity)}</strong></div><div class="summary-row"><span>Totale teorico</span><strong>${money(theoretical)}</strong></div><div class="summary-row"><span>Totale finale</span><strong>${money(total)}</strong></div><div class="summary-row"><span>Margine stimato</span><strong>${money(margin)}</strong></div>`; }
  function saveSaleFromModal(existing){ syncSaleLinesFromDom(); const customerId=val('saleCustomer'); if(!customerId) return toast('Seleziona o crea un cliente.'); const lines=window.__saleLines.filter(l=>l.wineId).map(l=>({...l,id:S.uuid()})); if(!lines.length) return toast('Aggiungi almeno un vino.'); if(existing&&existing.status!=='annullato') reverseSaleStock(existing); for(const l of lines){ const w=getWine(l.wineId); if(!w) return toast('Vino non valido.'); if(l.quantity<=0) return toast('Quantità non valida.'); if(!state.settings.allowNegativeStock&&Number(w.quantity||0)<Number(l.quantity||0)){ if(!confirm(`Stock insufficiente per ${w.name}. Vuoi continuare?`)){ if(existing&&existing.status!=='annullato') applySaleStock(existing); return; } } const cost=allocateStockSimple(w,Number(l.quantity),val('saleDate')); l.costTotal=cost; }
    const totals=calculateSaleTotals(lines); const sale={id:existing?.id||S.uuid(),code:existing?.code||nextCode('CLI',state.sales),customerId,date:val('saleDate'),status:val('saleStatus'),notes:val('saleNotes'),lines,totals,createdAt:existing?.createdAt||S.now(),updatedAt:S.now(),demo:existing?.demo||false}; if(existing) Object.assign(existing,sale); else state.sales.push(sale); save(); closeModal(); toast(existing?'Ordine cliente aggiornato.':'Ordine cliente salvato.'); render(); }
  function calculateSaleTotals(lines){ return lines.reduce((a,l)=>{ const t=saleLineTotals(l); a.quantity+=Number(l.quantity||0); a.theoretical+=t.theoretical; a.total+=t.total; a.cost+=t.cost; a.margin+=t.margin; return a; },{quantity:0,theoretical:0,total:0,cost:0,margin:0}); }
  function allocateStockSimple(w,qty,date){ const take=Math.min(Number(w.quantity||0),qty); const cost=lineTotals(w).netUnit*qty; w.quantity=Number(w.quantity||0)-qty; addMovement(w.id,-qty,'vendita',date,`Ordine cliente`,'sale',''); return cost; }
  function reverseSaleStock(sale){ sale.lines.forEach(l=>{ const w=getWine(l.wineId); if(w){ w.quantity=Number(w.quantity||0)+Number(l.quantity||0); addMovement(w.id,Number(l.quantity||0),'rettifica annullamento vendita',todayISO(),`Modifica ordine cliente ${sale.code}`,'sale',sale.id); }}); }
  function applySaleStock(sale){ sale.lines.forEach(l=>{ const w=getWine(l.wineId); if(w){ w.quantity=Number(w.quantity||0)-Number(l.quantity||0); addMovement(w.id,-Number(l.quantity||0),'vendita',sale.date,`Ordine cliente ${sale.code}`,'sale',sale.id); }}); }

  function quickAddDistributor(callback){ const name=prompt('Nome nuovo distributore'); if(!name) return; const d={id:S.uuid(),name:name.trim(),discountPreset:'none',archived:false,notes:'',createdAt:S.now()}; state.distributors.push(d); save(); toast('Distributore aggiunto.'); callback?.(d.id,d.name); }
  function quickAddCustomer(callback){ const name=prompt('Nome nuovo cliente'); if(!name) return; const c={id:S.uuid(),name:name.trim(),type:'privato',email:'',phone:'',notes:'',archived:false,createdAt:S.now()}; state.customers.push(c); save(); toast('Cliente aggiunto.'); callback?.(c.id,c.name); }
  function openDistributorModal(id){ const d=id?state.distributors.find(x=>x.id===id):{id:S.uuid(),name:'',discountPreset:'none',notes:'',archived:false}; openModal({title:id?'Modifica distributore':'Nuovo distributore',body:`<div class="form-grid one">${field('Nome','distName',d.name,'text')}${field('Sconto predefinito','distDiscountPreset',d.discountPreset||'none','selectPairs',DISCOUNT_PRESETS)}<div class="field"><label>Note</label><textarea id="f_distNotes">${esc(d.notes||'')}</textarea></div>${field('Stato','distArchived',String(Boolean(d.archived)),'selectPairs',[['false','Attivo'],['true','Archiviato']])}</div>`,primary:'Salva',onPrimary:()=>{ if(!val('distName').trim()) return toast('Inserisci il nome.'); Object.assign(d,{name:val('distName').trim(),discountPreset:val('distDiscountPreset')||'none',notes:val('distNotes'),archived:val('distArchived')==='true',updatedAt:S.now()}); if(!id) state.distributors.push({...d,createdAt:S.now()}); save(); closeModal(); toast('Distributore salvato.'); render(); }}); }
  function openCustomerModal(id){ const c=id?state.customers.find(x=>x.id===id):{id:S.uuid(),name:'',type:'privato',email:'',phone:'',address:'',vat:'',taxCode:'',notes:'',archived:false}; openModal({title:id?'Modifica cliente':'Nuovo cliente',body:`<div class="form-grid">${field('Nome / ragione sociale','customerName',c.name,'text')}${field('Tipologia','customerType',c.type,'select',CUSTOMER_TYPES)}${field('Email','customerEmail',c.email,'text')}${field('Telefono','customerPhone',c.phone,'text')}<div class="field" style="grid-column:1/-1"><label>Indirizzo</label><input id="f_customerAddress" value="${esc(c.address||'')}"></div>${field('Partita IVA','customerVat',c.vat,'text')}${field('Codice fiscale','customerTaxCode',c.taxCode,'text')}<div class="field" style="grid-column:1/-1"><label>Note</label><textarea id="f_customerNotes">${esc(c.notes||'')}</textarea></div>${field('Stato','customerArchived',String(Boolean(c.archived)),'selectPairs',[['false','Attivo'],['true','Archiviato']])}</div>`,primary:'Salva',onPrimary:()=>{ if(!val('customerName').trim()) return toast('Inserisci il nome cliente.'); Object.assign(c,{name:val('customerName').trim(),type:val('customerType'),email:val('customerEmail'),phone:val('customerPhone'),address:val('customerAddress'),vat:val('customerVat'),taxCode:val('customerTaxCode'),notes:val('customerNotes'),archived:val('customerArchived')==='true',updatedAt:S.now()}); if(!id) state.customers.push({...c,createdAt:S.now()}); save(); closeModal(); toast('Cliente salvato.'); render(); }}); }
  function openHistory(id){ const w=getWine(id); const rows=state.movements.filter(m=>m.wineId===id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))); openModal({title:`Storico — ${w?.name||''}`,subtitle:w?`${w.code} · ${w.producer}`:'',body:rows.length?`<div class="table-scroll"><table><thead><tr><th>Data</th><th>Tipo</th><th>Quantità</th><th>Origine</th><th>Nota</th></tr></thead><tbody>${rows.map(m=>`<tr><td>${dateIT(m.date)}</td><td>${esc(m.type)}</td><td>${m.quantityChange>0?'+':''}${number(m.quantityChange)}</td><td>${esc(m.sourceType||'manuale')}</td><td>${esc(m.note||'—')}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">Nessun movimento.</div>`,primary:'Chiudi',onPrimary:closeModal}); }


  function deleteWine(id){
    const w=getWine(id); if(!w) return;
    if(!confirm(`Eliminare definitivamente ${w.name}? Verranno rimossi anche i movimenti collegati a questa referenza.`)) return;
    state.wines=state.wines.filter(x=>x.id!==id);
    state.movements=state.movements.filter(m=>m.wineId!==id);
    state.sales.forEach(s=>{ s.lines=(s.lines||[]).filter(l=>l.wineId!==id); s.totals=calculateSaleTotals(s.lines); });
    save(); toast('Vino eliminato.'); render();
  }
  function deleteOrder(id){
    const o=state.orders.find(x=>x.id===id); if(!o) return;
    if(!confirm(`Eliminare l’ordine distributore ${o.code}? Se era ricevuto, le quantità verranno rettificate.`)) return;
    if(o.status==='ricevuto') reverseOrderStock(o);
    state.orders=state.orders.filter(x=>x.id!==id);
    state.movements=state.movements.filter(m=>m.sourceId!==id);
    save(); toast('Ordine distributore eliminato.'); render();
  }
  function deleteSale(id){
    const sale=state.sales.find(x=>x.id===id); if(!sale) return;
    if(!confirm(`Eliminare l’ordine cliente ${sale.code}? Le bottiglie verranno ricaricate in cantina.`)) return;
    if(sale.status!=='annullato') reverseSaleStock(sale);
    state.sales=state.sales.filter(x=>x.id!==id);
    state.movements=state.movements.filter(m=>m.sourceId!==id);
    save(); toast('Ordine cliente eliminato.'); render();
  }
  function deleteCustomer(id){
    const c=state.customers.find(x=>x.id===id); if(!c) return;
    const linked=state.sales.filter(s=>s.customerId===id).length + state.orders.filter(o=>o.customerId===id).length;
    if(!confirm(`Eliminare il cliente ${c.name}${linked?`? È collegato a ${linked} ordine/i: resteranno salvati ma senza cliente associato.`:'?'} `)) return;
    state.sales.forEach(s=>{ if(s.customerId===id) s.customerId=''; });
    state.orders.forEach(o=>{ if(o.customerId===id) o.customerId=''; });
    state.customers=state.customers.filter(x=>x.id!==id);
    save(); toast('Cliente eliminato.'); render();
  }
  function deleteDistributor(id){
    const d=state.distributors.find(x=>x.id===id); if(!d) return;
    const linked=state.orders.filter(o=>o.distributorId===id).length + state.wines.filter(w=>w.distributorId===id).length;
    if(!confirm(`Eliminare il distributore ${d.name}${linked?`? È collegato a ${linked} elemento/i: i dati resteranno salvati ma senza distributore associato.`:'?'} `)) return;
    state.orders.forEach(o=>{ if(o.distributorId===id) o.distributorId=''; });
    state.wines.forEach(w=>{ if(w.distributorId===id) w.distributorId=''; });
    state.distributors=state.distributors.filter(x=>x.id!==id);
    save(); toast('Distributore eliminato.'); render();
  }

  function bindInlineActions(){ document.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>{ const a=btn.dataset.action, id=btn.dataset.id; if(a==='new-wine') openWineModal(); if(a==='edit-wine') openWineModal(id); if(a==='wine-history') openHistory(id); if(a==='new-movement') openMovementModal(); if(a==='new-order') openOrderModal(); if(a==='edit-order') openOrderModal(id); if(a==='view-order') openOrderView(id); if(a==='duplicate-order') openOrderModal(id,true); if(a==='new-sale') openSaleModal(); if(a==='edit-sale') openSaleModal(id); if(a==='duplicate-sale') openSaleModal(id,true); if(a==='new-customer') openCustomerModal(); if(a==='edit-customer') openCustomerModal(id); if(a==='new-distributor') openDistributorModal(); if(a==='edit-distributor') openDistributorModal(id); if(a==='delete-wine') deleteWine(id); if(a==='delete-order') deleteOrder(id); if(a==='delete-sale') deleteSale(id); if(a==='delete-customer') deleteCustomer(id); if(a==='delete-distributor') deleteDistributor(id); })); }
  function download(filename,text,type='text/plain'){ const blob=new Blob([text],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
  function csvEscape(v){ return `"${String(v??'').replace(/"/g,'""')}"`; }
  function exportCantinaCsv(){ const rows=[['codice','nome vino','cantina','annata','dimensione','tag','distributore','listino no iva','sconto','netto scontato no iva','iva %','costo con iva','prezzo resell','quantita','totale costo con iva','totale resell','stato']]; filteredWines().forEach(w=>{ const t=lineTotals(w); rows.push([w.code,w.name,w.producer,w.vintage,w.size,w.tag,distributorName(w.distributorId),round2(w.netUnitPrice),discountLabel(w),round2(t.netUnit),w.vatRate,round2(t.grossUnit),round2(w.resalePrice),w.quantity,round2(t.grossTotal),round2(t.resaleTotal),wineStatus(w)]); }); download(`ambiguo-cantina-${todayISO()}.csv`,rows.map(r=>r.map(csvEscape).join(',')).join('\n'),'text/csv'); }
  function downloadBackup(){ download(`ambiguo-backup-${todayISO()}.json`,S.exportJSON(state),'application/json'); }
  function restoreBackup(e){ const file=e.target.files[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try{ state=S.importJSON(reader.result); toast('Backup ripristinato.'); render(); } catch(err){ toast(err.message); } }; reader.readAsText(file); }
  function loadDemoData(){ if(!confirm('Caricare dati demo?')) return; const c={id:S.uuid(),name:'Cliente Demo',type:'privato',email:'',phone:'',notes:'',archived:false,demo:true,createdAt:S.now()}; state.customers.push(c); const etica=state.distributors.find(d=>d.name==='Etica Distribuzione')?.id; const sun=state.distributors.find(d=>d.name==='Sun Import')?.id; const order1={id:S.uuid(),code:nextCode('ORD',state.orders),distributorId:etica,customerId:'',date:todayISO(),status:'ricevuto',notes:'Demo Etica.',demo:true,createdAt:S.now(),lines:[{id:S.uuid(),code:'ET001',name:'Bianco di prova',producer:'Cantina Demo',vintage:'2024',size:'0.75',tag:'bianco',netUnitPrice:12.35,discountPreset:'5',resalePrice:24,quantity:12,vatRate:22},{id:S.uuid(),code:'ET002',name:'Rosso di prova',producer:'Cantina Demo',vintage:'2023',size:'0.75',tag:'rosso',netUnitPrice:14.1,discountPreset:'5',resalePrice:27,quantity:12,vatRate:22},{id:S.uuid(),code:'ET003',name:'Orange di prova',producer:'Cantina Demo',vintage:'2024',size:'0.75',tag:'orange',netUnitPrice:16.7,discountPreset:'5',resalePrice:31,quantity:12,vatRate:22}]}; order1.totals=calculateOrderTotals(order1.lines); const order2={id:S.uuid(),code:nextCode('ORD',[...state.orders,order1]),distributorId:sun,customerId:'',date:todayISO(),status:'ricevuto',notes:'Demo Sun Import.',demo:true,createdAt:S.now(),lines:[{id:S.uuid(),code:'SUN01',name:'Bolla di prova',producer:'Metodo Demo',vintage:'2022',size:'0.75',tag:'bolla',netUnitPrice:19.9,discountPreset:'5+6',resalePrice:39,quantity:6,vatRate:22},{id:S.uuid(),code:'SUN02',name:'Rosato di prova',producer:'Costa Demo',vintage:'2024',size:'0.75',tag:'rosato',netUnitPrice:11.8,discountPreset:'5+6',resalePrice:24,quantity:8,vatRate:22}]}; order2.totals=calculateOrderTotals(order2.lines); state.orders.push(order1,order2); order1.lines.forEach(l=>upsertWineFromOrderLine(l,order1)); order2.lines.forEach(l=>upsertWineFromOrderLine(l,order2)); state.wines.filter(w=>w.sourceOrderId===order1.id||w.sourceOrderId===order2.id).forEach(w=>w.demo=true); state.movements.filter(m=>m.sourceId===order1.id||m.sourceId===order2.id).forEach(m=>m.demo=true); save(); toast('Dati demo caricati.'); render(); }
  function removeDemoData(){ if(!confirm('Rimuovere tutti i dati demo?')) return; const ids=state.orders.filter(o=>o.demo).map(o=>o.id); state.orders=state.orders.filter(o=>!o.demo); state.sales=state.sales.filter(s=>!s.demo); state.customers=state.customers.filter(c=>!c.demo); state.wines=state.wines.filter(w=>!w.demo&&!ids.includes(w.sourceOrderId)); state.movements=state.movements.filter(m=>!m.demo&&!ids.includes(m.sourceId)); save(); toast('Dati demo rimossi.'); render(); }
  function resetAll(){ if(!confirm('Prima conferma: vuoi cancellare tutti i dati?')) return; if(!confirm('Seconda conferma: questa azione non si può annullare.')) return; state=S.reset(); toast('Dati cancellati.'); render(); }

  const CHART_ORANGE = '#c36522';
  const CHART_GRAY = '#8f8f8f';
  const CHART_GRAY_LIGHT = '#d8d3cd';
  const CHART_GRID = '#eee9e4';
  const CHART_TEXT = '#686868';

  function drawBarChart(id, labels, series, names){
    const c=document.getElementById(id); if(!c)return; setupCanvas(c);
    const ctx=c.getContext('2d'), W=c.width, H=c.height;
    const pad={l:54,r:34,t:50,b:46};
    ctx.clearRect(0,0,W,H);
    const vals=series.flat().map(v=>Number(v||0));
    const max=niceMax(Math.max(...vals,0));
    drawGrid(ctx,W,H,pad,labels,max,id==='chartCash');
    drawLegend(ctx,names,[CHART_ORANGE,CHART_GRAY],W,pad);
    if(max<=0){ drawEmptyChart(ctx,W,H,'Nessun dato per ora'); return; }

    const plotW=W-pad.l-pad.r, plotH=H-pad.t-pad.b;
    const groupW=plotW/labels.length;
    const barW=Math.max(12,Math.min(30,(groupW-18)/Math.max(series.length,1)));
    const colors=[CHART_ORANGE,CHART_GRAY];
    series.forEach((s,si)=>s.forEach((raw,i)=>{
      const v=Number(raw||0); if(v<=0) return;
      const h=Math.max(4,plotH*(v/max));
      const center=pad.l+i*groupW+groupW/2;
      const x=center - (barW*series.length + 6*(series.length-1))/2 + si*(barW+6);
      const y=pad.t+plotH-h;
      ctx.fillStyle=colors[si%colors.length];
      roundRect(ctx,x,y,barW,h,8); ctx.fill();
      ctx.fillStyle=CHART_TEXT;
      ctx.font='600 12px Host Grotesk';
      ctx.textAlign='center';
      ctx.fillText(id==='chartCash'?shortMoney(v):number(v),x+barW/2,Math.max(18,y-8));
    }));
  }

  function drawLineChart(id, labels, values, label=''){
    const c=document.getElementById(id); if(!c)return; setupCanvas(c);
    const ctx=c.getContext('2d'), W=c.width, H=c.height;
    const pad={l:58,r:40,t:42,b:46};
    ctx.clearRect(0,0,W,H);
    const max=niceMax(Math.max(...values.map(v=>Number(v||0)),0));
    drawGrid(ctx,W,H,pad,labels,max,true);
    if(max<=0){ drawEmptyChart(ctx,W,H,'Nessun movimento ancora'); return; }

    const plotW=W-pad.l-pad.r, plotH=H-pad.t-pad.b;
    const step=plotW/Math.max(labels.length-1,1);
    const points=values.map((v,i)=>({
      x:pad.l+i*step,
      y:pad.t+plotH-(plotH*(Number(v||0)/max)),
      v:Number(v||0)
    }));

    ctx.beginPath();
    points.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.lineTo(points[points.length-1].x,pad.t+plotH);
    ctx.lineTo(points[0].x,pad.t+plotH);
    ctx.closePath();
    ctx.fillStyle='rgba(195,101,34,.08)';
    ctx.fill();

    ctx.strokeStyle=CHART_ORANGE;
    ctx.lineWidth=3;
    ctx.lineJoin='round';
    ctx.lineCap='round';
    ctx.beginPath();
    points.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.stroke();

    points.forEach((p,i)=>{
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(p.x,p.y,5,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=CHART_ORANGE; ctx.lineWidth=3; ctx.stroke();
      if(i===points.length-1 && p.v>0){
        const txt=shortMoney(p.v);
        ctx.font='600 12px Host Grotesk';
        ctx.textAlign='right';
        ctx.fillStyle=CHART_TEXT;
        ctx.fillText(txt,Math.min(W-pad.r,p.x+24),Math.max(18,p.y-12));
      }
    });
  }

  function drawDonutChart(id,items){
    const c=document.getElementById(id); if(!c)return; setupCanvas(c);
    const ctx=c.getContext('2d'), W=c.width, H=c.height;
    ctx.clearRect(0,0,W,H);
    if(!items.length){ drawEmptyChart(ctx,W,H,'Nessun acquisto ancora'); return; }
    const total=items.reduce((s,i)=>s+Number(i.value||0),0);
    const colors=[CHART_ORANGE, CHART_GRAY, CHART_GRAY_LIGHT, '#b9b2aa', '#eee9e4'];
    const cx=W*.36, cy=H*.56, r=Math.min(W,H)*.28, width=r*.38;
    let start=-Math.PI/2;
    items.forEach((it,i)=>{
      const a=(Number(it.value||0)/total)*Math.PI*2;
      ctx.beginPath();
      ctx.arc(cx,cy,r,start,start+a);
      ctx.lineWidth=width;
      ctx.strokeStyle=colors[i%colors.length];
      ctx.lineCap='butt';
      ctx.stroke();
      start+=a;
    });
    ctx.fillStyle=CHART_TEXT;
    ctx.font='500 12px Host Grotesk';
    ctx.textAlign='center';
    ctx.fillText('Totale',cx,cy-4);
    ctx.fillStyle='#111';
    ctx.font='700 16px Host Grotesk';
    ctx.fillText(shortMoney(total),cx,cy+18);

    ctx.textAlign='left';
    items.slice(0,5).forEach((it,i)=>{
      const y=42+i*28;
      ctx.fillStyle=colors[i%colors.length];
      roundRect(ctx,W*.58,y-10,12,12,3); ctx.fill();
      ctx.fillStyle='#111';
      ctx.font='600 13px Host Grotesk';
      ctx.fillText(`${it.label} · ${shortMoney(it.value)}`,W*.58+22,y);
    });
  }

  function drawEmptyChart(ctx,W,H,message){
    ctx.fillStyle=CHART_TEXT;
    ctx.font='500 13px Host Grotesk';
    ctx.textAlign='center';
    ctx.fillText(message,W/2,H/2);
    ctx.textAlign='left';
  }
  function setupCanvas(c){
    const r=c.getBoundingClientRect();
    c.width=Math.max(320,Math.floor(r.width));
    c.height=Math.max(180,Math.floor(r.height));
  }
  function niceMax(v){
    if(v<=0) return 0;
    const exp=Math.pow(10,Math.floor(Math.log10(v)));
    const n=v/exp;
    const nice=n<=1?1:n<=2?2:n<=5?5:10;
    return nice*exp;
  }
  function drawGrid(ctx,W,H,pad,labels,max,isMoney=false){
    const plotW=W-pad.l-pad.r, plotH=H-pad.t-pad.b;
    ctx.strokeStyle=CHART_GRID; ctx.lineWidth=1;
    ctx.fillStyle=CHART_TEXT; ctx.font='500 12px Host Grotesk';
    ctx.textAlign='right';
    for(let i=0;i<4;i++){
      const y=pad.t+i*(plotH/3);
      ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(W-pad.r,y); ctx.stroke();
      if(max>0){ const val=max-(max*i/3); ctx.fillText(isMoney?shortMoney(val):number(Math.round(val)),pad.l-10,y+4); }
    }
    ctx.textAlign='center';
    labels.forEach((l,i)=>{
      const x=pad.l+i*(plotW/Math.max(labels.length-1,1));
      ctx.fillText(l,x,pad.t+plotH+28);
    });
  }
  function drawLegend(ctx,names,colors,W,pad){
    ctx.font='600 12px Host Grotesk';
    ctx.textAlign='left';
    const startX=Math.max(pad.l,W-pad.r-150);
    names.forEach((n,i)=>{
      const y=22+i*18;
      ctx.fillStyle=colors[i%colors.length]; roundRect(ctx,startX,y-9,10,10,2); ctx.fill();
      ctx.fillStyle=CHART_TEXT; ctx.fillText(n,startX+16,y);
    });
  }
  function shortMoney(v){ return money(v).replace(',00',''); }
  function roundRect(ctx,x,y,w,h,r){ const rr=Math.min(r,w/2,h/2); ctx.beginPath(); ctx.moveTo(x+rr,y); ctx.arcTo(x+w,y,x+w,y+h,rr); ctx.arcTo(x+w,y+h,x,y+h,rr); ctx.arcTo(x,y+h,x,y,rr); ctx.arcTo(x,y,x+w,y,rr); ctx.closePath(); }

  document.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      render();
    });
  });

  document.getElementById('quickOrderBtn')?.addEventListener('click', () => openOrderModal());
  document.getElementById('quickWineBtn')?.addEventListener('click', () => openWineModal());
  document.getElementById('quickSaleBtn')?.addEventListener('click', () => openSaleModal());
  document.getElementById('exportCsvBtn')?.addEventListener('click', exportCantinaCsv);
  document.getElementById('globalSearch')?.addEventListener('input', e => {
    searchTerm = e.target.value;
    render();
  });

  window.addEventListener('resize', () => {
    if (currentView === 'dashboard') renderDashboard();
  });

  // Quando Redis risponde con i dati online, aggiorna lo stato della dashboard.
  // Questo è il fix che permette di vedere i dati anche da un altro dispositivo.
  window.addEventListener('ambiguo:onlineLoaded', event => {
    if (!event.detail || !event.detail.state) return;
    state = event.detail.state;
    render();
    if (typeof toast === 'function') toast('Dati caricati online');
  });

  window.addEventListener('ambiguo:onlineSaved', () => {
    console.log('Dati salvati online su Redis.');
  });

  window.addEventListener('ambiguo:onlineSaveError', event => {
    console.warn('Errore salvataggio online Redis.', event.detail?.error);
    if (typeof toast === 'function') toast('Salvataggio online non riuscito. Dati salvati solo localmente.');
  });

  render();
})();
