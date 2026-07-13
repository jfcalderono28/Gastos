import type { Obligacion, Transaction } from '../../data/db'
import { mesActual } from '../../lib/dates'

/** ¿La transacción corresponde a esta obligación (categoría y, si aplica, subcategoría)? */
function coincide(o: Obligacion, t: Transaction): boolean {
  if (t.tipo !== 'gasto' || t.categoriaId !== o.categoriaId) return false
  if (!o.subcategoria) return true
  return (t.subcategoria ?? '').toLowerCase() === o.subcategoria.toLowerCase()
}

/** Promedio mensual de gasto de la obligación (promedia los totales por mes). */
export function promedioMensual(o: Obligacion, txs: Transaction[]): number {
  const porMes: Record<string, number> = {}
  for (const t of txs) {
    if (coincide(o, t)) {
      const m = t.fecha.slice(0, 7)
      porMes[m] = (porMes[m] ?? 0) + t.monto
    }
  }
  const totales = Object.values(porMes)
  if (!totales.length) return 0
  return Math.round(totales.reduce((a, b) => a + b, 0) / totales.length)
}

/** Costo mensual estimado de una obligación: monto fijo o promedio. */
export function estimadoMensual(o: Obligacion, txs: Transaction[]): number {
  return o.montoFijo != null ? o.montoFijo : promedioMensual(o, txs)
}

/** Días que faltan para la fecha límite (diaFin) este mes. Negativo = vencido. */
export function diasParaLimite(o: Obligacion, hoy = new Date()): number {
  return o.diaFin - hoy.getDate()
}

/** ¿Ya hubo gasto de esta obligación este mes? */
export function pagadoEsteMes(o: Obligacion, txs: Transaction[]): boolean {
  const m = mesActual()
  return txs.some((t) => coincide(o, t) && t.fecha.slice(0, 7) === m)
}

/** Clases de fondo según urgencia (más rojo mientras más cerca/vencido). */
export function estiloUrgencia(dias: number, pagado: boolean): string {
  if (pagado) return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100'
  if (dias < 0) return 'bg-red-700 text-white'
  if (dias <= 2) return 'bg-red-600 text-white'
  if (dias <= 5) return 'bg-red-500 text-white'
  if (dias <= 9) return 'bg-orange-400 text-white'
  if (dias <= 14) return 'bg-amber-300 text-amber-950'
  return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
}
