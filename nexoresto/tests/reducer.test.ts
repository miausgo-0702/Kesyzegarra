import { describe, expect, it } from "vitest";
import { reducir, type Accion } from "@/lib/store/actions";
import { crearEstadoInicial } from "@/lib/store/seed";
import { esperadoTurno } from "@/lib/store/selectors";
import { mesaId, prodId } from "@/lib/store/catalogo";
import type { NexoState } from "@/lib/types";

let n = 0;
const ctx = (now = Date.now()) => ({ now, uid: () => `t-${++n}` });
const run = (s: NexoState, ...as: Accion[]) => as.reduce((acc, a) => reducir(acc, a, ctx()), s);

describe("reductor del sistema (modo demo)", () => {
  it("crear pedido: precio congelado, stock descontado por receta e idempotencia", () => {
    const s0 = { ...crearEstadoInicial(), simulacion: false };
    const ron0 = s0.insumos.find((i) => i.nombre === "Ron blanco")!.stock_actual;
    const pedido: Accion = { type: "crearPedido", tipo: "salon", mesa_id: mesaId(1), idempotency_key: "k1", items: [{ producto_id: prodId(1), cantidad: 2, precio_visto: 1 }] };
    const s1 = run(s0, pedido, pedido); // mismo envío dos veces
    expect(s1.pedidos.filter((p) => p.idempotency_key === "k1")).toHaveLength(1);
    expect(s1.insumos.find((i) => i.nombre === "Ron blanco")!.stock_actual).toBe(ron0 - 100);
    const it = s1.items.find((i) => i.pedido_id === s1.pedidos[0].id)!;
    // precio_visto=1 es menor que el vigente → se respeta lo que vio el cliente
    expect(it.precio_unitario).toBe(1);
    expect(s1.mesas.find((m) => m.id === mesaId(1))!.estado).toBe("esperando");
  });

  it("cobro multipago con propina cierra el pedido, libera la mesa y no cobra dos veces", () => {
    let s = run({ ...crearEstadoInicial(), simulacion: false }, { type: "crearPedido", tipo: "salon", mesa_id: mesaId(1), idempotency_key: "k2", items: [{ producto_id: prodId(9), cantidad: 1 }] });
    const ped = s.pedidos.find((p) => p.idempotency_key === "k2")!;
    const turno = s.turnos.find((t) => t.estado === "abierto")!;
    const mitad = Math.round(ped.total / 2);
    const pago: Accion = { type: "registrarPago", pedido_ids: [ped.id], turno_id: turno.id, pagos: [{ medio: "efectivo", monto: mitad }, { medio: "qr", monto: ped.total - mitad }], propina: 500, idempotency_key: "pay-x" };
    s = run(s, pago, pago);
    const p2 = s.pedidos.find((p) => p.id === ped.id)!;
    expect(p2.estado).toBe("cerrado");
    expect(p2.pagado).toBe(ped.total + 500);
    expect(s.movimientos.filter((m) => m.idempotency_key.startsWith("pay-x"))).toHaveLength(3);
    expect(s.mesas.find((m) => m.id === mesaId(1))!.estado).toBe("libre");
  });

  it("arqueo ciego: calcula la diferencia contra lo esperado al cerrar", () => {
    let s = crearEstadoInicial();
    // cobramos todo lo abierto para poder cerrar
    const turno = s.turnos.find((t) => t.estado === "abierto")!;
    for (const p of s.pedidos.filter((x) => x.tipo === "salon" && x.estado !== "cerrado")) {
      s = run(s, { type: "registrarPago", pedido_ids: [p.id], turno_id: turno.id, pagos: [{ medio: "efectivo", monto: p.total - p.pagado }], propina: 0, idempotency_key: `c-${p.id}` });
    }
    const esperado = esperadoTurno(s, turno.id);
    s = run(s, { type: "cerrarTurno", turno_id: turno.id, declarado: { ...esperado, efectivo: esperado.efectivo - 1200 } });
    expect(s.turnos.find((t) => t.id === turno.id)!.diferencia_total).toBe(-1200);
  });

  it("no se puede cerrar el turno con mesas abiertas", () => {
    const s = crearEstadoInicial();
    const turno = s.turnos.find((t) => t.estado === "abierto")!;
    expect(() => reducir(s, { type: "cerrarTurno", turno_id: turno.id, declarado: {} }, ctx())).toThrow(/sin cobrar/);
  });

  it("votación: un voto por ronda y cupón para la ganadora", () => {
    let s = crearEstadoInicial();
    const foto = s.fotos.find((f) => f.estado === "aprobada")!;
    s = run(s, { type: "votar", foto_id: foto.id, sesion_cliente: "cliente-1" });
    expect(() => reducir(s, { type: "votar", foto_id: foto.id, sesion_cliente: "cliente-1" }, ctx())).toThrow(/Ya usaste/);
    s = run(s, { type: "cerrarVotacion", descuento_pct: 20 });
    const ganadora = s.fotos.find((f) => f.es_ganadora)!;
    expect(ganadora.cupon_codigo).toMatch(/^FOTO-/);
    expect(s.cupones.some((c) => c.codigo === ganadora.cupon_codigo && c.descuento_pct === 20)).toBe(true);
  });

  it("market crash baja a precio mínimo y al vencer restaura los precios", () => {
    const t0 = Date.now();
    let s = crearEstadoInicial(t0);
    const antes = s.productos.find((p) => p.id === prodId(1))!.precio_actual;
    s = reducir(s, { type: "marketCrash", ids: [prodId(1)], mensaje: "test", minutos: 10, descuento_pct: null }, ctx(t0));
    expect(s.productos.find((p) => p.id === prodId(1))!.precio_actual).toBe(s.productos.find((p) => p.id === prodId(1))!.precio_minimo);
    s = reducir(s, { type: "exchangeTick", ventanaMs: 60_000 }, ctx(t0 + 11 * 60_000));
    expect(s.crash).toBeNull();
    // tras restaurar, el tick puede moverlo como máximo ±3 %
    const despues = s.productos.find((p) => p.id === prodId(1))!.precio_actual;
    expect(Math.abs(despues - antes) / antes).toBeLessThanOrEqual(0.031);
  });

  it("agotado (86): no se puede vender y vuelve al reponer", () => {
    let s = run({ ...crearEstadoInicial(), simulacion: false }, { type: "toggleAgotado", producto_id: prodId(9) });
    expect(() => reducir(s, { type: "crearPedido", tipo: "salon", mesa_id: mesaId(1), idempotency_key: "k86", items: [{ producto_id: prodId(9), cantidad: 1 }] }, ctx())).toThrow(/agotado/);
    s = run(s, { type: "toggleAgotado", producto_id: prodId(9) });
    expect(run(s, { type: "crearPedido", tipo: "salon", mesa_id: mesaId(1), idempotency_key: "k86b", items: [{ producto_id: prodId(9), cantidad: 1 }] }).pedidos.some((p) => p.idempotency_key === "k86b")).toBe(true);
  });

  it("mover y unir mesas lleva los pedidos abiertos y libera la de origen", () => {
    let s = run({ ...crearEstadoInicial(), simulacion: false }, { type: "crearPedido", tipo: "salon", mesa_id: mesaId(1), idempotency_key: "mv", items: [{ producto_id: prodId(1), cantidad: 1 }] });
    s = run(s, { type: "moverMesa", origen_id: mesaId(1), destino_id: mesaId(8) });
    expect(s.pedidos.find((p) => p.idempotency_key === "mv")!.mesa_id).toBe(mesaId(8));
    expect(s.mesas.find((m) => m.id === mesaId(1))!.estado).toBe("libre");
    expect(s.mesas.find((m) => m.id === mesaId(8))!.estado).not.toBe("libre");
  });

  it("guardar producto valida el rango y respeta el precio dentro de piso y tope", () => {
    const s0 = crearEstadoInicial();
    expect(() => reducir(s0, { type: "guardarProducto", producto: { nombre: "X", categoria_id: s0.categorias[0].id, precio_base: 1000, precio_minimo: 1200 } }, ctx())).toThrow(/entre el mínimo y el máximo/);
    const s1 = run(s0, { type: "guardarProducto", producto: { nombre: "Caipirinha", categoria_id: s0.categorias[0].id, precio_base: 4000 }, receta: [{ insumo_id: s0.insumos[1].id, cantidad: 1 }] });
    const p = s1.productos.find((x) => x.nombre === "Caipirinha")!;
    expect([p.precio_minimo, p.precio_actual, p.precio_maximo]).toEqual([3000, 4000, 5600]);
    expect(s1.recetas.filter((r) => r.producto_id === p.id)).toHaveLength(1);
  });

  it("venta de mostrador: pedido sin mesa", () => {
    const s = run({ ...crearEstadoInicial(), simulacion: false }, { type: "crearPedido", tipo: "mostrador", mesa_id: null, idempotency_key: "mos", items: [{ producto_id: prodId(5), cantidad: 2 }] });
    const p = s.pedidos.find((x) => x.idempotency_key === "mos")!;
    expect(p.tipo).toBe("mostrador");
    expect(p.mesa_id).toBeNull();
  });
});
