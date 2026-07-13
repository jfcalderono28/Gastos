import { useMemo, useState } from 'react'
import MonthSelector from '../../components/MonthSelector'
import TransactionForm from './TransactionForm'
import TransferirForm from '../bolsillos/TransferirForm'
import { useAhorroId, useBolsillos, useCategories, useDebts, useMoneda, useTransactions, useTxColors } from '../../hooks/data'
import type { Category, Transaction } from '../../data/db'
import { esDelMes, fechaCorta } from '../../lib/dates'
import { formatMoney } from '../../lib/format'

export default function TransactionsPage({
  mes,
  setMes,
}: {
  mes: string
  setMes: (m: string) => void
}) {
  const categorias = useCategories()
  const transacciones = useTransactions()
  const deudas = useDebts()
  const bolsillos = useBolsillos()
  const moneda = useMoneda()
  const txColors = useTxColors()
  const ahorroId = useAhorroId()
  const [form, setForm] = useState<{ abierto: boolean; editar?: Transaction }>({ abierto: false })
  const [filtro, setFiltro] = useState<'todos' | 'ingreso' | 'gasto'>('todos')
  const [bolsilloFiltro, setBolsilloFiltro] = useState<number | 'todos'>('todos')
  const [transferir, setTransferir] = useState(false)
  const [diaFiltro, setDiaFiltro] = useState<string | null>(null)
  const [calendarioAbierto, setCalendarioAbierto] = useState(false)

  const catById = useMemo(() => {
    const m = new Map<number, Category>()
    categorias.forEach((c) => c.id && m.set(c.id, c))
    return m
  }, [categorias])

  const txFiltradas = useMemo(() => {
    if (bolsilloFiltro === 'todos') return transacciones
    
    const b = bolsillos.find(x => x.id === bolsilloFiltro)
    if (b?.tipo === 'credito') {
      const catDeudasId = categorias.find(c => c.nombre.toLowerCase() === 'deudas')?.id ?? 0
      const debtsForCard = deudas.filter(d => d.bolsilloId === b.id)
      
      const fakeDebts = debtsForCard.map(d => ({
        id: -(d.id || 0),
        tipo: 'gasto' as const,
        monto: d.montoTotal,
        fecha: d.fechaCreacion,
        categoriaId: catDeudasId,
        subcategoria: d.nombre,
        nota: d.esCuotas ? `${d.numCuotas} cuotas` : 'Pago único',
        bolsilloId: b.id,
        _isFake: true
      }))
      
      const nombresDeudas = new Set(debtsForCard.map(d => d.nombre))
      const fakePayments = transacciones
        .filter(t => t.tipo === 'gasto' && t.subcategoria && nombresDeudas.has(t.subcategoria))
        .map(t => ({
          ...t,
          tipo: 'ingreso' as const,
          bolsilloId: b.id,
          _isFake: true
        }))
        
      return [...fakeDebts, ...fakePayments] as (Transaction & { _isFake?: boolean })[]
    }
    
    // Si es el único bolsillo no-ahorro, las transacciones antiguas sin bolsilloId
    // le pertenecen implícitamente (fueron creadas antes del sistema de bolsillos)
    const bolsillosNoAhorro = bolsillos.filter(x => x.id !== ahorroId)
    const esUnico = bolsillosNoAhorro.length === 1 && bolsillosNoAhorro[0]?.id === bolsilloFiltro
    return transacciones.filter(t =>
      t.bolsilloId === bolsilloFiltro || (esUnico && !t.bolsilloId)
    )
  }, [transacciones, bolsilloFiltro, bolsillos, deudas, categorias, ahorroId])

  const delMes = useMemo(
    () => txFiltradas.filter((t) => esDelMes(t.fecha, mes)),
    [txFiltradas, mes],
  )

  // En "Todos" los bolsillos, las transferencias se excluyen del balance para evitar
  // doble conteo (gasto del origen + ingreso del destino se cancelan).
  // En un bolsillo específico, la transferencia ES un movimiento real del bolsillo.
  const esTransfer = (t: any) => catById.get(t.categoriaId)?.nombre.toLowerCase() === 'transferencias'
  const excluirDelBalance = (t: any) => bolsilloFiltro === 'todos' && esTransfer(t)

  const ingresos = delMes
    .filter((t) => t.tipo === 'ingreso' && !excluirDelBalance(t))
    .reduce((s, t) => s + t.monto, 0)

  const gastos = delMes
    .filter((t) => t.tipo === 'gasto' && !excluirDelBalance(t))
    .reduce((s, t) => s + t.monto, 0)

  const balance = ingresos - gastos

  const listaBase = filtro === 'todos'
    ? delMes
    : delMes.filter((t) => t.tipo === filtro && !excluirDelBalance(t))

  const listaVisible = diaFiltro
    ? listaBase.filter(t => t.fecha === diaFiltro)
    : listaBase

  // Días del mes con al menos una transacción (para resaltar en el calendario)
  const diasConTx = useMemo(() => {
    const s = new Set<number>()
    delMes.forEach(t => s.add(Number(t.fecha.slice(8, 10))))
    return s
  }, [delMes])

  return (
    <div className="space-y-4">
      {bolsillos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setBolsilloFiltro('todos')}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${bolsilloFiltro === 'todos' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
          >
            Total
          </button>
          {bolsillos.map(b => (
            <button
              key={b.id}
              onClick={() => setBolsilloFiltro(b.id!)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${bolsilloFiltro === b.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
            >
              {b.icono} {b.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <MonthSelector mes={mes} setMes={(m) => { setMes(m); setDiaFiltro(null) }} />
        </div>
        <button
          onClick={() => setCalendarioAbierto(v => !v)}
          className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition ${
            diaFiltro
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
          }`}
        >
          {diaFiltro ? `Día ${Number(diaFiltro.slice(8))}` : '📅 Día'}
        </button>
      </div>

      {calendarioAbierto && (
        <CalendarioMes
          mes={mes}
          diaSeleccionado={diaFiltro}
          diasConTx={diasConTx}
          onSelect={(fecha) => {
            setDiaFiltro(prev => prev === fecha ? null : fecha)
            setCalendarioAbierto(false)
          }}
        />
      )}

      {/* Resumen (también filtran el listado) */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Resumen
          label="Ingresos"
          valor={formatMoney(ingresos, moneda)}
          color="text-emerald-600"
          activo={filtro === 'ingreso'}
          onClick={() => setFiltro((f) => (f === 'ingreso' ? 'todos' : 'ingreso'))}
        />
        <Resumen
          label="Gastos"
          valor={formatMoney(gastos, moneda)}
          color="text-red-600"
          activo={filtro === 'gasto'}
          onClick={() => setFiltro((f) => (f === 'gasto' ? 'todos' : 'gasto'))}
        />
        <Resumen
          label="Balance"
          valor={formatMoney(balance, moneda)}
          color={balance >= 0 ? 'text-emerald-600' : 'text-red-600'}
          activo={filtro === 'todos'}
          onClick={() => setFiltro('todos')}
        />
      </div>

      {/* Lista agrupada por día */}
      {listaVisible.length === 0 ? (
        <p className="py-10 text-center text-slate-400">
          {filtro === 'ingreso'
            ? 'Sin ingresos este mes.'
            : filtro === 'gasto'
              ? 'Sin gastos este mes.'
              : 'Sin movimientos este mes. Toca + para agregar el primero.'}
        </p>
      ) : (
        <div className="space-y-3">
          {Object.entries(
            listaVisible.reduce<Record<string, typeof listaVisible>>((acc, t) => {
              ;(acc[t.fecha] ??= []).push(t)
              return acc
            }, {}),
          )
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([fecha, txs]) => (
              <div key={fecha}>
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                    {fechaCorta(fecha)}
                  </span>
                  <span className="flex gap-2 text-xs font-medium">
                    {(() => {
                      const isTransfer = (t: any) => catById.get(t.categoriaId)?.nombre.toLowerCase() === 'transferencias'
                      const ing = (txs as any[]).filter(t => t.tipo === 'ingreso' && !isTransfer(t)).reduce((s: number, t: any) => s + t.monto, 0)
                      const gas = (txs as any[]).filter(t => t.tipo === 'gasto' && !isTransfer(t)).reduce((s: number, t: any) => s + t.monto, 0)
                      // En "todos" cada transferencia aparece dos veces (gasto+ingreso); contar solo gastos
                      const allTra = (txs as any[]).filter(isTransfer)
                      const numTra = bolsilloFiltro === 'todos'
                        ? allTra.filter((t: any) => t.tipo === 'gasto').length
                        : allTra.length
                      return <>
                        {ing > 0 && <span className="text-emerald-600">+{formatMoney(ing, moneda)}</span>}
                        {gas > 0 && <span className="text-rose-600">-{formatMoney(gas, moneda)}</span>}
                        {numTra > 0 && <span className="text-slate-400">🔄 {numTra}</span>}
                      </>
                    })()}
                  </span>
                </div>
                <ul className="space-y-1">
                  {(txs as any[]).map((t: any) => {
                    const cat = catById.get(t.categoriaId)
                    const isTransfer = cat?.nombre.toLowerCase() === 'transferencias'
                    const baseColor = isTransfer ? txColors.transfer : (t.tipo === 'ingreso' ? txColors.ingreso : txColors.gasto)
                    const textColor = isTransfer ? txColors.transferText : (t.tipo === 'ingreso' ? txColors.ingresoText : txColors.gastoText)
                    const customStyle = { backgroundColor: baseColor || '#f1f5f9', color: textColor }
                    return (
                      <li
                        key={t.id}
                        onClick={() => {
                          if (t._isFake) {
                            alert('Para editar deudas de crédito o sus pagos, ve a la sección de Deudas o modifica el registro original.')
                            return
                          }
                          setForm({ abierto: true, editar: t })
                        }}
                        className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 shadow-sm transition-colors"
                        style={customStyle}
                      >
                        <span
                          className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
                          style={{ backgroundColor: (cat?.color ?? '#94a3b8') + '44' }}
                        >
                          {cat?.icono ?? '❓'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {cat?.nombre ?? 'Sin categoría'}
                          </div>
                          <div className="truncate text-xs" style={{ opacity: 0.75 }}>
                            {t.subcategoria ? t.subcategoria : ''}
                            {t.nota ? (t.subcategoria ? ` · ${t.nota}` : t.nota) : ''}
                          </div>
                        </div>
                        <div className="shrink-0 font-semibold">
                          {t.tipo === 'ingreso' ? '+' : '-'}
                          {formatMoney(t.monto, moneda)}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
        </div>
      )}

      {/* Botones flotantes */}
      <div className="fixed bottom-20 right-4 z-30 flex flex-col gap-2 items-end">
        {bolsillos.length > 1 && (
          <button
            onClick={() => setTransferir(true)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-600 text-xl text-white shadow-lg active:scale-95"
            aria-label="Transferir entre bolsillos"
          >
            🔄
          </button>
        )}
        <button
          onClick={() => setForm({ abierto: true })}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-3xl text-white shadow-lg active:scale-95"
          aria-label="Agregar movimiento"
        >
          +
        </button>
      </div>

      {form.abierto && (
        <TransactionForm
          categorias={categorias}
          bolsillos={bolsillos}
          existente={form.editar}
          onClose={() => setForm({ abierto: false })}
                  />
      )}

      {transferir && (
        <TransferirForm
          bolsillos={bolsillos}
          moneda={moneda}
          onClose={() => setTransferir(false)}
        />
      )}

    </div>
  )
}

function CalendarioMes({
  mes,
  diaSeleccionado,
  diasConTx,
  onSelect,
}: {
  mes: string
  diaSeleccionado: string | null
  diasConTx: Set<number>
  onSelect: (fecha: string) => void
}) {
  const [year, month] = mes.split('-').map(Number)
  const primerDia = new Date(year, month - 1, 1).getDay() // 0=dom
  const diasEnMes = new Date(year, month, 0).getDate()
  const offset = (primerDia + 6) % 7 // lunes primero

  const dias = Array.from({ length: diasEnMes }, (_, i) => i + 1)
  const blancos = Array.from({ length: offset })

  return (
    <div className="rounded-xl bg-white p-3 shadow-md dark:bg-slate-800">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Filtrar por día
        </span>
        {diaSeleccionado && (
          <button
            onClick={() => onSelect(diaSeleccionado)}
            className="text-xs text-rose-500"
          >
            Quitar filtro
          </button>
        )}
      </div>
      <div className="mb-1 grid grid-cols-7 text-center">
        {['L','M','X','J','V','S','D'].map(d => (
          <span key={d} className="text-xs font-medium text-slate-400">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {blancos.map((_, i) => <span key={`b${i}`} />)}
        {dias.map(dia => {
          const fechaStr = `${mes}-${String(dia).padStart(2, '0')}`
          const tieneTx = diasConTx.has(dia)
          const seleccionado = diaSeleccionado === fechaStr
          return (
            <button
              key={dia}
              onClick={() => onSelect(fechaStr)}
              className={`relative rounded-lg py-1.5 text-sm font-medium transition ${
                seleccionado
                  ? 'bg-emerald-600 text-white'
                  : tieneTx
                    ? 'text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                    : 'text-slate-300 dark:text-slate-600'
              }`}
            >
              {dia}
              {tieneTx && !seleccionado && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-emerald-500" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Resumen({
  label,
  valor,
  color,
  activo,
  onClick,
}: {
  label: string
  valor: string
  color: string
  activo: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl bg-white px-2 py-3 text-center shadow-sm transition dark:bg-slate-800 ${
        activo ? 'ring-2 ring-emerald-500' : 'opacity-90 hover:opacity-100'
      }`}
    >
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-sm font-semibold ${color}`}>{valor}</div>
    </button>
  )
}
