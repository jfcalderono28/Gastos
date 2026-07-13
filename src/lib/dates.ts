/** Utilidades de fecha. Trabajamos con cadenas 'YYYY-MM-DD' y meses 'YYYY-MM'. */

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Fecha de hoy como 'YYYY-MM-DD' en horario local. */
export function hoyISO(): string {
  const d = new Date()
  return toISODate(d)
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Mes actual como 'YYYY-MM'. */
export function mesActual(): string {
  return hoyISO().slice(0, 7)
}

/** ¿La fecha 'YYYY-MM-DD' pertenece al mes 'YYYY-MM'? */
export function esDelMes(fechaISO: string, mes: string): boolean {
  return fechaISO.startsWith(mes)
}

/** 'Junio 2026' a partir de 'YYYY-MM'. */
export function nombreMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const nombre = MESES[m - 1] ?? ''
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${y}`
}

/** Suma `delta` meses a un 'YYYY-MM' y devuelve el nuevo 'YYYY-MM'. */
export function sumarMeses(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 'dd/mm' legible para listas. */
export function fechaCorta(fechaISO: string): string {
  const [, m, d] = fechaISO.split('-')
  return `${d}/${m}`
}

/** Índice numérico de un mes 'YYYY-MM' (o fecha 'YYYY-MM-DD'), para comparar/restar. */
export function indiceMes(mes: string): number {
  const [y, m] = mes.slice(0, 7).split('-').map(Number)
  return y * 12 + (m - 1)
}
