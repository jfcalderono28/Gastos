import { useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import CategoriesManager from '../categories/CategoriesManager'
import ImportPage from '../import/ImportPage'
import ObligacionesManager from '../obligatorios/ObligacionesManager'
import Modal from '../../components/Modal'
import { repo } from '../../data/repository'
import { seedSiPrimeraVez } from '../../data/seed'
import { DEFAULT_ORDER, FLASHBAR_ITEMS, useAhorroId, useAhorroPct, useBolsillos, useBolsillosSaldos, useComprasActivo, useMoneda, useSaldoInicial, useTransactions } from '../../hooks/data'
import type { FlashBarItem } from '../../hooks/data'
import { formatMoney } from '../../lib/format'
import { hoyISO } from '../../lib/dates'

import BolsillosManager from '../bolsillos/BolsillosManager'

type Vista = 'menu' | 'categorias' | 'importar' | 'obligatorios' | 'bolsillos'

export default function SettingsPage() {
  const [vista, setVista] = useState<Vista>('menu')
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [activarAhorro, setActivarAhorro] = useState(false)
  const [ajustarSaldo, setAjustarSaldo] = useState(false)
  const [ordenarBarra, setOrdenarBarra] = useState(false)
  const [coloresTx, setColoresTx] = useState(false)
  const [ayuda, setAyuda] = useState(false)
  const ahorroId = useAhorroId()
  const ahorroPct = useAhorroPct()
  const comprasActivo = useComprasActivo()

  if (vista === 'categorias') return <CategoriesManager onVolver={() => setVista('menu')} />
  if (vista === 'importar') return <ImportPage onVolver={() => setVista('menu')} />
  if (vista === 'obligatorios') return <ObligacionesManager onVolver={() => setVista('menu')} />
  if (vista === 'bolsillos') return <BolsillosManager onVolver={() => setVista('menu')} />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Ajustes</h1>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm dark:divide-slate-700 dark:bg-slate-800">
        <Opcion icono="💰" texto="Ajustar saldo" onClick={() => setAjustarSaldo(true)} />
        <Opcion icono="👛" texto="Bolsillos" onClick={() => setVista('bolsillos')} />
        <Opcion icono="🏷️" texto="Categorías" onClick={() => setVista('categorias')} />
        <Opcion icono="📌" texto="Gastos obligatorios" onClick={() => setVista('obligatorios')} />
        <Opcion icono="📥" texto="Importar desde CSV" onClick={() => setVista('importar')} />
        <Opcion icono="💾" texto="Exportar respaldo (CSV)" onClick={exportarRespaldo} />
        <Opcion icono="↕️" texto="Ordenar barra superior" onClick={() => setOrdenarBarra(true)} />
        <Opcion icono="🎨" texto="Colores de movimientos" onClick={() => setColoresTx(true)} />
      </ul>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm dark:divide-slate-700 dark:bg-slate-800">
        {ahorroId ? (
          <OpcionConDetalle
            icono="🐷"
            texto="Ahorro"
            detalle={`${ahorroPct}% del disponible`}
            onClick={() => setActivarAhorro(true)}
          />
        ) : (
          <Opcion icono="🐷" texto="Activar ahorro" onClick={() => setActivarAhorro(true)} />
        )}
        <OpcionConDetalle
          icono="🛒"
          texto="Compras"
          detalle={comprasActivo ? 'Activo · reemplaza Presupuestos' : 'Inactivo'}
          onClick={async () => { await repo.setSetting('comprasActivo', comprasActivo ? '0' : '1') }}
        />
      </ul>

      <ul className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-slate-800">
        <Opcion icono="❓" texto="Ayuda · cómo se calcula la barra" onClick={() => setAyuda(true)} />
      </ul>

      <ul className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-slate-800">
        <Opcion
          icono="🗑️"
          texto="Borrar todos los datos"
          peligro
          onClick={() => setConfirmarBorrado(true)}
        />
      </ul>

      <p className="px-1 text-center text-xs text-slate-400">
        Mi Finanzas · Tus datos se guardan solo en este dispositivo.
      </p>

      {ayuda && <AyudaBarra onClose={() => setAyuda(false)} />}
      {ajustarSaldo && <AjustarSaldo onClose={() => setAjustarSaldo(false)} />}
      {ordenarBarra && <OrdenarBarra onClose={() => setOrdenarBarra(false)} />}
      {coloresTx && <ColoresTransacciones onClose={() => setColoresTx(false)} />}
      {confirmarBorrado && <ConfirmarBorrado onClose={() => setConfirmarBorrado(false)} />}
      {activarAhorro && (
        <ConfigurarAhorro
          ahorroIdActual={ahorroId}
          pctActual={ahorroPct}
          onClose={() => setActivarAhorro(false)}
        />
      )}
    </div>
  )
}

function AjustarSaldo({ onClose }: { onClose: () => void }) {
  const transacciones = useTransactions()
  const bolsillos = useBolsillos()
  const bolsillosSaldos = useBolsillosSaldos()
  const moneda = useMoneda()
  const saldoInicial = useSaldoInicial()

  const esPrimeraVez = transacciones.length === 0 && saldoInicial === 0

  const [bolsilloId, setBolsilloId] = useState<number | ''>(bolsillos[0]?.id ?? '')
  const [valor, setValor] = useState('')
  const [guardando, setGuardando] = useState(false)

  const bolsilloSelId = (typeof bolsilloId === 'number' ? bolsilloId : bolsillos[0]?.id) as number | undefined
  const saldoBolsillo = bolsilloSelId !== undefined ? (bolsillosSaldos.get(bolsilloSelId) ?? 0) : 0

  // Pre-rellenar con el saldo actual del bolsillo seleccionado cuando carga
  const valorNum = valor === '' ? saldoBolsillo : (Number(valor) || 0)
  const diff = valorNum - saldoBolsillo

  async function guardar() {
    const real = valorNum
    if (isNaN(real)) return
    setGuardando(true)

    const fecha = hoyISO()
    const bId = bolsilloSelId

    if (esPrimeraVez) {
      let catId = (await repo.getCategories()).find(
        (c) => c.tipo === 'ingreso' && c.nombre.toLowerCase() === 'saldo inicial',
      )?.id
      if (!catId) {
        catId = await repo.addCategory({
          nombre: 'Saldo inicial',
          tipo: 'ingreso',
          color: '#10b981',
          icono: '🏦',
        })
      }
      await repo.addTransaction({
        tipo: 'ingreso',
        monto: real,
        fecha,
        categoriaId: catId,
        bolsilloId: bId || undefined,
      })
    } else if (diff > 0) {
      let catId = (await repo.getCategories()).find(
        (c) => c.tipo === 'ingreso' && c.nombre.toLowerCase() === 'ingresos no registrados',
      )?.id
      if (!catId) {
        catId = await repo.addCategory({
          nombre: 'Ingresos no registrados',
          tipo: 'ingreso',
          color: '#6366f1',
          icono: '❓',
        })
      }
      await repo.addTransaction({
        tipo: 'ingreso',
        monto: diff,
        fecha,
        categoriaId: catId,
        bolsilloId: bId || undefined,
      })
    } else if (diff < 0) {
      let catId = (await repo.getCategories()).find(
        (c) => c.tipo === 'gasto' && c.nombre.toLowerCase() === 'gastos no registrados',
      )?.id
      if (!catId) {
        catId = await repo.addCategory({
          nombre: 'Gastos no registrados',
          tipo: 'gasto',
          color: '#6366f1',
          icono: '❓',
        })
      }
      await repo.addTransaction({
        tipo: 'gasto',
        monto: Math.abs(diff),
        fecha,
        categoriaId: catId,
        bolsilloId: bId || undefined,
      })
    }

    setGuardando(false)
    onClose()
  }

  return (
    <Modal title="Ajustar saldo" onClose={onClose}>
      <div className="space-y-4">
        {bolsillos.length > 1 && (
          <label className="block">
            <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Bolsillo</span>
            <select
              value={bolsilloId}
              onChange={(e) => { setBolsilloId(e.target.value ? Number(e.target.value) : ''); setValor('') }}
              className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600"
            >
              {bolsillos.filter(b => b.tipo !== 'credito').map((b) => (
                <option key={b.id} value={b.id} className="text-black">
                  {b.icono} {b.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        {!esPrimeraVez && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Saldo actual: <b>{formatMoney(saldoBolsillo, moneda)}</b>
          </p>
        )}

        <label className="block">
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
            {esPrimeraVez ? `¿Con cuánto empiezas? (${moneda})` : `Saldo real ahora (${moneda})`}
          </span>
          <input
            type="number"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={String(saldoBolsillo)}
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-lg dark:border-slate-600"
          />
        </label>

        {!esPrimeraVez && valor !== '' && diff !== 0 && (
          <div className={`rounded-lg px-3 py-2 text-sm ${diff > 0 ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' : 'bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200'}`}>
            {diff > 0
              ? `Se registrará un ingreso de ${formatMoney(diff, moneda)} como "Ingresos no registrados"`
              : `Se registrará un gasto de ${formatMoney(Math.abs(diff), moneda)} como "Gastos no registrados"`}
          </div>
        )}

        <button
          onClick={guardar}
          disabled={guardando || valor === '' || (Number(valor) === saldoBolsillo && !esPrimeraVez)}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Modal>
  )
}

const ITEM_LABELS: Record<FlashBarItem, string> = {
  saldo: '💰 Total',
  sueldo: '💵 Sueldo',
  deudas: '💳 Deudas',
  obligatorios: '📌 Gastos fijos',
  pendientes: '⏳ Gastos pendientes',
  disponible: '📊 Disponible',
  ahorro: '🐷 Ahorro',
}

const MODOS_FIJOS = ['Gastos fijos', 'Fijos + próx. mes', 'Fijos + deuda total'] as const
const MODOS_DISPONIBLE = ['Disp. del sueldo', 'Disp. del total'] as const

function OrdenarBarra({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<FlashBarItem[]>([])
  const [hidden, setHidden] = useState<Set<FlashBarItem>>(new Set())
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [modoFijos, setModoFijos] = useState<0 | 1 | 2>(0)
  const [modoDisponible, setModoDisponible] = useState<0 | 1>(0)
  const listRef = useRef<HTMLUListElement>(null)
  const touchRef = useRef<{ fromIdx: number; overIdx: number } | null>(null)

  useEffect(() => {
    Promise.all([
      repo.getSetting('flashBarOrder'),
      repo.getSetting('flashBarHidden'),
      repo.getSetting('flashBarModoFijos'),
      repo.getSetting('flashBarModoDisponible'),
    ]).then(([orderV, hiddenV, modoFijosV, modoDispV]) => {
      const order = orderV ?? DEFAULT_ORDER
      const ordered = order.split(',').filter((k): k is FlashBarItem => FLASHBAR_ITEMS.includes(k as FlashBarItem))
      for (const item of FLASHBAR_ITEMS) {
        if (!ordered.includes(item)) ordered.push(item)
      }
      setItems(ordered)
      if (hiddenV) {
        setHidden(new Set(hiddenV.split(',').filter((k): k is FlashBarItem => FLASHBAR_ITEMS.includes(k as FlashBarItem))))
      }
      const mf = Number(modoFijosV ?? '0')
      setModoFijos(mf === 1 ? 1 : mf === 2 ? 2 : 0)
      setModoDisponible(modoDispV === '1' ? 1 : 0)
    })
  }, [])

  // ── Touch drag (mobile) ──────────────────────────────────────
  // Attach non-passive touchmove on document only while dragging
  useEffect(() => {
    if (dragIdx === null) return

    function recalcOver(clientY: number) {
      if (!listRef.current) return
      const lis = listRef.current.querySelectorAll('li[data-idx]')
      let newOver = touchRef.current?.fromIdx ?? 0
      for (let i = 0; i < lis.length; i++) {
        const rect = lis[i].getBoundingClientRect()
        if (clientY < rect.top + rect.height / 2) { newOver = i; break }
        if (i === lis.length - 1) newOver = i
      }
      if (touchRef.current) touchRef.current.overIdx = newOver
      setOverIdx(newOver)
    }

    function onMove(e: TouchEvent) {
      e.preventDefault()
      recalcOver(e.touches[0].clientY)
    }

    function onEnd() {
      if (touchRef.current) {
        const from = touchRef.current.fromIdx
        const to = touchRef.current.overIdx
        if (from !== to) {
          setItems(prev => {
            const copy = [...prev]
            const [item] = copy.splice(from, 1)
            copy.splice(to, 0, item)
            return copy
          })
        }
      }
      touchRef.current = null
      setDragIdx(null)
      setOverIdx(null)
    }

    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    return () => {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [dragIdx])

  // ── HTML5 DnD (desktop) ──────────────────────────────────────
  function onDragStart(e: React.DragEvent, idx: number) {
    e.dataTransfer.effectAllowed = 'move'
    setDragIdx(idx)
  }
  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverIdx(idx)
  }
  function onDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault()
    if (dragIdx !== null && dragIdx !== toIdx) {
      const copy = [...items]
      const [item] = copy.splice(dragIdx, 1)
      copy.splice(toIdx, 0, item)
      setItems(copy)
    }
    setDragIdx(null)
    setOverIdx(null)
  }
  function onDragEnd() {
    setDragIdx(null)
    setOverIdx(null)
  }

  // ── Touch drag handle start ──────────────────────────────────
  function onHandleTouchStart(_e: React.TouchEvent, idx: number) {
    touchRef.current = { fromIdx: idx, overIdx: idx }
    setDragIdx(idx)
    setOverIdx(idx)
  }

  // ── Arrow fallback ────────────────────────────────────────────
  function mover(idx: number, dir: -1 | 1) {
    const next = idx + dir
    if (next < 0 || next >= items.length) return
    const copy = [...items]
    ;[copy[idx], copy[next]] = [copy[next], copy[idx]]
    setItems(copy)
  }

  // ── Visibility toggle ─────────────────────────────────────────
  function toggleHidden(item: FlashBarItem) {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(item)) next.delete(item); else next.add(item)
      return next
    })
  }

  // ── Save ──────────────────────────────────────────────────────
  async function guardar() {
    await repo.setSetting('flashBarOrder', items.join(','))
    await repo.setSetting('flashBarHidden', [...hidden].join(','))
    await repo.setSetting('flashBarModoFijos', String(modoFijos))
    await repo.setSetting('flashBarModoDisponible', String(modoDisponible))
    onClose()
  }

  if (items.length === 0) return null // cargando

  return (
    <Modal title="Ordenar barra superior" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Arrastra ⠿ para reordenar · Toca 👁 para ocultar · Toca la etiqueta de color para elegir el modo por defecto
        </p>
        <ul ref={listRef} className="space-y-1 select-none">
          {items.map((item, i) => {
            const isHidden = hidden.has(item)
            const isDragging = dragIdx === i
            const isOver = overIdx === i && dragIdx !== null && dragIdx !== i
            return (
              <li
                key={item}
                data-idx={i}
                draggable
                onDragStart={(e) => onDragStart(e, i)}
                onDragOver={(e) => onDragOver(e, i)}
                onDrop={(e) => onDrop(e, i)}
                onDragEnd={onDragEnd}
                className={[
                  'flex items-center gap-2 rounded-xl px-2 py-2.5 transition-all duration-150',
                  isDragging ? 'opacity-30 scale-[0.97]' : '',
                  isOver ? 'ring-2 ring-emerald-500 ring-offset-1' : 'ring-0',
                  isHidden
                    ? 'bg-slate-100/60 dark:bg-slate-700/20'
                    : 'bg-slate-50 dark:bg-slate-700/50',
                ].join(' ')}
              >
                {/* Drag handle (desktop: drag attribute | mobile: touch events) */}
                <span
                  className="cursor-grab touch-none select-none px-1 text-lg text-slate-300 dark:text-slate-600 active:cursor-grabbing"
                  onTouchStart={(e) => onHandleTouchStart(e, i)}
                >
                  ⠿
                </span>

                {/* Label + modo */}
                <div className="flex flex-1 flex-col min-w-0">
                  <span
                    className={[
                      'text-sm font-medium transition-all',
                      isHidden
                        ? 'text-slate-400 line-through dark:text-slate-500'
                        : 'text-slate-800 dark:text-slate-100',
                    ].join(' ')}
                  >
                    {ITEM_LABELS[item]}
                  </span>
                  {item === 'obligatorios' && (
                    <button
                      onClick={() => setModoFijos(m => ((m + 1) % 3) as 0 | 1 | 2)}
                      className="mt-0.5 w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                    >
                      Por defecto: {MODOS_FIJOS[modoFijos]} →
                    </button>
                  )}
                  {item === 'disponible' && (
                    <button
                      onClick={() => setModoDisponible(m => (m === 0 ? 1 : 0))}
                      className="mt-0.5 w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    >
                      Por defecto: {MODOS_DISPONIBLE[modoDisponible]} →
                    </button>
                  )}
                </div>

                {/* Arrow buttons */}
                <button
                  onClick={() => mover(i, -1)}
                  disabled={i === 0}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-xs text-slate-600 disabled:opacity-25 dark:bg-slate-600 dark:text-slate-300"
                >↑</button>
                <button
                  onClick={() => mover(i, 1)}
                  disabled={i === items.length - 1}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-xs text-slate-600 disabled:opacity-25 dark:bg-slate-600 dark:text-slate-300"
                >↓</button>

                {/* Visibility toggle */}
                <button
                  onClick={() => toggleHidden(item)}
                  title={isHidden ? 'Mostrar en barra' : 'Ocultar de barra'}
                  className={[
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base transition-colors',
                    isHidden
                      ? 'bg-slate-200 text-slate-400 dark:bg-slate-700'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                  ].join(' ')}
                >
                  {isHidden ? '🙈' : '👁'}
                </button>
              </li>
            )
          })}
        </ul>

        {/* Preview de cuántos visibles quedan */}
        <p className="text-center text-xs text-slate-400">
          {items.filter(k => !hidden.has(k)).length} de {items.length} elementos visibles
        </p>

        <button
          onClick={guardar}
          className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white active:scale-[0.98]"
        >
          Guardar cambios
        </button>
      </div>
    </Modal>
  )
}

function ConfirmarBorrado({ onClose }: { onClose: () => void }) {
  const [borrando, setBorrando] = useState(false)

  async function borrar() {
    setBorrando(true)
    await repo.borrarTodo()
    await seedSiPrimeraVez() // restaura categorías por defecto
    setBorrando(false)
    onClose()
  }

  return (
    <Modal title="¿Borrar todos los datos?" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Se eliminarán <b>todos</b> tus movimientos, presupuestos y categorías personalizadas, y
          la app volverá a empezar de cero (con las categorías por defecto). Esta acción no se
          puede deshacer.
        </p>
        <button
          onClick={borrar}
          disabled={borrando}
          className="w-full rounded-lg bg-red-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {borrando ? 'Borrando…' : 'Sí, borrar todo'}
        </button>
        <button
          onClick={onClose}
          className="w-full rounded-lg py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          Cancelar
        </button>
      </div>
    </Modal>
  )
}

async function exportarRespaldo() {
  const [txs, cats] = await Promise.all([repo.getTransactions(), repo.getCategories()])
  const nombre = new Map(cats.map((c) => [c.id, c.nombre]))
  const filas = txs.map((t) => ({
    fecha: t.fecha,
    tipo: t.tipo,
    monto: t.monto,
    categoria: nombre.get(t.categoriaId) ?? '',
    nota: t.nota ?? '',
  }))
  const csv = Papa.unparse(filas)
  const filename = `respaldo-finanzas-${new Date().toISOString().slice(0, 10)}.csv`
  const file = new File([csv], filename, { type: 'text/csv;charset=utf-8' })

  // En Android (Capacitor) usar Web Share API con archivo
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: filename })
    return
  }

  // Fallback para navegador web
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ConfigurarAhorro({
  ahorroIdActual,
  pctActual,
  onClose,
}: {
  ahorroIdActual: number
  pctActual: number
  onClose: () => void
}) {
  const bolsillos = useBolsillos()
  const transacciones = useTransactions()
  const moneda = useMoneda()
  const [pct, setPct] = useState(pctActual ? String(pctActual) : '10')
  const [guardando, setGuardando] = useState(false)
  const [confirmarDesactivar, setConfirmarDesactivar] = useState(false)
  const [destinoId, setDestinoId] = useState<number>(0)

  const saldoAhorro = useMemo(() => {
    if (!ahorroIdActual) return 0
    return transacciones
      .filter((t) => t.bolsilloId === ahorroIdActual)
      .reduce((s, t) => s + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0)
  }, [transacciones, ahorroIdActual])

  const otrosBolsillos = bolsillos.filter((b) => b.id !== ahorroIdActual)

  async function guardar() {
    const porcentaje = Math.max(1, Math.min(100, Number(pct) || 10))
    setGuardando(true)

    let bolsilloId = ahorroIdActual
    if (!bolsilloId) {
      // Reusar bolsillo "Ahorro" existente si quedó huérfano
      const existente = bolsillos.find((b) => b.nombre === 'Ahorro')
      if (existente?.id) {
        bolsilloId = existente.id
      } else {
        bolsilloId = await repo.addBolsillo({
          nombre: 'Ahorro',
          icono: '🐷',
          color: '#f59e0b',
        })
      }
    }

    await repo.setSetting('ahorroId', String(bolsilloId))
    await repo.setSetting('ahorroPct', String(porcentaje))
    setGuardando(false)
    onClose()
  }

  async function desactivar() {
    setGuardando(true)

    // Si hay saldo, transferirlo al bolsillo destino
    if (saldoAhorro > 0 && destinoId) {
      const cats = await repo.getCategories()
      let catGasto = cats.find((c) => c.tipo === 'gasto' && c.nombre.toLowerCase() === 'transferencias')
      let catIngreso = cats.find((c) => c.tipo === 'ingreso' && c.nombre.toLowerCase() === 'transferencias')
      const gastoId = catGasto?.id ?? await repo.addCategory({ nombre: 'Transferencias', tipo: 'gasto', color: '#6366f1', icono: '🔄' })
      const ingresoId = catIngreso?.id ?? await repo.addCategory({ nombre: 'Transferencias', tipo: 'ingreso', color: '#6366f1', icono: '🔄' })

      const destinoNombre = otrosBolsillos.find((b) => b.id === destinoId)?.nombre ?? ''
      const nota = `Cierre de ahorro → ${destinoNombre}`
      const fecha = hoyISO()

      await repo.addTransaction({ tipo: 'gasto', monto: saldoAhorro, fecha, categoriaId: gastoId, nota, bolsilloId: ahorroIdActual })
      await repo.addTransaction({ tipo: 'ingreso', monto: saldoAhorro, fecha, categoriaId: ingresoId, nota, bolsilloId: destinoId })
    }

    // Eliminar el bolsillo y limpiar settings
    if (ahorroIdActual) await repo.deleteBolsillo(ahorroIdActual)
    await repo.setSetting('ahorroId', '0')
    await repo.setSetting('ahorroPct', '0')
    setGuardando(false)
    onClose()
  }

  // Pantalla de confirmación de desactivación
  if (confirmarDesactivar) {
    // Inicializar destino al primer bolsillo disponible
    if (!destinoId && otrosBolsillos.length > 0) setDestinoId(otrosBolsillos[0].id!)

    return (
      <Modal title="Desactivar ahorro" onClose={onClose}>
        <div className="space-y-4">
          {saldoAhorro > 0 ? (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Tu ahorro tiene <b>{formatMoney(saldoAhorro, moneda)}</b>. ¿A qué bolsillo quieres mover ese dinero?
              </p>
              <label className="block">
                <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Transferir a</span>
                <select
                  value={destinoId}
                  onChange={(e) => setDestinoId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-black dark:border-slate-600"
                >
                  {otrosBolsillos.map((b) => (
                    <option key={b.id} value={b.id} className="text-black">
                      {b.icono} {b.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              El ahorro no tiene saldo. Se eliminará el bolsillo.
            </p>
          )}

          <button
            onClick={desactivar}
            disabled={guardando || (saldoAhorro > 0 && !destinoId)}
            className="w-full rounded-lg bg-red-600 py-3 font-semibold text-white disabled:opacity-40"
          >
            {guardando ? 'Desactivando…' : saldoAhorro > 0 ? 'Transferir y desactivar' : 'Desactivar ahorro'}
          </button>
          <button
            onClick={() => setConfirmarDesactivar(false)}
            className="w-full rounded-lg py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Cancelar
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={ahorroIdActual ? 'Configurar ahorro' : 'Activar ahorro'} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          El ahorro es un bolsillo especial donde apartas dinero. Se muestra en la barra
          superior como referencia. Tú decides cuándo mover dinero aquí con una transferencia.
        </p>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
            ¿Qué % del disponible mensual quieres ahorrar?
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              autoFocus
              className="w-24 rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-center text-lg dark:border-slate-600"
            />
            <span className="text-lg text-slate-600 dark:text-slate-300">%</span>
          </div>
        </label>

        <button
          onClick={guardar}
          disabled={guardando}
          className="w-full rounded-lg bg-amber-500 py-3 font-semibold text-white disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : ahorroIdActual ? 'Guardar cambios' : 'Activar ahorro'}
        </button>

        {ahorroIdActual > 0 && (
          <button
            onClick={() => setConfirmarDesactivar(true)}
            disabled={guardando}
            className="w-full rounded-lg py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Desactivar ahorro
          </button>
        )}
      </div>
    </Modal>
  )
}

function AyudaBarra({ onClose }: { onClose: () => void }) {
  const items: { icono: string; nombre: string; formula: string; nota?: string }[] = [
    {
      icono: '💰',
      nombre: 'Total',
      formula: 'Saldo inicial + todos los ingresos − todos los gastos',
      nota: 'Suma de todos los bolsillos débito y ahorro. Toca para ver por bolsillo.',
    },
    {
      icono: '💵',
      nombre: 'Sueldo',
      formula: 'Valor configurado manualmente',
      nota: 'Tócalo para editarlo.',
    },
    {
      icono: '💳',
      nombre: 'Deudas',
      formula: 'Suma del saldo pendiente de todas las deudas (tipo "Debo")',
    },
    {
      icono: '📌',
      nombre: 'Gastos fijos',
      formula: 'Suma del estimado mensual de todos los gastos obligatorios (pagados o no)',
      nota: 'Toca para ciclar entre 3 modos:',
    },
    {
      icono: '📌',
      nombre: 'Fijos + próx. mes',
      formula: 'Gastos fijos + cuotas/deudas que vencen el próximo mes',
    },
    {
      icono: '📌',
      nombre: 'Fijos + deuda total',
      formula: 'Gastos fijos + saldo pendiente total de todas las deudas (tipo "Debo")',
    },
    {
      icono: '⏳',
      nombre: 'Gastos pendientes',
      formula: 'Suma de gastos obligatorios aún NO pagados este mes',
    },
    {
      icono: '📊',
      nombre: 'Disp. del sueldo',
      formula: 'Sueldo − gastos fijos − deudas del próximo mes',
      nota: 'Toca para cambiar a modo "Disp. del total".',
    },
    {
      icono: '📊',
      nombre: 'Disp. del total',
      formula: 'Total (saldo real) − gastos fijos pendientes − deudas de este mes',
    },
    {
      icono: '🐷',
      nombre: 'Ahorro',
      formula: 'Suma de movimientos en el bolsillo de ahorro',
      nota: 'Solo aparece si el ahorro está activado.',
    },
  ]

  return (
    <Modal title="Cómo se calcula la barra" onClose={onClose}>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.nombre} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-700/40">
            <div className="mb-1 flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
              <span>{item.icono}</span>
              <span>{item.nombre}</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-mono text-xs bg-slate-200 dark:bg-slate-600 px-1 rounded">=</span>{' '}
              {item.formula}
            </p>
            {item.nota && (
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{item.nota}</p>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}

function Opcion({
  icono,
  texto,
  onClick,
  peligro,
}: {
  icono: string
  texto: string
  onClick: () => void
  peligro?: boolean
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
          peligro ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'
        }`}
      >
        <span className="text-xl">{icono}</span>
        <span className="flex-1">{texto}</span>
        <span className="text-slate-300">›</span>
      </button>
    </li>
  )
}

function OpcionConDetalle({
  icono,
  texto,
  detalle,
  onClick,
}: {
  icono: string
  texto: string
  detalle: string
  onClick: () => void
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700/50"
      >
        <span className="text-xl">{icono}</span>
        <div className="flex-1">
          <div>{texto}</div>
          <div className="text-xs text-slate-400">{detalle}</div>
        </div>
        <span className="text-slate-300">›</span>
      </button>
    </li>
  )
}

function ColoresTransacciones({ onClose }: { onClose: () => void }) {
  const [ingreso, setIngreso] = useState('#16a34a')
  const [gasto, setGasto] = useState('#dc2626')
  const [transfer, setTransfer] = useState('#64748b')
  const [ingresoText, setIngresoText] = useState('#000000')
  const [gastoText, setGastoText] = useState('#ffffff')
  const [transferText, setTransferText] = useState('#000000')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      repo.getSetting('txColorIngreso'),
      repo.getSetting('txColorGasto'),
      repo.getSetting('txColorTransfer'),
      repo.getSetting('txTextIngreso'),
      repo.getSetting('txTextGasto'),
      repo.getSetting('txTextTransfer'),
    ]).then(([ci, cg, ct, ti, tg, tt]) => {
      if (ci) setIngreso(ci)
      if (cg) setGasto(cg)
      if (ct) setTransfer(ct)
      if (ti) setIngresoText(ti)
      if (tg) setGastoText(tg)
      if (tt) setTransferText(tt)
      setLoaded(true)
    })
  }, [])

  async function guardar() {
    const map: Record<string, string> = {
      txColorIngreso: ingreso, txColorGasto: gasto, txColorTransfer: transfer,
      txTextIngreso: ingresoText, txTextGasto: gastoText, txTextTransfer: transferText,
    }
    await Promise.all(Object.entries(map).map(([k, v]) => repo.setSetting(k, v)))
    Object.entries(map).forEach(([k, v]) => localStorage.setItem(k, v))
    onClose()
  }

  async function resetear() {
    const map: Record<string, string> = {
      txColorIngreso: '#16a34a', txColorGasto: '#dc2626', txColorTransfer: '#64748b',
      txTextIngreso: '#000000', txTextGasto: '#ffffff', txTextTransfer: '#000000',
    }
    await Promise.all(Object.entries(map).map(([k, v]) => repo.setSetting(k, v)))
    Object.entries(map).forEach(([k, v]) => localStorage.setItem(k, v))
    onClose()
  }

  if (!loaded) return null

  const tipos = [
    {
      key: 'ingreso',
      labelPrefix: <span className="font-bold text-green-600">+</span>,
      labelText: ' Entradas',
      bg: ingreso, setBg: setIngreso,
      text: ingresoText, setText: setIngresoText,
      previewIcono: '💰', previewNombre: 'Saldo inicial', previewMonto: '+$100.000',
    },
    {
      key: 'gasto',
      labelPrefix: <span className="font-bold text-slate-800">−</span>,
      labelText: ' Salidas',
      bg: gasto, setBg: setGasto,
      text: gastoText, setText: setGastoText,
      previewIcono: '🚌', previewNombre: 'Transporte', previewMonto: '-$10.000',
    },
    {
      key: 'transfer',
      labelPrefix: <span className="font-bold text-slate-400">⇄</span>,
      labelText: ' Entre bolsillos',
      bg: transfer, setBg: setTransfer,
      text: transferText, setText: setTransferText,
      previewIcono: '🔄', previewNombre: 'Transferencias', previewMonto: '$10.000',
    },
  ]

  return (
    <Modal title="🎨 Colores de movimientos" onClose={onClose}>
      <div className="space-y-5">
        <p className="text-xs text-slate-400">
          Elige el color del bloque y el color del texto para cada tipo de movimiento.
        </p>

        {tipos.map((t) => (
          <div key={t.key} className="space-y-2">
            <div className="text-sm font-semibold text-slate-700">{t.labelPrefix}{t.labelText}</div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="mb-0.5 text-xs text-slate-400">Fondo</div>
                <input
                  type="color"
                  value={t.bg}
                  onChange={(e) => t.setBg(e.target.value)}
                  className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
                />
              </div>
              <div className="flex-1">
                <div className="mb-0.5 text-xs text-slate-400">Texto</div>
                <input
                  type="color"
                  value={t.text}
                  onChange={(e) => t.setText(e.target.value)}
                  className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
                />
              </div>
            </div>
            {/* Preview */}
            <div
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 shadow-sm"
              style={{ backgroundColor: t.bg, color: t.text }}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
                style={{ backgroundColor: t.text + '22' }}
              >
                {t.previewIcono}
              </span>
              <div className="flex-1">
                <div className="text-sm font-medium">{t.previewNombre}</div>
                <div className="text-xs" style={{ opacity: 0.75 }}>hoy · ejemplo</div>
              </div>
              <span className="font-semibold">{t.previewMonto}</span>
            </div>
          </div>
        ))}

        <button
          onClick={guardar}
          className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white active:scale-[0.98]"
        >
          Guardar colores
        </button>
        <button
          onClick={resetear}
          className="w-full rounded-xl py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          Restaurar por defecto
        </button>
      </div>
    </Modal>
  )
}
