(function () {
  const S = window.AmbiguoStorage;
  let state = S.load();
  const VIEW_KEY = 'ambiguo_current_view';
  let currentView = localStorage.getItem(VIEW_KEY) || 'dashboard';
  let sortState = { key: 'name', dir: 'asc' };
  let orderSortState = { key: 'date', dir: 'desc' };
  let searchTerm = '';
  let saleFilters = { status: '', payment: '', recipient: '', sort: 'date:desc' };
  const expandedOrders = new Set();

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
  const TAGS = ['bianco', 'rosso', 'orange', 'rosato', 'bolla', 'champagne'];
  const CUSTOMER_TYPES = ['privato','ristorante','enoteca','azienda','evento','uso interno','altro'];
  const SALE_STATUSES = ['bozza','confermato','pagato','annullato'];
  const PAYMENT_METHODS = ['cash','paypal','bonifico','revolut'];
  const PAYMENT_RECIPIENTS = ['Marco','Matteo','Michele','Riccardo','Samuele'];
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
  function parseAmount(v){
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    let raw = String(v ?? '').trim().replace(/\s/g, '').replace(/€/g, '');
    if (!raw) return 0;
    if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
    else raw = raw.replace(',', '.');
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  function intQty(v){ return Math.max(0, Math.round(parseAmount(v))); }
  function moneyInputValue(v){ const n=Number(v||0); return n ? '€ ' + String(round2(n)).replace('.', ',') : ''; }
  function money(v){ return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(v||0)); }
  function number(v){ return new Intl.NumberFormat('it-IT').format(Number(v||0)); }
  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function parseDateFlexible(value){
    if(!value) return new Date();
    if(value instanceof Date) return value;
    const raw=String(value).trim();
    const iso=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(iso) return new Date(Number(iso[1]), Number(iso[2])-1, Number(iso[3]));
    const it=raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if(it){
      const a=Number(it[1]), b=Number(it[2]), y=Number(it[3]);
      // Se il primo numero supera 12 è sicuramente GG/MM/AAAA.
      // Se il secondo supera 12 è MM/GG/AAAA. Se sono ambigui, per Ambiguo usiamo GG/MM/AAAA.
      const day = a>12 ? a : (b>12 ? b : a);
      const month = a>12 ? b : (b>12 ? a : b);
      return new Date(y, month-1, day);
    }
    const d=new Date(raw);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }
  function dateIT(iso){ if(!iso) return '—'; const d=parseDateFlexible(iso); return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('it-IT'); }
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
    const qty=intQty(line.quantity||0);
    const vatRate=Number(line.vatRate ?? state.settings.vatRate);
    const discounts=lineDiscounts(line);
    const netUnit=applySequentialDiscounts(listUnit, discounts);
    const discountUnit=Math.max(0,listUnit-netUnit);
    const vatUnit=calcVat(netUnit,vatRate);
    const grossUnit=netUnit+vatUnit;
    const resaleUnit=Number(line.resalePrice||0);
    return {listUnit,netUnit,discountUnit,vatUnit,grossUnit,resaleUnit,netTotal:netUnit*qty,discountTotal:discountUnit*qty,vatTotal:vatUnit*qty,grossTotal:grossUnit*qty,resaleTotal:resaleUnit*qty};
  }
  function saleLineTotals(line){
    const qty=intQty(line.quantity||0);
    const unit=parseAmount(line.unitPrice||0);
    const discount=parseAmount(line.discount||0);
    const total=Math.max(0,(unit*qty)-discount);
    const w=line?.wineId ? getWine(line.wineId) : null;
    const liveCost=w ? lineTotals(w).grossUnit*qty : 0;
    const cost=Number(line.costTotal || liveCost || 0);
    return { theoretical:unit*qty, total, cost, margin:total-cost };
  }
  function wineStatus(w){ if(w.archived) return 'archiviato'; if(Number(w.quantity||0)<=0) return 'esaurito'; if(Number(w.quantity||0)<=Number(state.settings.lowStockThreshold||0)) return 'giacenza bassa'; return 'disponibile'; }
  function tagBadge(tag){ const t=String(tag||'').toLowerCase(); return `<span class="badge tag-badge tag-${esc(t)}">${esc(tag||'—')}</span>`; }
  function nextCode(prefix, arr){ return `${prefix}-${String((arr?.length||0)+1).padStart(3,'0')}`; }

  function filteredWines(){ const q=norm(searchTerm); return state.wines.filter(w=>!q || [w.code,w.name,w.producer,w.vintage,w.size,w.tag,distributorName(w.distributorId)].some(v=>norm(v).includes(q))); }
  function filteredOrders(){ const q=norm(searchTerm); return state.orders.filter(o=>!q || [o.code,distributorName(o.distributorId),customerName(o.customerId),o.date,o.notes].some(v=>norm(v).includes(q)) || o.lines.some(l=>[l.code,l.name,l.producer,l.vintage,l.tag].some(v=>norm(v).includes(q)))); }
  function filteredSales(){
    const q=norm(searchTerm);
    let rows=state.sales.filter(s=>{
      const textOk=!q || [s.code,customerName(s.customerId),s.date,s.status,s.paymentMethod,s.paymentRecipient,s.notes].some(v=>norm(v).includes(q)) || s.lines.some(l=>norm(getWine(l.wineId)?.name).includes(q));
      const statusOk=!saleFilters.status || String(s.status||'')===saleFilters.status;
      const paymentOk=!saleFilters.payment || String(s.paymentMethod||'')===saleFilters.payment;
      const recipientOk=!saleFilters.recipient || String(s.paymentRecipient||'')===saleFilters.recipient;
      return textOk && statusOk && paymentOk && recipientOk;
    });
    const [key,dir]=(saleFilters.sort||'date:desc').split(':');
    const sign=dir==='asc'?1:-1;
    rows.sort((a,b)=>{
      let av,bv;
      if(key==='date'){ av=parseDateFlexible(a.date).getTime(); bv=parseDateFlexible(b.date).getTime(); }
      else if(key==='code'){ av=String(a.code||''); bv=String(b.code||''); }
      else if(key==='amount'){ av=Number(a.totals?.total||0); bv=Number(b.totals?.total||0); }
      else if(key==='margin'){ av=Number(a.totals?.margin||0); bv=Number(b.totals?.margin||0); }
      else if(key==='customer'){ av=customerName(a.customerId); bv=customerName(b.customerId); }
      else { av=String(a.date||''); bv=String(b.date||''); }
      return (av>bv?1:av<bv?-1:0)*sign;
    });
    return rows;
  }
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

  function monthKeyFromDate(value){
    const d=parseDateFlexible(value || todayISO());
    if(Number.isNaN(d.getTime())) return todayISO().slice(0,7);
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    return `${y}-${m}`;
  }

  function monthlyData(){
    const sourceDates=[];
    state.orders.forEach(o=>sourceDates.push(o.date||o.createdAt));
    state.sales.forEach(s=>sourceDates.push(s.date||s.createdAt));
    state.movements.forEach(m=>sourceDates.push(m.date||m.createdAt));
    state.wines.forEach(w=>sourceDates.push(w.lastOrderDate||w.lastPurchaseDate||w.createdAt));
    const validDates=sourceDates.map(parseDateFlexible).filter(d=>d && !Number.isNaN(d.getTime()));
    const latest=validDates.length ? new Date(Math.max(...validDates.map(d=>d.getTime()), new Date().getTime())) : new Date();
    const months=[];
    for(let i=5;i>=0;i--){
      const d=new Date(latest.getFullYear(),latest.getMonth()-i,1);
      const end=new Date(latest.getFullYear(),latest.getMonth()-i+1,0,23,59,59);
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      months.push({key,label:d.toLocaleDateString('it-IT',{month:'short'}),end,spent:0,sales:0,inQty:0,outQty:0,value:0});
    }

    state.orders.filter(o=>o.status!=='annullato').forEach(o=>{
      const b=months.find(m=>m.key===monthKeyFromDate(o.date || o.createdAt));
      if(b){
        const totals=o.totals || calculateOrderTotals(o.lines||[]);
        b.spent+=Number(totals.grossTotal || 0);
        // Usa sempre anche gli ordini come sorgente per le entrate, perché i dati vecchi possono non avere movimenti completi.
        b.inQty+=Number(totals.quantity || 0);
      }
    });

    state.sales.filter(s=>s.status!=='annullato').forEach(s=>{
      const b=months.find(m=>m.key===monthKeyFromDate(s.date || s.createdAt));
      if(b){
        const totals=s.totals || calculateSaleTotals(s.lines||[]);
        b.sales+=Number(totals.total || 0);
        // Usa sempre anche gli ordini clienti come sorgente per le uscite.
        b.outQty+=Number(totals.quantity || 0);
      }
    });

    // Integra eventuali movimenti manuali che non derivano da ordine/vendita.
    state.movements.forEach(move=>{
      const source=String(move.sourceType||'').toLowerCase();
      if(['order','sale'].includes(source)) return;
      const b=months.find(m=>m.key===monthKeyFromDate(move.date || move.createdAt));
      if(!b) return;
      const q=Number(move.quantityChange||0);
      if(q>0) b.inQty+=q;
      if(q<0) b.outQty+=Math.abs(q);
    });

    months.forEach(m=>{
      // Valore cantina nel tempo: se ci sono movimenti storici usa quelli, altrimenti mostra il valore attuale sul mese più recente.
      const qtyByWine={};
      state.movements.forEach(move=>{
        const md=parseDateFlexible(move.date||move.createdAt||todayISO());
        if(md<=m.end) qtyByWine[move.wineId]=(qtyByWine[move.wineId]||0)+Number(move.quantityChange||0);
      });
      const historical=Object.entries(qtyByWine).reduce((sum,[wineId,qty])=>{ const w=getWine(wineId); return sum + Math.max(0,qty)*Number(w?.resalePrice||0); },0);
      m.value=historical;
    });
    if(!months.some(m=>m.value>0)){
      const currentValue=state.wines.filter(w=>!w.archived && intQty(w.quantity)>0).reduce((sum,w)=>sum+Number(w.resalePrice||0)*intQty(w.quantity||0),0);
      if(months.length) months[months.length-1].value=currentValue;
    }
    return months;
  }
  function distributorBreakdown(){ const items=activeDistributors().map(d=>({label:d.name,value:0})); state.orders.forEach(o=>{ const it=items.find(x=>x.label===distributorName(o.distributorId)); if(it) it.value+=Number(o.totals?.grossTotal || calculateOrderTotals(o.lines||[]).grossTotal || 0); }); return items.filter(i=>i.value>0); }
  function tagQuantityBreakdown(){
    const map={};
    state.wines.filter(w=>!w.archived && Number(w.quantity||0)>0).forEach(w=>{ const tag=w.tag||'senza tag'; map[tag]=(map[tag]||0)+Number(w.quantity||0); });
    return Object.entries(map).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
  }
  function tagValueBreakdown(){
    const map={};
    state.wines.filter(w=>!w.archived && Number(w.quantity||0)>0).forEach(w=>{ const tag=w.tag||'senza tag'; map[tag]=(map[tag]||0)+Number(w.resalePrice||0)*Number(w.quantity||0); });
    return Object.entries(map).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
  }

  function render(){
    if (!views[currentView]) currentView = 'dashboard';
    localStorage.setItem(VIEW_KEY, currentView);
    document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));
    Object.entries(views).forEach(([n,el])=>el?.classList.toggle('active',n===currentView));
    document.getElementById('pageTitle').textContent=titles[currentView];
    renderNotificationMenu();
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
      <div class="dashboard-charts dashboard-charts-6">
        <div class="card chart-card"><h2>Andamento cantina</h2><div class="chart-wrap small"><canvas id="chartInventory"></canvas></div></div>
        <div class="card chart-card"><h2>Bottiglie entrate / uscite</h2><div class="chart-wrap small"><canvas id="chartBottles"></canvas></div></div>
        <div class="card chart-card"><h2>Entrate / uscite €</h2><div class="chart-wrap small"><canvas id="chartCash"></canvas></div></div>
        <div class="card chart-card"><h2>Acquisti per distributore</h2><div class="chart-wrap small"><canvas id="chartDistributor"></canvas></div></div>
        <div class="card chart-card"><h2>Bottiglie per tipologia</h2><div class="chart-wrap small"><canvas id="chartTagQty"></canvas></div></div>
        <div class="card chart-card"><h2>Valore resell per tipologia</h2><div class="chart-wrap small"><canvas id="chartTagValue"></canvas></div></div>
      </div>`;
    drawLineChart('chartInventory',months.map(m=>m.label),months.map(m=>m.value), 'Valore cantina');
    drawBarChart('chartBottles',months.map(m=>m.label),[months.map(m=>m.inQty),months.map(m=>m.outQty)],['Entrate','Uscite']);
    drawBarChart('chartCash',months.map(m=>m.label),[months.map(m=>m.spent),months.map(m=>m.sales)],['Spese','Incassi']);
    drawDonutChart('chartDistributor',distributorBreakdown());
    drawSingleBarChart('chartTagQty',tagQuantityBreakdown(),'Bottiglie');
    drawDonutChart('chartTagValue',tagValueBreakdown());
    bindInlineActions();
  }
  function notificationRows(){
    const unpaidOrders=state.orders.filter(o=>(o.paymentStatus||'da pagare')!=='pagato' && o.status!=='annullato');
    const unpaidSales=state.sales.filter(s=>!['pagato','annullato'].includes(s.status));
    return [
      ...unpaidOrders.map(o=>({
        type:'Da pagare',
        tone:'pay',
        title:distributorName(o.distributorId),
        body:`Ordine distributore ${o.code || '—'} · ${dateIT(o.date)}`,
        total:o.totals?.grossTotal,
        action:'edit-order',
        id:o.id,
        date:o.date
      })),
      ...unpaidSales.map(s=>({
        type:'Da incassare',
        tone:'cash',
        title:customerName(s.customerId),
        body:`Ordine cliente ${s.code || '—'} · ${dateIT(s.date)}`,
        total:s.totals?.total,
        action:'edit-sale',
        id:s.id,
        date:s.date
      }))
    ].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
  }

  function notificationsPanel(){
    const rows=notificationRows();
    if(!rows.length) return `<div class="empty">Nessuna notifica: non risultano ordini aperti, da pagare o da incassare.</div>`;
    return `<div class="table-scroll"><table><thead><tr><th>Tipo</th><th>Da chi / a chi</th><th>Codice</th><th>Data</th><th>Importo</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="badge">${esc(r.type)}</span></td><td class="cell-title">${esc(r.title)}</td><td>${esc(r.body.split(' · ')[0])}</td><td>${esc(r.body.split(' · ')[1]||'—')}</td><td>${money(r.total)}</td><td><button class="btn small secondary" data-action="${r.action}" data-id="${r.id}">Apri</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderNotificationMenu(){
    const list=document.getElementById('notificationList');
    const subtitle=document.getElementById('notificationSubtitle');
    const dot=document.getElementById('notificationDot');
    if(!list) return;
    const rows=notificationRows();
    if(subtitle) subtitle.textContent = rows.length ? `${rows.length} notifiche da leggere` : 'Nessuna notifica aperta';
    if(dot) dot.hidden = rows.length === 0;
    if(!rows.length){
      list.innerHTML = `<div class="notification-empty"><strong>Tutto pulito.</strong><span>Non ci sono ordini da pagare o da incassare.</span></div>`;
      return;
    }
    list.innerHTML = rows.map(r => `
      <button class="notification-item" type="button" data-action="${r.action}" data-id="${r.id}">
        <span class="notification-status ${r.tone}">${esc(r.type)}</span>
        <span class="notification-main">
          <strong>${esc(r.title)}</strong>
          <small>${esc(r.body)}</small>
        </span>
        <span class="notification-amount">${money(r.total)}</span>
      </button>
    `).join('');
    list.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>{
      closeNotificationMenu();
      handleAction(btn.dataset.action, btn.dataset.id);
    }));
  }

  function openNotificationMenu(){
    const menu=document.getElementById('notificationMenu');
    const btn=document.getElementById('notificationBtn');
    if(!menu) return;
    renderNotificationMenu();
    menu.hidden=false;
    btn?.setAttribute('aria-expanded','true');
  }

  function closeNotificationMenu(){
    const menu=document.getElementById('notificationMenu');
    const btn=document.getElementById('notificationBtn');
    if(!menu) return;
    menu.hidden=true;
    btn?.setAttribute('aria-expanded','false');
  }

  function applyCantinaStockFilter(wines, stockMode){
    const qty = w => Number(w.quantity || 0);
    const mode = stockMode || 'available';

    // Default: la Cantina apre su “Disponibili”, cioè solo bottiglie rimaste.
    // “Tutto lo stock” invece deve mostrare anche le referenze finite/zero.
    if(mode === 'available') return wines.filter(w => qty(w) > 0);
    if(mode === 'all') return wines;
    if(mode === 'low') return wines.filter(w => qty(w) > 0 && qty(w) <= Number(state.settings.lowStockThreshold || 3));
    if(mode === 'empty') return wines.filter(w => qty(w) <= 0);
    return wines.filter(w => qty(w) > 0);
  }

  function renderCantina(){
    const mode=window.__cantinaMode||'compact';
    const stockMode=window.__cantinaStockFilter||'available';
    let wines=applyCantinaStockFilter(filteredWines(), stockMode); wines.sort((a,b)=>sortCompare(a,b));
    views.cantina.innerHTML=`<div class="section-head"><div class="filters"><select id="cantinaMode" class="filter"><option value="compact">Vista compatta</option><option value="full">Vista completa</option></select><select id="tagFilter" class="filter"><option value="">Tutti i tag</option>${TAGS.map(t=>`<option value="${t}">${t}</option>`).join('')}</select><select id="distributorFilter" class="filter"><option value="">Tutti i distributori</option>${activeDistributors().map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select><select id="stockFilter" class="filter"><option value="available">Disponibili</option><option value="all">Tutto lo stock</option><option value="low">Pochi pezzi</option><option value="empty">Esauriti</option></select><select id="cantinaSort" class="filter"><option value="name:asc">Ordina: nome A-Z</option><option value="lastPurchaseDate:desc">Ordina: data ordine recente</option><option value="tag:asc">Ordina: tipologia vino</option><option value="distributor:asc">Ordina: distributore</option><option value="quantity:desc">Ordina: quantità alta</option><option value="resaleTotal:desc">Ordina: valore resell</option><option value="grossTotal:desc">Ordina: costo stock</option></select></div><div class="actions"><button class="btn secondary" data-action="new-movement">Movimento</button><button class="btn primary" data-action="new-wine">Nuovo vino</button></div></div><div class="card table-card">${wines.length?cantinaTable(wines,mode):`<div class="empty">Nessun vino disponibile.</div>`}</div>`;
    const m=document.getElementById('cantinaMode'); if(m) m.value=mode;
    const stock=document.getElementById('stockFilter'); if(stock) stock.value=stockMode;
    bindCantinaFilters(); bindInlineActions();
  }
  function sortValue(w,key){ const t=lineTotals(w); if(key==='distributor') return distributorName(w.distributorId); if(key==='discount') return discountLabel(w); if(key==='grossUnit') return t.grossUnit; if(key==='netTotal') return t.netTotal; if(key==='grossTotal') return t.grossTotal; if(key==='resaleTotal') return t.resaleTotal; if(key==='status') return wineStatus(w); if(key==='lastPurchaseDate') return w.lastOrderDate || w.lastPurchaseDate || w.createdAt || ''; return w[key]; }
  function sortCompare(a,b){ const av=sortValue(a,sortState.key), bv=sortValue(b,sortState.key); const r=(typeof av==='number'||typeof bv==='number')?Number(av||0)-Number(bv||0):String(av||'').localeCompare(String(bv||'')); return sortState.dir==='asc'?r:-r; }
  function cantinaTable(wines, mode='compact'){
    const compact=[['code','Codice'],['name','Vino'],['tag','Tag'],['distributor','Distributore'],['lastPurchaseDate','Data'],['quantity','Qtà'],['grossUnit','Costo'],['resalePrice','Resell'],['resaleTotal','Tot. resell'],['status','Stato'],['actions','']];
    const full=[['code','Codice'],['name','Nome vino'],['producer','Cantina'],['vintage','Annata'],['size','Dimensione'],['tag','Tag'],['distributor','Distributore'],['lastPurchaseDate','Data ordine'],['netUnitPrice','Listino no IVA'],['discount','Sconto'],['vatRate','IVA'],['grossUnit','Costo con IVA'],['resalePrice','Resell Ambiguo'],['quantity','Qtà'],['grossTotal','Totale costo'],['resaleTotal','Totale resell'],['status','Stato'],['actions','']];
    const headers=mode==='full'?full:compact;
    return `<div class="table-scroll"><table class="cantina-table ${mode==='compact'?'compact-table':''}"><thead><tr>${headers.map(([k,l])=>`<th class="${k!=='actions'?'sortable':''}" data-sort="${k}">${l}${sortState.key===k?(sortState.dir==='asc'?' ↑':' ↓'):''}</th>`).join('')}</tr></thead><tbody>${wines.map(w=>{const t=lineTotals(w); const cells={code:`<td class="cell-title">${esc(w.code)}</td>`,name:`<td><div class="cell-title">${esc(w.name)}</div><div class="cell-sub">${esc(w.producer||'—')} · ${esc(w.vintage||'—')} · ${esc(w.size||'')}</div>${w.notes?`<div class="cell-sub">${esc(w.notes)}</div>`:''}</td>`,producer:`<td>${esc(w.producer)}</td>`,vintage:`<td>${esc(w.vintage)}</td>`,size:`<td>${esc(w.size)}</td>`,tag:`<td>${tagBadge(w.tag)}</td>`,distributor:`<td>${esc(distributorName(w.distributorId))}</td>`,lastPurchaseDate:`<td>${dateIT(w.lastOrderDate || w.lastPurchaseDate || w.createdAt)}</td>`,netUnitPrice:`<td>${money(w.netUnitPrice)}</td>`,discount:`<td>${discountLabel(w)}</td>`,vatRate:`<td>${number(w.vatRate)}%</td>`,grossUnit:`<td>${money(t.grossUnit)}</td>`,resalePrice:`<td>${money(w.resalePrice)}</td>`,quantity:`<td><strong>${number(w.quantity)}</strong></td>`,grossTotal:`<td>${money(t.grossTotal)}</td>`,resaleTotal:`<td>${money(t.resaleTotal)}</td>`,status:`<td><span class="badge status-badge status-${wineStatus(w).replace(/\s/g,'-')}">${wineStatus(w)}</span></td>`,actions:`<td><div class="actions inline-actions"><button class="btn small secondary" data-action="edit-wine" data-id="${w.id}">Modifica</button><button class="btn small ghost" data-action="wine-history" data-id="${w.id}">Storico</button><button class="btn small danger" data-action="delete-wine" data-id="${w.id}">Elimina</button></div></td>`}; return `<tr>${headers.map(([k])=>cells[k]).join('')}</tr>`;}).join('')}</tbody></table></div>`;
  }

  function bindCantinaFilters(){
    const mode=document.getElementById('cantinaMode'), tag=document.getElementById('tagFilter'), dist=document.getElementById('distributorFilter'), stock=document.getElementById('stockFilter'), sort=document.getElementById('cantinaSort');
    if(sort) sort.value=`${sortState.key}:${sortState.dir}`;
    if(mode) mode.value=window.__cantinaMode||'compact';
    if(stock) stock.value=window.__cantinaStockFilter||'available';
    const apply=()=>{
      if(mode) window.__cantinaMode=mode.value;
      if(sort&&sort.value){ const [key,dir]=sort.value.split(':'); sortState={key,dir}; }
      const stockMode = stock ? stock.value : 'available';
      window.__cantinaStockFilter = stockMode || 'available';
      let wines=filteredWines().filter(w=>(!tag.value||w.tag===tag.value)&&(!dist.value||w.distributorId===dist.value));
      wines = applyCantinaStockFilter(wines, window.__cantinaStockFilter);
      wines.sort((a,b)=>sortCompare(a,b));
      document.querySelector('#view-cantina .table-card').innerHTML=wines.length?cantinaTable(wines,window.__cantinaMode||'compact'):`<div class="empty">Nessun vino con questi filtri.</div>`;
      bindInlineActions(); bindSortHeaders();
    };
    [mode,tag,dist,stock,sort].filter(Boolean).forEach(el=>el.addEventListener('change',apply)); bindSortHeaders();
  }
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
    const isExpanded = expandedOrders.has(o.id);
    const visibleLines = isExpanded ? o.lines : o.lines.slice(0, 5);
    const rows=visibleLines.map(l=>{ const t=lineTotals(l); return `<tr><td class="cell-title">${esc(l.code)}</td><td>${esc(l.name)}</td><td>${esc(l.producer)}</td><td>${esc(l.vintage||'—')}</td><td>${tagBadge(l.tag)}</td><td>${number(l.quantity)}</td><td>${money(l.netUnitPrice)}</td><td>${discountLabel(l)}</td><td>${money(l.resalePrice)}</td><td>${money(t.grossTotal)}</td></tr>`; }).join('');
    const toggle = o.lines.length > 5 ? `<button class="order-expand-toggle icon-only" data-action="toggle-order-lines" data-id="${o.id}" title="${isExpanded?'Raggruppa righe':'Mostra tutte le righe'}" aria-label="${isExpanded?'Raggruppa righe':'Mostra tutte le righe'}"><span aria-hidden="true">${isExpanded?'↑':'↓'}</span></button>` : '';
    return `<article class="order-card"><div class="order-card-head"><div><div class="order-date">${dateIT(o.date)}</div><h2>${esc(distributorName(o.distributorId))}</h2><p>${o.customerId?`Cliente ref. ${esc(customerName(o.customerId))}`:'Nessun cliente associato'} · ${esc(o.code)}</p></div><div class="order-total"><strong>${money(o.totals?.grossTotal)}</strong><span>${number(o.totals?.quantity)} bottiglie · ${number(o.lines.length)} referenze</span><span class="badge">${esc(o.status)}</span><span class="badge">${esc(o.paymentStatus||'da pagare')}</span></div></div><div class="table-scroll compact"><table><thead><tr><th>Codice</th><th>Vino</th><th>Cantina</th><th>Annata</th><th>Tag</th><th>Qtà</th><th>Listino</th><th>Sconto</th><th>Resell</th><th>Totale</th></tr></thead><tbody>${rows}</tbody></table></div><div class="order-card-actions"><div class="order-card-actions-left">${toggle}</div><div class="order-card-actions-right"><button class="btn small secondary" data-action="edit-order" data-id="${o.id}">Modifica dati</button><button class="btn small ghost" data-action="view-order" data-id="${o.id}">Apri dettaglio</button><button class="btn small ghost" data-action="duplicate-order" data-id="${o.id}">Duplica</button><button class="btn small danger" data-action="delete-order" data-id="${o.id}">Elimina</button></div></div></article>`;
  }

  function renderVendite(){
    const sales=filteredSales();
    views.vendite.innerHTML=`<div class="section-head"><div class="filters"><select id="saleStatusFilter" class="filter"><option value="">Tutti gli stati</option>${SALE_STATUSES.map(x=>`<option value="${x}" ${saleFilters.status===x?'selected':''}>${x}</option>`).join('')}</select><select id="salePaymentFilter" class="filter"><option value="">Tutti i pagamenti</option>${PAYMENT_METHODS.map(x=>`<option value="${x}" ${saleFilters.payment===x?'selected':''}>${x}</option>`).join('')}</select><select id="saleRecipientFilter" class="filter"><option value="">Tutti i destinatari</option>${PAYMENT_RECIPIENTS.map(x=>`<option value="${x}" ${saleFilters.recipient===x?'selected':''}>${x}</option>`).join('')}</select><select id="saleSort" class="filter"><option value="date:desc" ${saleFilters.sort==='date:desc'?'selected':''}>Ordina: data recente</option><option value="date:asc" ${saleFilters.sort==='date:asc'?'selected':''}>Ordina: data vecchia</option><option value="code:asc" ${saleFilters.sort==='code:asc'?'selected':''}>Ordina: numero ordine A-Z</option><option value="code:desc" ${saleFilters.sort==='code:desc'?'selected':''}>Ordina: numero ordine Z-A</option><option value="amount:desc" ${saleFilters.sort==='amount:desc'?'selected':''}>Ordina: importo alto</option><option value="amount:asc" ${saleFilters.sort==='amount:asc'?'selected':''}>Ordina: importo basso</option><option value="margin:desc" ${saleFilters.sort==='margin:desc'?'selected':''}>Ordina: margine alto</option><option value="customer:asc" ${saleFilters.sort==='customer:asc'?'selected':''}>Ordina: cliente A-Z</option></select></div><button class="btn primary" data-action="new-sale">Nuovo ordine cliente</button></div><div class="card table-card">${sales.length?`<div class="table-scroll"><table><thead><tr><th>Data</th><th>Codice</th><th>Cliente</th><th>Stato</th><th>Pagamento</th><th>Mandati a</th><th>Bottiglie</th><th>Totale</th><th>Costo bottiglie</th><th>Margine</th><th>Note</th><th></th></tr></thead><tbody>${sales.map(s=>`<tr><td class="cell-title">${dateIT(s.date)}</td><td>${esc(s.code)}</td><td>${esc(customerName(s.customerId))}</td><td><span class="badge">${esc(s.status)}</span></td><td>${esc(s.paymentMethod||'—')}</td><td>${esc(s.paymentRecipient||'—')}</td><td>${number(s.totals?.quantity)}</td><td>${money(s.totals?.total)}</td><td>${money(s.totals?.cost)}</td><td>${money(s.totals?.margin)}</td><td>${esc(s.notes||'—')}</td><td><div class="actions"><button class="btn small secondary" data-action="edit-sale" data-id="${s.id}">Modifica</button><button class="btn small ghost" data-action="duplicate-sale" data-id="${s.id}">Duplica</button><button class="btn small danger" data-action="delete-sale" data-id="${s.id}">Elimina</button></div></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">Nessun ordine cliente registrato.</div>`}</div>`;
    document.getElementById('saleStatusFilter')?.addEventListener('change',e=>{ saleFilters.status=e.target.value; renderVendite(); });
    document.getElementById('salePaymentFilter')?.addEventListener('change',e=>{ saleFilters.payment=e.target.value; renderVendite(); });
    document.getElementById('saleRecipientFilter')?.addEventListener('change',e=>{ saleFilters.recipient=e.target.value; renderVendite(); });
    document.getElementById('saleSort')?.addEventListener('change',e=>{ saleFilters.sort=e.target.value; renderVendite(); });
    bindInlineActions();
  }

  function renderClienti(){ const customers=filteredCustomers().sort((a,b)=>a.name.localeCompare(b.name)); views.clienti.innerHTML=`<div class="section-head"><span class="small-muted">Lista clienti modificabile.</span><button class="btn primary" data-action="new-customer">Nuovo cliente</button></div><div class="card table-card">${customers.length?`<div class="table-scroll"><table><thead><tr><th>Nome</th><th>Tipologia</th><th>Email</th><th>Telefono</th><th>Ordini</th><th>Bottiglie</th><th>Totale speso</th><th>Note</th><th></th></tr></thead><tbody>${customers.map(c=>{ const sales=state.sales.filter(s=>s.customerId===c.id&&s.status!=='annullato'); const qty=sales.reduce((a,s)=>a+Number(s.totals?.quantity||0),0); const total=sales.reduce((a,s)=>a+Number(s.totals?.total||0),0); return `<tr><td class="cell-title">${esc(c.name)}</td><td>${esc(c.type||'—')}</td><td>${esc(c.email||'—')}</td><td>${esc(c.phone||'—')}</td><td>${number(sales.length)}</td><td>${number(qty)}</td><td>${money(total)}</td><td>${esc(c.notes||'—')}</td><td><button class="btn small secondary" data-action="edit-customer" data-id="${c.id}">Modifica</button><button class="btn small danger" data-action="delete-customer" data-id="${c.id}">Elimina</button></td></tr>`;}).join('')}</tbody></table></div>`:`<div class="empty">Nessun cliente. Puoi aggiungerlo qui o durante un ordine cliente.</div>`}</div>`; bindInlineActions(); }

  function renderDistributori(){ const dists=filteredDistributors().sort((a,b)=>a.name.localeCompare(b.name)); views.distributori.innerHTML=`<div class="section-head"><span class="small-muted">Ogni distributore può avere uno sconto predefinito. È solo una proposta: negli ordini puoi cambiarlo per singola riga.</span><button class="btn primary" data-action="new-distributor">Nuovo distributore</button></div><div class="card table-card">${dists.length?`<div class="table-scroll"><table><thead><tr><th>Nome</th><th>Sconto predefinito</th><th>Ordini</th><th>Bottiglie acquistate</th><th>Totale acquistato</th><th>Note</th><th></th></tr></thead><tbody>${dists.map(d=>{ const orders=state.orders.filter(o=>o.distributorId===d.id); const qty=orders.reduce((s,o)=>s+Number(o.totals?.quantity||0),0); const total=orders.reduce((s,o)=>s+Number(o.totals?.grossTotal||0),0); return `<tr><td class="cell-title">${esc(d.name)}</td><td><span class="badge">${esc(DISCOUNT_PRESETS.find(p=>p[0]===(d.discountPreset||'none'))?.[1]||'Nessuno')}</span></td><td>${number(orders.length)}</td><td>${number(qty)}</td><td>${money(total)}</td><td>${esc(d.notes||'—')}</td><td><button class="btn small secondary" data-action="edit-distributor" data-id="${d.id}">Modifica</button><button class="btn small danger" data-action="delete-distributor" data-id="${d.id}">Elimina</button></td></tr>`;}).join('')}</tbody></table></div>`:`<div class="empty">Nessun distributore trovato.</div>`}</div>`; bindInlineActions(); }

  function renderImpostazioni(){ views.impostazioni.innerHTML=`<div class="grid two"><div class="card"><h2>Impostazioni base</h2><div class="settings-row"><div><strong>Aliquota IVA predefinita</strong><div class="small-muted">Usata quando inserisci nuovi vini o righe ordine.</div></div><input class="filter" id="vatSetting" type="number" step="0.01" value="${state.settings.vatRate}"></div><div class="settings-row"><div><strong>Soglia giacenza bassa</strong><div class="small-muted">Solo per stato cantina, non in homepage.</div></div><input class="filter" id="lowStockSetting" type="number" step="1" value="${state.settings.lowStockThreshold}"></div><div class="settings-row"><div><strong>Giacenza negativa</strong><div class="small-muted">Per ora consigliato: disattivata.</div></div><select class="filter" id="negativeStockSetting"><option value="false">Non consentita</option><option value="true">Consentita</option></select></div><button class="btn primary" id="saveSettingsBtn">Salva impostazioni</button></div><div class="card"><h2>Dati</h2><div class="grid"><button class="btn secondary" id="backupBtn">Scarica backup JSON</button><label class="btn secondary" style="text-align:center">Ripristina backup JSON<input id="restoreInput" type="file" accept="application/json" hidden></label><button class="btn ghost" id="demoBtn">Carica dati demo</button><button class="btn ghost" id="removeDemoBtn">Rimuovi dati demo</button><button class="btn danger" id="resetBtn">Cancella tutti i dati</button></div></div></div>`; document.getElementById('negativeStockSetting').value=String(state.settings.allowNegativeStock); document.getElementById('saveSettingsBtn').addEventListener('click',()=>{ state.settings.vatRate=Number(document.getElementById('vatSetting').value||22); state.settings.lowStockThreshold=Number(document.getElementById('lowStockSetting').value||3); state.settings.allowNegativeStock=document.getElementById('negativeStockSetting').value==='true'; save(); toast('Impostazioni salvate.'); render(); }); document.getElementById('backupBtn').addEventListener('click',downloadBackup); document.getElementById('restoreInput').addEventListener('change',restoreBackup); document.getElementById('demoBtn').addEventListener('click',loadDemoData); document.getElementById('removeDemoBtn').addEventListener('click',removeDemoData); document.getElementById('resetBtn').addEventListener('click',resetAll); }

  function field(label,id,value,type,options=[]){
    const htmlId='f_'+id;
    if(type==='select') return `<div class="field"><label>${esc(label)}</label><select id="${htmlId}">${options.map(o=>`<option value="${esc(o)}" ${String(value)===String(o)?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;
    if(type==='selectPairs') return `<div class="field"><label>${esc(label)}</label><select id="${htmlId}">${options.map(([v,lab])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(lab)}</option>`).join('')}</select></div>`;
    const isQty = /quantity|quantità/i.test(id) || /quantità/i.test(label);
    const isMoney = /prezzo|listino|resell|totale|sconto €/i.test(label) || /netUnitPrice|resalePrice|unitPrice|discount$/i.test(id);
    const inputType = type==='number' && isMoney ? 'text' : type;
    const cls = isMoney ? ' money-input' : '';
    const attrs = isQty ? 'inputmode="numeric" step="1" min="0"' : (isMoney ? 'inputmode="decimal" data-money="1"' : (type==='number'?'step="0.01"':''));
    const valOut = isMoney ? moneyInputValue(value) : (value ?? '');
    return `<div class="field"><label>${esc(label)}</label><input id="${htmlId}" class="${cls.trim()}" type="${inputType}" value="${esc(valOut)}" ${attrs}></div>`;
  }
  function openModal({title,subtitle='',body,primary='Salva',onPrimary,footerLeft=''}){ const root=document.getElementById('modalRoot'); root.classList.add('active'); root.innerHTML=`<div class="modal-backdrop" data-close="1"></div><div class="modal"><div class="modal-header"><div><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button class="close" data-close="1">×</button></div><div class="modal-body">${body}</div><div class="modal-footer" style="justify-content:space-between;align-items:center"><div class="modal-footer-left">${footerLeft||''}</div><div class="modal-footer-right" style="display:flex;gap:9px"><button class="btn secondary" data-close="1">Annulla</button><button class="btn primary" id="modalPrimary">${esc(primary)}</button></div></div></div>`; root.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',closeModal)); document.getElementById('modalPrimary').addEventListener('click',onPrimary); setTimeout(bindFormEnhancements,0); }
  function bindFormEnhancements(){
    document.querySelectorAll('.modal input, .modal select, .modal textarea').forEach(el=>{
      if(el.dataset.boundNav) return; el.dataset.boundNav='1';
      el.addEventListener('keydown',e=>{
        if(!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(e.key)) return;
        const fields=[...document.querySelectorAll('.modal input, .modal select, .modal textarea')].filter(x=>!x.disabled && x.offsetParent!==null);
        const i=fields.indexOf(el); if(i<0) return;
        const cols=el.closest('.order-line-grid')?14:2;
        let ni=i;
        if(e.key==='ArrowRight') ni=i+1;
        if(e.key==='ArrowLeft') ni=i-1;
        if(e.key==='ArrowDown') ni=i+cols;
        if(e.key==='ArrowUp') ni=i-cols;
        if(fields[ni]){ e.preventDefault(); fields[ni].focus(); fields[ni].select?.(); }
      });
      if(el.dataset.money){
        el.addEventListener('blur',()=>{ const n=parseAmount(el.value); el.value = n ? '€ ' + String(round2(n)).replace('.', ',') : ''; });
      }
      if(/quantity/i.test(el.id)){
        el.addEventListener('blur',()=>{ el.value=String(intQty(el.value)); });
      }
    });
  }

  function closeModal(){ const root=document.getElementById('modalRoot'); root.classList.remove('active'); root.innerHTML=''; }
  function toast(msg){ const root=document.getElementById('toastRoot'); const el=document.createElement('div'); el.className='toast'; el.textContent=msg; root.appendChild(el); setTimeout(()=>el.remove(),3200); }

  function openWineModal(id){
    const isEdit=Boolean(id);
    const w=isEdit?getWine(id):{id:S.uuid(),code:'',name:'',producer:'',vintage:'',size:'0.75',tag:'bianco',netUnitPrice:0,quantity:0,vatRate:state.settings.vatRate,distributorId:activeDistributors()[0]?.id||'',lastOrderDate:todayISO(),notes:'',archived:false,resalePrice:0,discountPreset:distributorDefaultDiscount(activeDistributors()[0]?.id)||'none',discount1:0,discount2:0,discount3:0};
    const previous=isEdit?JSON.parse(JSON.stringify(w)):null;
    openModal({title:isEdit?'Modifica vino':'Nuovo vino',subtitle:'Ogni vino inserito manualmente viene collegato anche agli ordini distributore.',body:wineForm(w),primary:isEdit?'Salva modifiche':'Aggiungi vino',onPrimary:()=>{
      const next=readWineForm(w.id);
      const err=validateWine(next); if(err) return toast(err);
      if(isEdit){
        const before=getWine(id);
        const delta=intQty(next.quantity)-intQty(before.quantity||0);
        Object.assign(before,next,{updatedAt:S.now()});
        if(delta!==0) addMovement(before.id,delta,'rettifica inventario',todayISO(),'Modifica quantità da scheda vino');
        // Se il vino è già collegato a un ordine, aggiorniamo QUELLA riga, senza creare nuovi ordini o spostarlo.
        updateLinkedOrderLineFromWine(before, previous);
      } else {
        next.createdAt=S.now();
        state.wines.push(next);
        if(intQty(next.quantity)!==0) addMovement(next.id,intQty(next.quantity),'carico manuale',next.lastOrderDate||todayISO(),'Inserimento manuale vino');
        syncManualWineOrder(next, null);
      }
      cleanupEmptyOrderWines();
      save(); closeModal(); toast(isEdit?'Vino aggiornato.':'Vino aggiunto.'); render();
    }});
    bindLiveWineTotals();
    bindFormEnhancements();
  }
  function wineForm(w){ return `<div class="form-grid">${field('Data ordine','lastOrderDate',w.lastOrderDate||todayISO(),'date')}${field('Codice','code',w.code,'text')}${field('Nome vino','name',w.name,'text')}${field('Cantina','producer',w.producer,'text')}${field('Annata','vintage',w.vintage,'text')}${field('Dimensione','size',w.size,'select',['0.75','1.5l','1l','magnum','altro'])}${field('Tag','tag',w.tag,'select',TAGS)}${field('Distributore','distributorId',w.distributorId,'selectPairs',activeDistributors().map(d=>[d.id,d.name]))}${field('Prezzo no IVA / bottiglia','netUnitPrice',w.netUnitPrice,'number')}${field('Sconto','discountPreset',w.discountPreset||'none','selectPairs',DISCOUNT_PRESETS)}${field('Sconto manuale 1 %','discount1',w.discount1||0,'number')}${field('Sconto manuale 2 %','discount2',w.discount2||0,'number')}${field('Sconto manuale 3 %','discount3',w.discount3||0,'number')}${field('Prezzo resell Ambiguo','resalePrice',w.resalePrice||0,'number')}${field('Quantità','quantity',w.quantity,'number')}${field('IVA %','vatRate',w.vatRate??state.settings.vatRate,'number')}<div class="field" style="grid-column:1/-1"><label>Note</label><textarea id="f_notes">${esc(w.notes||'')}</textarea></div><div class="summary-box soft-summary" style="grid-column:1/-1" id="wineLiveTotals"></div></div>`; }
  function readWineForm(id){ return {id,code:val('code'),name:val('name'),producer:val('producer'),vintage:val('vintage'),size:val('size'),tag:val('tag'),distributorId:val('distributorId'),lastOrderDate:val('lastOrderDate')||todayISO(),netUnitPrice:parseAmount(val('netUnitPrice')),discountPreset:val('discountPreset')||'none',discount1:parseAmount(val('discount1')),discount2:parseAmount(val('discount2')),discount3:parseAmount(val('discount3')),resalePrice:parseAmount(val('resalePrice')),quantity:intQty(val('quantity')),vatRate:parseAmount(val('vatRate')||state.settings.vatRate),notes:val('notes'),archived:false}; }
  function validateWine(w){ if(!w.code.trim()) return 'Inserisci il codice.'; if(!w.name.trim()) return 'Inserisci il nome del vino.'; if(!w.producer.trim()) return 'Inserisci la cantina.'; if(!w.distributorId) return 'Seleziona un distributore.'; if(Number.isNaN(w.netUnitPrice)||w.netUnitPrice<0) return 'Prezzo no IVA non valido.'; if(!state.settings.allowNegativeStock&&w.quantity<0) return 'Quantità negativa non consentita.'; return ''; }
  function bindLiveWineTotals(){ ['netUnitPrice','discountPreset','discount1','discount2','discount3','resalePrice','quantity','vatRate'].forEach(id=>document.getElementById('f_'+id)?.addEventListener('input',updateWineTotals)); updateWineTotals(); }
  function updateWineTotals(){ const l={netUnitPrice:parseAmount(val('netUnitPrice')),discountPreset:val('discountPreset'),discount1:parseAmount(val('discount1')),discount2:parseAmount(val('discount2')),discount3:parseAmount(val('discount3')),resalePrice:parseAmount(val('resalePrice')),quantity:intQty(val('quantity')),vatRate:parseAmount(val('vatRate')||state.settings.vatRate)}; const t=lineTotals(l); const el=document.getElementById('wineLiveTotals'); if(el) el.innerHTML=`<div class="summary-row"><span>Sconto applicato</span><strong>${discountLabel(l)}</strong></div><div class="summary-row"><span>Costo netto scontato</span><strong>${money(t.netUnit)}</strong></div><div class="summary-row"><span>IVA per bottiglia</span><strong>${money(t.vatUnit)}</strong></div><div class="summary-row"><span>Costo con IVA / bottiglia</span><strong>${money(t.grossUnit)}</strong></div><div class="summary-row"><span>Totale costo con IVA</span><strong>${money(t.grossTotal)}</strong></div><div class="summary-row"><span>Totale resell</span><strong>${money(t.resaleTotal)}</strong></div>`; }

  function wineToOrderLine(w){
    const id=w.sourceOrderLineId||S.uuid();
    return {id,sourceOrderLineId:id,sourceWineId:w.id,manualStock:true,code:w.code,name:w.name,producer:w.producer,vintage:w.vintage,size:w.size,tag:w.tag,netUnitPrice:parseAmount(w.netUnitPrice),discountPreset:w.discountPreset||'none',discount1:parseAmount(w.discount1),discount2:parseAmount(w.discount2),discount3:parseAmount(w.discount3),resalePrice:parseAmount(w.resalePrice),quantity:intQty(w.quantity),vatRate:parseAmount(w.vatRate||state.settings.vatRate)};
  }
  function syncManualWineOrder(w, previous){
    if(!w || !w.distributorId || !w.lastOrderDate) return;

    // Se il vino era già collegato a un ordine, NON creare/spostare ordini:
    // aggiorna solo la riga già collegata.
    if(previous && previous.sourceOrderId){
      w.sourceOrderId=previous.sourceOrderId;
      w.sourceOrderLineId=previous.sourceOrderLineId;
      w.manualStock=Boolean(previous.manualStock);
      updateLinkedOrderLineFromWine(w, previous);
      return;
    }

    // Solo un vino nuovo inserito manualmente in Cantina genera/aggiorna ordine automatico.
    let order=state.orders.find(o=>o.manualStock && o.distributorId===w.distributorId && String(o.date||'')===String(w.lastOrderDate||''));
    if(!order){
      order={id:S.uuid(),code:nextCode('ORD',state.orders),distributorId:w.distributorId,customerId:'',date:w.lastOrderDate,status:'ricevuto',paymentStatus:'da pagare',discountPreset:w.discountPreset||distributorDefaultDiscount(w.distributorId)||'none',notes:'Creato automaticamente da inserimento manuale in cantina.',manualStock:true,lines:[],createdAt:S.now()};
      state.orders.push(order);
    }
    const line=wineToOrderLine(w);
    const idx=order.lines.findIndex(l=>l.sourceWineId===w.id || l.sourceOrderLineId===w.sourceOrderLineId);
    if(idx>=0) order.lines[idx]=line; else order.lines.push(line);
    w.sourceOrderId=order.id;
    w.sourceOrderLineId=line.sourceOrderLineId;
    w.manualStock=true;
    order.totals=calculateOrderTotals(order.lines||[]);
    order.updatedAt=S.now();
  }
  function cleanupEmptyOrderWines(){
    const protectedIds=new Set();
    state.sales.forEach(s=>(s.lines||[]).forEach(l=>protectedIds.add(l.wineId)));
    state.wines=state.wines.filter(w=> intQty(w.quantity)>0 || protectedIds.has(w.id) || !w.sourceOrderId);
    state.orders.forEach(o=>{ o.totals=calculateOrderTotals(o.lines||[]); });
  }

  function openMovementModal(){ openModal({title:'Movimento manuale',subtitle:'Ogni modifica quantità viene tracciata nello storico.',body:`<div class="form-grid">${field('Vino','wineId','', 'selectPairs', state.wines.map(w=>[w.id,`${w.code} — ${w.name} (${w.quantity} disp.)`]))}${field('Tipo movimento','type','scarico manuale','select',['carico manuale','scarico manuale','bottiglia degustata','omaggio','bottiglia danneggiata','rettifica inventario','prelievo personale','reso'])}${field('Quantità','quantity',1,'number')}${field('Data','date',todayISO(),'date')}<div class="field" style="grid-column:1/-1"><label>Motivo / nota</label><textarea id="f_note"></textarea></div></div>`,primary:'Registra movimento',onPrimary:()=>{ const wine=getWine(val('wineId')); if(!wine) return toast('Seleziona un vino.'); const qty=Math.abs(intQty(val('quantity'))); if(!qty) return toast('Inserisci una quantità valida.'); const type=val('type'), positive=['carico manuale','reso'].includes(type), delta=positive?qty:-qty; if(!state.settings.allowNegativeStock&&Number(wine.quantity||0)+delta<0) return toast('Stock insufficiente.'); wine.quantity=Number(wine.quantity||0)+delta; addMovement(wine.id,delta,type,val('date'),val('note')); save(); closeModal(); toast('Movimento registrato.'); render(); }}); }
  function addMovement(wineId,quantityChange,type,date,note,sourceType='manuale',sourceId=''){ state.movements.push({id:S.uuid(),wineId,quantityChange:Number(quantityChange),type,date:date||todayISO(),note:note||'',sourceType,sourceId,createdAt:S.now()}); }

  function openOrderModal(id, duplicate=false){ const isEdit=Boolean(id)&&!duplicate; const old=id?state.orders.find(o=>o.id===id):null; const order=old?JSON.parse(JSON.stringify(old)):null; const initialLines=order?.lines?.length?order.lines:[emptyOrderLine()]; openModal({title:isEdit?'Modifica ordine distributore':duplicate?'Duplica ordine distributore':'Nuovo ordine distributore',subtitle:'Inserisci prima la data. Non devi scegliere nessun numero ordine: viene creato un codice interno automatico.',body:`<div class="form-grid order-meta-grid">${field('Data ordine','orderDate',order?.date||todayISO(),'date')}<div class="field"><label>Distributore</label><div style="display:flex; gap:8px"><select id="f_orderDistributor">${activeDistributors().map(d=>`<option value="${d.id}" ${order?.distributorId===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select><button class="btn secondary" id="addDistributorInOrder" type="button">+</button></div></div>${field('Sconto ordine proposto','orderDiscountPreset',order?.discountPreset||distributorDefaultDiscount(order?.distributorId||activeDistributors()[0]?.id)||'none','selectPairs',DISCOUNT_PRESETS)}<div class="field"><label>Cliente associato, opzionale</label><div style="display:flex; gap:8px"><select id="f_orderCustomer"><option value="">Nessun cliente</option>${activeCustomers().map(c=>`<option value="${c.id}" ${order?.customerId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select><button class="btn secondary" id="addCustomerInOrder" type="button">+</button></div></div>${field('Stato','orderStatus',order?.status||'ricevuto','select',['bozza','ricevuto'])}${field('Pagamento','orderPaymentStatus',order?.paymentStatus||'da pagare','select',['da pagare','pagato'])}</div><div class="section-head"><h2>Referenze</h2><button class="btn secondary" id="addOrderLineBtn" type="button">Aggiungi riga</button></div><div id="orderLines"></div><div class="modal-inline-actions bottom-add-row"><button class="btn secondary" id="addOrderLineBottomBtn" type="button">Aggiungi vino</button></div><div class="summary-box" id="orderTotals" style="margin-top:16px"></div><div class="field" style="margin-top:14px"><label>Note</label><textarea id="f_orderNotes">${esc(order?.notes||'')}</textarea></div>`,primary:isEdit?'Salva modifiche':'Salva ordine',onPrimary:()=>saveOrderFromModal(isEdit?old:null)}); window.__orderLines=initialLines.map(l=>({...emptyOrderLine(),...l})); if(!old){ const preset=val('orderDiscountPreset')||'none'; window.__orderLines=window.__orderLines.map(l=>({...l,discountPreset:preset})); } renderOrderLines(); document.getElementById('addOrderLineBtn').addEventListener('click',()=>{ window.__orderLines.push(emptyOrderLine()); renderOrderLines(); }); document.getElementById('addOrderLineBottomBtn')?.addEventListener('click',()=>{ syncOrderLinesFromDom(); window.__orderLines.push(emptyOrderLine()); renderOrderLines(); setTimeout(()=>document.querySelector('#orderLines .order-line-card:last-child input, #orderLines .order-line-card:last-child select')?.focus(),0); }); document.getElementById('f_orderDistributor').addEventListener('change',()=>{ const preset=distributorDefaultDiscount(val('orderDistributor')); const discountField=document.getElementById('f_orderDiscountPreset'); if(discountField && !isEdit) discountField.value=preset||'none'; }); document.getElementById('f_orderDiscountPreset')?.addEventListener('change',()=>{ syncOrderLinesFromDom(); const preset=val('orderDiscountPreset')||'none'; window.__orderLines=window.__orderLines.map(l=>({...l,discountPreset:preset,discount1:0,discount2:0,discount3:0})); renderOrderLines(); }); document.getElementById('addDistributorInOrder').addEventListener('click',()=>quickAddDistributor((id,name)=>{ const select=document.getElementById('f_orderDistributor'); select.insertAdjacentHTML('beforeend',`<option value="${id}">${esc(name)}</option>`); select.value=id; const df=document.getElementById('f_orderDiscountPreset'); if(df) df.value=distributorDefaultDiscount(id)||'none'; })); document.getElementById('addCustomerInOrder').addEventListener('click',()=>quickAddCustomer((id,name)=>{ const select=document.getElementById('f_orderCustomer'); select.insertAdjacentHTML('beforeend',`<option value="${id}">${esc(name)}</option>`); select.value=id; })); bindFormEnhancements(); }
  function emptyOrderLine(){ return {code:'',name:'',producer:'',vintage:'',size:'0.75',tag:'bianco',netUnitPrice:0,discountPreset:val('orderDiscountPreset')||'none',discount1:0,discount2:0,discount3:0,resalePrice:0,quantity:1,vatRate:state.settings.vatRate}; }
  function renderOrderLines(){ const root=document.getElementById('orderLines'); root.innerHTML=window.__orderLines.map((l,i)=>`<div class="order-line" data-index="${i}"><div class="line-head"><strong>Vino ${i+1}</strong><div class="actions"><button class="btn small ghost" data-line-action="duplicate" data-index="${i}">Duplica</button><button class="btn small secondary" data-line-action="remove" data-index="${i}">Elimina</button></div></div><div class="order-line-grid">${field('Codice',`l_${i}_code`,l.code,'text')}${field('Nome vino',`l_${i}_name`,l.name,'text')}${field('Cantina',`l_${i}_producer`,l.producer,'text')}${field('Annata',`l_${i}_vintage`,l.vintage,'text')}${field('Dimensione',`l_${i}_size`,l.size,'select',['0.75','1.5l','1l','magnum','altro'])}${field('Tag',`l_${i}_tag`,l.tag,'select',TAGS)}${field('Listino no IVA',`l_${i}_netUnitPrice`,l.netUnitPrice,'number')}${field('Sconto',`l_${i}_discountPreset`,l.discountPreset||'none','selectPairs',DISCOUNT_PRESETS)}${field('Manuale 1 %',`l_${i}_discount1`,l.discount1||0,'number')}${field('Manuale 2 %',`l_${i}_discount2`,l.discount2||0,'number')}${field('Manuale 3 %',`l_${i}_discount3`,l.discount3||0,'number')}${field('Resell Ambiguo',`l_${i}_resalePrice`,l.resalePrice||0,'number')}${field('Quantità',`l_${i}_quantity`,l.quantity,'number')}${field('IVA %',`l_${i}_vatRate`,l.vatRate,'number')}</div><div class="summary-box line-summary soft-summary" id="line_total_${i}"></div></div>`).join(''); root.querySelectorAll('[data-line-action]').forEach(btn=>btn.addEventListener('click',()=>{ syncOrderLinesFromDom(); const i=Number(btn.dataset.index); if(btn.dataset.lineAction==='remove'&&window.__orderLines.length>1) window.__orderLines.splice(i,1); if(btn.dataset.lineAction==='duplicate'){ const copy={...window.__orderLines[i],id:S.uuid(),sourceWineId:'',sourceOrderLineId:S.uuid()}; window.__orderLines.splice(i+1,0,copy); } renderOrderLines(); })); root.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',()=>{ syncOrderLinesFromDom(); updateOrderTotals(); })); updateOrderTotals(); }
  function syncOrderLinesFromDom(){ window.__orderLines=window.__orderLines.map((l,i)=>({id:l.id,sourceWineId:l.sourceWineId||'',sourceOrderLineId:l.sourceOrderLineId||l.id||'',manualStock:Boolean(l.manualStock),code:val(`l_${i}_code`),name:val(`l_${i}_name`),producer:val(`l_${i}_producer`),vintage:val(`l_${i}_vintage`),size:val(`l_${i}_size`),tag:val(`l_${i}_tag`),netUnitPrice:parseAmount(val(`l_${i}_netUnitPrice`)),discountPreset:val(`l_${i}_discountPreset`)||'none',discount1:parseAmount(val(`l_${i}_discount1`)),discount2:parseAmount(val(`l_${i}_discount2`)),discount3:parseAmount(val(`l_${i}_discount3`)),resalePrice:parseAmount(val(`l_${i}_resalePrice`)),quantity:intQty(val(`l_${i}_quantity`)),vatRate:parseAmount(val(`l_${i}_vatRate`)||state.settings.vatRate)})); }
  function updateOrderTotals(){ let quantity=0, listTotal=0, discountTotal=0, netTotal=0, vatTotal=0, grossTotal=0, resaleTotal=0; window.__orderLines.forEach((l,i)=>{ const t=lineTotals(l); quantity+=Number(l.quantity||0); listTotal+=t.listUnit*Number(l.quantity||0); discountTotal+=t.discountTotal; netTotal+=t.netTotal; vatTotal+=t.vatTotal; grossTotal+=t.grossTotal; resaleTotal+=t.resaleTotal; const el=document.getElementById(`line_total_${i}`); if(el) el.innerHTML=`<div class="summary-row"><span>Sconto</span><strong>${discountLabel(l)}</strong></div><div class="summary-row"><span>Netto scontato</span><strong>${money(t.netUnit)}</strong></div><div class="summary-row"><span>Con IVA / bottiglia</span><strong>${money(t.grossUnit)}</strong></div><div class="summary-row"><span>Totale riga</span><strong>${money(t.grossTotal)}</strong></div>`; }); const root=document.getElementById('orderTotals'); if(root) root.innerHTML=`<div class="summary-row"><span>Bottiglie</span><strong>${number(quantity)}</strong></div><div class="summary-row"><span>Listino no IVA</span><strong>${money(listTotal)}</strong></div><div class="summary-row"><span>Sconti</span><strong>${money(discountTotal)}</strong></div><div class="summary-row"><span>Totale no IVA</span><strong>${money(netTotal)}</strong></div><div class="summary-row"><span>IVA</span><strong>${money(vatTotal)}</strong></div><div class="summary-row"><span>Totale con IVA</span><strong>${money(grossTotal)}</strong></div><div class="summary-row"><span>Valore resell</span><strong>${money(resaleTotal)}</strong></div>`; }
  function saveOrderFromModal(existing){
    syncOrderLinesFromDom();
    const previousOrder = existing ? JSON.parse(JSON.stringify(existing)) : null;
    const oldLines = previousOrder?.lines || [];
    const lines=window.__orderLines
      .filter(l=>l.code||l.name||l.producer)
      .map(l=>{ const lineId=l.sourceOrderLineId||l.id||S.uuid(); return {...l,id:l.id||lineId,sourceOrderLineId:lineId,sourceWineId:l.sourceWineId||''}; });

    if(!lines.length) return toast('Aggiungi almeno una riga.');
    for(const l of lines){
      if(!l.code||!l.name||!l.producer) return toast('Ogni riga deve avere codice, nome vino e cantina.');
      if(l.quantity<=0) return toast('La quantità deve essere maggiore di zero.');
      if(l.netUnitPrice<0||Number.isNaN(l.netUnitPrice)) return toast('Prezzo non valido.');
      if([l.discount1,l.discount2,l.discount3].some(d=>Number(d)<0||Number(d)>=100)) return toast('Gli sconti devono essere tra 0 e 99,99%.');
    }

    const order={id:existing?.id||S.uuid(),code:existing?.code||nextCode('ORD',state.orders),distributorId:val('orderDistributor'),customerId:val('orderCustomer'),date:val('orderDate'),status:val('orderStatus'),paymentStatus:val('orderPaymentStatus'),discountPreset:val('orderDiscountPreset')||'none',notes:val('orderNotes'),lines,totals:calculateOrderTotals(lines),createdAt:existing?.createdAt||S.now(),updatedAt:S.now(),demo:existing?.demo||false,manualStock:Boolean(existing?.manualStock)};

    if(existing) Object.assign(existing,order); else state.orders.push(order);

    if(order.status==='ricevuto'){
      reconcileOrderWithCellar(order, oldLines, previousOrder?.status);
    }

    cleanupEmptyOrderWines();
    save(); closeModal(); toast(existing?'Ordine aggiornato.':'Ordine salvato.'); render();
  }

  function orderLineKey(l){ return l?.sourceWineId || l?.id || l?.sourceOrderLineId || ''; }
  function findWineForOrderLine(l, order){
    if(l.sourceWineId){ const byId=getWine(l.sourceWineId); if(byId) return byId; }
    const byLine=state.wines.find(w=>w.sourceOrderId===order.id && w.sourceOrderLineId && w.sourceOrderLineId===(l.sourceOrderLineId||l.id));
    if(byLine) return byLine;
    return state.wines.find(w=>w.sourceOrderId===order.id && norm(w.code)===norm(l.code) && norm(w.name)===norm(l.name) && norm(w.producer)===norm(l.producer) && String(w.vintage||'')===String(l.vintage||'') && String(w.size||'')===String(l.size||''));
  }

  function applyOrderFieldsToWine(w,l,order){
    Object.assign(w,{code:l.code,name:l.name,producer:l.producer,vintage:l.vintage,size:l.size,tag:l.tag,distributorId:order.distributorId,netUnitPrice:Number(l.netUnitPrice||0),discountPreset:l.discountPreset||'none',discount1:Number(l.discount1||0),discount2:Number(l.discount2||0),discount3:Number(l.discount3||0),resalePrice:Number(l.resalePrice||0),vatRate:Number(l.vatRate||state.settings.vatRate),sourceOrderId:order.id,sourceOrderLineId:l.sourceOrderLineId||l.id,lastOrderDate:order.date,updatedAt:S.now(),demo:order.demo||w.demo||false});
    l.sourceWineId=w.id;
    l.sourceOrderLineId=w.sourceOrderLineId;
  }

  function reconcileOrderWithCellar(order, oldLines=[], previousStatus){
    const oldByKey=new Map(oldLines.map(l=>[orderLineKey(l), l]));
    const newKeys=new Set(order.lines.map(orderLineKey));

    // Righe tolte dall'ordine: scarica solo la quantità vecchia dalla cantina collegata.
    oldLines.forEach(old=>{
      const key=orderLineKey(old);
      if(!key || newKeys.has(key)) return;
      const w=findWineForOrderLine(old, order);
      if(w){
        w.quantity=intQty(w.quantity)-intQty(old.quantity);
        addMovement(w.id,-intQty(old.quantity),'rettifica modifica ordine',todayISO(),`Riga rimossa da ${order.code}`,'order',order.id);
      }
    });

    order.lines.forEach(l=>{
      const key=orderLineKey(l);
      const previousLine=oldByKey.get(key) || null;
      let w=findWineForOrderLine(l, order);
      // Se la riga è stata modificata nei campi chiave (codice/nome/cantina/annata),
      // la ricerca con i nuovi valori può non trovare il vino vecchio. In quel caso
      // usiamo la riga precedente per recuperare il vino già collegato e mantenerlo coerente.
      if(!w && previousLine) w=findWineForOrderLine(previousLine, order);
      if(!w){
        w={id:S.uuid(),notes:'',archived:false,createdAt:S.now(),quantity:0};
        state.wines.push(w);
      }

      const previousQty = previousStatus==='ricevuto' && previousLine ? intQty(previousLine.quantity) : 0;
      const delta = intQty(l.quantity) - previousQty;
      applyOrderFieldsToWine(w,l,order);
      if(delta!==0){
        w.quantity=intQty(w.quantity)+delta;
        addMovement(w.id,delta,delta>0?'acquisto':'rettifica modifica ordine',order.date||todayISO(),`Ordine ${order.code}`,'order',order.id);
      }
    });

    order.totals=calculateOrderTotals(order.lines||[]);
  }

  function reverseOrderStock(order){
    order.lines.forEach(l=>{
      const wine=findWineForOrderLine(l, order);
      if(wine){
        wine.quantity=intQty(wine.quantity)-intQty(l.quantity);
        addMovement(wine.id,-intQty(l.quantity),'rettifica eliminazione ordine',todayISO(),`Eliminazione ordine ${order.code}`,'order',order.id);
      }
    });
  }

  function upsertWineFromOrderLine(l,order){
    const line={...l,id:l.id||S.uuid(),sourceOrderLineId:l.sourceOrderLineId||l.id||S.uuid()};
    const previous=[];
    reconcileOrderWithCellar({...order,lines:[line]}, previous, 'bozza');
  }

  function updateLinkedOrderLineFromWine(w, previous){
    if(!w || !w.sourceOrderId) return;
    const order=state.orders.find(o=>o.id===w.sourceOrderId);
    if(!order) return;

    let line=(order.lines||[]).find(l=>
      l.sourceWineId===w.id ||
      (w.sourceOrderLineId && (l.sourceOrderLineId===w.sourceOrderLineId || l.id===w.sourceOrderLineId))
    );

    // Fallback per dati vecchi dove mancavano sourceWineId/sourceOrderLineId.
    if(!line){
      line=(order.lines||[]).find(l=>
        norm(l.code)===norm(previous?.code||w.code) &&
        norm(l.name)===norm(previous?.name||w.name) &&
        norm(l.producer)===norm(previous?.producer||w.producer) &&
        String(l.vintage||'')===String(previous?.vintage||w.vintage||'') &&
        String(l.size||'')===String(previous?.size||w.size||'')
      );
    }
    if(!line) return;

    // Manteniamo collegamento stabile tra Cantina e riga ordine.
    line.sourceWineId=w.id;
    line.sourceOrderLineId=w.sourceOrderLineId||line.sourceOrderLineId||line.id||S.uuid();
    w.sourceOrderLineId=line.sourceOrderLineId;

    // Qualsiasi modifica effettuata in Cantina viene riflessa sulla riga ordine collegata.
    Object.assign(line,{
      code:w.code,
      name:w.name,
      producer:w.producer,
      vintage:w.vintage,
      size:w.size,
      tag:w.tag,
      netUnitPrice:Number(w.netUnitPrice||0),
      discountPreset:w.discountPreset||'none',
      discount1:Number(w.discount1||0),
      discount2:Number(w.discount2||0),
      discount3:Number(w.discount3||0),
      resalePrice:Number(w.resalePrice||0),
      quantity:intQty(w.quantity),
      vatRate:Number(w.vatRate||state.settings.vatRate)
    });

    // Importante: non spostiamo l'ordine e non cambiamo data/distributore dell'ordine storico.
    // Se cambiano distributore o data sul vino, restano attributi del vino, non creano nuovi ordini.
    order.totals=calculateOrderTotals(order.lines||[]);
    order.updatedAt=S.now();
  }

  function calculateOrderTotals(lines){ return lines.reduce((acc,l)=>{ const t=lineTotals(l); acc.quantity+=Number(l.quantity); acc.listTotal+=t.listUnit*Number(l.quantity||0); acc.discountTotal+=t.discountTotal; acc.netTotal+=t.netTotal; acc.vatTotal+=t.vatTotal; acc.grossTotal+=t.grossTotal; acc.resaleTotal+=t.resaleTotal; return acc; },{quantity:0,listTotal:0,discountTotal:0,netTotal:0,vatTotal:0,grossTotal:0,resaleTotal:0}); }
  function lineIdentity(l){ return [norm(l.code),norm(l.name),norm(l.producer),String(l.vintage||''),String(l.size||'')].join('|'); }

  function wineToOrderLine(w){
    const id=w.sourceOrderLineId||S.uuid();
    return {id,sourceOrderLineId:id,sourceWineId:w.id,manualStock:true,code:w.code,name:w.name,producer:w.producer,vintage:w.vintage,size:w.size,tag:w.tag,netUnitPrice:parseAmount(w.netUnitPrice),discountPreset:w.discountPreset||'none',discount1:parseAmount(w.discount1),discount2:parseAmount(w.discount2),discount3:parseAmount(w.discount3),resalePrice:parseAmount(w.resalePrice),quantity:intQty(w.quantity),vatRate:parseAmount(w.vatRate||state.settings.vatRate)};
  }
  function syncManualWineOrder(w, previous){
    if(!w || !w.distributorId || !w.lastOrderDate) return;

    // Se il vino era già collegato a un ordine, NON creare/spostare ordini:
    // aggiorna solo la riga già collegata nello stesso ordine.
    if(previous && previous.sourceOrderId){
      w.sourceOrderId=previous.sourceOrderId;
      w.sourceOrderLineId=previous.sourceOrderLineId;
      w.manualStock=Boolean(previous.manualStock);
      updateLinkedOrderLineFromWine(w, previous);
      return;
    }

    // Solo un vino nuovo inserito manualmente in Cantina genera/aggiorna ordine automatico.
    let order=state.orders.find(o=>o.manualStock && o.distributorId===w.distributorId && String(o.date||'')===String(w.lastOrderDate||''));
    if(!order){
      order={id:S.uuid(),code:nextCode('ORD',state.orders),distributorId:w.distributorId,customerId:'',date:w.lastOrderDate,status:'ricevuto',paymentStatus:'da pagare',discountPreset:w.discountPreset||distributorDefaultDiscount(w.distributorId)||'none',notes:'Creato automaticamente da inserimento manuale in cantina.',manualStock:true,lines:[],createdAt:S.now()};
      state.orders.push(order);
    }
    const line=wineToOrderLine(w);
    const idx=order.lines.findIndex(l=>l.sourceWineId===w.id || l.sourceOrderLineId===w.sourceOrderLineId);
    if(idx>=0) order.lines[idx]=line; else order.lines.push(line);
    w.sourceOrderId=order.id;
    w.sourceOrderLineId=line.sourceOrderLineId;
    w.manualStock=true;
    order.totals=calculateOrderTotals(order.lines||[]);
    order.updatedAt=S.now();
  }
  function cleanupEmptyOrderWines(){
    const protectedIds=new Set();
    state.sales.forEach(s=>(s.lines||[]).forEach(l=>protectedIds.add(l.wineId)));
    state.orders.forEach(o=>{ (o.lines||[]).forEach(l=>{ if(l.sourceWineId) protectedIds.add(l.sourceWineId); }); o.totals=calculateOrderTotals(o.lines||[]); });
    state.wines=state.wines.filter(w=> intQty(w.quantity)>0 || protectedIds.has(w.id) || !w.sourceOrderId);
  }
  function repairOrderCellarLinks(){
    let changed=false;
    state.orders.forEach(order=>{
      order.lines = Array.isArray(order.lines) ? order.lines : [];
      order.lines.forEach(line=>{
        if(!line.id) { line.id=S.uuid(); changed=true; }
        if(!line.sourceOrderLineId) { line.sourceOrderLineId=line.id; changed=true; }

        let wine = line.sourceWineId ? getWine(line.sourceWineId) : null;
        if(!wine){
          wine = state.wines.find(w=>
            w.sourceOrderId===order.id &&
            (w.sourceOrderLineId===line.sourceOrderLineId ||
              (norm(w.code)===norm(line.code) && norm(w.name)===norm(line.name) && norm(w.producer)===norm(line.producer) && String(w.vintage||'')===String(line.vintage||'') && String(w.size||'')===String(line.size||'')))
          );
        }
        if(!wine && order.status==='ricevuto'){
          wine={id:S.uuid(),notes:'',archived:false,createdAt:S.now(),quantity:intQty(line.quantity||0)};
          state.wines.push(wine);
          addMovement(wine.id,intQty(line.quantity||0),'riparazione collegamento ordine',order.date||todayISO(),`Collegamento ricostruito da ${order.code}`,'order',order.id);
          changed=true;
        }
        if(wine){
          line.sourceWineId=wine.id;
          wine.sourceOrderId=order.id;
          wine.sourceOrderLineId=line.sourceOrderLineId;
          applyOrderFieldsToWine(wine,line,order);
          changed=true;
        }
      });
      const totals=calculateOrderTotals(order.lines||[]);
      if(JSON.stringify(order.totals||{})!==JSON.stringify(totals)){ order.totals=totals; changed=true; }
    });
    return changed;
  }

  function quickAddDistributor(callback){ const name=prompt('Nome nuovo distributore'); if(!name) return; const d={id:S.uuid(),name:name.trim(),discountPreset:'none',archived:false,notes:'',createdAt:S.now()}; state.distributors.push(d); save(); toast('Distributore aggiunto.'); callback?.(d.id,d.name); }
  function quickAddCustomer(callback){ const name=prompt('Nome nuovo cliente'); if(!name) return; const c={id:S.uuid(),name:name.trim(),type:'privato',email:'',phone:'',notes:'',archived:false,createdAt:S.now()}; state.customers.push(c); save(); toast('Cliente aggiunto.'); callback?.(c.id,c.name); }
  function openDistributorModal(id){ const d=id?state.distributors.find(x=>x.id===id):{id:S.uuid(),name:'',discountPreset:'none',notes:'',archived:false}; openModal({title:id?'Modifica distributore':'Nuovo distributore',body:`<div class="form-grid one">${field('Nome','distName',d.name,'text')}${field('Sconto predefinito','distDiscountPreset',d.discountPreset||'none','selectPairs',DISCOUNT_PRESETS)}<div class="field"><label>Note</label><textarea id="f_distNotes">${esc(d.notes||'')}</textarea></div>${field('Stato','distArchived',String(Boolean(d.archived)),'selectPairs',[['false','Attivo'],['true','Archiviato']])}</div>`,primary:'Salva',onPrimary:()=>{ if(!val('distName').trim()) return toast('Inserisci il nome.'); Object.assign(d,{name:val('distName').trim(),discountPreset:val('distDiscountPreset')||'none',notes:val('distNotes'),archived:val('distArchived')==='true',updatedAt:S.now()}); if(!id) state.distributors.push({...d,createdAt:S.now()}); save(); closeModal(); toast('Distributore salvato.'); render(); }}); }
  function openCustomerModal(id){ const c=id?state.customers.find(x=>x.id===id):{id:S.uuid(),name:'',type:'privato',email:'',phone:'',address:'',vat:'',taxCode:'',notes:'',archived:false}; openModal({title:id?'Modifica cliente':'Nuovo cliente',body:`<div class="form-grid">${field('Nome / ragione sociale','customerName',c.name,'text')}${field('Tipologia','customerType',c.type,'select',CUSTOMER_TYPES)}${field('Email','customerEmail',c.email,'text')}${field('Telefono','customerPhone',c.phone,'text')}<div class="field" style="grid-column:1/-1"><label>Indirizzo</label><input id="f_customerAddress" value="${esc(c.address||'')}"></div>${field('Partita IVA','customerVat',c.vat,'text')}${field('Codice fiscale','customerTaxCode',c.taxCode,'text')}<div class="field" style="grid-column:1/-1"><label>Note</label><textarea id="f_customerNotes">${esc(c.notes||'')}</textarea></div>${field('Stato','customerArchived',String(Boolean(c.archived)),'selectPairs',[['false','Attivo'],['true','Archiviato']])}</div>`,primary:'Salva',onPrimary:()=>{ if(!val('customerName').trim()) return toast('Inserisci il nome cliente.'); Object.assign(c,{name:val('customerName').trim(),type:val('customerType'),email:val('customerEmail'),phone:val('customerPhone'),address:val('customerAddress'),vat:val('customerVat'),taxCode:val('customerTaxCode'),notes:val('customerNotes'),archived:val('customerArchived')==='true',updatedAt:S.now()}); if(!id) state.customers.push({...c,createdAt:S.now()}); save(); closeModal(); toast('Cliente salvato.'); render(); }}); }
  function openHistory(id){ const w=getWine(id); const rows=state.movements.filter(m=>m.wineId===id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))); openModal({title:`Storico — ${w?.name||''}`,subtitle:w?`${w.code} · ${w.producer}`:'',body:rows.length?`<div class="table-scroll"><table><thead><tr><th>Data</th><th>Tipo</th><th>Quantità</th><th>Origine</th><th>Nota</th></tr></thead><tbody>${rows.map(m=>`<tr><td>${dateIT(m.date)}</td><td>${esc(m.type)}</td><td>${m.quantityChange>0?'+':''}${number(m.quantityChange)}</td><td>${esc(m.sourceType||'manuale')}</td><td>${esc(m.note||'—')}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">Nessun movimento.</div>`,primary:'Chiudi',onPrimary:closeModal}); }


  function availableWineOptions(selectedId=''){
    return state.wines
      .filter(w=>!w.archived && (intQty(w.quantity)>0 || w.id===selectedId))
      .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')))
      .map(w=>[w.id, `${w.code || '—'} — ${w.name || 'Senza nome'} · ${w.producer || '—'} · ${w.vintage || '—'} (${intQty(w.quantity)} disp.)`]);
  }


  function saleWineSearchField(index, selectedId, options){
    const selected=options.find(([id])=>String(id)===String(selectedId));
    const selectedLabel=selected ? selected[1] : '';
    const payload=encodeURIComponent(JSON.stringify(options));
    return `<div class="field sale-wine-picker" style="grid-column:span 2">
      <label>Vino</label>
      <div class="wine-search-row" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center">
        <input id="f_s_${index}_wineSearch" class="wine-search-input" type="search" list="f_s_${index}_wineList" autocomplete="off" placeholder="Cerca codice, vino, cantina, annata..." value="${esc(selectedLabel)}" data-all-options="${esc(payload)}">
        <input id="f_s_${index}_wineId" type="hidden" value="${esc(selectedId||'')}">
        <button class="btn small secondary wine-search-select-btn" type="button" data-index="${index}">Cerca</button>
        <datalist id="f_s_${index}_wineList">
          ${options.map(([v,lab])=>`<option value="${esc(lab)}" data-id="${esc(v)}"></option>`).join('')}
        </datalist>
      </div>
    </div>`;
  }

  function decodeWineOptionsFromInput(input){
    try { return JSON.parse(decodeURIComponent(input.dataset.allOptions || '%5B%5D')); }
    catch(err){ return []; }
  }

  function findWineOptionByQuery(options, query){
    const q=String(query||'').toLowerCase().trim();
    if(!q) return null;
    const exact=options.find(([,label])=>String(label||'').toLowerCase()===q);
    if(exact) return exact;
    const starts=options.find(([,label])=>String(label||'').toLowerCase().startsWith(q));
    if(starts) return starts;
    return options.find(([,label])=>String(label||'').toLowerCase().includes(q)) || null;
  }

  function selectWineFromSearch(box, forceFirst=false){
    const input=box.querySelector('.wine-search-input');
    const hidden=box.querySelector('input[type="hidden"][id$="_wineId"]');
    if(!input || !hidden) return false;
    const all=decodeWineOptionsFromInput(input);
    const match=findWineOptionByQuery(all, input.value) || (forceFirst ? all[0] : null);
    if(!match) { toast('Nessun vino trovato.'); return false; }
    hidden.value=match[0];
    input.value=match[1];
    hidden.dispatchEvent(new Event('change', { bubbles:true }));
    return true;
  }

  function bindSaleWineSearch(){
    document.querySelectorAll('.sale-wine-picker').forEach(box=>{
      const input=box.querySelector('.wine-search-input');
      const hidden=box.querySelector('input[type="hidden"][id$="_wineId"]');
      const btn=box.querySelector('.wine-search-select-btn');
      const list=box.querySelector('datalist');
      if(!input || !hidden) return;
      const all=decodeWineOptionsFromInput(input);

      const refreshList=()=>{
        if(!list) return;
        const q=String(input.value||'').toLowerCase().trim();
        const filtered=(q ? all.filter(([,label])=>String(label||'').toLowerCase().includes(q)) : all).slice(0,40);
        list.innerHTML=filtered.map(([v,lab])=>`<option value="${esc(lab)}" data-id="${esc(v)}"></option>`).join('');
      };

      input.addEventListener('input',()=>{
        refreshList();
        const exact=findWineOptionByQuery(all, input.value);
        if(exact && String(input.value).length>2){
          hidden.value=exact[0];
        }
      });
      input.addEventListener('keydown',e=>{
        if(e.key==='Enter'){
          e.preventDefault();
          selectWineFromSearch(box, true);
        }
      });
      input.addEventListener('change',()=>{
        selectWineFromSearch(box, false);
      });
      btn?.addEventListener('click',()=>selectWineFromSearch(box, true));
    });
  }

  function emptySaleLine(){
    const first=state.wines.find(w=>!w.archived && intQty(w.quantity)>0) || state.wines.find(w=>!w.archived) || null;
    return {
      id:S.uuid(),
      wineId:first?.id || '',
      quantity:1,
      unitPrice:Number(first?.resalePrice||0),
      discount:0,
      costTotal:0,
      manualPrice:false
    };
  }

  function calculateSaleTotals(lines){
    return (lines||[]).reduce((acc,l)=>{
      const t=saleLineTotals(l);
      acc.quantity+=intQty(l.quantity||0);
      acc.theoretical+=t.theoretical;
      acc.discount+=parseAmount(l.discount||0);
      acc.total+=t.total;
      acc.cost+=t.cost;
      acc.margin+=t.margin;
      return acc;
    },{quantity:0,theoretical:0,discount:0,total:0,cost:0,margin:0});
  }

  function saleShouldAffectStock(sale){
    return sale && !['bozza','annullato'].includes(String(sale.status||''));
  }

  function reverseSaleStock(sale){
    if(!sale || sale.stockReversed) return;
    (sale.lines||[]).forEach(l=>{
      const w=getWine(l.wineId);
      const qty=intQty(l.quantity||0);
      if(w && qty>0){
        w.quantity=intQty(w.quantity)+qty;
        addMovement(w.id,qty,'rettifica annullamento vendita',sale.date||todayISO(),`Ripristino ${sale.code||'ordine cliente'}`,'sale',sale.id);
      }
    });
    sale.stockApplied=false;
    sale.stockReversed=true;
  }

  function applySaleStock(sale){
    if(!sale || sale.stockApplied) return true;
    for(const l of sale.lines||[]){
      const w=getWine(l.wineId);
      const qty=intQty(l.quantity||0);
      if(!w) { toast('Un vino selezionato non esiste più in cantina.'); return false; }
      if(qty<=0) { toast('Ogni riga cliente deve avere quantità maggiore di zero.'); return false; }
      if(!state.settings.allowNegativeStock && intQty(w.quantity)<qty){
        toast(`Stock insufficiente per ${w.name}: disponibili ${intQty(w.quantity)}, richieste ${qty}.`);
        return false;
      }
    }
    (sale.lines||[]).forEach(l=>{
      const w=getWine(l.wineId);
      const qty=intQty(l.quantity||0);
      const historicalCost=lineTotals(w).grossUnit*qty;
      l.costTotal=round2(historicalCost);
      w.quantity=intQty(w.quantity)-qty;
      addMovement(w.id,-qty,'vendita',sale.date||todayISO(),`Ordine cliente ${sale.code||''}`,'sale',sale.id);
    });
    sale.stockApplied=true;
    sale.stockReversed=false;
    sale.totals=calculateSaleTotals(sale.lines||[]);
    return true;
  }

  function openSaleModal(id, duplicate=false){
    const old=id?state.sales.find(s=>s.id===id):null;
    const isEdit=Boolean(old)&&!duplicate;
    const source=old?JSON.parse(JSON.stringify(old)):null;
    const sale=source&&!duplicate?source:null;
    const initialLines=(source?.lines?.length?source.lines:[emptySaleLine()]).map(l=>({
      id: duplicate ? S.uuid() : (l.id||S.uuid()),
      wineId:l.wineId||'',
      quantity:intQty(l.quantity||1),
      unitPrice:parseAmount(l.unitPrice ?? getWine(l.wineId)?.resalePrice ?? 0),
      discount:parseAmount(l.discount||0),
      costTotal:duplicate ? 0 : Number(l.costTotal||0),
      manualPrice:Boolean(l.manualPrice)
    }));

    openModal({
      title:isEdit?'Modifica ordine cliente':duplicate?'Duplica ordine cliente':'Nuovo ordine cliente',
      subtitle:'Il prezzo proposto arriva dal resell Ambiguo, ma puoi modificarlo manualmente riga per riga.',
      body:`<div class="form-grid order-meta-grid">
        <div class="field"><label>Cliente</label><div style="display:flex; gap:8px"><select id="f_saleCustomer"><option value="">Nessun cliente</option>${activeCustomers().map(c=>`<option value="${c.id}" ${source?.customerId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select><button class="btn secondary" id="addCustomerInSale" type="button">+</button></div></div>
        ${field('Data','saleDate',source?.date||todayISO(),'date')}
        ${field('Stato','saleStatus',source?.status||'pagato','select',SALE_STATUSES)}
        ${field('Metodo pagamento','salePaymentMethod',source?.paymentMethod||'cash','select',PAYMENT_METHODS)}
        ${field('Mandati a','salePaymentRecipient',source?.paymentRecipient||'Marco','select',PAYMENT_RECIPIENTS)}
      </div>
      <div class="section-head"><h2>Vini</h2><button class="btn secondary" id="addSaleLineBtn" type="button">Aggiungi vino</button></div>
      <div id="saleLines"></div>
      <div class="summary-box soft-summary" id="saleTotals" style="margin-top:16px"></div>
      <div class="field" style="margin-top:14px"><label>Note</label><textarea id="f_saleNotes">${esc(source?.notes||'')}</textarea></div>`,
      primary:isEdit?'Salva modifiche':'Salva ordine cliente',
      footerLeft:'<button class="btn secondary" id="addSaleLineBottomBtn" type="button">+ Aggiungi vino</button>',
      onPrimary:()=>saveSaleFromModal(isEdit?old:null, source)
    });

    window.__saleLines=initialLines;
    renderSaleLines();
    const addSaleLine=()=>{ syncSaleLinesFromDom(); window.__saleLines.push(emptySaleLine()); renderSaleLines(); };
    document.getElementById('addSaleLineBtn')?.addEventListener('click',addSaleLine);
    document.getElementById('addSaleLineBottomBtn')?.addEventListener('click',addSaleLine);
    document.getElementById('addCustomerInSale')?.addEventListener('click',()=>quickAddCustomer((cid,name)=>{ const sel=document.getElementById('f_saleCustomer'); sel.insertAdjacentHTML('beforeend',`<option value="${cid}">${esc(name)}</option>`); sel.value=cid; }));
    bindFormEnhancements();
  }

  function renderSaleLines(){
    const root=document.getElementById('saleLines');
    if(!root) return;
    root.innerHTML=window.__saleLines.map((l,i)=>{
      const w=getWine(l.wineId);
      const options=availableWineOptions(l.wineId);
      return `<div class="order-line sale-line" data-index="${i}">
        <div class="line-head"><strong>Vino ${i+1}</strong><div class="actions"><button class="btn small ghost" data-sale-line-action="duplicate" data-index="${i}" type="button">Duplica</button><button class="btn small secondary" data-sale-line-action="remove" data-index="${i}" type="button">Elimina</button></div></div>
        <div class="order-line-grid sale-line-grid">
          ${saleWineSearchField(i,l.wineId,options)}
          ${field('Disponibili',`s_${i}_available`,w?intQty(w.quantity):0,'number')}
          ${field('Quantità',`s_${i}_quantity`,l.quantity,'number')}
          ${field('Costo pagato IVA incl.',`s_${i}_grossCostUnit`,w?lineTotals(w).grossUnit:0,'number')}
          ${field('Costo selezionato',`s_${i}_grossCostTotal`,w?lineTotals(w).grossUnit*intQty(l.quantity||0):0,'number')}
          ${field('Prezzo resell base',`s_${i}_resaleBase`,w?Number(w.resalePrice||0):0,'number')}
          ${field('Prezzo applicato',`s_${i}_unitPrice`,l.unitPrice,'number')}
          ${field('Sconto €',`s_${i}_discount`,l.discount||0,'number')}
        </div>
        <div class="summary-box line-summary soft-summary" id="sale_line_total_${i}"></div>
      </div>`;
    }).join('');

    root.querySelectorAll('[id$="_available"],[id$="_resaleBase"],[id$="_grossCostUnit"],[id$="_grossCostTotal"]').forEach(el=>{ el.disabled=true; });
    root.querySelectorAll('[data-sale-line-action]').forEach(btn=>btn.addEventListener('click',()=>{
      syncSaleLinesFromDom();
      const i=Number(btn.dataset.index);
      if(btn.dataset.saleLineAction==='remove' && window.__saleLines.length>1) window.__saleLines.splice(i,1);
      if(btn.dataset.saleLineAction==='duplicate') window.__saleLines.splice(i+1,0,{...window.__saleLines[i],id:S.uuid(),costTotal:0});
      renderSaleLines();
    }));

    bindSaleWineSearch();
    root.querySelectorAll('input[id^="f_s_"][id$="_wineId"]').forEach(sel=>sel.addEventListener('change',()=>{
      const i=Number(sel.id.match(/f_s_(\d+)_wineId/)?.[1]||0);
      const w=getWine(sel.value);
      syncSaleLinesFromDom();
      window.__saleLines[i].wineId=sel.value;
      window.__saleLines[i].unitPrice=Number(w?.resalePrice||0);
      window.__saleLines[i].manualPrice=false;
      renderSaleLines();
    }));

    root.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',()=>{ syncSaleLinesFromDom(); updateSaleTotals(); }));
    updateSaleTotals();
    bindFormEnhancements();
  }

  function syncSaleLinesFromDom(){
    window.__saleLines=window.__saleLines.map((l,i)=>{
      const w=getWine(val(`s_${i}_wineId`));
      const unit=parseAmount(val(`s_${i}_unitPrice`));
      const base=Number(w?.resalePrice||0);
      return {
        id:l.id||S.uuid(),
        wineId:val(`s_${i}_wineId`),
        quantity:intQty(val(`s_${i}_quantity`)),
        unitPrice:unit,
        discount:parseAmount(val(`s_${i}_discount`)),
        costTotal:Number(l.costTotal||0),
        manualPrice:Math.abs(unit-base)>0.009
      };
    });
  }

  function updateSaleTotals(){
    let totals={quantity:0,theoretical:0,discount:0,total:0,cost:0,margin:0};
    (window.__saleLines||[]).forEach((l,i)=>{
      const w=getWine(l.wineId);
      const t=saleLineTotals(l);
      totals.quantity+=intQty(l.quantity||0);
      totals.theoretical+=t.theoretical;
      totals.discount+=parseAmount(l.discount||0);
      totals.total+=t.total;
      totals.cost+=t.cost;
      totals.margin=totals.total-totals.cost;
      const el=document.getElementById(`sale_line_total_${i}`);
      const grossCostUnit = w ? lineTotals(w).grossUnit : 0;
      const grossCostTotal = grossCostUnit * intQty(l.quantity||0);
      if(el) el.innerHTML=`<div class="summary-row"><span>Costo pagato / bottiglia</span><strong>${money(grossCostUnit)}</strong></div><div class="summary-row"><span>Costo selezionato</span><strong>${money(grossCostTotal)}</strong></div><div class="summary-row"><span>Resell base</span><strong>${money(w?.resalePrice||0)}</strong></div><div class="summary-row"><span>Prezzo applicato</span><strong>${money(l.unitPrice)}</strong></div><div class="summary-row"><span>Totale riga</span><strong>${money(t.total)}</strong></div>${l.manualPrice?`<div class="summary-row"><span>Nota</span><strong>Prezzo modificato manualmente</strong></div>`:''}`;
    });
    const root=document.getElementById('saleTotals');
    if(root) root.innerHTML=`<div class="summary-row"><span>Bottiglie</span><strong>${number(totals.quantity)}</strong></div><div class="summary-row"><span>Totale teorico</span><strong>${money(totals.theoretical)}</strong></div><div class="summary-row"><span>Sconti</span><strong>${money(totals.discount)}</strong></div><div class="summary-row"><span>Totale cliente</span><strong>${money(totals.total)}</strong></div><div class="summary-row"><span>Costo bottiglie</span><strong>${money(totals.cost)}</strong></div><div class="summary-row"><span>Margine</span><strong>${money(totals.margin)}</strong></div>`;
  }

  function saveSaleFromModal(existing, originalSnapshot){
    syncSaleLinesFromDom();
    const lines=(window.__saleLines||[]).filter(l=>l.wineId && intQty(l.quantity)>0);
    if(!lines.length) return toast('Aggiungi almeno un vino.');
    if(!val('saleCustomer')) return toast('Seleziona o crea un cliente.');
    for(const l of lines){
      const w=getWine(l.wineId);
      if(!w) return toast('Un vino selezionato non esiste.');
      if(parseAmount(l.unitPrice)<0) return toast('Prezzo applicato non valido.');
      if(parseAmount(l.discount)<0) return toast('Sconto non valido.');
    }

    if(existing && saleShouldAffectStock(existing)) reverseSaleStock(existing);

    const sale={
      id:existing?.id||S.uuid(),
      code:existing?.code||nextCode('CLI',state.sales),
      customerId:val('saleCustomer'),
      date:val('saleDate')||todayISO(),
      status:val('saleStatus')||'pagato',
      paymentMethod:val('salePaymentMethod')||'',
      paymentRecipient:val('salePaymentRecipient')||'',
      notes:val('saleNotes'),
      lines:lines.map(l=>({...l,costTotal:0})),
      createdAt:existing?.createdAt||S.now(),
      updatedAt:S.now(),
      demo:existing?.demo||false,
      stockApplied:false,
      stockReversed:false
    };

    sale.totals=calculateSaleTotals(sale.lines);
    if(saleShouldAffectStock(sale)){
      if(!applySaleStock(sale)){
        // Se stavi modificando, ripristina lo snapshot precedente per evitare mezze modifiche.
        if(existing && originalSnapshot){ Object.assign(existing, originalSnapshot); if(saleShouldAffectStock(existing)) applySaleStock(existing); }
        return;
      }
    }
    sale.totals=calculateSaleTotals(sale.lines);

    if(existing) Object.assign(existing,sale); else state.sales.push(sale);
    save(); closeModal(); toast(existing?'Ordine cliente aggiornato.':'Ordine cliente salvato.'); render();
  }


  function deleteWine(id){
    const w=getWine(id); if(!w) return;
    if(!confirm(`Eliminare definitivamente ${w.name}? Verranno rimossi anche i movimenti collegati a questa referenza.`)) return;
    state.orders.forEach(o=>{ o.lines=(o.lines||[]).filter(l=>l.sourceWineId!==id); o.totals=calculateOrderTotals(o.lines); });
    state.orders=state.orders.filter(o=>!(o.manualStock && (!o.lines || !o.lines.length)));
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

  function bindInlineActions(){ document.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>{ const a=btn.dataset.action, id=btn.dataset.id; if(a==='new-wine') openWineModal(); if(a==='edit-wine') openWineModal(id); if(a==='wine-history') openHistory(id); if(a==='new-movement') openMovementModal(); if(a==='new-order') openOrderModal(); if(a==='edit-order') openOrderModal(id); if(a==='view-order') openOrderView(id); if(a==='duplicate-order') openOrderModal(id,true); if(a==='new-sale') openSaleModal(); if(a==='edit-sale') openSaleModal(id); if(a==='duplicate-sale') openSaleModal(id,true); if(a==='new-customer') openCustomerModal(); if(a==='edit-customer') openCustomerModal(id); if(a==='new-distributor') openDistributorModal(); if(a==='edit-distributor') openDistributorModal(id); if(a==='delete-wine') deleteWine(id); if(a==='delete-order') deleteOrder(id); if(a==='delete-sale') deleteSale(id); if(a==='delete-customer') deleteCustomer(id); if(a==='delete-distributor') deleteDistributor(id); if(a==='toggle-order-lines'){ if(expandedOrders.has(id)) expandedOrders.delete(id); else expandedOrders.add(id); renderOrdini(); } })); }
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
    const ctx=c.getContext('2d'), W=c._chartW || c.width, H=c._chartH || c.height;
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
    const ctx=c.getContext('2d'), W=c._chartW || c.width, H=c._chartH || c.height;
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

  function drawSingleBarChart(id, items, label='Valore'){
    const c=document.getElementById(id); if(!c)return; setupCanvas(c);
    const ctx=c.getContext('2d'), W=c._chartW || c.width, H=c._chartH || c.height;
    ctx.clearRect(0,0,W,H);
    if(!items.length){ drawEmptyChart(ctx,W,H,'Nessun dato per ora'); return; }
    const pad={l:116,r:38,t:34,b:30};
    const max=niceMax(Math.max(...items.map(i=>Number(i.value||0)),0));
    const plotW=W-pad.l-pad.r;
    const rowH=Math.min(34, Math.max(24,(H-pad.t-pad.b)/Math.max(items.length,1)));
    ctx.fillStyle=CHART_TEXT;
    ctx.font='600 12px Host Grotesk';
    ctx.textAlign='left';
    ctx.fillText(label,pad.l,pad.t-12);
    items.slice(0,7).forEach((it,i)=>{
      const y=pad.t+i*rowH;
      const value=Number(it.value||0);
      ctx.fillStyle=CHART_TEXT;
      ctx.font='600 13px Host Grotesk';
      ctx.textAlign='right';
      ctx.fillText(String(it.label),pad.l-14,y+14);
      ctx.fillStyle='rgba(0,0,0,.06)';
      roundRect(ctx,pad.l,y,plotW,14,7); ctx.fill();
      ctx.fillStyle=i===0?CHART_ORANGE:CHART_GRAY;
      roundRect(ctx,pad.l,y,Math.max(6,plotW*(value/max)),14,7); ctx.fill();
      ctx.fillStyle='#111';
      ctx.font='700 12px Host Grotesk';
      ctx.textAlign='left';
      ctx.fillText(number(value),pad.l+Math.max(10,plotW*(value/max))+8,y+12);
    });
  }

  function drawDonutChart(id,items){
    const c=document.getElementById(id); if(!c)return; setupCanvas(c);
    const ctx=c.getContext('2d'), W=c._chartW || c.width, H=c._chartH || c.height;
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
    const rect = c.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const cssW = Math.max(320, Math.floor(rect.width));
    const cssH = Math.max(180, Math.floor(rect.height));

    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
    c.width = Math.floor(cssW * dpr);
    c.height = Math.floor(cssH * dpr);

    c._chartW = cssW;
    c._chartH = cssH;
    c._chartDpr = dpr;

    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  const SIDEBAR_KEY = 'ambiguo_sidebar_collapsed';
  const appShell = document.querySelector('.app-shell');
  const sidebarToggle = document.getElementById('sidebarToggle');

  function applySidebarState(collapsed) {
    appShell?.classList.toggle('sidebar-collapsed', collapsed);
    if (sidebarToggle) {
      sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
      sidebarToggle.setAttribute('aria-label', collapsed ? 'Espandi barra laterale' : 'Riduci barra laterale');
      sidebarToggle.title = collapsed ? 'Espandi menu' : 'Riduci menu';
    }
  }

  const savedSidebarState = localStorage.getItem(SIDEBAR_KEY) === 'true';
  applySidebarState(savedSidebarState);

  sidebarToggle?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const activeView = document.querySelector('.nav-link.active[data-view]')?.dataset.view;
    if (activeView && views[activeView]) currentView = activeView;
    if (!views[currentView]) currentView = localStorage.getItem(VIEW_KEY) || 'dashboard';

    const collapsed = !appShell?.classList.contains('sidebar-collapsed');
    localStorage.setItem(SIDEBAR_KEY, String(collapsed));
    applySidebarState(collapsed);

    requestAnimationFrame(() => {
      if (!views[currentView]) currentView = 'dashboard';
      render();
    });
  });

  document.querySelectorAll('.nav-link[data-view]').forEach(btn => {
    btn.addEventListener('click', event => {
      const nextView = event.currentTarget?.dataset?.view;
      if (!nextView || !views[nextView]) return;
      currentView = nextView;
      localStorage.setItem(VIEW_KEY, currentView);
      closeNotificationMenu();
      render();
    });
  });

  document.getElementById('notificationBtn')?.addEventListener('click', event => {
    event.stopPropagation();
    const menu=document.getElementById('notificationMenu');
    if(menu?.hidden) openNotificationMenu();
    else closeNotificationMenu();
  });
  document.getElementById('notificationClose')?.addEventListener('click', closeNotificationMenu);
  document.addEventListener('click', event => {
    const wrap=document.querySelector('.notifications-wrap');
    if(wrap && !wrap.contains(event.target)) closeNotificationMenu();
  });
  document.addEventListener('keydown', event => {
    if(event.key==='Escape') closeNotificationMenu();
  });

  document.getElementById('cloudRefreshBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('cloudRefreshBtn');
    try {
      btn?.classList.add('is-loading');
      btn?.setAttribute('disabled', 'disabled');
      const onlineState = await S.refreshOnline();
      state = onlineState;
      render();
      toast('Dati aggiornati dal cloud.');
    } catch (error) {
      console.warn('Refresh cloud fallito.', error);
      toast('Non riesco ad aggiornare dal cloud. Controlla connessione o Redis.');
    } finally {
      btn?.classList.remove('is-loading');
      btn?.removeAttribute('disabled');
    }
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
    repairOrderCellarLinks();
    cleanupEmptyOrderWines();
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

  window.addEventListener('ambiguo:onlineLoadError', event => {
    console.warn('Errore caricamento online Redis.', event.detail?.error);
  });

  repairOrderCellarLinks();
  cleanupEmptyOrderWines();
  render();
})();


/* === DISTRIBUTOR ORDERS COLLAPSE FINAL FIX === */
(function installDistributorOrdersCollapseFix(){
  const expandedOrders = new Set();

  function isDistributorOrdersPage() {
    const title = document.querySelector("h1, .page-title, .view-title");
    return title && title.textContent.trim().toLowerCase().includes("ordini distributori");
  }

  function svgChevronDown() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9l6 6 6-6"></path>
      </svg>
    `;
  }

  function getOrderKey(card, index) {
    const text = card.textContent || "";
    const code = text.match(/ORD[-–—]\s*\d+/i);
    if (code) return code[0].replace(/\s+/g, "");
    const title = card.querySelector("h2,h3,strong,b")?.textContent?.trim() || "";
    const date = text.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || "";
    return `${date}-${title}-${index}`;
  }

  function findOrderCards() {
    if (!isDistributorOrdersPage()) return [];

    const tables = Array.from(document.querySelectorAll("table"));
    const cards = [];

    tables.forEach((table) => {
      let el = table.parentElement;
      let chosen = null;

      while (el && el !== document.body) {
        const text = el.textContent || "";
        const hasOrderCode = /ORD[-–—]\s*\d+/i.test(text);
        const hasDistributorActions =
          text.includes("Modifica dati") ||
          text.includes("Apri dettaglio") ||
          text.includes("Duplica") ||
          text.includes("Elimina");

        if (hasOrderCode && hasDistributorActions) {
          chosen = el;
          break;
        }

        el = el.parentElement;
      }

      if (chosen && !cards.includes(chosen)) cards.push(chosen);
    });

    return cards;
  }

  function removeOldExpandButtons(card) {
    const buttons = Array.from(card.querySelectorAll("button"));
    buttons.forEach((btn) => {
      const t = btn.textContent.trim().toLowerCase();
      if (
        t.includes("mostra tutte") ||
        t.includes("raggruppa") ||
        t === "↓" ||
        t === "↑"
      ) {
        btn.dataset.oldExpand = "true";
        btn.classList.add("dist-order-old-expand");
        btn.style.display = "none";
      }
    });
  }

  function getInsertPoint(card) {
    const table = card.querySelector("table");
    if (table) return table;

    const tableLike = card.querySelector(".order-lines,.order-table,.table-wrap,.responsive-table");
    if (tableLike) return tableLike;

    return null;
  }

  function enhanceOrderCards() {
    if (!isDistributorOrdersPage()) return;

    const cards = findOrderCards();

    cards.forEach((card, index) => {
      const key = getOrderKey(card, index);

      card.classList.add("dist-order-card-fixed");
      card.dataset.distOrderKey = key;

      removeOldExpandButtons(card);

      let row = card.querySelector(":scope > .dist-order-collapse-row");
      if (!row) {
        row = document.createElement("div");
        row.className = "dist-order-collapse-row";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dist-order-collapse-btn";
        btn.innerHTML = svgChevronDown();
        btn.setAttribute("aria-label", "Espandi ordine");
        btn.title = "Espandi ordine";

        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const isExpanded = card.classList.contains("is-expanded");

          if (isExpanded) {
            expandedOrders.delete(key);
            card.classList.remove("is-expanded");
            card.classList.add("is-collapsed");
            btn.setAttribute("aria-label", "Espandi ordine");
            btn.title = "Espandi ordine";
          } else {
            expandedOrders.add(key);
            card.classList.add("is-expanded");
            card.classList.remove("is-collapsed");
            btn.setAttribute("aria-label", "Raggruppa ordine");
            btn.title = "Raggruppa ordine";
          }
        });

        row.appendChild(btn);

        const insertPoint = getInsertPoint(card);
        if (insertPoint && insertPoint.parentNode) {
          insertPoint.parentNode.insertBefore(row, insertPoint.nextSibling);
        } else {
          card.appendChild(row);
        }
      }

      if (expandedOrders.has(key)) {
        card.classList.add("is-expanded");
        card.classList.remove("is-collapsed");
      } else {
        card.classList.add("is-collapsed");
        card.classList.remove("is-expanded");
      }
    });
  }

  const run = () => {
    requestAnimationFrame(() => {
      enhanceOrderCards();
      setTimeout(enhanceOrderCards, 120);
    });
  };

  document.addEventListener("click", () => setTimeout(run, 80), true);
  document.addEventListener("input", () => setTimeout(run, 80), true);
  document.addEventListener("change", () => setTimeout(run, 80), true);

  const observer = new MutationObserver(() => {
    clearTimeout(window.__distOrderCollapseTimer);
    window.__distOrderCollapseTimer = setTimeout(run, 80);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
/* === END DISTRIBUTOR ORDERS COLLAPSE FINAL FIX === */

