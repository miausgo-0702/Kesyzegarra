import { describe, expect, it } from "vitest";
import { calcularPrecio, evaluarMercado, pisoEfectivo, simularSerie, triggerMarketCrash, finalizarMarketCrash, REGLAS_DEFAULT } from "@/lib/exchangeEngine";
import { PRODUCTOS } from "@/lib/store/catalogo";

const mojito = { precio_actual: 3800, precio_minimo: 2850, precio_maximo: 5300, objetivo_ventana: 6 };

describe("motor Exchange", () => {
  it("reproduce la tabla de ejemplo de la propuesta (Mojito base $3.800, objetivo 6)", () => {
    // 20:00→6, 20:15→9, 20:30→8, 20:45→10, 21:00→7, 21:15→8
    const serie = simularSerie(mojito, [6, 9, 8, 10, 7, 8], 793);
    expect(serie).toEqual([3800, 3800, 3900, 4000, 4100, 4150, 4250]);
  });

  it("el paso se limita a ±3 % por ventana", () => {
    expect(calcularPrecio(mojito, 30, 793).paso_pct).toBe(3);
    expect(calcularPrecio(mojito, 0, 793).paso_pct).toBe(-3);
  });

  it("NUNCA supera el precio máximo", () => {
    const serie = simularSerie(mojito, Array(60).fill(50), 793);
    expect(Math.max(...serie)).toBe(5300);
  });

  it("NUNCA perfora el piso (máximo entre precio_minimo y costo × 1,35)", () => {
    const serie = simularSerie(mojito, Array(60).fill(0), 793);
    expect(Math.min(...serie)).toBe(2850);
    // con un costo alto, el piso de margen manda sobre el mínimo cargado
    expect(pisoEfectivo(mojito, 2500)).toBe(3400);
    const caro = simularSerie(mojito, Array(60).fill(0), 2500);
    expect(Math.min(...caro)).toBe(3400);
  });

  it("redondea siempre a $50", () => {
    for (const v of [0, 3, 7, 11]) expect(calcularPrecio({ ...mojito, precio_actual: 3777 }, v, 0).precio % 50).toBe(0);
  });

  it("ignora productos no cotizables y los afectados por un crash activo", () => {
    const ahora = Date.now();
    const { crash } = triggerMarketCrash({ productos: PRODUCTOS, ids: [PRODUCTOS[0].id], ahora });
    const cambios = evaluarMercado({ productos: PRODUCTOS, ventas: [], costos: {}, crash, ahora });
    expect(cambios.find((c) => c.producto_id === PRODUCTOS[0].id)).toBeUndefined();
    const agua = PRODUCTOS.find((p) => !p.es_cotizable_bolsa)!;
    expect(cambios.find((c) => c.producto_id === agua.id)).toBeUndefined();
  });

  it("Market Crash lleva al mínimo y restaura los precios previos", () => {
    const prods = PRODUCTOS.map((p) => ({ ...p, precio_actual: p.precio_base + 200 }));
    const ids = prods.slice(0, 3).map((p) => p.id);
    const { crash, precios } = triggerMarketCrash({ productos: prods, ids, minutos: 10 });
    ids.forEach((id) => expect(precios[id]).toBe(prods.find((p) => p.id === id)!.precio_minimo));
    expect(new Date(crash.fin_at).getTime() - new Date(crash.inicio_at).getTime()).toBe(10 * 60_000);
    const rest = finalizarMarketCrash(crash);
    ids.forEach((id) => expect(rest[id]).toBe(prods.find((p) => p.id === id)!.precio_actual));
  });

  it("crash con descuento porcentual no perfora el mínimo", () => {
    const { precios } = triggerMarketCrash({ productos: PRODUCTOS, ids: [PRODUCTOS[0].id], descuento_pct: 90 });
    expect(precios[PRODUCTOS[0].id]).toBe(PRODUCTOS[0].precio_minimo);
    expect(REGLAS_DEFAULT.crash_duracion_min).toBe(10);
  });
});
