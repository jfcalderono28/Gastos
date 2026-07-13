import { useMemo, useState } from 'react'
import MonthSelector from '../../components/MonthSelector'
import Modal from '../../components/Modal'
import { useBudgets, useCategories, useMoneda, useObligaciones, useSueldo, useTransactions } from '../../hooks/data'
import { repo } from '../../data/repository'
import type { Category, Obligacion, Transaction } from '../../data/db'
import { esDelMes, nombreMes } from '../../lib/dates'
import { formatMoney } from '../../lib/format'
import { estimadoMensual } from '../obligatorios/calc'

export default function BudgetsPage({
  mes,
  setMes,
}: {
  mes: string
  setMes: (m: string) => void
}) {
  const categorias = useCategories()
  const presupuestos = useBudgets()
  const transacciones = useTransactions()
  const obligaciones = useObligaciones()
  const moneda = useMoneda()
  const sueldo = useSueldo()
  const [editar, setEditar] = useState<Category | null>(null)

  const categoriasGasto = categorias.filter((c) => c.tipo === 'gasto')

  // Set de categorías que tienen obligaciones
  const catsObligatorias = useMemo(() => {
    const s = new Set<number>()
    obligaciones.forEach((o) => s.add(o.categoriaId))
    return s
  }, [obligaciones])

  // Obligaciones agrupadas por categoría
  const obligPorCat = useMemo(() => {
    const m = new Map<number, Obligacion[]>()
    obligaciones.forEach((o) => {
      const arr = m.get(o.categoriaId) ?? []
      arr.push(o)
      m.set(o.categoriaId, arr)
    })
    return m
  }, [obligaciones])

  // Gasto del mes por categoría
  const gastoPorCat = useMemo(() => {
    const m = new Map<number, number>()
    transacciones
      .filter((t) => t.tipo === 'gasto' && esDelMes(t.fecha, mes))
      .forEach((t) => m.set(t.categoriaId, (m.get(t.categoriaId) ?? 0) + t.monto))
    return m
  }, [transacciones, mes])

  const limitePorCat = useMemo(() => {
    const m = new Map<number, number>()
    presupuestos.forEach((b) => m.set(b.categoriaId, b.montoLimite))
    return m
  }, [presupuestos])

  // Ordenar: con presupuesto primero, luego obligatorios, luego sin presupuesto
  const catOrdenadas = useMemo(() => {
    return [...categoriasGasto].sort((a, b) => {
      const aP = a.id ? limitePorCat.has(a.id) : false
      const bP = b.id ? limitePorCat.has(b.id) : false
      if (aP !== bP) return aP ? -1 : 1
      const aO = a.id ? catsObligatorias.has(a.id!) : false
      const bO = b.id ? catsObligatorias.has(b.id!) : false
      if (aO !== bO) return aO ? -1 : 1
      return 0
    })
  }, [categoriasGasto, limitePorCat, catsObligatorias])

  // Total presupuestado y % del sueldo
  const totalPresupuestado = useMemo(() => {
    let total = 0
    for (const [, v] of limitePorCat) total += v
    return total
  }, [limitePorCat])

  return (
    <div className="space-y-4">
      <MonthSelector mes={mes} setMes={setMes} />

      {sueldo > 0 && (
        <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-slate-800">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">Total presupuestado</span>
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {formatMoney(totalPresupuestado, moneda)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>del sueldo ({formatMoney(sueldo, moneda)})</span>
            <span className={totalPresupuestado > sueldo ? 'text-red-500 font-semibold' : ''}>
              {Math.round((totalPresupuestado / sueldo) * 100)}%
            </span>
          </div>
        </div>
      )}

      <p className="text-sm text-slate-400">
        Define un límite mensual por categoría. Toca una para ver historial y definir presupuesto.
      </p>

      <ul className="space-y-2">
        {catOrdenadas.map((c) => {
          const limite = c.id ? limitePorCat.get(c.id) : undefined
          const gastado = c.id ? (gastoPorCat.get(c.id) ?? 0) : 0
          const esObligatoria = c.id ? catsObligatorias.has(c.id) : false
          const pct = limite ? Math.min(100, (gastado / limite) * 100) : 0
          const excedido = limite ? gastado > limite : false
          const pctSueldo = sueldo > 0 && limite ? Math.round((limite / sueldo) * 100) : 0

          // Para obligatorias sin presupuesto, mostrar el estimado como referencia
          const estimadoOblig = esObligatoria && !limite && c.id
            ? (obligPorCat.get(c.id) ?? []).reduce((s, o) => s + estimadoMensual(o, transacciones), 0)
            : 0

          return (
            <li
              key={c.id}
              onClick={() => setEditar(c)}
              className="cursor-pointer rounded-xl bg-white p-3 shadow-sm dark:bg-slate-800"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {c.icono} {c.nombre}
                  </span>
                  {esObligatoria && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      Obligatorio
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">
                  {limite ? (
                    <>
                      {formatMoney(gastado, moneda)} / {formatMoney(limite, moneda)}
                    </>
                  ) : estimadoOblig > 0 ? (
                    <span className="text-amber-600">~{formatMoney(estimadoOblig, moneda)}/mes</span>
                  ) : (
                    <span className="text-emerald-600">Definir</span>
                  )}
                </span>
              </div>
              {limite ? (
                <>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className={`h-full rounded-full ${excedido ? 'bg-red-500' : 'bg-emerald-500'}`}
                      style={{ width: `${pct}%`, backgroundColor: excedido ? undefined : c.color }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                    <span>{Math.round(pct)}% usado</span>
                    {pctSueldo > 0 && <span>{pctSueldo}% del sueldo</span>}
                  </div>
                </>
              ) : null}
              {excedido && (
                <div className="mt-1 text-xs font-medium text-red-600">
                  ⚠️ Te pasaste por {formatMoney(gastado - (limite ?? 0), moneda)}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {editar && (
        <BudgetEditor
          categoria={editar}
          actual={editar.id ? limitePorCat.get(editar.id) : undefined}
          transacciones={transacciones}
          sueldo={sueldo}
          esObligatoria={editar.id ? catsObligatorias.has(editar.id) : false}
          obligaciones={editar.id ? (obligPorCat.get(editar.id) ?? []) : []}
          moneda={moneda}
          mes={mes}
          onClose={() => setEditar(null)}
        />
      )}
    </div>
  )
}

/** Calcula gasto por mes para una categoría, retorna los últimos N meses que tengan datos. */
function historialCategoria(catId: number, txs: Transaction[], maxMeses: number) {
  const porMes: Record<string, number> = {}
  for (const t of txs) {
    if (t.tipo === 'gasto' && t.categoriaId === catId) {
      const m = t.fecha.slice(0, 7)
      porMes[m] = (porMes[m] ?? 0) + t.monto
    }
  }
  // Ordenar por mes descendente y tomar los últimos N con datos
  const meses = Object.keys(porMes).sort().reverse().slice(0, maxMeses).reverse()
  return meses.map((m) => ({ mes: m, total: porMes[m] }))
}

function BudgetEditor({
  categoria,
  actual,
  transacciones,
  sueldo,
  esObligatoria,
  obligaciones,
  moneda,
  mes,
  onClose,
}: {
  categoria: Category
  actual?: number
  transacciones: Transaction[]
  sueldo: number
  esObligatoria: boolean
  obligaciones: Obligacion[]
  moneda: string
  mes: string
  onClose: () => void
}) {
  const historial = useMemo(
    () => (categoria.id ? historialCategoria(categoria.id, transacciones, 5) : []),
    [categoria.id, transacciones],
  )

  const promedio = useMemo(() => {
    if (historial.length === 0) return 0
    const suma = historial.reduce((s, h) => s + h.total, 0)
    return Math.round(suma / historial.length)
  }, [historial])

  const estimadoOblig = useMemo(() => {
    if (!esObligatoria) return 0
    return obligaciones.reduce((s, o) => s + estimadoMensual(o, transacciones), 0)
  }, [esObligatoria, obligaciones, transacciones])

  const sugerido = actual ?? (promedio || estimadoOblig || 0)
  const [valor, setValor] = useState(sugerido ? String(sugerido) : '')

  const valorNum = Number(valor) || 0
  const pctSueldo = sueldo > 0 && valorNum > 0 ? Math.round((valorNum / sueldo) * 100) : 0

  // Gasto del mes actual
  const gastoMesActual = useMemo(() => {
    if (!categoria.id) return 0
    return transacciones
      .filter((t) => t.tipo === 'gasto' && t.categoriaId === categoria.id && esDelMes(t.fecha, mes))
      .reduce((s, t) => s + t.monto, 0)
  }, [categoria.id, transacciones, mes])

  async function guardar() {
    if (!categoria.id) return
    const n = Number(valor)
    if (n > 0) await repo.setBudget(categoria.id, n)
    onClose()
  }

  return (
    <Modal title={`${categoria.icono} ${categoria.nombre}`} onClose={onClose}>
      <div className="space-y-4">
        {esObligatoria && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            📌 Gasto obligatorio
            {estimadoOblig > 0 && <> · estimado ~{formatMoney(estimadoOblig, moneda)}/mes</>}
          </div>
        )}

        {/* Historial */}
        {historial.length > 0 ? (
          <div>
            <span className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Historial de gastos ({historial.length} {historial.length === 1 ? 'mes' : 'meses'} con registros)
            </span>
            <ul className="space-y-1">
              {historial.map((h) => {
                const pct = sueldo > 0 ? Math.round((h.total / sueldo) * 100) : 0
                return (
                  <li key={h.mes} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm dark:bg-slate-700/50">
                    <span className="text-slate-500 dark:text-slate-400">
                      {nombreMes(h.mes).split(' ')[0]} {h.mes.split('-')[0]}
                    </span>
                    <div className="text-right">
                      <span className="font-medium text-slate-800 dark:text-slate-100">
                        {formatMoney(h.total, moneda)}
                      </span>
                      {pct > 0 && (
                        <span className="ml-2 text-xs text-slate-400">{pct}%</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-1.5 text-sm dark:bg-emerald-900/30">
              <span className="font-medium text-emerald-700 dark:text-emerald-300">Promedio</span>
              <div className="text-right">
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {formatMoney(promedio, moneda)}
                </span>
                {sueldo > 0 && (
                  <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                    {Math.round((promedio / sueldo) * 100)}% del sueldo
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Sin registros de gasto en esta categoría.</p>
        )}

        {/* Este mes */}
        {gastoMesActual > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">Este mes llevas</span>
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {formatMoney(gastoMesActual, moneda)}
            </span>
          </div>
        )}

        {/* Input presupuesto */}
        <label className="block">
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
            Presupuesto mensual ({moneda})
          </span>
          <input
            type="number"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={promedio ? String(promedio) : '0'}
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-lg dark:border-slate-600"
          />
          {pctSueldo > 0 && (
            <span className="mt-1 block text-xs text-slate-400">
              Equivale al {pctSueldo}% de tu sueldo
            </span>
          )}
        </label>

        <button
          onClick={guardar}
          disabled={valorNum <= 0}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          Guardar
        </button>
        {actual !== undefined && (
          <button
            onClick={async () => {
              const b = (await repo.getBudgets()).find((x) => x.categoriaId === categoria.id)
              if (b?.id) await repo.deleteBudget(b.id)
              onClose()
            }}
            className="w-full rounded-lg py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Quitar presupuesto
          </button>
        )}
      </div>
    </Modal>
  )
}
