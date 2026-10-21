export const WEEK_DAYS = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
];

export const emptyWeekDays = () => Object.fromEntries(
  WEEK_DAYS.map(({ key }) => [key, { lunch: "", dinner: "" }])
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

export const normalizeWeekDays = value => {
  const result = emptyWeekDays();
  WEEK_DAYS.forEach(({ key }) => {
    result[key] = {
      lunch: value?.[key]?.lunch || "",
      dinner: value?.[key]?.dinner || "",
    };
  });
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

const wrapText = (ctx, text, maxWidth) => {
  const words = String(text || "—").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; }
    else line = next;
  }
  lines.push(line);
  return lines.slice(0, 2);
};

export const drawWeeklyMenu = (canvas, weekStart, days) => {
  const ctx = canvas.getContext("2d");
  canvas.width = 1080;
  canvas.height = 1350;
  ctx.fillStyle = "#f7f2e8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#89b8ad";
  ctx.fillRect(0, 0, 1080, 245);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 70px Arial, sans-serif";
  ctx.fillText("MENÚ SEMANAL", 540, 105);
  ctx.font = "500 34px Arial, sans-serif";
  ctx.fillText(`Lunes a viernes · ${weekLabel(weekStart)}`, 540, 170);
  ctx.font = "700 30px Arial, sans-serif";
  ctx.fillText("NUTRIFREE · LIBRE DE GLUTEN", 540, 218);

  WEEK_DAYS.forEach(({ key, label }, index) => {
    const y = 285 + index * 195;
    ctx.fillStyle = index % 2 ? "#ffffff" : "#eef5f2";
    ctx.fillRect(70, y, 940, 165);
    ctx.textAlign = "left";
    ctx.fillStyle = "#4c786f";
    ctx.font = "700 36px Arial, sans-serif";
    ctx.fillText(label.toUpperCase(), 100, y + 48);
    [["ALMUERZO", days[key]?.lunch], ["CENA", days[key]?.dinner]].forEach(([kind, text], col) => {
      const x = 100 + col * 455;
      ctx.fillStyle = "#8a8a84";
      ctx.font = "700 19px Arial, sans-serif";
      ctx.fillText(kind, x, y + 82);
      ctx.fillStyle = "#242a28";
      ctx.font = "600 27px Arial, sans-serif";
      wrapText(ctx, text, 400).forEach((line, lineIndex) => ctx.fillText(line, x, y + 116 + lineIndex * 31));
    });
  });
  ctx.textAlign = "center";
  ctx.fillStyle = "#4c786f";
  ctx.font = "600 28px Arial, sans-serif";
  ctx.fillText("Consultas y pedidos · WhatsApp +54 9 2281 588834", 540, 1300);
};

export const canvasToPng = canvas => new Promise((resolve, reject) =>
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen")), "image/png")
);
