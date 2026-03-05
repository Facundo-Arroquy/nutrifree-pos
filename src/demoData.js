// ─── DEMO DATA — seed data for the demo environment ──────────────────────────
const KEY = "nutrifree_demo_";

const dAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
const dsAgo = (n) => dAgo(n).slice(0, 10);

export const DEMO_SEED = {
  categories: [
    { name:"Viandas" }, { name:"Panadería" }, { name:"Postres" }, { name:"Bebidas" },
  ],
  expense_categories: [
    { name:"Ingredientes" }, { name:"Servicios" }, { name:"Envases" }, { name:"Otros" },
  ],
  products: [
    { id:"dp1", name:"Milanesa con puré",     category:"Viandas",   price_retail:2200, price_wholesale:1800, unit:"unit", stock:14, active:true, photo:null, description:"Milanesa de ternera con puré casero", kit_items:[] },
    { id:"dp2", name:"Tarta de verduras",      category:"Viandas",   price_retail:1600, price_wholesale:1300, unit:"unit", stock:7,  active:true, photo:null, description:"Tarta de acelga y ricota",           kit_items:[] },
    { id:"dp3", name:"Brownie de chocolate",   category:"Panadería", price_retail:800,  price_wholesale:650,  unit:"unit", stock:20, active:true, photo:null, description:"Brownie húmedo sin TACC",            kit_items:[] },
    { id:"dp4", name:"Pan de molde sin TACC",  category:"Panadería", price_retail:1100, price_wholesale:900,  unit:"unit", stock:2,  active:true, photo:null, description:"Pan de molde 400g",                  kit_items:[] },
    { id:"dp5", name:"Flan casero",            category:"Postres",   price_retail:900,  price_wholesale:750,  unit:"unit", stock:0,  active:true, photo:null, description:"Flan de vainilla con caramelo",      kit_items:[] },
    { id:"dp6", name:"Budín de limón",         category:"Postres",   price_retail:1300, price_wholesale:1050, unit:"unit", stock:5,  active:true, photo:null, description:"Budín esponjoso con glaseado",       kit_items:[] },
  ],
  customers: [
    { id:"dc1", name:"Ana Rodríguez",       phone:"11-2345-6789", address:"Av. Santa Fe 1234", notes:"Sin TACC estricto", price_list:"retail",    balance:0, discount_pct:0 },
    { id:"dc2", name:"Comedor La Estrella", phone:"11-5678-9012", address:"Av. Belgrano 456",  notes:"Pedido fijo lunes", price_list:"wholesale", balance:0, discount_pct:5 },
    { id:"dc3", name:"Marcos Pérez",        phone:"11-9876-5432", address:"",                  notes:"",                  price_list:"retail",    balance:0, discount_pct:0 },
  ],
  ingredients: [
    { id:"di1", name:"Ternera (nalga)",    category:"Carnes",     unit:"g",    stock:2000, stock_min:500, unit_cost:5.5,  supplier:"Carnicería Don Juan", notes:"" },
    { id:"di2", name:"Chocolate negro",    category:"Repostería", unit:"g",    stock:1500, stock_min:300, unit_cost:3.8,  supplier:"Distribuidora Norte", notes:"Mínimo 60% cacao" },
    { id:"di3", name:"Harina de arroz",    category:"Harinas",    unit:"g",    stock:3000, stock_min:500, unit_cost:0.9,  supplier:"Distribuidora Norte", notes:"Sin TACC" },
    { id:"di4", name:"Manteca",            category:"Lácteos",    unit:"g",    stock:800,  stock_min:200, unit_cost:2.2,  supplier:"Lácteos del Sur",     notes:"" },
  ],
  recipes: [
    { id:"dr1", product_id:"dp1", prep_time:20, cook_time:15, yield:1, notes:"Golpear la carne hasta 1cm.", steps:["Aplanar la carne.","Pasar por huevo y pan rallado.","Freír 3 min por lado.","Preparar el puré."] },
    { id:"dr2", product_id:"dp3", prep_time:15, cook_time:25, yield:12, notes:"No batir de más.", steps:["Derretir chocolate con manteca.","Incorporar harina.","Hornear 25 min a 170°C."] },
  ],
  recipe_ingredients: [
    { id:"dri1", recipe_id:"dr1", ingredient_id:"di1", qty:200, unit:"g",    cost:1100 },
    { id:"dri2", recipe_id:"dr1", ingredient_id:"di4", qty:20,  unit:"g",    cost:44 },
    { id:"dri3", recipe_id:"dr2", ingredient_id:"di2", qty:200, unit:"g",    cost:760 },
    { id:"dri4", recipe_id:"dr2", ingredient_id:"di3", qty:80,  unit:"g",    cost:72 },
    { id:"dri5", recipe_id:"dr2", ingredient_id:"di4", qty:150, unit:"g",    cost:330 },
  ],
  suppliers: [
    { id:"ds1", name:"Distribuidora Norte", phone:"11-1111-2222", email:"norte@demo.com", address:"Av. Industrial 100", notes:"Entrega los martes", created_at: dAgo(60) },
    { id:"ds2", name:"Lácteos del Sur",     phone:"11-3333-4444", email:"sur@demo.com",   address:"Calle 9 N°45",       notes:"",                   created_at: dAgo(45) },
  ],
  supplier_payments: [
    { id:"dsp1", supplier_id:"ds1", expense_id:"de1", amount:4200, type:"charge",  payment_method:null,       date:dsAgo(20), notes:"Ingredientes del mes", created_at: dAgo(20) },
    { id:"dsp2", supplier_id:"ds1", expense_id:null,  amount:4200, type:"payment", payment_method:"transfer", date:dsAgo(10), notes:"Pago factura",         created_at: dAgo(10) },
  ],
  expenses: [
    { id:"de1", date:dsAgo(20), supplier:"Distribuidora Norte", concept:"Harina de arroz y chocolate", quantity:1,  unit:"lote",   unit_price:4200, total:4200, payment_method:"transfer", payment_status:"paid",    category:"Ingredientes", notes:"",                supplier_id:"ds1" },
    { id:"de2", date:dsAgo(14), supplier:"Lácteos del Sur",     concept:"Manteca x 5kg",               quantity:5,  unit:"kg",     unit_price:900,  total:4500, payment_method:"cash",     payment_status:"paid",    category:"Ingredientes", notes:"",                supplier_id:"ds2" },
    { id:"de3", date:dsAgo(10), supplier:"Gas Natural",         concept:"Factura gas",                 quantity:1,  unit:"mes",    unit_price:2800, total:2800, payment_method:"transfer", payment_status:"paid",    category:"Servicios",    notes:"Factura 1203",    supplier_id:null  },
    { id:"de4", date:dsAgo(5),  supplier:"Envases SRL",         concept:"Cajas descartables",          quantity:100,unit:"unidad", unit_price:35,   total:3500, payment_method:"cash",     payment_status:"pending", category:"Envases",      notes:"",                supplier_id:null  },
    { id:"de5", date:dsAgo(2),  supplier:"Carnicería Don Juan", concept:"Ternera (nalga) 2kg",         quantity:2,  unit:"kg",     unit_price:5500, total:11000,payment_method:"cash",     payment_status:"paid",    category:"Ingredientes", notes:"",                supplier_id:null  },
  ],
  account_payments: [
    { id:"dap1", customer_id:"dc2", sale_id:"ds3",  amount:12000, type:"charge",  payment_method:null,       date:dsAgo(15), notes:"",        created_at:dAgo(15) },
    { id:"dap2", customer_id:"dc2", sale_id:null,   amount:8000,  type:"payment", payment_method:"transfer", date:dsAgo(8),  notes:"Pago cc", created_at:dAgo(8)  },
  ],
  stock_movements: [
    { id:"dsm1", product_id:"dp1", product_name:"Milanesa con puré",   qty:10, type:"production", notes:"Producción del día", created_at:dAgo(7) },
    { id:"dsm2", product_id:"dp3", product_name:"Brownie de chocolate", qty:24, type:"production", notes:"Hornada completa",    created_at:dAgo(3) },
  ],
  cash_shifts: [
    { id:"dcs1", opened_by:"Administrador", opened_at:dAgo(2), closed_at:dAgo(2), status:"closed", initial_cash:10000, sales_cash:18500, sales_transfer:9200, sales_card:0, sales_account:12000, expenses_cash:3500, expected_cash:25000, counted_cash:24800, difference:-200, notes:"Diferencia mínima", created_at:dAgo(2) },
  ],
  sales: [
    { id:"ds1",  customer_id:"dc1", customer_name:"Ana Rodríguez",       items:[{productId:"dp1",name:"Milanesa con puré",qty:2,price:2200,subtotal:4400},{productId:"dp6",name:"Budín de limón",qty:1,price:1300,subtotal:1300}], total:5700,  price_list:"retail",    payment_method:"cash",     status:"closed",   notes:"",              created_at:dAgo(28), discount_type:"pct",   discount_value:0, discount_amount:0, delivery_date:null },
    { id:"ds2",  customer_id:null,   customer_name:"Anónimo",             items:[{productId:"dp3",name:"Brownie de chocolate",qty:4,price:800,subtotal:3200}],                                                                      total:3200,  price_list:"retail",    payment_method:"cash",     status:"closed",   notes:"",              created_at:dAgo(26), discount_type:"pct",   discount_value:0, discount_amount:0, delivery_date:null },
    { id:"ds3",  customer_id:"dc2",  customer_name:"Comedor La Estrella", items:[{productId:"dp1",name:"Milanesa con puré",qty:6,price:1800,subtotal:10800},{productId:"dp2",name:"Tarta de verduras",qty:4,price:1300,subtotal:5200}],total:12000,price_list:"wholesale", payment_method:"account",  status:"closed",   notes:"Pedido lunes",  created_at:dAgo(22), discount_type:"pct",   discount_value:5, discount_amount:800, delivery_date:null },
    { id:"ds4",  customer_id:"dc3",  customer_name:"Marcos Pérez",        items:[{productId:"dp6",name:"Budín de limón",qty:2,price:1300,subtotal:2600},{productId:"dp3",name:"Brownie de chocolate",qty:3,price:800,subtotal:2400}], total:5000,  price_list:"retail",    payment_method:"transfer", status:"closed",   notes:"",              created_at:dAgo(20), discount_type:"pct",   discount_value:0, discount_amount:0, delivery_date:null },
    { id:"ds5",  customer_id:"dc1",  customer_name:"Ana Rodríguez",       items:[{productId:"dp4",name:"Pan de molde sin TACC",qty:2,price:1100,subtotal:2200}],                                                                    total:2200,  price_list:"retail",    payment_method:"transfer", status:"closed",   notes:"",              created_at:dAgo(17), discount_type:"pct",   discount_value:0, discount_amount:0, delivery_date:null },
    { id:"ds6",  customer_id:null,   customer_name:"Anónimo",             items:[{productId:"dp3",name:"Brownie de chocolate",qty:6,price:800,subtotal:4800}],                                                                      total:4800,  price_list:"retail",    payment_method:"cash",     status:"closed",   notes:"",              created_at:dAgo(15), discount_type:"pct",   discount_value:0, discount_amount:0, delivery_date:null },
    { id:"ds7",  customer_id:"dc2",  customer_name:"Comedor La Estrella", items:[{productId:"dp1",name:"Milanesa con puré",qty:8,price:1800,subtotal:14400},{productId:"dp2",name:"Tarta de verduras",qty:6,price:1300,subtotal:7800}],total:22200,price_list:"wholesale", payment_method:"account",  status:"closed",   notes:"Pedido semanal",created_at:dAgo(8),  discount_type:"pct",   discount_value:5, discount_amount:1200,delivery_date:null },
    { id:"ds8",  customer_id:"dc3",  customer_name:"Marcos Pérez",        items:[{productId:"dp1",name:"Milanesa con puré",qty:1,price:2200,subtotal:2200},{productId:"dp5",name:"Flan casero",qty:2,price:900,subtotal:1800}],       total:4000,  price_list:"retail",    payment_method:"cash",     status:"closed",   notes:"",              created_at:dAgo(6),  discount_type:"pct",   discount_value:0, discount_amount:0, delivery_date:null },
    { id:"ds9",  customer_id:"dc1",  customer_name:"Ana Rodríguez",       items:[{productId:"dp3",name:"Brownie de chocolate",qty:5,price:800,subtotal:4000},{productId:"dp6",name:"Budín de limón",qty:1,price:1300,subtotal:1300}],  total:5300,  price_list:"retail",    payment_method:"transfer", status:"closed",   notes:"",              created_at:dAgo(3),  discount_type:"pct",   discount_value:0, discount_amount:0, delivery_date:null },
    { id:"ds10", customer_id:null,   customer_name:"Anónimo",             items:[{productId:"dp4",name:"Pan de molde sin TACC",qty:1,price:1100,subtotal:1100}],                                                                    total:1100,  price_list:"retail",    payment_method:"cash",     status:"closed",   notes:"",              created_at:dAgo(1),  discount_type:"pct",   discount_value:0, discount_amount:0, delivery_date:null },
    { id:"ds11", customer_id:"dc2",  customer_name:"Comedor La Estrella", items:[{productId:"dp1",name:"Milanesa con puré",qty:5,price:1800,subtotal:9000},{productId:"dp3",name:"Brownie de chocolate",qty:10,price:650,subtotal:6500}],total:15500,price_list:"wholesale", payment_method:"account",  status:"open",     notes:"Entregar mañana",created_at:dAgo(0), discount_type:"pct",   discount_value:0, discount_amount:0, delivery_date:dsAgo(0) },
    { id:"ds12", customer_id:"dc1",  customer_name:"Ana Rodríguez",       items:[{productId:"dp2",name:"Tarta de verduras",qty:2,price:1600,subtotal:3200}],                                                                        total:3200,  price_list:"retail",    payment_method:"cash",     status:"pending",  notes:"Confirmar mañana",created_at:dAgo(0), discount_type:"pct",   discount_value:0, discount_amount:0, delivery_date:dsAgo(1) },
  ],
};

// ─── Init demo DB (writes seed data to localStorage) ─────────────────────────
export function initDemoDb(force = false) {
  const tables = Object.keys(DEMO_SEED);
  for (const table of tables) {
    const k = KEY + table;
    if (force || !localStorage.getItem(k)) {
      localStorage.setItem(k, JSON.stringify(DEMO_SEED[table]));
    }
  }
}

// ─── Reset demo DB ────────────────────────────────────────────────────────────
export function resetDemoDb() {
  const tables = Object.keys(DEMO_SEED);
  for (const table of tables) {
    localStorage.setItem(KEY + table, JSON.stringify(DEMO_SEED[table]));
  }
}
