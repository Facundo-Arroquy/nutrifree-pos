/**
 * demoData.js — Datos de seed para el modo demo
 *
 * DEMO_SEED contiene datos ficticios para todas las tablas, cubriendo ~70 días
 * de operación para demostrar correctamente los módulos de reportes, tendencias,
 * cierre de caja, proveedores y cuenta corriente.
 *
 * initDemoDb(force?)  — Escribe las tablas en localStorage si no existen.
 * resetDemoDb()       — Sobreescribe todas las tablas con los datos originales.
 *
 * Las claves en localStorage siguen el patrón: "nutrifree_demo_<tabla>"
 * Ninguna función en este archivo toca Supabase.
 */
// ─── DEMO DATA — seed data for the demo environment ──────────────────────────
const KEY = "nutrifree_demo_";

const dAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
const dsAgo = (n) => dAgo(n).slice(0, 10);

// Helper: ISO string with specific hour
const dAgoH = (n, h = 10) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  d.setHours(h, 0, 0, 0); return d.toISOString();
};

export const DEMO_SEED = {
  categories: [
    { name:"Viandas" }, { name:"Panadería" }, { name:"Postres" }, { name:"Bebidas" }, { name:"Servicios" },
  ],
  expense_categories: [
    { name:"Ingredientes" }, { name:"Servicios" }, { name:"Envases" }, { name:"Otros" },
  ],
  products: [
    { id:"dp1", name:"Milanesa con puré",     category:"Viandas",   price_retail:2200, price_wholesale:1800, unit:"unit", stock:14, active:true, photo:null, description:"Milanesa de ternera con puré casero", kit_items:[] },
    { id:"dp2", name:"Tarta de verduras",      category:"Viandas",   price_retail:1600, price_wholesale:1300, unit:"unit", stock:7,  active:true, photo:null, description:"Tarta de acelga y ricota",           kit_items:[] },
    { id:"dp3", name:"Brownie de chocolate",   category:"Panadería", price_retail:800,  price_wholesale:650,  unit:"unit", stock:20, active:true, photo:null, description:"Brownie húmedo sin TACC",            kit_items:[] },
    { id:"dp4", name:"Pan de molde sin TACC",  category:"Panadería", price_retail:1100, price_wholesale:900,  unit:"unit", stock:8,  active:true, photo:null, description:"Pan de molde 400g",                  kit_items:[] },
    { id:"dp5", name:"Flan casero",            category:"Postres",   price_retail:900,  price_wholesale:750,  unit:"unit", stock:6,  active:true, photo:null, description:"Flan de vainilla con caramelo",      kit_items:[] },
    { id:"dp6", name:"Budín de limón",         category:"Postres",   price_retail:1300, price_wholesale:1050, unit:"unit", stock:5,  active:true, photo:null, description:"Budín esponjoso con glaseado",       kit_items:[] },
    { id:"dp7", name:"Envio",                  category:"Servicios", price_retail:800,  price_wholesale:600,  unit:"unit", stock:999, active:true, photo:null, description:"Costo de envío a domicilio",         kit_items:[] },
    { id:"dp8", name:"Envio Extra",            category:"Servicios", price_retail:1200, price_wholesale:900,  unit:"unit", stock:999, active:true, photo:null, description:"Envío a zona extendida",             kit_items:[] },
  ],
  customers: [
    { id:"dc1", name:"Ana Rodríguez",       phone:"11-2345-6789", address:"Av. Santa Fe 1234", notes:"Sin TACC estricto", price_list:"retail",    balance:4200, discount_pct:0,  default_billing:false },
    { id:"dc2", name:"Comedor La Estrella", phone:"11-5678-9012", address:"Av. Belgrano 456",  notes:"Pedido fijo lunes", price_list:"wholesale", balance:18700, discount_pct:5,  default_billing:true  },
    { id:"dc3", name:"Marcos Pérez",        phone:"11-9876-5432", address:"Av. Córdoba 789",   notes:"Prefiere efectivo", price_list:"retail",    balance:0,     discount_pct:0,  default_billing:false },
    { id:"dc4", name:"Panadería El Sol",    phone:"11-4444-5555", address:"Calle Mitre 321",   notes:"Mayorista fijo",    price_list:"wholesale", balance:9500,  discount_pct:10, default_billing:true  },
  ],
  ingredients: [
    { id:"di1", name:"Ternera (nalga)",    category:"Carnes",     unit:"g",    stock:5000, stock_min:500, unit_cost:5.5,  supplier:"Carnicería Don Juan", notes:"" },
    { id:"di2", name:"Chocolate negro",    category:"Repostería", unit:"g",    stock:3000, stock_min:300, unit_cost:3.8,  supplier:"Distribuidora Norte", notes:"Mínimo 60% cacao" },
    { id:"di3", name:"Harina de arroz",    category:"Harinas",    unit:"g",    stock:6000, stock_min:500, unit_cost:0.9,  supplier:"Distribuidora Norte", notes:"Sin TACC" },
    { id:"di4", name:"Manteca",            category:"Lácteos",    unit:"g",    stock:2000, stock_min:200, unit_cost:2.2,  supplier:"Lácteos del Sur",     notes:"" },
    { id:"di5", name:"Huevos",             category:"Lácteos",    unit:"unit", stock:48,   stock_min:12,  unit_cost:180,  supplier:"Lácteos del Sur",     notes:"" },
    { id:"di6", name:"Azúcar",             category:"Secos",      unit:"g",    stock:4000, stock_min:500, unit_cost:0.6,  supplier:"Distribuidora Norte", notes:"" },
  ],
  recipes: [
    { id:"dr1", product_id:"dp1", prep_time:20, cook_time:15, yield:1, notes:"Golpear la carne hasta 1cm.", steps:["Aplanar la carne.","Pasar por huevo y pan rallado.","Freír 3 min por lado.","Preparar el puré."] },
    { id:"dr2", product_id:"dp3", prep_time:15, cook_time:25, yield:12, notes:"No batir de más.", steps:["Derretir chocolate con manteca.","Incorporar harina y azúcar.","Hornear 25 min a 170°C."] },
  ],
  recipe_ingredients: [
    { id:"dri1", recipe_id:"dr1", ingredient_id:"di1", qty:200, unit:"g",    cost:1100 },
    { id:"dri2", recipe_id:"dr1", ingredient_id:"di4", qty:20,  unit:"g",    cost:44 },
    { id:"dri3", recipe_id:"dr2", ingredient_id:"di2", qty:200, unit:"g",    cost:760 },
    { id:"dri4", recipe_id:"dr2", ingredient_id:"di3", qty:80,  unit:"g",    cost:72 },
    { id:"dri5", recipe_id:"dr2", ingredient_id:"di4", qty:150, unit:"g",    cost:330 },
  ],
  suppliers: [
    { id:"ds1", name:"Distribuidora Norte", phone:"11-1111-2222", email:"norte@demo.com", address:"Av. Industrial 100", notes:"Entrega los martes", created_at: dAgo(90) },
    { id:"ds2", name:"Lácteos del Sur",     phone:"11-3333-4444", email:"sur@demo.com",   address:"Calle 9 N°45",       notes:"Pago a 30 días",     created_at: dAgo(80) },
    { id:"ds3", name:"Carnicería Don Juan", phone:"11-7777-8888", email:"",               address:"Mercado Central",    notes:"Solo efectivo",      created_at: dAgo(70) },
  ],
  supplier_payments: [
    { id:"dsp1", supplier_id:"ds1", expense_id:"de1", amount:5200, type:"charge",  payment_method:null,       date:dsAgo(75), notes:"Ingredientes mes anterior",  created_at: dAgo(75) },
    { id:"dsp2", supplier_id:"ds1", expense_id:null,  amount:5200, type:"payment", payment_method:"transfer", date:dsAgo(60), notes:"Pago factura",                created_at: dAgo(60) },
    { id:"dsp3", supplier_id:"ds2", expense_id:"de2", amount:4500, type:"charge",  payment_method:null,       date:dsAgo(45), notes:"Manteca y huevos",            created_at: dAgo(45) },
    { id:"dsp4", supplier_id:"ds2", expense_id:null,  amount:4500, type:"payment", payment_method:"transfer", date:dsAgo(30), notes:"Pago al día",                  created_at: dAgo(30) },
    { id:"dsp5", supplier_id:"ds1", expense_id:"de5", amount:4200, type:"charge",  payment_method:null,       date:dsAgo(20), notes:"Ingredientes mes corriente",   created_at: dAgo(20) },
    { id:"dsp6", supplier_id:"ds3", expense_id:"de6", amount:11000,type:"charge",  payment_method:null,       date:dsAgo(5),  notes:"Ternera semanal",             created_at: dAgo(5) },
  ],
  expenses: [
    // Hace ~2.5 meses
    { id:"de1",  date:dsAgo(75), supplier:"Distribuidora Norte", concept:"Harina de arroz y chocolate",  quantity:1,   unit:"lote",   unit_price:5200,  total:5200,  payment_method:"transfer", payment_status:"paid",    category:"Ingredientes", notes:"",              supplier_id:"ds1" },
    // Hace ~1.5 meses
    { id:"de2",  date:dsAgo(45), supplier:"Lácteos del Sur",     concept:"Manteca 5kg + huevos 60u",     quantity:1,   unit:"lote",   unit_price:4500,  total:4500,  payment_method:"transfer", payment_status:"paid",    category:"Ingredientes", notes:"",              supplier_id:"ds2" },
    { id:"de3",  date:dsAgo(42), supplier:"Gas Natural",         concept:"Factura gas",                  quantity:1,   unit:"mes",    unit_price:3100,  total:3100,  payment_method:"transfer", payment_status:"paid",    category:"Servicios",    notes:"Factura 1180",  supplier_id:null  },
    { id:"de4",  date:dsAgo(40), supplier:"Envases SRL",         concept:"Cajas descartables x200",      quantity:200, unit:"unidad", unit_price:35,    total:7000,  payment_method:"cash",     payment_status:"paid",    category:"Envases",      notes:"",              supplier_id:null  },
    // Hace ~1 mes
    { id:"de5",  date:dsAgo(20), supplier:"Distribuidora Norte", concept:"Harina de arroz y chocolate",  quantity:1,   unit:"lote",   unit_price:4200,  total:4200,  payment_method:"transfer", payment_status:"paid",    category:"Ingredientes", notes:"",              supplier_id:"ds1" },
    { id:"de6",  date:dsAgo(5),  supplier:"Carnicería Don Juan", concept:"Ternera (nalga) 2kg",          quantity:2,   unit:"kg",     unit_price:5500,  total:11000, payment_method:"cash",     payment_status:"pending", category:"Ingredientes", notes:"",              supplier_id:"ds3" },
    { id:"de7",  date:dsAgo(14), supplier:"Gas Natural",         concept:"Factura gas",                  quantity:1,   unit:"mes",    unit_price:3200,  total:3200,  payment_method:"transfer", payment_status:"paid",    category:"Servicios",    notes:"Factura 1195",  supplier_id:null  },
    { id:"de8",  date:dsAgo(10), supplier:"Envases SRL",         concept:"Cajas descartables x100",      quantity:100, unit:"unidad", unit_price:38,    total:3800,  payment_method:"cash",     payment_status:"paid",    category:"Envases",      notes:"",              supplier_id:null  },
    { id:"de9",  date:dsAgo(3),  supplier:"Varios",              concept:"Limpieza y desinfección",      quantity:1,   unit:"mes",    unit_price:1500,  total:1500,  payment_method:"cash",     payment_status:"paid",    category:"Otros",        notes:"",              supplier_id:null  },
  ],
  account_payments: [
    { id:"dap1", customer_id:"dc2", sale_id:"dv3",  amount:12000, type:"charge",  payment_method:null,       date:dsAgo(70), notes:"",          created_at:dAgo(70) },
    { id:"dap2", customer_id:"dc2", sale_id:null,   amount:12000, type:"payment", payment_method:"transfer", date:dsAgo(55), notes:"Pago mes",   created_at:dAgo(55) },
    { id:"dap3", customer_id:"dc2", sale_id:"dv9",  amount:22200, type:"charge",  payment_method:null,       date:dsAgo(36), notes:"",          created_at:dAgo(36) },
    { id:"dap4", customer_id:"dc2", sale_id:null,   amount:15000, type:"payment", payment_method:"transfer", date:dsAgo(20), notes:"Pago parc", created_at:dAgo(20) },
    { id:"dap5", customer_id:"dc4", sale_id:"dv14", amount:9500,  type:"charge",  payment_method:null,       date:dsAgo(12), notes:"",          created_at:dAgo(12) },
    { id:"dap6", customer_id:"dc1", sale_id:"dv17", amount:5300,  type:"charge",  payment_method:null,       date:dsAgo(3),  notes:"",          created_at:dAgo(3)  },
    { id:"dap7", customer_id:"dc1", sale_id:null,   amount:1100,  type:"payment", payment_method:"cash",     date:dsAgo(1),  notes:"Pago parc", created_at:dAgo(1)  },
  ],
  stock_movements: [
    { id:"dsm1", product_id:"dp1", product_name:"Milanesa con puré",   qty:20, type:"production", notes:"Producción semanal",  created_at:dAgo(65) },
    { id:"dsm2", product_id:"dp3", product_name:"Brownie de chocolate", qty:48, type:"production", notes:"Hornada doble",        created_at:dAgo(63) },
    { id:"dsm3", product_id:"dp1", product_name:"Milanesa con puré",   qty:20, type:"production", notes:"Producción semanal",  created_at:dAgo(35) },
    { id:"dsm4", product_id:"dp3", product_name:"Brownie de chocolate", qty:36, type:"production", notes:"Hornada",             created_at:dAgo(33) },
    { id:"dsm5", product_id:"dp2", product_name:"Tarta de verduras",    qty:12, type:"production", notes:"Producción semanal",  created_at:dAgo(20) },
    { id:"dsm6", product_id:"dp1", product_name:"Milanesa con puré",   qty:15, type:"production", notes:"Producción semanal",  created_at:dAgo(7)  },
    { id:"dsm7", product_id:"dp3", product_name:"Brownie de chocolate", qty:24, type:"production", notes:"Hornada",             created_at:dAgo(3)  },
  ],
  cash_shifts: [
    { id:"dcs1", opened_by:"Administrador", opened_at:dAgoH(62,8), closed_at:dAgoH(62,18), status:"closed", initial_cash:8000,  sales_cash:14200, sales_transfer:7800,  sales_card:0,    sales_account:9000,  expenses_cash:3200, expected_cash:19000, counted_cash:18800, difference:-200, notes:"Diferencia mínima",  created_at:dAgo(62) },
    { id:"dcs2", opened_by:"Vendedor",      opened_at:dAgoH(55,8), closed_at:dAgoH(55,18), status:"closed", initial_cash:5000,  sales_cash:11500, sales_transfer:5200,  sales_card:3000, sales_account:0,     expenses_cash:1500, expected_cash:15000, counted_cash:15000, difference:0,    notes:"Cuadrado perfecto",  created_at:dAgo(55) },
    { id:"dcs3", opened_by:"Administrador", opened_at:dAgoH(35,8), closed_at:dAgoH(35,18), status:"closed", initial_cash:10000, sales_cash:22000, sales_transfer:12000, sales_card:0,    sales_account:22200, expenses_cash:7000, expected_cash:25000, counted_cash:25500, difference:500,  notes:"Sobrante de caja",   created_at:dAgo(35) },
    { id:"dcs4", opened_by:"Vendedor",      opened_at:dAgoH(14,8), closed_at:dAgoH(14,18), status:"closed", initial_cash:6000,  sales_cash:16800, sales_transfer:8400,  sales_card:2500, sales_account:9500,  expenses_cash:3800, expected_cash:19000, counted_cash:18700, difference:-300, notes:"",                   created_at:dAgo(14) },
    { id:"dcs5", opened_by:"Administrador", opened_at:dAgoH(2,8),  closed_at:dAgoH(2,18),  status:"closed", initial_cash:12000, sales_cash:18500, sales_transfer:9200,  sales_card:0,    sales_account:12000, expenses_cash:1500, expected_cash:29000, counted_cash:28800, difference:-200, notes:"Diferencia mínima",  created_at:dAgo(2) },
  ],
  sales: [
    // ── Hace ~2 meses ──
    { id:"dv1",  customer_id:"dc1",  customer_name:"Ana Rodríguez",       items:[{productId:"dp1",name:"Milanesa con puré",qty:2,price:2200,subtotal:4400},{productId:"dp6",name:"Budín de limón",qty:2,price:1300,subtotal:2600}],                                                                total:7000,  price_list:"retail",    payment_method:"cash",     status:"closed", notes:"",               created_at:dAgoH(68,10), discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:null },
    { id:"dv2",  customer_id:null,   customer_name:"Anónimo",             items:[{productId:"dp3",name:"Brownie de chocolate",qty:6,price:800,subtotal:4800}],                                                                                                                                       total:4800,  price_list:"retail",    payment_method:"cash",     status:"closed", notes:"",               created_at:dAgoH(67,11), discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:null },
    { id:"dv3",  customer_id:"dc2",  customer_name:"Comedor La Estrella", items:[{productId:"dp1",name:"Milanesa con puré",qty:6,price:1800,subtotal:10800},{productId:"dp2",name:"Tarta de verduras",qty:4,price:1300,subtotal:5200}],                                                              total:12000, price_list:"wholesale", payment_method:"account",  status:"closed", notes:"Pedido lunes",   created_at:dAgoH(64,9),  discount_type:"pct",   discount_value:5,  discount_amount:800,  delivery_date:null },
    { id:"dv4",  customer_id:"dc3",  customer_name:"Marcos Pérez",        items:[{productId:"dp6",name:"Budín de limón",qty:2,price:1300,subtotal:2600},{productId:"dp3",name:"Brownie de chocolate",qty:4,price:800,subtotal:3200}],                                                               total:5800,  price_list:"retail",    payment_method:"cash",     status:"closed", notes:"",               created_at:dAgoH(63,14), discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:null },
    { id:"dv5",  customer_id:"dc1",  customer_name:"Ana Rodríguez",       items:[{productId:"dp4",name:"Pan de molde sin TACC",qty:3,price:1100,subtotal:3300}],                                                                                                                                     total:3300,  price_list:"retail",    payment_method:"transfer", status:"closed", notes:"",               created_at:dAgoH(61,10), discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:null },
    { id:"dv6",  customer_id:null,   customer_name:"Anónimo",             items:[{productId:"dp3",name:"Brownie de chocolate",qty:8,price:800,subtotal:6400}],                                                                                                                                       total:6400,  price_list:"retail",    payment_method:"cash",     status:"closed", notes:"",               created_at:dAgoH(59,12), discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:null },
    { id:"dv7",  customer_id:"dc4",  customer_name:"Panadería El Sol",    items:[{productId:"dp4",name:"Pan de molde sin TACC",qty:10,price:900,subtotal:9000}],                                                                                                                                     total:9000,  price_list:"wholesale", payment_method:"transfer", status:"closed", notes:"Mayorista",      created_at:dAgoH(57,9),  discount_type:"pct",   discount_value:10, discount_amount:1000, delivery_date:null },
    { id:"dv8",  customer_id:"dc3",  customer_name:"Marcos Pérez",        items:[{productId:"dp1",name:"Milanesa con puré",qty:2,price:2200,subtotal:4400},{productId:"dp5",name:"Flan casero",qty:3,price:900,subtotal:2700}],                                                                      total:7100,  price_list:"retail",    payment_method:"cash",     status:"closed", notes:"",               created_at:dAgoH(55,15), discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:null },

    // ── Hace ~1 mes ──
    { id:"dv9",  customer_id:"dc2",  customer_name:"Comedor La Estrella", items:[{productId:"dp1",name:"Milanesa con puré",qty:8,price:1800,subtotal:14400},{productId:"dp2",name:"Tarta de verduras",qty:6,price:1300,subtotal:7800}],                                                              total:22200, price_list:"wholesale", payment_method:"account",  status:"closed", notes:"Pedido semanal", created_at:dAgoH(36,9),  discount_type:"pct",   discount_value:5,  discount_amount:1200, delivery_date:null },
    { id:"dv10", customer_id:null,   customer_name:"Anónimo",             items:[{productId:"dp3",name:"Brownie de chocolate",qty:5,price:800,subtotal:4000},{productId:"dp6",name:"Budín de limón",qty:2,price:1300,subtotal:2600}],                                                                total:6600,  price_list:"retail",    payment_method:"cash",     status:"closed", notes:"",               created_at:dAgoH(35,11), discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:null },
    { id:"dv11", customer_id:"dc1",  customer_name:"Ana Rodríguez",       items:[{productId:"dp1",name:"Milanesa con puré",qty:3,price:2200,subtotal:6600}],                                                                                                                                         total:6600,  price_list:"retail",    payment_method:"transfer", status:"closed", notes:"",               created_at:dAgoH(33,10), discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:null },
    { id:"dv12", customer_id:"dc4",  customer_name:"Panadería El Sol",    items:[{productId:"dp3",name:"Brownie de chocolate",qty:12,price:650,subtotal:7800},{productId:"dp4",name:"Pan de molde sin TACC",qty:6,price:900,subtotal:5400}],                                                          total:13200, price_list:"wholesale", payment_method:"transfer", status:"closed", notes:"Mayorista",      created_at:dAgoH(30,9),  discount_type:"pct",   discount_value:10, discount_amount:1400, delivery_date:null },
    { id:"dv13", customer_id:"dc3",  customer_name:"Marcos Pérez",        items:[{productId:"dp2",name:"Tarta de verduras",qty:2,price:1600,subtotal:3200},{productId:"dp5",name:"Flan casero",qty:2,price:900,subtotal:1800}],                                                                       total:5000,  price_list:"retail",    payment_method:"cash",     status:"closed", notes:"",               created_at:dAgoH(28,13), discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:null },
    { id:"dv14", customer_id:"dc4",  customer_name:"Panadería El Sol",    items:[{productId:"dp4",name:"Pan de molde sin TACC",qty:6,price:900,subtotal:5400},{productId:"dp3",name:"Brownie de chocolate",qty:6,price:650,subtotal:3900},{productId:"dp6",name:"Budín de limón",qty:2,price:1050,subtotal:2100}], total:9500, price_list:"wholesale", payment_method:"account",  status:"closed", notes:"Mayorista",     created_at:dAgoH(12,9),  discount_type:"pct",   discount_value:10, discount_amount:940,  delivery_date:null },
    { id:"dv15", customer_id:"dc2",  customer_name:"Comedor La Estrella", items:[{productId:"dp1",name:"Milanesa con puré",qty:6,price:1800,subtotal:10800},{productId:"dp2",name:"Tarta de verduras",qty:4,price:1300,subtotal:5200}],                                                              total:16000, price_list:"wholesale", payment_method:"account",  status:"closed", notes:"Pedido lunes",   created_at:dAgoH(22,9),  discount_type:"pct",   discount_value:5,  discount_amount:1000, delivery_date:null },
    { id:"dv16", customer_id:null,   customer_name:"Anónimo",             items:[{productId:"dp3",name:"Brownie de chocolate",qty:4,price:800,subtotal:3200},{productId:"dp4",name:"Pan de molde sin TACC",qty:2,price:1100,subtotal:2200}],                                                          total:5400,  price_list:"retail",    payment_method:"cash",     status:"closed", notes:"",               created_at:dAgoH(20,11), discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:null },

    // ── Últimas semanas ──
    { id:"dv17", customer_id:"dc1",  customer_name:"Ana Rodríguez",       items:[{productId:"dp3",name:"Brownie de chocolate",qty:5,price:800,subtotal:4000},{productId:"dp6",name:"Budín de limón",qty:1,price:1300,subtotal:1300}],                                                                total:5300,  price_list:"retail",    payment_method:"account",  status:"closed", notes:"",               created_at:dAgoH(3,10),  discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:null },
    { id:"dv18", customer_id:"dc3",  customer_name:"Marcos Pérez",        items:[{productId:"dp1",name:"Milanesa con puré",qty:1,price:2200,subtotal:2200},{productId:"dp5",name:"Flan casero",qty:2,price:900,subtotal:1800}],                                                                       total:4000,  price_list:"retail",    payment_method:"cash",     status:"closed", notes:"",               created_at:dAgoH(6,14),  discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:null },
    { id:"dv19", customer_id:null,   customer_name:"Anónimo",             items:[{productId:"dp4",name:"Pan de molde sin TACC",qty:1,price:1100,subtotal:1100}],                                                                                                                                     total:1100,  price_list:"retail",    payment_method:"cash",     status:"closed", notes:"",               created_at:dAgoH(1,11),  discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:null },
    { id:"dv20", customer_id:"dc2",  customer_name:"Comedor La Estrella", items:[{productId:"dp1",name:"Milanesa con puré",qty:5,price:1800,subtotal:9000},{productId:"dp3",name:"Brownie de chocolate",qty:10,price:650,subtotal:6500}],                                                             total:15500, price_list:"wholesale", payment_method:"account",  status:"open",   notes:"Entregar mañana", created_at:dAgoH(0,9),   discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:dsAgo(0)  },
    { id:"dv21", customer_id:"dc1",  customer_name:"Ana Rodríguez",       items:[{productId:"dp2",name:"Tarta de verduras",qty:2,price:1600,subtotal:3200}],                                                                                                                                         total:3200,  price_list:"retail",    payment_method:"cash",     status:"pending", notes:"Confirmar mañana", created_at:dAgoH(0,10), discount_type:"pct",   discount_value:0,  discount_amount:0,    delivery_date:dsAgo(1)  },
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
