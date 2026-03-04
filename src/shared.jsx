import { useState, useEffect, useRef, useMemo } from "react";

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const SEED_CATEGORIES = ["Viandas", "Panadería", "Postres", "Bebidas", "Otros"];

const SEED_PRODUCTS = [
  { id:"p1", name:"Milanesa con puré", category:"Viandas", priceRetail:1800, priceWholesale:1500, unit:"unit", stock:12, active:true, photo:null, description:"Milanesa de ternera con puré de papa" },
  { id:"p2", name:"Pollo al horno con verduras", category:"Viandas", priceRetail:1600, priceWholesale:1350, unit:"unit", stock:8, active:true, photo:null, description:"Cuarto de pollo con ensalada de estación" },
  { id:"p3", name:"Tarta de verduras", category:"Viandas", priceRetail:1200, priceWholesale:1000, unit:"unit", stock:6, active:true, photo:null, description:"Tarta casera de acelga y ricota" },
  { id:"p4", name:"Brownie de chocolate", category:"Panadería", priceRetail:600, priceWholesale:500, unit:"unit", stock:20, active:true, photo:null, description:"Brownie húmedo sin TACC" },
  { id:"p5", name:"Pan de molde", category:"Panadería", priceRetail:900, priceWholesale:750, unit:"unit", stock:15, active:true, photo:null, description:"Pan de molde sin gluten, 400g" },
  { id:"p6", name:"Budín de limón", category:"Postres", priceRetail:1100, priceWholesale:900, unit:"unit", stock:10, active:true, photo:null, description:"Budín esponjoso con glaseado de limón" },
  { id:"p7", name:"Flan casero", category:"Postres", priceRetail:700, priceWholesale:600, unit:"unit", stock:5, active:true, photo:null, description:"Flan de vainilla con caramelo" },
  { id:"p8", name:"Agua saborizada", category:"Bebidas", priceRetail:400, priceWholesale:350, unit:"unit", stock:30, active:true, photo:null, description:"Botella 500ml" },
];

const SEED_CUSTOMERS = [
  { id:"c1", name:"María González", phone:"11-1234-5678", address:"Av. Corrientes 1234", notes:"Sin gluten estricto", priceList:"retail", balance:0 },
  { id:"c2", name:"Carlos Fernández", phone:"11-9876-5432", address:"", notes:"Mayorista", priceList:"wholesale", balance:500 },
  { id:"c3", name:"Restaurante El Rincón", phone:"11-5555-0000", address:"Av. San Martín 456", notes:"Pedido fijo lunes y jueves", priceList:"wholesale", balance:-1200 },
];

const SEED_RECIPES = [
  {
    id:"r1", productId:"p1", prepTime:20, cookTime:15, yield:1, notes:"Usar papa tipo Spunta para mejor textura.",
    ingredients:[
      { name:"Ternera (nalga)", qty:200, unit:"g", cost:800 },
      { name:"Pan rallado sin TACC", qty:50, unit:"g", cost:120 },
      { name:"Huevo", qty:1, unit:"unidad", cost:80 },
      { name:"Papa", qty:300, unit:"g", cost:150 },
      { name:"Manteca", qty:20, unit:"g", cost:60 },
    ],
    steps:["Golpear la carne hasta 1cm de espesor.","Pasar por huevo batido y pan rallado.","Freír a fuego medio 3 min por lado.","Hervir papa, pisarla con manteca y sal."]
  },
  {
    id:"r2", productId:"p4", prepTime:15, cookTime:25, yield:12, notes:"Mezclar lo justo — no batir de más.",
    ingredients:[
      { name:"Chocolate negro", qty:200, unit:"g", cost:600 },
      { name:"Manteca", qty:150, unit:"g", cost:350 },
      { name:"Azúcar", qty:200, unit:"g", cost:200 },
      { name:"Huevo", qty:3, unit:"unidades", cost:240 },
      { name:"Harina de arroz", qty:80, unit:"g", cost:180 },
    ],
    steps:["Derretir chocolate con manteca a baño María.","Incorporar azúcar y huevos.","Agregar harina tamizada.","Volcar en molde enmantecado.","Hornear 25 min a 170°C."]
  },
];

const SEED_SALES = [
  { id:"s1", customerId:"c1", customerName:"María González", items:[{productId:"p1",name:"Milanesa con puré",qty:2,price:1800,subtotal:3600},{productId:"p4",name:"Brownie de chocolate",qty:3,price:600,subtotal:1800}], total:5400, priceList:"retail", paymentMethod:"transfer", status:"closed", notes:"", createdAt: new Date(Date.now()-3600000*2).toISOString() },
  { id:"s2", customerId:null, customerName:"Anónimo", items:[{productId:"p5",name:"Pan de molde",qty:1,price:900,subtotal:900}], total:900, priceList:"retail", paymentMethod:"cash", status:"closed", notes:"", createdAt: new Date(Date.now()-3600000*4).toISOString() },
  { id:"s3", customerId:"c3", customerName:"Restaurante El Rincón", items:[{productId:"p2",name:"Pollo al horno",qty:6,price:1350,subtotal:8100},{productId:"p3",name:"Tarta de verduras",qty:4,price:1000,subtotal:4000}], total:12100, priceList:"wholesale", paymentMethod:"account", status:"open", notes:"Entregar jueves 12hs", createdAt: new Date(Date.now()-3600000*1).toISOString() },
];

// ─── UTILS ────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const $ = (n, d=0) => `$${Number(n||0).toLocaleString("es-AR",{minimumFractionDigits:d,maximumFractionDigits:d})}`;
const fmtDate = d => new Date(d).toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit",year:"numeric"});
const fmtTime = d => new Date(d).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
const fmtDT = d => `${fmtDate(d)} ${fmtTime(d)}`;
const todayStr = () => new Date().toISOString().slice(0,10);
const clamp = (v,mn,mx) => Math.min(Math.max(v,mn),mx);

const STATUS_LABELS = { open:"Abierto", pending:"Pend. pago", ready:"Listo", delivered:"Entregado", cancelled:"Cancelado", closed:"Cerrado" };
const STATUS_COLORS = { open:"badge-blue", pending:"badge-amber", ready:"badge-green", delivered:"badge-gray", cancelled:"badge-red", closed:"badge-gray" };
const PAY_LABELS = { cash:"Efectivo", transfer:"Transferencia", card:"Tarjeta", account:"Cuenta corriente" };
const PAY_ORDER_LABELS = { cash:"Efectivo", transfer:"Transferencia", account:"Cuenta corriente" };

// ─── STYLES ───────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f5f5f7;--s0:#ffffff;--s1:#fafafa;--s2:#f2f2f5;
  --border:rgba(0,0,0,.07);--border2:rgba(0,0,0,.15);
  --green:#89b8ad;--green2:#72a99d;--greenl:#edf4f2;--greenlb:#c5ddd9;
  --amber:#d97706;--amberl:#fffbeb;--amberlb:#fde68a;
  --red:#dc2626;--redl:#fef2f2;--redlb:#fecaca;
  --blue:#2563eb;--bluel:#eff6ff;--blueb:#bfdbfe;
  --t1:#1d1d1f;--t2:#3d3d3f;--t3:#86868b;--t4:#aeaeb2;
  --ff:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter','Segoe UI',system-ui,sans-serif;
  --r:10px;--rl:14px;
  --shadow:0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04);
  --shadow-lg:0 16px 48px rgba(0,0,0,.11),0 4px 16px rgba(0,0,0,.06);
}
body{background:var(--bg);color:var(--t1);font-family:var(--ff);font-size:14px;min-height:100vh;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
#root{min-height:100vh}

/* LAYOUT */
.app{display:flex;min-height:100vh}
.sidebar{width:244px;background:var(--s0);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0;position:fixed;top:0;left:0;height:100vh;z-index:40;overflow-y:auto}
.content{flex:1;margin-left:244px;display:flex;flex-direction:column;min-height:100vh;overflow-x:hidden}

/* SIDEBAR */
.sb-logo{padding:18px 16px 14px}
.sb-logo h1{font-size:.85em;font-weight:700;color:var(--t1);letter-spacing:-.01em;display:flex;align-items:center;gap:8px;line-height:1.2}
.sb-logo p{font-size:.67em;color:var(--t4);margin-top:3px;padding-left:2px;letter-spacing:.01em}
.sb-nav{padding:2px 8px;flex:1}
.sb-section{font-size:.59em;font-weight:600;text-transform:uppercase;letter-spacing:.9px;color:var(--t4);padding:16px 10px 4px}
.ni{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;cursor:pointer;color:var(--t3);transition:background .1s,color .1s;font-size:.83em;font-weight:500;border:none;background:none;width:100%;text-align:left;margin-bottom:1px}
.ni:hover{background:var(--s2);color:var(--t2);transform:translateX(1px)}
.ni.active{background:var(--greenl);color:var(--green);font-weight:600}
.ni svg{flex-shrink:0;opacity:.65}
.ni:hover svg,.ni.active svg{opacity:1}
.sb-footer{padding:8px 8px 14px;border-top:1px solid var(--border)}
.user-chip{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--s2);border-radius:10px}
.user-av{width:26px;height:26px;border-radius:50%;background:var(--green);color:white;display:flex;align-items:center;justify-content:center;font-size:.69em;font-weight:700;flex-shrink:0}

/* PAGE */
.page{padding:28px 32px;animation:fadeIn .17s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;gap:16px;flex-wrap:wrap}
.page-title{font-size:1.4em;font-weight:700;color:var(--t1);letter-spacing:-.025em}
.page-sub{font-size:.76em;color:var(--t3);margin-top:2px;font-weight:400}

/* TOPBAR */
.topbar{background:rgba(255,255,255,.82);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid var(--border);padding:0 28px;height:54px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;position:sticky;top:0;z-index:30}
.topbar-brand{display:flex;align-items:center;gap:8px;font-size:.86em;font-weight:700;color:var(--t1);letter-spacing:-.02em}
.topbar-right{display:flex;align-items:center;gap:12px}
.topbar-date{font-size:.74em;color:var(--t4);font-weight:400}
.topbar-userchip{display:flex;align-items:center;gap:6px;background:var(--s2);border-radius:20px;padding:4px 10px 4px 4px;border:1px solid var(--border)}
.topbar-user-name{font-size:.76em;font-weight:600;color:var(--t2)}

/* CARDS */
.card{background:var(--s0);border:1px solid var(--border);border-radius:var(--rl);padding:20px;box-shadow:var(--shadow)}
.card-sm{padding:14px}
.card-hover:hover{border-color:var(--border2);box-shadow:0 4px 16px rgba(0,0,0,.07);cursor:pointer;transition:all .15s}

/* STATS */
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
.stat{background:var(--s0);border:1px solid var(--border);border-radius:var(--rl);padding:18px 20px;position:relative;overflow:hidden;box-shadow:var(--shadow)}
.stat-num{font-size:1.7em;font-weight:700;color:var(--t1);letter-spacing:-.03em;line-height:1}
.stat-label{font-size:.71em;color:var(--t3);margin-top:5px;font-weight:400;letter-spacing:.01em}
.stat-icon{position:absolute;right:14px;top:12px;opacity:.05;font-size:1.9em}
.stat-green .stat-num{color:var(--green)}
.stat-amber .stat-num{color:var(--amber)}
.stat-red .stat-num{color:var(--red)}
.stat-blue .stat-num{color:var(--blue)}

/* BUTTONS */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 15px;border-radius:8px;border:none;cursor:pointer;font-family:var(--ff);font-size:.82em;font-weight:500;transition:all .13s;white-space:nowrap;letter-spacing:-.01em}
.btn:active:not(:disabled){transform:scale(.96)}
.btn:disabled{opacity:.35;cursor:not-allowed}
.btn-primary{background:var(--green);color:white}
.btn-primary:hover:not(:disabled){background:var(--green2)}
.btn-secondary{background:var(--s0);color:var(--t1);border:1px solid var(--border2)}
.btn-secondary:hover{background:var(--s2)}
.btn-ghost{background:transparent;color:var(--t2)}
.btn-ghost:hover{background:var(--s2);color:var(--t1)}
.btn-danger{background:var(--s0);color:var(--red);border:1px solid var(--redlb)}
.btn-danger:hover{background:var(--red);color:white;border-color:var(--red)}
.btn-amber{background:var(--amberl);color:var(--amber);border:1px solid var(--amberlb)}
.btn-amber:hover{background:var(--amber);color:white}
.btn-blue{background:var(--bluel);color:var(--blue);border:1px solid var(--blueb)}
.btn-blue:hover{background:var(--blue);color:white}
.btn-lg{padding:11px 22px;font-size:.88em;font-weight:600;border-radius:10px}
.btn-sm{padding:5px 11px;font-size:.76em;border-radius:7px}
.btn-icon{padding:6px;border-radius:7px}
.btn-block{width:100%}

/* FORMS */
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.form-grid-3{grid-template-columns:1fr 1fr 1fr}
.form-group{display:flex;flex-direction:column;gap:5px}
.form-group.full{grid-column:1/-1}
label.lbl{font-size:.69em;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.5px}
input,select,textarea{background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--t1);font-family:var(--ff);font-size:.88em;transition:all .15s;width:100%;outline:none;appearance:none;-webkit-appearance:none}
select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23aeaeb2' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:30px}
input:hover,select:hover{border-color:var(--border2)}
input:focus,select:focus,textarea:focus{border-color:var(--green);background:white;box-shadow:0 0 0 3px rgba(137,184,173,.15)}
input[type="date"]{color-scheme:light}
textarea{resize:vertical;min-height:72px}
.input-group{display:flex;gap:0}
.input-group input{border-radius:8px 0 0 8px;flex:1}
.input-group .btn{border-radius:0 8px 8px 0}

/* BADGES */
.badge{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:20px;font-size:.7em;font-weight:500;letter-spacing:.01em}
.badge-green{background:var(--greenl);color:var(--green)}
.badge-amber{background:var(--amberl);color:var(--amber)}
.badge-red{background:var(--redl);color:var(--red)}
.badge-blue{background:var(--bluel);color:var(--blue)}
.badge-gray{background:var(--s2);color:var(--t3)}

/* TABLE */
.table-wrap{overflow-x:auto;border-radius:var(--r);border:1px solid var(--border);background:white}
table{width:100%;border-collapse:collapse}
th{background:var(--s2);padding:10px 16px;text-align:left;font-size:.67em;font-weight:600;color:var(--t4);text-transform:uppercase;letter-spacing:.7px;border-bottom:1px solid var(--border)}
td{padding:11px 16px;border-bottom:1px solid var(--border);font-size:.85em;vertical-align:middle}
tr:last-child td{border-bottom:none}
tbody tr:hover td{background:var(--s1)}
.tr-click{cursor:pointer}

/* MODAL */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.3);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;animation:bgIn .15s ease}
@keyframes bgIn{from{opacity:0}to{opacity:1}}
.modal{background:rgba(255,255,255,.97);backdrop-filter:blur(24px);border-radius:18px;padding:28px;width:100%;max-width:640px;max-height:90vh;overflow-y:auto;box-shadow:var(--shadow-lg);border:1px solid var(--border);animation:modalIn .18s cubic-bezier(.22,1,.36,1)}
@keyframes modalIn{from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:none}}
.modal-lg{max-width:880px}
.modal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--border)}
.modal-title{font-size:.98em;font-weight:700;color:var(--t1);letter-spacing:-.01em}
.modal-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:22px;padding-top:16px;border-top:1px solid var(--border)}
.section-title{font-size:.67em;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--t4);margin-bottom:10px;padding-bottom:6px}

/* POS SPECIFIC */
.pos-layout{display:grid;grid-template-columns:1fr 376px;gap:0;height:calc(100vh - 54px)}
.pos-products{overflow-y:auto;padding:20px 24px;background:var(--bg)}
.pos-cart{background:var(--s0);border-left:1px solid var(--border);display:flex;flex-direction:column;height:100%}
.pos-cart-header{padding:16px 18px;border-bottom:1px solid var(--border)}
.pos-cart-items{flex:1;overflow-y:auto;padding:12px 16px}
.pos-cart-footer{padding:16px 18px;border-top:1px solid var(--border);background:var(--s0)}
.prod-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px}
.prod-card{background:var(--s0);border:1px solid var(--border);border-radius:var(--rl);padding:14px;cursor:pointer;transition:border-color .14s,box-shadow .14s,transform .14s;user-select:none}
.prod-card:hover{border-color:var(--green);box-shadow:0 4px 14px rgba(137,184,173,.18);transform:translateY(-1px)}
.prod-card:active{transform:scale(.98)}
.prod-card.inactive{opacity:.28;cursor:not-allowed}
.prod-card-name{font-weight:600;font-size:.86em;color:var(--t1);margin-bottom:3px;line-height:1.3}
.prod-card-cat{font-size:.68em;color:var(--t4);margin-bottom:6px}
.prod-card-price{font-size:.94em;font-weight:700;color:var(--green)}
.prod-card-stock{font-size:.68em;color:var(--t4);margin-top:4px}
.cart-item{display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border)}
.cart-item:last-child{border-bottom:none}
.cart-item-name{flex:1;font-size:.83em;font-weight:500;color:var(--t1);min-width:0}
.cart-item-sub{font-size:.72em;color:var(--t3)}
.qty-ctrl{display:flex;align-items:center;gap:5px}
.qty-btn{width:24px;height:24px;border-radius:50%;border:1px solid var(--border);background:var(--s2);cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:.79em;color:var(--t2);transition:all .12s}
.qty-btn:hover{background:var(--green);color:white;border-color:var(--green)}
.qty-num{font-size:.85em;font-weight:600;min-width:20px;text-align:center}
.price-toggle{display:flex;border-radius:9px;background:var(--s2);padding:2px;gap:2px;border:1px solid var(--border)}
.price-toggle button{flex:1;padding:6px 12px;border:none;background:transparent;color:var(--t3);cursor:pointer;font-family:var(--ff);font-size:.78em;font-weight:500;transition:all .13s;border-radius:7px}
.price-toggle button.active{background:var(--s0);color:var(--t1);font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.09)}
.tot-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:.86em}
.tot-row.total{font-weight:700;font-size:.97em;color:var(--t1);padding-top:10px;border-top:1px solid var(--border)}

/* SEARCH */
.search-wrap{position:relative}
.search-wrap input{padding-left:34px}
.search-ico{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--t3);pointer-events:none}

/* TOAST */
.toast{position:fixed;bottom:24px;right:24px;background:#1d1d1f;color:white;padding:11px 18px;border-radius:12px;font-size:.82em;font-weight:500;z-index:999;animation:slideUp .2s ease;box-shadow:0 8px 24px rgba(0,0,0,.18)}
.toast.success{background:var(--green)}
.toast.error{background:var(--red)}
.toast.info{background:var(--blue)}
@keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

/* MISC */
.divider{height:1px;background:var(--border);margin:16px 0}
.empty{text-align:center;padding:52px 20px;color:var(--t3)}
.empty-icon{font-size:2.4em;margin-bottom:10px;opacity:.45}
.empty h3{color:var(--t2);font-size:.88em;margin-bottom:4px;font-weight:600}
.tag{display:inline-flex;padding:2px 8px;border-radius:6px;font-size:.69em;font-weight:500;background:var(--s2);color:var(--t3)}
.balance-pos{color:var(--green);font-weight:600}
.balance-neg{color:var(--red);font-weight:600}
.balance-zero{color:var(--t3)}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:10px}
::-webkit-scrollbar-track{background:transparent}
@media(max-width:900px){.sidebar{transform:translateX(-100%)}.content{margin-left:0}.pos-layout{grid-template-columns:1fr}.pos-cart{height:auto;border-left:none;border-top:1px solid var(--border)}.stats-row{grid-template-columns:1fr 1fr}}
`;

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Ico = ({ n, s=16, c="currentColor" }) => {
  const p = {
    pos:"M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
    orders:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    customers:"M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    products:"M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    production:"M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
    recipes:"M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    reports:"M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    settings:"M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    plus:"M12 4v16m-8-8h16",
    x:"M6 18L18 6M6 6l12 12",
    edit:"M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    trash:"M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    check:"M5 13l4 4L19 7",
    search:"M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0",
    back:"M10 19l-7-7m0 0l7-7m-7 7h18",
    eye:"M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
    cash:"M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
    alert:"M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
    chevron:"M19 9l-7 7-7-7",
    logout:"M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
    user:"M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    tag:"M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z",
    box:"M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    clock:"M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    refresh:"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
    expenses:"M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    download:"M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
    ingredients:"M9 3h6M10 3v5.5L5.5 17A2 2 0 007.36 20h9.28A2 2 0 0018.5 17L14 8.5V3M9 13h6",
    suppliers:"M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
    dashboard:"M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  };
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={p[n]||""}/></svg>;
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, []);
  return <div className={`toast ${type}`}>{msg}</div>;
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, lg=false }) {
  return (
    <div className="modal-bg" onClick={e => { if (e.target.className === "modal-bg") onClose(); }}>
      <div className={`modal${lg ? " modal-lg" : ""}`}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><Ico n="x" s={18}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
const USERS = [
  { id:"admin", name:"Administrador", role:"admin", pass:"toto000" },
  { id:"vendor", name:"Vendedor", role:"vendor", pass:"000comida" },
];

function LoginPage({ onLogin }) {
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  const login = () => {
    const u = USERS.find(x => x.id === user && x.pass === pass);
    if (u) onLogin(u);
    else { setErr("Contraseña incorrecta"); setTimeout(() => setErr(""), 2000); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"var(--s0)", borderRadius:22, padding:"40px 36px", width:"100%", maxWidth:380, boxShadow:"var(--shadow-lg)", border:"1px solid var(--border)" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ marginBottom:14 }}><img src="/logo.jpg" alt="Nutrifree" style={{ height:64, borderRadius:14, boxShadow:"0 4px 12px rgba(0,0,0,.1)" }}/></div>
          <div style={{ fontWeight:700, fontSize:"1.3em", color:"var(--t1)", letterSpacing:"-.025em" }}>Nutrifree Manager</div>
          <div style={{ fontSize:".76em", color:"var(--t4)", marginTop:4, letterSpacing:".01em" }}>Sistema de gestión</div>
        </div>
        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="lbl">Usuario</label>
          <select value={user} onChange={e => setUser(e.target.value)}>
            <option value="admin">Administrador</option>
            <option value="vendor">Vendedor</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom:22 }}>
          <label className="lbl">Contraseña</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key==="Enter" && login()} autoFocus />
          {err && <span style={{ fontSize:".76em", color:"var(--red)", marginTop:2 }}>{err}</span>}
        </div>
        <button className="btn btn-primary btn-lg btn-block" onClick={login}>Ingresar</button>
      </div>
    </div>
  );
}

export { CSS, Ico, Toast, Modal, LoginPage, USERS, uid, $, fmtDate, fmtTime, fmtDT, todayStr, STATUS_LABELS, STATUS_COLORS, PAY_LABELS, PAY_ORDER_LABELS, SEED_PRODUCTS, SEED_CUSTOMERS, SEED_RECIPES, SEED_SALES, SEED_CATEGORIES };
