import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { repo } from '../data/repository'

/**
 * Hooks reactivos: leen vía el repositorio pero se re-ejecutan solos cuando
 * cambian los datos (gracias a useLiveQuery sobre Dexie). La UI no toca Dexie.
 */
export function useCategories() {
  return useLiveQuery(() => repo.getCategories(), [], [])
}

export function useTransactions() {
  return useLiveQuery(() => repo.getTransactions(), [], [])
}

export function useBudgets() {
  return useLiveQuery(() => repo.getBudgets(), [], [])
}

export function useDebts() {
  return useLiveQuery(() => repo.getDebts(), [], [])
}

export function useObligaciones() {
  return useLiveQuery(() => repo.getObligaciones(), [], [])
}

export function useBolsillos() {
  return useLiveQuery(() => repo.getBolsillos(), [], [])
}

export function useSueldo(): number {
  const v = useLiveQuery(() => repo.getSetting('sueldo'), [], '0')
  return Number(v ?? '0') || 0
}

export function useMoneda(): string {
  return useLiveQuery(() => repo.getSetting('moneda'), [], 'COP') ?? 'COP'
}

export function useAhorroId(): number {
  const v = useLiveQuery(() => repo.getSetting('ahorroId'), [], '0')
  return Number(v ?? '0') || 0
}

export function useAhorroPct(): number {
  const v = useLiveQuery(() => repo.getSetting('ahorroPct'), [], '0')
  return Number(v ?? '0') || 0
}

/** Saldo que había ANTES del primer movimiento registrado. */
export function useSaldoInicial(): number {
  const v = useLiveQuery(() => repo.getSetting('saldoInicial'), [], '0')
  return Number(v ?? '0') || 0
}

export const FLASHBAR_ITEMS = ['saldo', 'sueldo', 'deudas', 'obligatorios', 'pendientes', 'disponible', 'ahorro'] as const
export type FlashBarItem = (typeof FLASHBAR_ITEMS)[number]

export const DEFAULT_ORDER = FLASHBAR_ITEMS.join(',')

export function useFlashBarOrder(): FlashBarItem[] {
  const v = useLiveQuery(() => repo.getSetting('flashBarOrder'), [], DEFAULT_ORDER) ?? DEFAULT_ORDER
  const saved = v.split(',').filter((k): k is FlashBarItem => FLASHBAR_ITEMS.includes(k as FlashBarItem))
  // Append any new items not yet in the saved order
  const missing = FLASHBAR_ITEMS.filter(k => !saved.includes(k))
  const full = [...saved, ...missing]
  // saldo siempre primero
  return ['saldo', ...full.filter(k => k !== 'saldo')]
}

export function useFlashBarHidden(): FlashBarItem[] {
  const v = useLiveQuery(() => repo.getSetting('flashBarHidden'), [], '') ?? ''
  if (!v) return []
  return v.split(',').filter((k): k is FlashBarItem => FLASHBAR_ITEMS.includes(k as FlashBarItem))
}


export function useFlashBarModoFijos(): 0 | 1 | 2 {
  const v = useLiveQuery(() => repo.getSetting('flashBarModoFijos'), [], '0') ?? '0'
  const n = Number(v)
  return (n === 1 ? 1 : n === 2 ? 2 : 0)
}

export function useFlashBarModoDisponible(): boolean {
  const v = useLiveQuery(() => repo.getSetting('flashBarModoDisponible'), [], '0') ?? '0'
  return v === '1'
}

export function useListasMercado() {
  return useLiveQuery(() => repo.getListasMercado(), [], [])
}

export function useCapturasNotifPendientes() {
  return useLiveQuery(
    () => db.capturasNotif.where('estado').equals('pendiente').reverse().sortBy('timestamp'),
    [],
    [],
  )
}

export function useCapturasNotifHistorial() {
  return useLiveQuery(() => repo.getCapturasNotifHistorial(), []) ?? []
}

export function useCapturasNotifPendientesCount(): number {
  return useLiveQuery(
    () => db.capturasNotif.where('estado').equals('pendiente').count(),
    [],
    0,
  ) ?? 0
}

export function useComprasActivo(): boolean {
  const v = useLiveQuery(() => repo.getSetting('comprasActivo'), [], '0') ?? '0'
  return v === '1'
}

/** Saldo actual de cada bolsillo débito (excluye crédito y ahorro). */
export function useBolsillosSaldos(): Map<number, number> {
  const bolsillos = useBolsillos()
  const transacciones = useTransactions()
  const ahorroId = useAhorroId()
  const saldoInicial = useSaldoInicial()

  return useMemo(() => {
    const map = new Map<number, number>()
    const noAhorro = bolsillos.filter(b => b.id !== ahorroId && b.tipo !== 'credito')
    if (noAhorro.length === 0) return map

    const netoTotal = transacciones.reduce<number>(
      (s, t) => s + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0,
    )
    const saldoGlobal = saldoInicial + netoTotal

    const saldoAhorro = ahorroId
      ? transacciones
          .filter(t => t.bolsilloId === ahorroId)
          .reduce<number>((s, t) => s + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0)
      : 0

    const primarioId = Math.min(...noAhorro.map(b => b.id!))

    for (const b of noAhorro) {
      if (!b.id || b.id === primarioId) continue
      const saldo = transacciones
        .filter(t => t.bolsilloId === b.id)
        .reduce<number>((s, t) => s + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0)
      map.set(b.id, saldo)
    }

    const otrosSaldos = [...map.values()].reduce((s, v) => s + v, 0)
    map.set(primarioId, saldoGlobal - saldoAhorro - otrosSaldos)

    return map
  }, [bolsillos, transacciones, ahorroId, saldoInicial])
}

function txSetting(v: string | undefined | null, fallback: string) {
  return v || fallback
}

function lsColor(key: string, fallback: string) {
  return localStorage.getItem(key) || fallback
}

export function useTxColors() {
  const ingreso      = txSetting(useLiveQuery(() => repo.getSetting('txColorIngreso'),  [], lsColor('txColorIngreso',  '#16a34a')), '#16a34a')
  const gasto        = txSetting(useLiveQuery(() => repo.getSetting('txColorGasto'),    [], lsColor('txColorGasto',    '#dc2626')), '#dc2626')
  const transfer     = txSetting(useLiveQuery(() => repo.getSetting('txColorTransfer'), [], lsColor('txColorTransfer', '#64748b')), '#64748b')
  const ingresoText  = txSetting(useLiveQuery(() => repo.getSetting('txTextIngreso'),   [], lsColor('txTextIngreso',   '#000000')), '#000000')
  const gastoText    = txSetting(useLiveQuery(() => repo.getSetting('txTextGasto'),     [], lsColor('txTextGasto',     '#ffffff')), '#ffffff')
  const transferText = txSetting(useLiveQuery(() => repo.getSetting('txTextTransfer'),  [], lsColor('txTextTransfer',  '#000000')), '#000000')

  // Mantener localStorage sincronizado con los valores reales de la DB.
  // Esto hace la migración automática: en el primer render tras cargar la DB,
  // localStorage queda poblado y en reinicios/cambios de pestaña no hay flash.
  useEffect(() => {
    localStorage.setItem('txColorIngreso',  ingreso)
    localStorage.setItem('txColorGasto',    gasto)
    localStorage.setItem('txColorTransfer', transfer)
    localStorage.setItem('txTextIngreso',   ingresoText)
    localStorage.setItem('txTextGasto',     gastoText)
    localStorage.setItem('txTextTransfer',  transferText)
  }, [ingreso, gasto, transfer, ingresoText, gastoText, transferText])

  return { ingreso, gasto, transfer, ingresoText, gastoText, transferText }
}
