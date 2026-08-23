import { describe, it, expect } from "vitest";
import {
  ROUTES, PUBLIC_PATHS, PAY_RESULT_PATHS, SETTINGS_SECTIONS,
  routeById, pathForPage, pageIdForPath, homePathFor,
  canAccess, navItemsFor, settingsSectionsFor,
} from "./paths.js";

const admin  = { role: "admin",  isDemo: false };
const vendor = { role: "vendor", isDemo: false };
const cocina = { role: "cocina", isDemo: false };
const demo   = { role: "vendor", isDemo: true };

describe("catálogo de rutas", () => {
  it("no repite ids", () => {
    const ids = ROUTES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no repite paths (cada sección tiene su propia URL)", () => {
    const paths = ROUTES.map(r => r.path).filter(Boolean);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("todas las rutas arrancan con / y ninguna choca con una ruta pública", () => {
    const publicos = Object.values(PUBLIC_PATHS);
    for (const r of ROUTES.filter(x => x.path)) {
      expect(r.path.startsWith("/")).toBe(true);
      expect(publicos).not.toContain(r.path);
    }
  });

  it("toda ruta declara al menos un rol", () => {
    for (const r of ROUTES) expect(r.roles.length).toBeGreaterThan(0);
  });

  it("las tres URLs de retorno de pago son públicas", () => {
    expect(PAY_RESULT_PATHS).toHaveLength(3);
    for (const p of PAY_RESULT_PATHS) expect(Object.values(PUBLIC_PATHS)).toContain(p);
  });
});

describe("pathForPage / pageIdForPath", () => {
  it("hace ida y vuelta para toda ruta navegable", () => {
    for (const r of ROUTES.filter(x => x.path)) {
      expect(pathForPage(r.id)).toBe(r.path);
      expect(pageIdForPath(r.path)).toBe(r.id);
    }
  });

  it("cae al dashboard con un id desconocido", () => {
    expect(pathForPage("no-existe")).toBe("/dashboard");
    expect(routeById("no-existe")).toBeNull();
  });

  it("reconoce subrutas de configuración", () => {
    expect(pageIdForPath("/configuracion/empleados")).toBe("settings");
    expect(pageIdForPath("/configuracion")).toBe("settings");
  });

  it("ignora la barra final", () => {
    expect(pageIdForPath("/clientes/")).toBe("customers");
  });

  it("devuelve null para URLs que no son de la app", () => {
    expect(pageIdForPath("/menu-mayorista")).toBeNull();
    expect(pageIdForPath("/")).toBeNull();
    expect(pageIdForPath("/cualquier-cosa")).toBeNull();
  });

  it("no confunde prefijos parecidos", () => {
    expect(pageIdForPath("/produccion")).toBe("production");
    expect(pageIdForPath("/registro-produccion")).toBe("production-log");
  });
});

describe("homePathFor", () => {
  it("manda a cocina al calendario de pedidos", () => {
    expect(homePathFor(cocina)).toBe("/calendario-pedidos");
  });
  it("manda al dashboard al resto", () => {
    expect(homePathFor(admin)).toBe("/dashboard");
    expect(homePathFor(vendor)).toBe("/dashboard");
    expect(homePathFor(null)).toBe("/dashboard");
  });
});

describe("canAccess", () => {
  it("reserva reportes, importar y banco de horas para admin", () => {
    for (const id of ["reports", "import", "hours-bank"]) {
      expect(canAccess(admin, id)).toBe(true);
      expect(canAccess(vendor, id)).toBe(false);
      expect(canAccess(cocina, id)).toBe(false);
    }
  });

  it("habilita a cocina solo en sus secciones", () => {
    for (const id of ["orders-kanban", "recipes", "production", "production-log", "help-admin"]) {
      expect(canAccess(cocina, id)).toBe(true);
    }
    for (const id of ["pos", "customers", "expenses", "settings", "dashboard"]) {
      expect(canAccess(cocina, id)).toBe(false);
    }
  });

  it("el modo demo entra a todo", () => {
    for (const r of ROUTES) expect(canAccess(demo, r.id)).toBe(true);
  });

  it("un id desconocido usa el permiso por defecto (admin/vendor)", () => {
    expect(canAccess(admin, "zzz")).toBe(true);
    expect(canAccess(cocina, "zzz")).toBe(false);
  });

  it("sin usuario no hay acceso", () => {
    expect(canAccess(null, "dashboard")).toBe(false);
  });
});

describe("sidebar", () => {
  it("oculta las rutas sin sección (banco de horas)", () => {
    expect(navItemsFor(admin).map(n => n.id)).not.toContain("hours-bank");
  });

  it("solo muestra ítems permitidos para el rol", () => {
    for (const item of navItemsFor(cocina)) expect(item.roles).toContain("cocina");
    expect(navItemsFor(vendor).map(n => n.id)).not.toContain("reports");
  });

  it("mantiene el orden declarado", () => {
    const ids = navItemsFor(admin).map(n => n.id);
    expect(ids.indexOf("dashboard")).toBeLessThan(ids.indexOf("pos"));
    expect(ids.indexOf("pos")).toBeLessThan(ids.indexOf("settings"));
  });

  it("filtra las subsecciones de configuración por rol", () => {
    expect(settingsSectionsFor(vendor).map(s => s.id)).not.toContain("empleados");
    expect(settingsSectionsFor(admin)).toHaveLength(SETTINGS_SECTIONS.length);
    expect(settingsSectionsFor(demo)).toHaveLength(SETTINGS_SECTIONS.length);
  });
});
