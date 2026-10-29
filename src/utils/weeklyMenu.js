export const WEEK_DAYS = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
];

/**
 * Plantillas de imagen del menú semanal. Los platos de todas se guardan juntos
 * en `weekly_menus.days` (un objeto por día con una clave por comida):
 * - classic: almuerzo y cena (`lunch`, `dinner`).
 * - keto: un solo plato por día (`keto`).
 * Además, cada día guarda en `qty` las unidades a producir de cada comida
 * (`{ lunch: 30, dinner: 20, keto: 10 }`); la imagen de Instagram no las usa.
 */
export const MENU_TYPES = {
  classic: {
    label: "Clásico",
    title: "Menú semanal",
    filePrefix: "menu-semanal",
    slots: [{ key: "lunch", label: "Almuerzo" }, { key: "dinner", label: "Cena" }],
  },
  keto: {
    label: "Keto",
    title: "Menú keto",
    filePrefix: "menu-keto",
    slots: [{ key: "keto", label: "Plato del día", column: "Keto" }],
  },
};
export const DEFAULT_MENU_TYPE = "classic";

const ALL_SLOT_KEYS = Object.values(MENU_TYPES).flatMap(type => type.slots.map(slot => slot.key));

/** Columnas de carga de la pantalla: una por comida de cada plantilla (`column` sobreescribe el rótulo). */
export const MEAL_COLUMNS = Object.values(MENU_TYPES).flatMap(type => type.slots.map(slot => ({ key: slot.key, label: slot.column || slot.label })));

export const normalizeMenuType = value => Object.hasOwn(MENU_TYPES, value) ? value : DEFAULT_MENU_TYPE;

/** Unidades a producir: entero positivo, o "" si está vacío o no es válido. */
export const normalizeQty = value => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : "";
};

/** Nombre de plato normalizado (sin acentos, mayúsculas ni espacios sobrantes) para compararlo con un producto. */
export const mealKey = name => String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

const emptyDay = () => ({
  ...Object.fromEntries(ALL_SLOT_KEYS.map(slot => [slot, ""])),
  qty: Object.fromEntries(ALL_SLOT_KEYS.map(slot => [slot, ""])),
});

export const emptyWeekDays = () => Object.fromEntries(WEEK_DAYS.map(({ key }) => [key, emptyDay()]));

/** ¿La semana tiene al menos un plato cargado para esa plantilla? */
export const hasMenuDishes = (days, type) => WEEK_DAYS.some(({ key }) =>
  MENU_TYPES[normalizeMenuType(type)].slots.some(slot => String(days?.[key]?.[slot.key] || "").trim())
);

export const mondayOf = (value = new Date()) => {
  const date = typeof value === "string" ? new Date(`${value}T12:00:00`) : new Date(value);
  const diff = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - diff);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const shiftWeek = (weekStart, amount) => {
  const date = new Date(`${weekStart}T12:00:00`);
  date.setDate(date.getDate() + amount * 7);
  return mondayOf(date);
};

/** Completa los días que falten y descarta claves desconocidas (los menús viejos no traen `keto` ni `qty`). */
export const normalizeWeekDays = value => {
  const result = emptyWeekDays();
  WEEK_DAYS.forEach(({ key }) => ALL_SLOT_KEYS.forEach(slot => {
    result[key][slot] = value?.[key]?.[slot] || "";
    result[key].qty[slot] = normalizeQty(value?.[key]?.qty?.[slot]);
  }));
  return result;
};

export const weeklyMenuProducts = (products = []) => products
  .filter(product => product.active && /vianda/i.test(product.category || ""))
  .sort((a, b) => a.name.localeCompare(b.name, "es"));

export const weekLabel = weekStart => {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  const fmt = d => d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  return `${fmt(start)} al ${fmt(end)}`;
};

/** Número de día del mes (1-31) del día `index` (0 = lunes) de la semana que empieza en `weekStart`. */
export const dayOfMonth = (weekStart, index) => {
  const date = new Date(`${weekStart}T12:00:00`);
  date.setDate(date.getDate() + index);
  return date.getDate();
};
