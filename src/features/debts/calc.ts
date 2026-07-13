import type { Debt } from '../../data/db'
import { indiceMes } from '../../lib/dates'

/** Convierte un índice de mes a cadena 'YYYY-MM'. */
function mesDesdeIndice(idx: number): string {
  const y = Math.floor(idx / 12)
  const m = (idx % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

/** Saldo pendiente de una deuda. */
export function pendiente(d: Debt): number {
  return Math.max(0, d.montoTotal - (d.montoPagado ?? 0))
}

/** Cuántas cuotas se consideran ya cubiertas por los pagos hechos. */
export function cuotasPagadas(d: Debt): number {
  if (!d.esCuotas || !d.montoCuota || !d.numCuotas) return 0
  return Math.min(d.numCuotas, Math.floor((d.montoPagado ?? 0) / d.montoCuota))
}

/** Monto que vence en el mes 'YYYY-MM' (0 si no vence nada o ya está pagado). */
export function montoEnMes(d: Debt, mes: string): number {
  if (d.esCuotas) {
    if (!d.mesPrimeraCuota || !d.numCuotas) return 0
    const idx = indiceMes(mes) - indiceMes(d.mesPrimeraCuota)
    if (idx < 0 || idx >= d.numCuotas) return 0
    if (idx < cuotasPagadas(d)) return 0 // cuota ya cubierta por pagos
    return d.montoCuota ?? 0
  }
  if (pendiente(d) <= 0) return 0
  return d.fechaPago && d.fechaPago.slice(0, 7) === mes ? d.montoTotal : 0
}

/** Próxima cuota/pago pendiente desde 'desdeMes' (incluido). Null si ya terminó. */
export function proximaCuota(d: Debt, desdeMes: string): { mes: string; monto: number } | null {
  if (d.esCuotas) {
    if (!d.mesPrimeraCuota || !d.numCuotas) return null
    const inicio = indiceMes(d.mesPrimeraCuota) + cuotasPagadas(d)
    const fin = indiceMes(d.mesPrimeraCuota) + d.numCuotas - 1
    const idx = Math.max(indiceMes(desdeMes), inicio)
    if (idx > fin) return null
    return { mes: mesDesdeIndice(idx), monto: d.montoCuota ?? 0 }
  }
  if (pendiente(d) <= 0) return null
  if (d.fechaPago && d.fechaPago.slice(0, 7) >= desdeMes) {
    return { mes: d.fechaPago.slice(0, 7), monto: d.montoTotal }
  }
  return null
}

/** Número de cuota actual respecto a un mes (1-based) o null. */
export function numeroCuota(d: Debt, mes: string): number | null {
  if (!d.esCuotas || !d.mesPrimeraCuota || !d.numCuotas) return null
  const idx = indiceMes(mes) - indiceMes(d.mesPrimeraCuota)
  return idx >= 0 && idx < d.numCuotas ? idx + 1 : null
}

/** True si la deuda tiene pagos vencidos antes de 'desdeMes' que aún no se han cubierto. */
export function estaAtrasada(d: Debt, desdeMes: string): boolean {
  if (d.esCuotas) {
    if (!d.mesPrimeraCuota || !d.numCuotas) return false
    const pagadas = cuotasPagadas(d)
    if (pagadas >= d.numCuotas) return false
    return indiceMes(d.mesPrimeraCuota) + pagadas < indiceMes(desdeMes)
  }
  return pendiente(d) > 0 && !!d.fechaPago && d.fechaPago.slice(0, 7) < desdeMes
}

/** Monto vencido antes de 'desdeMes' (cuotas o pago único sin pagar). */
export function montoAtrasado(d: Debt, desdeMes: string): number {
  if (!estaAtrasada(d, desdeMes)) return 0
  if (d.esCuotas) {
    const pagadas = cuotasPagadas(d)
    const idxDesde = indiceMes(d.mesPrimeraCuota!) + pagadas
    const idxHasta = Math.min(indiceMes(desdeMes), indiceMes(d.mesPrimeraCuota!) + d.numCuotas!)
    return Math.max(0, idxHasta - idxDesde) * (d.montoCuota ?? 0)
  }
  return pendiente(d)
}
