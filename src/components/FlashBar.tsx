import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal'
import { repo } from '../data/repository'
import { useAhorroId, useAhorroPct, useBolsillos, useCapturasNotifPendientesCount, useCategories, useDebts, useFlashBarHidden, useFlashBarModoDisponible, useFlashBarModoFijos, useFlashBarOrder, useMoneda, useObligaciones, useSaldoInicial, useSueldo, useTransactions } from '../hooks/data'
import type { FlashBarItem } from '../hooks/data'
import CaptureNotificationsModal from '../features/settings/CaptureNotificationsModal'
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
  const categorias = useCategories()
  const notifCount = useCapturasNotifPendientesCount()
  const [editarSueldo, setEditarSueldo] = useState(false)
  const [detalleItem, setDetalleItem] = useState<FlashBarItem | null>(null)
  const [mostrarCaptura, setMostrarCaptura] = useState(false)
  const [manualIdx, setManualIdx] = useState<number | null>(null)
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressedRef = useRef(false)
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

  // ── Long-press para ver detalle ──────────────────────────────────────────────
  function pressStart(key: FlashBarItem) {
    longPressedRef.current = false
    pressTimerRef.current = setTimeout(() => {
      longPressedRef.current = true
      setDetalleItem(key)
    }, 500)
  }
  function pressEnd() {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
  }
  function guardedClick(fn: () => void) {
    return () => { if (!longPressedRef.current) fn() }
  }
  const pressProps = (key: FlashBarItem) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); pressStart(key) },
    onPointerUp: pressEnd,
    onPointerLeave: pressEnd,
    onPointerCancel: pressEnd,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    style: { userSelect: 'none' as const, WebkitUserSelect: 'none' as const },
  })

  function renderItem(key: FlashBarItem, isLast: boolean) {
    const widthCls = 'w-[104px]' // Ancho fijo para que no baile
    const borderCls = isLast ? `pl-3 ${widthCls}` : `border-r border-slate-200 px-3 dark:border-slate-700 ${widthCls}`
    const firstBorderCls = isLast ? `pr-0 pl-3 ${widthCls}` : `border-r border-slate-200 pr-3 pl-3 dark:border-slate-700 ${widthCls}`

    switch (key) {
      case 'saldo':
        return (
          <button
            key={key}
            onClick={guardedClick(ciclarBolsillo)}
            className={`flex shrink-0 flex-col items-start ${firstBorderCls}`}
            {...pressProps(key)}
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
            onClick={guardedClick(() => setEditarSueldo(true))}
            className={`flex shrink-0 flex-col items-start ${borderCls}`}
            {...pressProps(key)}
          >
            <span className="text-[10px] text-slate-400 w-full truncate text-left">Sueldo</span>
            <span className="font-semibold text-slate-800 dark:text-slate-100 w-full truncate text-left">
              {formatMoney(sueldo, moneda)}
            </span>
          </button>
        )
      case 'deudas':
        return (
          <div key={key} className={`flex shrink-0 flex-col items-start ${borderCls}`} {...pressProps(key)}>
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
          <button key={key} onClick={guardedClick(() => setModoFijos(m => ((m + 1) % 3) as 0|1|2))} className={`flex shrink-0 flex-col items-start ${borderCls}`} {...pressProps(key)}>
            <span className="text-[10px] text-slate-400 w-full truncate text-left">{labelesFijos[modoFijos]}</span>
            <span className={`font-semibold w-full truncate text-left ${valoresFijos[modoFijos] > 0 ? 'text-amber-600' : 'text-slate-800 dark:text-slate-100'}`}>
              {formatMoney(valoresFijos[modoFijos], moneda)}
            </span>
          </button>
        )
      }
      case 'pendientes':
        return (
          <div key={key} className={`flex shrink-0 flex-col items-start ${borderCls}`} {...pressProps(key)}>
            <span className="text-[10px] text-slate-400 w-full truncate text-left">Gastos pendientes</span>
            <span className={`font-semibold w-full truncate text-left ${totalObligatorios > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
              {formatMoney(totalObligatorios, moneda)}
            </span>
          </div>
        )
      case 'disponible': {
        const valorDisp = disponibleDelTotal ? saldoGlobal - totalObligatorios - deudaMensual : disponible
        return (
          <button key={key} onClick={guardedClick(() => setDisponibleDelTotal(v => !v))} className={`flex shrink-0 flex-col items-start ${borderCls}`} {...pressProps(key)}>
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
          <div key={key} className={`flex shrink-0 flex-col items-start ${borderCls}`} {...pressProps(key)}>
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
      <div className="sticky top-0 z-20 -mx-4 mb-3 flex items-center border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        {/* Items scrollables */}
        <div className="flex flex-1 items-center gap-0 overflow-x-auto px-4 py-2 text-xs">
          {visibleItems.map((key, i) => renderItem(key, i === visibleItems.length - 1))}
        </div>
        {/* Campana — siempre visible, no scrollea */}
        <button
          onClick={() => setMostrarCaptura(true)}
          className="relative mr-2 flex shrink-0 items-center justify-center rounded-full bg-white/50 dark:bg-slate-900/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          style={{ width: 41, height: 40 }}
        >
          <span className="text-lg leading-none">🔔</span>
          {notifCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {notifCount > 9 ? '9+' : notifCount}
            </span>
          )}
        </button>
      </div>

      {mostrarCaptura && (
        <CaptureNotificationsModal onClose={() => setMostrarCaptura(false)} />
      )}

      {editarSueldo && (
        <EditarSueldo sueldo={sueldo} moneda={moneda} onClose={() => setEditarSueldo(false)} />
      )}

      {detalleItem && (
        <DetalleFlashBar
          item={detalleItem}
          moneda={moneda}
          sueldo={sueldo}
          deudas={deudas}
          obligaciones={obligaciones}
          transacciones={transacciones}
          bolsillos={bolsillos}
          categorias={categorias}
          ahorroId={ahorroId}
          ahorroPct={ahorroPct}
          saldoGlobal={saldoGlobal}
          saldoAhorro={saldoAhorro}
          totalDeudas={totalDeudas}
          totalObligatoriosTodos={totalObligatoriosTodos}
          totalObligatorios={totalObligatorios}
          deudaProximoMes={deudaProximoMes}
          deudaMensual={deudaMensual}
          disponible={disponible}
          metaAhorro={metaAhorro}
          modoFijos={modoFijos}
          disponibleDelTotal={disponibleDelTotal}
          onClose={() => setDetalleItem(null)}
        />
      )}
    </>
  )
}

function DetalleFlashBar({
  item, moneda, sueldo, deudas, obligaciones, transacciones, bolsillos, categorias,
  ahorroId, ahorroPct, saldoGlobal, saldoAhorro, totalDeudas,
  totalObligatoriosTodos, totalObligatorios, deudaProximoMes, deudaMensual,
  disponible, metaAhorro, modoFijos, disponibleDelTotal,
  onClose,
}: {
  item: FlashBarItem
  moneda: string
  sueldo: number
  deudas: ReturnType<typeof useDebts>
  obligaciones: ReturnType<typeof useObligaciones>
  transacciones: ReturnType<typeof useTransactions>
  bolsillos: ReturnType<typeof useBolsillos>
  categorias: ReturnType<typeof useCategories>
  ahorroId: number
  ahorroPct: number
  saldoGlobal: number
  saldoAhorro: number
  totalDeudas: number
  totalObligatoriosTodos: number
  totalObligatorios: number
  deudaProximoMes: number
  deudaMensual: number
  disponible: number
  metaAhorro: number
  modoFijos: 0 | 1 | 2
  disponibleDelTotal: boolean
  onClose: () => void
}) {
  const catById = useMemo(() => {
    const m = new Map<number, string>()
    categorias.forEach(c => c.id && m.set(c.id, c.nombre))
    return m
  }, [categorias])

  const labelsObligatorios = ['Gastos fijos', 'Gastos fijos + próx. mes', 'Fijos + deuda total']
  const titulos: Record<FlashBarItem, string> = {
    saldo: 'Saldo por bolsillo',
    sueldo: 'Desglose del sueldo',
    deudas: 'Detalle de deudas',
    obligatorios: labelsObligatorios[modoFijos],
    pendientes: 'Gastos pendientes',
    disponible: disponibleDelTotal ? 'Disponible del total' : 'Disponible del sueldo',
    ahorro: 'Ahorro',
  }

  function Row({ label, value, color }: { label: string; value: number; color?: string }) {
    return (
      <div className="flex items-baseline justify-between py-1.5 text-sm">
        <span className="text-slate-600 dark:text-slate-300">{label}</span>
        <span className={`font-semibold tabular-nums ${color ?? 'text-slate-700 dark:text-slate-200'}`}>
          {formatMoney(value, moneda)}
        </span>
      </div>
    )
  }

  function Divider() {
    return <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
  }

  let content: React.ReactNode = null

  if (item === 'saldo') {
    // Primario = bolsillo de menor id (excluye ahorro)
    const noAhorro = bolsillos.filter(b => b.tipo !== 'credito' && b.id !== ahorroId)
    const primarioId = noAhorro.length ? Math.min(...noAhorro.map(b => b.id!)) : -1
    const otros = noAhorro.filter(b => b.id !== primarioId)
    const otrosSaldo = otros.reduce((sum, b) =>
      sum + transacciones.filter(t => t.bolsilloId === b.id)
        .reduce<number>((s, t) => s + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0), 0)
    const primarioSaldo = saldoGlobal - saldoAhorro - otrosSaldo

    content = (
      <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
        {noAhorro.map(b => {
          const saldo = b.id === primarioId ? primarioSaldo
            : transacciones.filter(t => t.bolsilloId === b.id)
                .reduce<number>((s, t) => s + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0)
          return <Row key={b.id} label={`${b.icono} ${b.nombre}`} value={saldo} color={saldo >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
        })}
        {ahorroId > 0 && <Row label="🐷 Ahorro" value={saldoAhorro} color="text-amber-600" />}
        <Divider />
        <Row label="Total" value={saldoGlobal} color={saldoGlobal >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'} />
      </div>
    )
  }

  if (item === 'sueldo') {
    content = (
      <div>
        <Row label="💰 Sueldo mensual" value={sueldo} />
        <Row label="— Gastos fijos" value={-totalObligatoriosTodos} color="text-amber-600" />
        <Row label="— Deudas próx. mes" value={-deudaProximoMes} color="text-rose-500" />
        <Divider />
        <Row label="≈ Disponible" value={disponible} color={disponible >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
      </div>
    )
  }

  if (item === 'deudas') {
    const debeDeudas = deudas.filter(d => (d.tipo_deuda ?? 'debo') === 'debo')
    content = debeDeudas.length === 0
      ? <p className="py-4 text-center text-sm text-slate-400">Sin deudas registradas.</p>
      : (
        <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
          {debeDeudas.map(d => (
            <Row key={d.id} label={d.nombre} value={pendiente(d)} color="text-rose-600" />
          ))}
          <Divider />
          <Row label="Total pendiente" value={totalDeudas} color="text-rose-600" />
        </div>
      )
  }

  if (item === 'obligatorios' || item === 'pendientes') {
    const lista = item === 'pendientes'
      ? obligaciones.filter(o => !pagadoEsteMes(o, transacciones))
      : obligaciones
    const totalBase = item === 'pendientes' ? totalObligatorios : totalObligatoriosTodos
    content = lista.length === 0
      ? <p className="py-4 text-center text-sm text-slate-400">
          {item === 'pendientes' ? '¡Todo pagado este mes! 🎉' : 'Sin gastos fijos configurados.'}
        </p>
      : (
        <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
          {lista.map(o => {
            const pagado = pagadoEsteMes(o, transacciones)
            const est = estimadoMensual(o, transacciones)
            const nombre = [catById.get(o.categoriaId), o.subcategoria].filter(Boolean).join(' · ')
            return (
              <div key={o.id} className="flex items-baseline justify-between py-1.5 text-sm">
                <span className="text-slate-600 dark:text-slate-300">{nombre || 'Sin nombre'}</span>
                <span className={`font-semibold tabular-nums ${pagado ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {pagado ? '✓ ' : ''}{formatMoney(est, moneda)}
                </span>
              </div>
            )
          })}
          <Divider />
          <Row label="Subtotal fijos" value={totalBase} color="text-amber-600" />
          {item === 'obligatorios' && modoFijos === 1 && (
            <>
              <Row label="+ Deudas próx. mes" value={deudaProximoMes} color="text-rose-500" />
              <Divider />
              <Row label="Total" value={totalObligatoriosTodos + deudaProximoMes} color="text-rose-600" />
            </>
          )}
          {item === 'obligatorios' && modoFijos === 2 && (
            <>
              <Row label="+ Deuda total pendiente" value={totalDeudas} color="text-rose-500" />
              <Divider />
              <Row label="Total" value={totalObligatoriosTodos + totalDeudas} color="text-rose-600" />
            </>
          )}
        </div>
      )
  }

  if (item === 'disponible') {
    if (disponibleDelTotal) {
      const valorTotal = saldoGlobal - totalObligatorios - deudaMensual
      content = (
        <div>
          <Row label="💰 Saldo total" value={saldoGlobal} />
          <Row label="— Gastos pendientes" value={-totalObligatorios} color="text-amber-600" />
          <Row label="— Deudas este mes" value={-deudaMensual} color="text-rose-500" />
          <Divider />
          <Row label="= Disponible del total" value={valorTotal} color={valorTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
        </div>
      )
    } else {
      content = (
        <div>
          <Row label="💰 Sueldo" value={sueldo} />
          <Row label="— Gastos fijos" value={-totalObligatoriosTodos} color="text-amber-600" />
          <Row label="— Deudas próx. mes" value={-deudaProximoMes} color="text-rose-500" />
          <Divider />
          <Row label="= Disponible del sueldo" value={disponible} color={disponible >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
        </div>
      )
    }
  }

  if (item === 'ahorro') {
    content = (
      <div>
        <Row label="🐷 Saldo ahorro" value={saldoAhorro} color="text-amber-600" />
        {metaAhorro > 0 && (
          <>
            <Divider />
            <Row label={`Meta mensual (${ahorroPct}% del disponible)`} value={metaAhorro} color="text-slate-500" />
          </>
        )}
      </div>
    )
  }

  return (
    <Modal title={titulos[item]} onClose={onClose}>
      {content}
    </Modal>
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
