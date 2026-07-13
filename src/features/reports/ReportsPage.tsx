import { useMemo, useState } from 'react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Bar,
  BarChart,
  XAxis,
} from 'recharts'
import MonthSelector from '../../components/MonthSelector'
import { useBolsillos, useCategories, useMoneda, useTransactions } from '../../hooks/data'
import type { Category, Transaction } from '../../data/db'
import { esDelMes, nombreMes, sumarMeses } from '../../lib/dates'
import { formatMoney } from '../../lib/format'

export default function ReportsPage({
  mes,
  setMes,
}: {
  mes: string
  setMes: (m: string) => void
}) {
  const categorias = useCategories()
  const transacciones = useTransactions()
  const bolsillos = useBolsillos()
  const moneda = useMoneda()
  const [bolsilloFiltro, setBolsilloFiltro] = useState<number | 'todos'>('todos')
  const [catDetalle, setCatDetalle] = useState<number | null>(null)

  const catById = useMemo(() => {
    const m = new Map<number, Category>()
    categorias.forEach((c) => c.id && m.set(c.id, c))
    return m
  }, [categorias])

  const idsTransferencia = useMemo(() => {
    const ids = new Set<number>()
    categorias.forEach((c) => {
      if (c.nombre.toLowerCase() === 'transferencias' && c.id) ids.add(c.id)
    })
    return ids
  }, [categorias])

  const esTransferencia = (t: Transaction) => idsTransferencia.has(t.categoriaId)

  const bolsillosDebito = useMemo(
    () => bolsillos.filter((b) => b.tipo !== 'credito'),
    [bolsillos],
  )

  // Base filtrada: sin transferencias, por bolsillo si aplica
  const base = useMemo(() => {
    return transacciones.filter((t) => {
      if (esTransferencia(t)) return false
      if (bolsilloFiltro !== 'todos' && t.bolsilloId !== bolsilloFiltro) return false
      return true
    })
  }, [transacciones, bolsilloFiltro, idsTransferencia])

  // Dona: gastos por categoría del mes seleccionado
  const porCategoria = useMemo(() => {
    const m = new Map<number, number>()
    base
      .filter((t) => t.tipo === 'gasto' && esDelMes(t.fecha, mes))
      .forEach((t) => m.set(t.categoriaId, (m.get(t.categoriaId) ?? 0) + t.monto))
    return [...m.entries()]
      .map(([categoriaId, valor]) => ({
        categoriaId,
        nombre: catById.get(categoriaId)?.nombre ?? 'Otros',
        icono: catById.get(categoriaId)?.icono ?? '',
        color: catById.get(categoriaId)?.color ?? '#94a3b8',
        valor,
      }))
      .sort((a, b) => b.valor - a.valor)
  }, [base, mes, catById])

  const totalGasto = porCategoria.reduce((s, x) => s + x.valor, 0)

  // Barras: últimos 6 meses
  const evolucion = useMemo(() => {
    const meses = Array.from({ length: 6 }, (_, i) => sumarMeses(mes, i - 5))
    return meses.map((m) => {
      const delMes = base.filter((t) => esDelMes(t.fecha, m))
      return {
        mes: nombreMes(m).split(' ')[0].slice(0, 3),
        ingresos: delMes.filter((t) => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0),
        gastos: delMes.filter((t) => t.tipo === 'gasto').reduce((s, t) => s + t.monto, 0),
      }
    })
  }, [base, mes])

  // Detalle de categoría seleccionada
  const txDetalle = useMemo(() => {
    if (catDetalle === null) return []
    return base
      .filter((t) => t.categoriaId === catDetalle && esDelMes(t.fecha, mes))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [base, catDetalle, mes])

  const chipBase = 'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors'
  const chipActivo = 'bg-slate-700 text-white'
  const chipInactivo = 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'

  const catDetalleInfo = catDetalle !== null ? catById.get(catDetalle) : null

  return (
    <div className="space-y-4">
      <MonthSelector mes={mes} setMes={setMes} />

      {/* Chips por bolsillo */}
      {bolsillosDebito.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setBolsilloFiltro('todos')} className={`${chipBase} ${bolsilloFiltro === 'todos' ? chipActivo : chipInactivo}`}>
            Total
          </button>
          {bolsillosDebito.map(b => (
            <button key={b.id} onClick={() => setBolsilloFiltro(b.id!)} className={`${chipBase} ${bolsilloFiltro === b.id ? 'text-white' : chipInactivo}`} style={bolsilloFiltro === b.id ? { backgroundColor: b.color } : {}}>
              {b.icono} {b.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Detalle por categoría */}
      {catDetalle !== null ? (
        <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-800">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">
              {catDetalleInfo?.icono} {catDetalleInfo?.nombre ?? 'Categoría'}
            </h2>
            <button
              onClick={() => setCatDetalle(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              ✕ Cerrar
            </button>
          </div>
          <MonthSelector mes={mes} setMes={setMes} />
          {txDetalle.length === 0 ? (
            <p className="py-6 text-center text-slate-400">Sin movimientos este mes.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {txDetalle.map((t) => {
                const fecha = t.fecha.split('-').reverse().join('/')
                return (
                  <li key={t.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="text-slate-700 dark:text-slate-200 truncate">
                        {t.subcategoria || catDetalleInfo?.nombre || 'Sin nombre'}
                      </div>
                      {t.nota && (
                        <div className="text-xs text-slate-400 truncate">{t.nota}</div>
                      )}
                      <div className="text-xs text-slate-400">{fecha}</div>
                    </div>
                    <span className={`shrink-0 font-semibold ${t.tipo === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {t.tipo === 'ingreso' ? '+' : '-'}{formatMoney(t.monto, moneda)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="mt-3 border-t border-slate-100 pt-2 text-right text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
            Total: {formatMoney(txDetalle.reduce((s, t) => s + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0), moneda)}
          </div>
        </section>
      ) : (
        <>
          {/* Dona */}
          <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-800">
            <h2 className="mb-2 font-semibold text-slate-800 dark:text-slate-100">
              Gastos por categoría
            </h2>
            {porCategoria.length === 0 ? (
              <p className="py-8 text-center text-slate-400">Sin gastos este mes.</p>
            ) : (
              <>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={porCategoria}
                        dataKey="valor"
                        nameKey="nombre"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                        onClick={(d: any) => setCatDetalle(d.categoriaId)}
                        style={{ cursor: 'pointer' }}
                      >
                        {porCategoria.map((x, i) => (
                          <Cell key={i} fill={x.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => formatMoney(Number(v), moneda)}
                        contentStyle={{ borderRadius: 8, border: 'none' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 space-y-1">
                  {porCategoria.map((x, i) => (
                    <li
                      key={i}
                      className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      onClick={() => setCatDetalle(x.categoriaId)}
                    >
                      <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: x.color }} />
                        {x.icono} {x.nombre}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {formatMoney(x.valor, moneda)} · {totalGasto ? Math.round((x.valor / totalGasto) * 100) : 0}%
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Barras */}
          <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-800">
            <h2 className="mb-2 font-semibold text-slate-800 dark:text-slate-100">
              Ingresos vs gastos (6 meses)
            </h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evolucion}>
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(v) => formatMoney(Number(v), moneda)}
                    contentStyle={{ borderRadius: 8, border: 'none' }}
                  />
                  <Bar dataKey="ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
