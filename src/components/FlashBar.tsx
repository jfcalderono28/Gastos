import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { repo } from '../data/repository'
import { useAhorroId, useAhorroPct, useBolsillos, useDebts, useFlashBarHidden, useFlashBarModoDisponible, useFlashBarModoFijos, useFlashBarOrder, useMoneda, useObligaciones, useSaldoInicial, useSueldo, useTransactions } from '../hooks/data'
import type { FlashBarItem } from '../hooks/data'
import { mesActual, sumarMeses } from '../lib/dates'
import { formatMoney } from '../lib/format'
import { montoEnMes, pendiente } from '../features/debts/calc'
import { estimadoMensual, pagadoEsteMes } from '../features/obligatorios/calc'

export default function FlashBar() {
  const sueldo = useSueldo()
  const deudas = useDebts()
  const obligaciones = useObligaciones()
  const transacciones = useTransactions()
  const bolsillos = useBolsillos()
  const ahorroId = useAhorroId()
  const ahorroPct = useAhorroPct()
  const moneda = useMoneda()
  const saldoInicial = useSaldoInicial()
  const orden = useFlashBarOrder()
  const ocultos = useFlashBarHidden()
  const [editarSueldo, setEditarSueldo] = useState(false)
  const [manualIdx, setManualIdx] = useState<number | null>(null)
  const savedModoFijos = useFlashBarModoFijos()
  const savedModoDisponible = useFlashBarModoDisponible()
  const [disponibleDelTotal, setDisponibleDelTotal] = useState(false)
  const [modoFijos, setModoFijos] = useState<0 | 1 | 2>(0)

  useEffect(() => { setModoFijos(savedModoFijos) }, [savedModoFijos])
  useEffect(() => { setDisponibleDelTotal(savedModoDisponible) }, [savedModoDisponible])

  const deudaMensual = useMemo(() => {
    const mes = mesActual()
    let total = 0
    for (const d of deudas) {
      if ((d.tipo_deuda ?? 'debo') === 'debo') total += montoEnMes(d, mes)
    }
    return total
  }, [deudas])

  const deudaProximoMes = useMemo(() => {
    const proximo = sumarMeses(mesActual(), 1)
    let total = 0
    for (const d of deudas) {
      if ((d.tipo_deuda ?? 'debo') === 'debo') total += montoEnMes(d, proximo)
    }
    return total
  }, [deudas])

  // Todos los gastos fijos (pagados + pendientes)
  const totalObligatoriosTodos = useMemo(() => {
    let total = 0
    for (const o of obligaciones) total += estimadoMensual(o, transacciones)
    return total
  }, [obligaciones, transacciones])

  // Solo los gastos fijos pendientes este mes
  const totalObligatorios = useMemo(() => {
    let total = 0
    for (const o of obligaciones) {
      if (!pagadoEsteMes(o, transacciones)) total += estimadoMensual(o, transacciones)
    }
    return total
  }, [obligaciones, transacciones])

  const totalDeudas = useMemo(() => {
    let total = 0
    for (const d of deudas) {
      if ((d.tipo_deuda ?? 'debo') === 'debo') total += pendiente(d)
    }
    return total
  }, [deudas])
  const disponible = sueldo - totalObligatoriosTodos - deudaProximoMes

  const netoTotal = useMemo(
    () => (transacciones ?? []).reduce<number>((s, t) => s + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0),
    [transacciones],
  )
  const saldoGlobal = saldoInicial + netoTotal

  // Bolsillos disponibles para ciclar en "Saldo actual" — excluye el de ahorro
  const bolsillosCiclables = useMemo(
    () => bolsillos.filter(b => b.id !== ahorroId && !b.nombre.toLowerCase().includes('ahorro')),
    [bolsillos, ahorroId],
  )

  const idx = manualIdx !== null ? manualIdx : (
    bolsillosCiclables.length > 0
      ? Math.max(0, bolsillosCiclables.findIndex((b) => b.nombre.toLowerCase() === 'general'))
      : -1
  )

  const saldoAhorro = useMemo(() => {
    if (!ahorroId) return 0
    return transacciones
      .filter((t) => t.bolsilloId === ahorroId)
      .reduce((s, t) => s + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0)
  }, [transacciones, ahorroId])

  const saldoMostrado = useMemo(() => {
    // idx -1 = vista global (General + Ahorro)
    if (idx === -1) return saldoGlobal
    const b = bolsillosCiclables[idx]
    if (!b?.id) return 0

    // El bolsillo primario (el más antiguo, menor id) absorbe las transacciones
    // sin bolsilloId y el saldoInicial. Su saldo = global - ahorro - suma(otros).
    // Esto funciona con 1 o N bolsillos sin depender de cómo están almacenadas las
    // transacciones antiguas.
    const primarioId = Math.min(...bolsillosCiclables.map(x => x.id!))

    if (b.id === primarioId) {
      const otrosSaldos = bolsillosCiclables
        .filter(x => x.id !== primarioId)
        .reduce((sum, x) => sum + transacciones
          .filter(t => t.bolsilloId === x.id)
          .reduce<number>((s, t) => s + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0)
        , 0)
      return saldoGlobal - saldoAhorro - otrosSaldos
    }

    // Bolsillos secundarios: filtrar por id explícito
    let saldo = transacciones
      .filter(t => t.bolsilloId === b.id)
      .reduce<number>((s, t) => s + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0)

    if (b.tipo === 'credito') {
      const debtTotal = deudas
        .filter(d => d.bolsilloId === b.id)
        .reduce((sum, d) => sum + pendiente(d), 0)
      saldo -= debtTotal
    }

    return saldo
  }, [idx, bolsillosCiclables, transacciones, saldoGlobal, saldoAhorro, deudas])

  const etiquetaSaldo = idx === -1
    ? 'Total'
    : `${bolsillosCiclables[idx]?.icono ?? ''} ${bolsillosCiclables[idx]?.nombre ?? ''}`

  function ciclarBolsillo() {
    // Con un solo bolsillo y ahorro activo: alterna entre General (-→ 0) y General+Ahorro (→ -1)
    if (bolsillosCiclables.length === 1 && ahorroId) {
      setManualIdx(idx === -1 ? 0 : -1)
      return
    }
    if (bolsillosCiclables.length <= 1) return
    const nextIdx = idx + 1 >= bolsillosCiclables.length ? -1 : idx + 1
    setManualIdx(nextIdx)
  }

  const metaAhorro = ahorroPct > 0 ? Math.round(disponible * ahorroPct / 100) : 0

  function renderItem(key: FlashBarItem, isLast: boolean) {
    const widthCls = 'w-[104px]' // Ancho fijo para que no baile
    const borderCls = isLast ? `pl-3 ${widthCls}` : `border-r border-slate-200 px-3 dark:border-slate-700 ${widthCls}`
    const firstBorderCls = isLast ? `pr-0 pl-3 ${widthCls}` : `border-r border-slate-200 pr-3 pl-3 dark:border-slate-700 ${widthCls}`

    switch (key) {
      case 'saldo':
        return (
          <button
            key={key}
            onClick={ciclarBolsillo}
            className={`flex shrink-0 flex-col items-start ${firstBorderCls}`}
          >
            <span className="text-[10px] text-slate-400 w-full truncate text-left">{etiquetaSaldo}</span>
            <span className={`font-bold w-full truncate text-left ${saldoMostrado >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatMoney(saldoMostrado, moneda)}
            </span>
          </button>
        )
      case 'sueldo':
        return (
          <button
            key={key}
            onClick={() => setEditarSueldo(true)}
            className={`flex shrink-0 flex-col items-start ${borderCls}`}
          >
            <span className="text-[10px] text-slate-400 w-full truncate text-left">Sueldo</span>
            <span className="font-semibold text-slate-800 dark:text-slate-100 w-full truncate text-left">
              {formatMoney(sueldo, moneda)}
            </span>
          </button>
        )
      case 'deudas':
        return (
          <div key={key} className={`flex shrink-0 flex-col items-start ${borderCls}`}>
            <span className="text-[10px] text-slate-400 w-full truncate text-left">Deudas</span>
            <span className={`font-semibold w-full truncate text-left ${totalDeudas > 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-100'}`}>
              {formatMoney(totalDeudas, moneda)}
            </span>
          </div>
        )
      case 'obligatorios': {
        const labelesFijos = ['Gastos fijos', 'Fijos + próx. mes', 'Fijos + deuda total']
        const valoresFijos = [
          totalObligatoriosTodos,
          totalObligatoriosTodos + deudaProximoMes,
          totalObligatoriosTodos + totalDeudas,
        ]
        return (
          <button key={key} onClick={() => setModoFijos(m => ((m + 1) % 3) as 0|1|2)} className={`flex shrink-0 flex-col items-start ${borderCls}`}>
            <span className="text-[10px] text-slate-400 w-full truncate text-left">{labelesFijos[modoFijos]}</span>
            <span className={`font-semibold w-full truncate text-left ${valoresFijos[modoFijos] > 0 ? 'text-amber-600' : 'text-slate-800 dark:text-slate-100'}`}>
              {formatMoney(valoresFijos[modoFijos], moneda)}
            </span>
          </button>
        )
      }
      case 'pendientes':
        return (
          <div key={key} className={`flex shrink-0 flex-col items-start ${borderCls}`}>
            <span className="text-[10px] text-slate-400 w-full truncate text-left">Gastos pendientes</span>
            <span className={`font-semibold w-full truncate text-left ${totalObligatorios > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
              {formatMoney(totalObligatorios, moneda)}
            </span>
          </div>
        )
      case 'disponible': {
        const valorDisp = disponibleDelTotal ? saldoGlobal - totalObligatorios - deudaMensual : disponible
        return (
          <button key={key} onClick={() => setDisponibleDelTotal(v => !v)} className={`flex shrink-0 flex-col items-start ${borderCls}`}>
            <span className="text-[10px] text-slate-400 w-full truncate text-left">
              {disponibleDelTotal ? 'Disp. del total' : 'Disp. del sueldo'}
            </span>
            <span className={`font-bold w-full truncate text-left ${valorDisp >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatMoney(valorDisp, moneda)}
            </span>
          </button>
        )
      }
      case 'ahorro':
        if (!ahorroId) return null
        return (
          <div key={key} className={`flex shrink-0 flex-col items-start ${borderCls}`}>
            <span className="text-[10px] text-slate-400 w-full truncate text-left">🐷 Ahorro</span>
            <span className="font-semibold text-amber-600 w-full truncate text-left">
              {formatMoney(saldoAhorro, moneda)}
            </span>
            {metaAhorro > 0 && (
              <span className="text-[9px] text-slate-400 w-full truncate text-left">
                meta: {formatMoney(metaAhorro, moneda)}/mes
              </span>
            )}
          </div>
        )
      default:
        return null
    }
  }

  const visibleItems = orden.filter(k => !ocultos.includes(k) && (k !== 'ahorro' || ahorroId > 0))

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 mb-3 flex items-center gap-0 overflow-x-auto border-b border-slate-200 bg-white/95 px-4 py-2 text-xs backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        {visibleItems.map((key, i) => renderItem(key, i === visibleItems.length - 1))}
      </div>

      {editarSueldo && (
        <EditarSueldo sueldo={sueldo} moneda={moneda} onClose={() => setEditarSueldo(false)} />
      )}
    </>
  )
}

function EditarSueldo({
  sueldo,
  moneda,
  onClose,
}: {
  sueldo: number
  moneda: string
  onClose: () => void
}) {
  const [valor, setValor] = useState(sueldo ? String(sueldo) : '')
  async function guardar() {
    await repo.setSetting('sueldo', String(Number(valor) || 0))
    onClose()
  }
  return (
    <Modal title="Mi sueldo" onClose={onClose}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
            Sueldo mensual ({moneda})
          </span>
          <input
            type="number"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-lg dark:border-slate-600"
          />
        </label>
        <button
          onClick={guardar}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white"
        >
          Guardar
        </button>
      </div>
    </Modal>
  )
}
