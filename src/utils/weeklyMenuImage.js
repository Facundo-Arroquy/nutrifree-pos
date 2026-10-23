/**
 * Imagen del menú semanal para Instagram (1080×1350, formato 4:5).
 *
 * Estética "papel orgánico": fondo crema con grano, espigas de trigo (el motivo
 * del logo), cabecera y pie de ondas color salvia, y una tarjeta por día con su
 * fecha. Sirve para el menú clásico (almuerzo y cena) y el keto (un plato por
 * día; ver `MENU_TYPES`). Los logos se cargan aparte (`loadWeeklyMenuAssets`)
 * y, si no están disponibles, la imagen se dibuja igual con texto.
 */
import { DEFAULT_MENU_TYPE, MENU_TYPES, WEEK_DAYS, dayOfMonth, normalizeMenuType, weekLabel } from "./weeklyMenu.js";

export const IMAGE_SIZE = { width: 1080, height: 1350 };

const COLORS = {
  sea: "#89b8ad", seaDeep: "#6fa598", forest: "#183b33", ink: "#242a28",
  cream: "#f7f2e8", paper: "#fbf8f1", brown: "#8b4a2b", muted: "#7b807b",
};
const SERIF = '"Playfair Display", Georgia, serif';
const SANS = '"DM Sans", "Helvetica Neue", Arial, sans-serif';

const ROW = { x: 70, width: 940, height: 146, top: 352, step: 172, dayBlock: 152, radius: 28 };
// Tamaños de letra del plato, de mayor a menor. El keto tiene un plato por día: más espacio, letra más grande.
const DISH_STYLES = [{ size: 27, maxLines: 2 }, { size: 24, maxLines: 3 }];
const SINGLE_DISH_STYLES = [{ size: 34, maxLines: 2 }, { size: 28, maxLines: 3 }];
const COLUMN_WIDTH = 346;
const SINGLE_WIDTH = 720;

// ── Utilidades puras ────────────────────────────────────────────────────────

/** Generador pseudoaleatorio determinístico: el grano y las espigas no cambian entre dibujos. */
export const mulberry32 = seed => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const wrapWords = (text, measure, maxWidth) => {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
};

const ellipsize = (text, measure, maxWidth) => {
  if (measure(text) <= maxWidth) return text;
  let value = text;
  while (value && measure(`${value}…`) > maxWidth) value = value.slice(0, -1);
  return `${value.trimEnd()}…`;
};

/**
 * Parte el nombre del plato en líneas que entran en `maxWidth`.
 * Prueba cada estilo de `styles` (27 px en 2 líneas, luego 24 px en 3, por defecto);
 * si ninguno entra, corta con "…". `measure(texto, tamaño)` devuelve el ancho en px.
 */
export const layoutDishText = (text, measure, maxWidth, styles = DISH_STYLES) => {
  const value = String(text || "").trim();
  if (!value) return { size: styles[0].size, lines: [] };
  for (const { size, maxLines } of styles) {
    const lines = wrapWords(value, t => measure(t, size), maxWidth);
    if (lines.length <= maxLines) return { size, lines: lines.map(l => ellipsize(l, t => measure(t, size), maxWidth)) };
  }
  const { size, maxLines } = styles[styles.length - 1];
  const fit = t => measure(t, size);
  const lines = wrapWords(value, fit, maxWidth);
  const kept = lines.slice(0, maxLines - 1).map(l => ellipsize(l, fit, maxWidth));
  return { size, lines: [...kept, ellipsize(lines.slice(maxLines - 1).join(" "), fit, maxWidth)] };
};

// ── Dibujo ──────────────────────────────────────────────────────────────────

const roundedRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const waveBand = (ctx, edge, baseY, amplitude, wavelength, phase, color) => {
  const { width, height } = IMAGE_SIZE;
  const anchorY = edge === "top" ? 0 : height;
  ctx.beginPath();
  ctx.moveTo(0, anchorY);
  for (let x = 0; x <= width; x += 8) ctx.lineTo(x, baseY + amplitude * Math.sin((x / wavelength) * Math.PI * 2 + phase));
  ctx.lineTo(width, anchorY);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
};

const drawLeaf = (ctx, x, y, angle, size) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(size * 0.42, -size * 0.25, size * 0.42, -size * 0.78, 0, -size);
  ctx.bezierCurveTo(-size * 0.42, -size * 0.78, -size * 0.42, -size * 0.25, 0, 0);
  ctx.fill();
  ctx.restore();
};

/** Espiga de trigo: tallo curvo con pares de granos (como las hojas del logo). */
const drawWheat = (ctx, { x, y, length, angle, color, alpha, pairs = 9 }) => {
  const bend = length * 0.08;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(bend * 2, -length * 0.5, 0, -length);
  ctx.stroke();
  for (let i = 0; i < pairs; i += 1) {
    const t = 0.4 + (i / (pairs - 1)) * 0.56;
    const px = 2 * (1 - t) * t * bend * 2;
    const py = -length * t;
    const size = 58 - i * 2.6;
    drawLeaf(ctx, px, py, -0.7, size);
    drawLeaf(ctx, px, py, 0.7, size);
  }
  drawLeaf(ctx, 0, -length + 4, 0, 50 - pairs * 2);
  ctx.restore();
};

const drawBackground = ctx => {
  const { width, height } = IMAGE_SIZE;
  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, "#faf6ec");
  base.addColorStop(1, "#f1e9d8");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  [[960, 560, 400], [40, 1010, 340]].forEach(([cx, cy, r]) => {
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glow.addColorStop(0, "rgba(137,184,173,.26)");
    glow.addColorStop(1, "rgba(137,184,173,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  });

  drawWheat(ctx, { x: 34, y: 1290, length: 600, angle: 0.16, color: COLORS.sea, alpha: 0.68 });
  drawWheat(ctx, { x: 92, y: 1300, length: 420, angle: 0.34, color: COLORS.brown, alpha: 0.26, pairs: 7 });
  drawWheat(ctx, { x: 1048, y: 1290, length: 560, angle: -0.18, color: COLORS.sea, alpha: 0.62 });
  drawWheat(ctx, { x: 990, y: 1300, length: 380, angle: -0.36, color: COLORS.brown, alpha: 0.24, pairs: 7 });
};

const drawGrain = ctx => {
  const { width, height } = IMAGE_SIZE;
  const random = mulberry32(2026);
  for (let i = 0; i < 2600; i += 1) {
    ctx.fillStyle = random() > 0.5 ? "rgba(139,74,43,.05)" : "rgba(24,59,51,.045)";
    ctx.fillRect(random() * width, random() * height, 1 + random() * 1.4, 1 + random() * 1.4);
  }
};

const setLetterSpacing = (ctx, value) => { if ("letterSpacing" in ctx) ctx.letterSpacing = value; };

const drawHeader = (ctx, weekStart, assets, title) => {
  waveBand(ctx, "top", 312, 14, 520, 1.1, COLORS.seaDeep);
  waveBand(ctx, "top", 296, 14, 520, 0.2, COLORS.sea);

  ctx.textAlign = "center";
  if (assets?.wordmark) {
    const width = 380;
    ctx.drawImage(assets.wordmark, 540 - width / 2, 26, width, width * (assets.wordmark.height / assets.wordmark.width));
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = `italic 600 72px ${SERIF}`;
    ctx.fillText("Nutrifree", 540, 100);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = `italic 600 68px ${SERIF}`;
  ctx.fillText(title, 540, 206);

  const label = `Lunes a viernes · ${weekLabel(weekStart)}`;
  ctx.font = `700 25px ${SANS}`;
  setLetterSpacing(ctx, "1px");
  const pillWidth = ctx.measureText(label).width + 56;
  ctx.fillStyle = COLORS.cream;
  roundedRect(ctx, 540 - pillWidth / 2, 228, pillWidth, 46, 23);
  ctx.fill();
  ctx.fillStyle = COLORS.forest;
  ctx.fillText(label, 540, 260);
  setLetterSpacing(ctx, "0px");
};

const drawSun = (ctx, x, y) => {
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 8; i += 1) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8);
    ctx.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
    ctx.stroke();
  }
};

const drawMoon = (ctx, x, y) => {
  ctx.beginPath();
  ctx.arc(x, y, 9, Math.PI * 0.35, Math.PI * 1.65);
  ctx.arc(x + 5, y, 7.5, Math.PI * 1.55, Math.PI * 0.45, true);
  ctx.closePath();
  ctx.fill();
};

const drawLeafIcon = (ctx, x, y) => drawLeaf(ctx, x - 4, y + 8, 0.7, 20);

const drawMeal = (ctx, { kind, text, x, y, icon, styles = DISH_STYLES, maxWidth = COLUMN_WIDTH }) => {
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.brown;
  ctx.strokeStyle = COLORS.brown;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  icon(ctx, x + 12, y + 38);
  ctx.font = `700 18px ${SANS}`;
  setLetterSpacing(ctx, "2px");
  ctx.fillText(kind, x + 34, y + 45);
  setLetterSpacing(ctx, "0px");

  const measure = (value, size) => { ctx.font = `600 ${size}px ${SANS}`; return ctx.measureText(value).width; };
  const { size, lines } = layoutDishText(text, measure, maxWidth, styles);
  if (!lines.length) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 ${size}px ${SANS}`;
    ctx.fillText("—", x, y + 90);
    return;
  }
  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 ${size}px ${SANS}`;
  const first = lines.length > 2 ? 76 : 45 + size + 10; // con 3 líneas, arranca más arriba para no tocar el borde
  lines.forEach((line, i) => ctx.fillText(line, x, y + first + i * (size + 2)));
};

const drawDayRow = (ctx, { key, label }, index, weekStart, days, slots) => {
  const y = ROW.top + index * ROW.step;
  const split = ROW.x + ROW.dayBlock;
  const mid = split + (ROW.width - ROW.dayBlock) / 2;

  ctx.save();
  ctx.shadowColor = "rgba(24,59,51,.14)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 9;
  ctx.fillStyle = "rgba(255,255,255,.92)";
  roundedRect(ctx, ROW.x, y, ROW.width, ROW.height, ROW.radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, ROW.x, y, ROW.width, ROW.height, ROW.radius);
  ctx.clip();
  ctx.fillStyle = index % 2 ? COLORS.seaDeep : COLORS.sea;
  ctx.fillRect(ROW.x, y, ROW.dayBlock, ROW.height);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 22px ${SANS}`;
  setLetterSpacing(ctx, "3px");
  ctx.fillText(label.slice(0, 3).toUpperCase(), ROW.x + ROW.dayBlock / 2, y + 52);
  setLetterSpacing(ctx, "0px");
  ctx.font = `italic 600 62px ${SERIF}`;
  ctx.fillText(String(dayOfMonth(weekStart, index)), ROW.x + ROW.dayBlock / 2, y + 114);

  if (slots.length === 1) {
    const [slot] = slots;
    drawMeal(ctx, { kind: slot.label.toUpperCase(), text: days?.[key]?.[slot.key], x: split + 28, y, icon: drawLeafIcon, styles: SINGLE_DISH_STYLES, maxWidth: SINGLE_WIDTH });
    return;
  }

  ctx.save();
  ctx.strokeStyle = "rgba(137,184,173,.7)";
  ctx.lineWidth = 2;
  ctx.setLineDash([2, 9]);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(mid, y + 26);
  ctx.lineTo(mid, y + ROW.height - 26);
  ctx.stroke();
  ctx.restore();

  const icons = [drawSun, drawMoon];
  slots.forEach((slot, i) => drawMeal(ctx, {
    kind: slot.label.toUpperCase(), text: days?.[key]?.[slot.key], x: (i ? mid : split) + 28, y, icon: icons[i],
  }));
};

const drawFooter = (ctx, assets) => {
  waveBand(ctx, "bottom", 1252, 9, 480, 0.6, COLORS.seaDeep);
  waveBand(ctx, "bottom", 1262, 9, 480, 2.4, COLORS.sea);

  const cx = 540;
  const cy = 1262;
  const radius = 54;
  ctx.save();
  ctx.shadowColor = "rgba(24,59,51,.28)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = COLORS.cream;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  if (assets?.mark) ctx.drawImage(assets.mark, cx - radius, cy - radius, radius * 2, radius * 2);
  else { ctx.fillStyle = COLORS.sea; ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2); }
  ctx.restore();

  ctx.fillStyle = COLORS.forest;
  ctx.font = `600 24px ${SANS}`;
  ctx.textAlign = "right";
  ctx.fillText("Consultas y pedidos", cx - radius - 34, 1296);
  ctx.textAlign = "left";
  ctx.fillText("WhatsApp +54 9 2281 588834", cx + radius + 34, 1296);
};

/** Dibuja el menú de la semana en `canvas`. `assets` (logos) es opcional; `type` es una clave de `MENU_TYPES`. */
export const drawWeeklyMenu = (canvas, weekStart, days, assets = null, type = DEFAULT_MENU_TYPE) => {
  const { title, slots } = MENU_TYPES[normalizeMenuType(type)];
  const ctx = canvas.getContext("2d");
  canvas.width = IMAGE_SIZE.width;
  canvas.height = IMAGE_SIZE.height;
  drawBackground(ctx);
  drawHeader(ctx, weekStart, assets, title);
  WEEK_DAYS.forEach((day, index) => drawDayRow(ctx, day, index, weekStart, days, slots));
  drawFooter(ctx, assets);
  drawGrain(ctx);
};

// ── Recursos (logos y tipografías) ──────────────────────────────────────────

const FONTS_CSS = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;600;700&family=Playfair+Display:ital,wght@1,600&display=swap";
const FONT_TIMEOUT_MS = 4000;

const loadImage = src => new Promise(resolve => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = src;
});

const ensureFonts = async () => {
  if (typeof document === "undefined" || !document.fonts) return;
  if (!document.querySelector(`link[href="${FONTS_CSS}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS_CSS;
    const loaded = new Promise(resolve => { link.onload = resolve; link.onerror = resolve; });
    document.head.appendChild(link);
    await Promise.race([loaded, new Promise(resolve => setTimeout(resolve, FONT_TIMEOUT_MS))]);
  }
  await Promise.race([
    Promise.all([
      document.fonts.load(`italic 600 68px ${SERIF}`),
      document.fonts.load(`600 27px ${SANS}`),
      document.fonts.load(`700 22px ${SANS}`),
    ]).catch(() => {}),
    new Promise(resolve => setTimeout(resolve, FONT_TIMEOUT_MS)),
  ]);
};

let assetsPromise = null;

/** Carga (una sola vez) logos y tipografías. Nunca falla: lo que no cargue queda en null. */
export const loadWeeklyMenuAssets = () => {
  if (!assetsPromise) {
    assetsPromise = Promise.all([loadImage("/imagenes/logo.png"), loadImage("/logo.jpg"), ensureFonts()])
      .then(([wordmark, mark]) => {
        if (!wordmark && !mark) assetsPromise = null; // permite reintentar si no había red
        return { wordmark, mark };
      });
  }
  return assetsPromise;
};

export const canvasToPng = canvas => new Promise((resolve, reject) =>
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen")), "image/png")
);
