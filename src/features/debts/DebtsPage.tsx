import { useMemo, useState } from 'react'
import DebtForm from './DebtForm'
import MeDebenForm from './MeDebenForm'
import { useBolsillos, useCategories, useDebts, useMoneda, useObligaciones, useTransactions } from '../../hooks/data'
import type { Bolsillo, Debt, TipoDeuda } from '../../data/db'
import { mesActual, nombreMes, sumarMeses } from '../../lib/dates'
import { formatMoney } from '../../lib/format'
import { estaAtrasada, montoAtrasado, montoEnMes, numeroCuota, pendiente, proximaCuota } from './calc'
import { diasParaLimite, estiloUrgencia, estimadoMensual, pagadoEsteMes } from '../obligatorios/calc'

function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#000000' : '#ffffff'
}

export default function DebtsPage() {
  const deudas = useDebts()
  const categorias = useCategories()
  const bolsillos = useBolsillos()
  const moneda = useMoneda()
  const [tab, setTab] = useState<TipoDeuda | 'obligatorios'>('debo')
  const [bolsilloFiltro, setBolsilloFiltro] = useState<number | 'todos'>('todos')
  const [formDebo, setFormDebo] = useState<{ abierto: boolean; editar?: Debt }>({ abierto: false })
  const [formMeDeben, setFormMeDeben] = useState<{ abierto: boolean; editar?: Debt }>({ abierto: false })

  const obligaciones = useObligaciones()
  const transacciones = useTransactions()

  const bolsilloById = useMemo(() => {
    const m = new Map<number, Bolsillo>()
    bolsillos.forEach(b => b.id && m.set(b.id, b))
    return m
  }, [bolsillos])

  const deboTodos = useMemo(() => deudas.filter(d => (d.tipo_deuda ?? 'debo') === 'debo'), [deudas])
  const meDebenTodos = useMemo(() => deudas.filter(d => d.tipo_deuda === 'me_deben'), [deudas])

  const esteMes = mesActual()
  const proximoMes = sumarMeses(esteMes, 1)

  const listaActual = tab === 'debo' ? deboTodos : meDebenTodos

  // Bolsillos presentes en el tab actual (para chips)
  const bolsillosEnTab = useMemo(() => {
    const ids = new Set(listaActual.map(d => d.bolsilloId).filter(Boolean) as number[])
    return bolsillos.filter(b => b.id && ids.has(b.id))
  }, [listaActual, bolsillos])

  const debo = useMemo(() =>
    bolsilloFiltro === 'todos' ? deboTodos : deboTodos.filter(d => d.bolsilloId === bolsilloFiltro),
  [deboTodos, bolsilloFiltro])

  const meDeben = useMemo(() =>
    bolsilloFiltro === 'todos' ? meDebenTodos : meDebenTodos.filter(d => d.bolsilloId === bolsilloFiltro),
  [meDebenTodos, bolsilloFiltro])

  const totalPendienteDebo = useMemo(() => debo.reduce((s, d) => s + pendiente(d), 0), [debo])
  const totalMeDeben = useMemo(() => meDeben.reduce((s, d) => s + pendiente(d), 0), [meDeben])

  // Agrupa una lista de deudas por bolsillo
  function agruparPorBolsillo(lista: Debt[]) {
    const grupos = new Map<number | null, Debt[]>()
    lista.forEach(d => {
      const key = d.bolsilloId ?? null
      if (!grupos.has(key)) grupos.set(key, [])
      grupos.get(key)!.push(d)
    })
    // Ordenar: bolsillos con id primero (por id), luego sin bolsillo al final
    const entries = [...grupos.entries()].sort((a, b) => {
      if (a[0] === null) return 1
      if (b[0] === null) return -1
      return a[0] - b[0]
    })
    return entries
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Deudas</h1>

      {/* Toggle */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => { setTab('me_deben'); setBolsilloFiltro('todos') }}
          className={`rounded-xl py-3 text-sm font-semibold transition ${
            tab === 'me_deben'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
          }`}
        >
          Me deben
        </button>
        <button
          onClick={() => { setTab('debo'); setBolsilloFiltro('todos') }}
          className={`rounded-xl py-3 text-sm font-semibold transition ${
            tab === 'debo'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
          }`}
        >
          Debo
        </button>
        <button
          onClick={() => setTab('obligatorios')}
          className={`rounded-xl py-3 text-sm font-semibold transition ${
            tab === 'obligatorios'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
          }`}
        >
          Fijos
        </button>
      </div>

      {/* Chips de filtro por bolsillo — solo en pestañas de deudas */}
      {tab !== 'obligatorios' && bolsillosEnTab.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setBolsilloFiltro('todos')}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              bolsilloFiltro === 'todos'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
            }`}
          >
            Todos
          </button>
          {bolsillosEnTab.map(b => (
            <button
              key={b.id}
              onClick={() => setBolsilloFiltro(b.id!)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                bolsilloFiltro === b.id ? 'text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }`}
              style={bolsilloFiltro === b.id ? { backgroundColor: b.color } : undefined}
            >
              {b.icono} {b.nombre}
            </button>
          ))}
        </div>
      )}

      {tab === 'obligatorios' ? (
        <TabObligatorios
          obligaciones={obligaciones}
          transacciones={transacciones}
          categorias={categorias}
          moneda={moneda}
        />
      ) : tab === 'debo' ? (
        <>
          {/* Resumen */}
          <div className="rounded-2xl bg-gradient-to-br from-rose-600 to-rose-700 p-4 text-white shadow-sm">
            <span className="text-sm text-rose-50/90">Total que debes</span>
            <div className="mt-1 text-3xl font-bold tracking-tight">
              {formatMoney(totalPendienteDebo, moneda)}
            </div>
            <div className="mt-1 flex gap-4 text-sm text-rose-100">
              <span>Este mes: {formatMoney(debo.reduce((s, d) => s + montoEnMes(d, esteMes) + montoAtrasado(d, esteMes), 0), moneda)}</span>
              <span>Próximo: {formatMoney(debo.reduce((s, d) => s + montoEnMes(d, proximoMes), 0), moneda)}</span>
            </div>
          </div>

          {/* Grupos por bolsillo */}
          {debo.length === 0 ? (
            <p className="py-10 text-center text-slate-400">Sin deudas registradas.</p>
          ) : (
            <div className="space-y-4">
              {agruparPorBolsillo(debo).map(([bolsilloId, grupo]) => {
                const bolsillo = bolsilloId !== null ? bolsilloById.get(bolsilloId) : undefined
                const subtotal = grupo.reduce((s, d) => s + pendiente(d), 0)
                return (
                  <div key={bolsilloId ?? 'sin'}>
                    {/* Encabezado de grupo */}
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {bolsillo ? (
                          <>
                            <span
                              className="flex h-6 w-6 items-center justify-center rounded-full text-xs"
                              style={{ backgroundColor: bolsillo.color, color: contrastText(bolsillo.color) }}
                            >
                              {bolsillo.icono}
                            </span>
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                              {bolsillo.nombre}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Sin medio de pago</span>
                        )}
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                          {grupo.length} {grupo.length === 1 ? 'deuda' : 'deudas'}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-rose-600">{formatMoney(subtotal, moneda)}</span>
                    </div>

                    {/* Tarjetas de deuda */}
                    <ul className="space-y-2">
                      {grupo.map(d => {
                        const pend = pendiente(d)
                        const saldada = pend <= 0
                        const prox = proximaCuota(d, esteMes)
                        const cuotaActual = prox ? numeroCuota(d, prox.mes) : null
                        const atrasada = !saldada && estaAtrasada(d, esteMes)
                        return (
                          <li
                            key={d.id}
                            onClick={() => setFormDebo({ abierto: true, editar: d })}
                            className="cursor-pointer rounded-xl bg-white p-3 shadow-sm dark:bg-slate-800"
                          >
                            {atrasada && (
                              <div className="mb-1.5 w-fit rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                                ⚠️ Vencida
                              </div>
                            )}
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium text-slate-800 dark:text-slate-100">
                                {d.nombre} {saldada && <span className="text-emerald-500">✓ saldada</span>}
                              </span>
                              <span className="shrink-0 font-semibold text-rose-600">
                                {formatMoney(pend, moneda)}
                              </span>
                            </div>
                            <div className="mt-0.5 text-xs text-slate-400">
                              Total: {formatMoney(d.montoTotal, moneda)}
                              {d.esCuotas
                                ? ` · ${d.numCuotas} cuotas de ${formatMoney(d.montoCuota ?? 0, moneda)}`
                                : d.fechaPago
                                  ? ` · vence ${d.fechaPago.split('-').reverse().join('/')}`
                                  : ''}
                            </div>
                            {prox && (
                              <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                                Próximo pago: {formatMoney(prox.monto, moneda)} en {nombreMes(prox.mes)}
                                {cuotaActual ? ` (cuota ${cuotaActual}/${d.numCuotas})` : ''}
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}

          <button
            onClick={() => setFormDebo({ abierto: true })}
            className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 text-3xl text-white shadow-lg active:scale-95"
            aria-label="Agregar deuda"
          >
            +
          </button>
        </>
      ) : (
        <>
          {/* Resumen me deben */}
          <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-4 text-white shadow-sm">
            <span className="text-sm text-emerald-50/90">Total que te deben</span>
            <div className="mt-1 text-3xl font-bold tracking-tight">
              {formatMoney(totalMeDeben, moneda)}
            </div>
          </div>

          {/* Grupos por bolsillo */}
          {meDeben.length === 0 ? (
            <p className="py-10 text-center text-slate-400">Nadie te debe nada.</p>
          ) : (
            <div className="space-y-4">
              {agruparPorBolsillo(meDeben).map(([bolsilloId, grupo]) => {
                const bolsillo = bolsilloId !== null ? bolsilloById.get(bolsilloId) : undefined
                const subtotal = grupo.reduce((s, d) => s + pendiente(d), 0)
                return (
                  <div key={bolsilloId ?? 'sin'}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {bolsillo ? (
                          <>
                            <span
                              className="flex h-6 w-6 items-center justify-center rounded-full text-xs"
                              style={{ backgroundColor: bolsillo.color, color: contrastText(bolsillo.color) }}
                            >
                              {bolsillo.icono}
                            </span>
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                              {bolsillo.nombre}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Sin medio de pago</span>
                        )}
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                          {grupo.length} {grupo.length === 1 ? 'deuda' : 'deudas'}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-emerald-600">{formatMoney(subtotal, moneda)}</span>
                    </div>

                    <ul className="space-y-2">
                      {grupo.map(d => {
                        const pend = pendiente(d)
                        const cobrada = pend <= 0
                        return (
                          <li
                            key={d.id}
                            onClick={() => setFormMeDeben({ abierto: true, editar: d })}
                            className="cursor-pointer rounded-xl bg-white p-3 shadow-sm dark:bg-slate-800"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <span className="font-medium text-slate-800 dark:text-slate-100">
                                  {d.deudor ?? d.nombre} {cobrada && <span className="text-emerald-500">✓ cobrada</span>}
                                </span>
                                {d.concepto && (
                                  <div className="truncate text-xs text-slate-400">{d.concepto}</div>
                                )}
                              </div>
                              <span className="shrink-0 font-semibold text-emerald-600">
                                {formatMoney(pend, moneda)}
                              </span>
                            </div>
                            <div className="mt-0.5 text-xs text-slate-400">
                              {formatMoney(d.montoTotal, moneda)} · {d.fechaCreacion.split('-').reverse().join('/')}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}

          <button
            onClick={() => setFormMeDeben({ abierto: true })}
            className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-3xl text-white shadow-lg active:scale-95"
            aria-label="Agregar deuda a favor"
          >
            +
          </button>
        </>
      )}

      {formDebo.abierto && (
        <DebtForm existente={formDebo.editar} moneda={moneda} onClose={() => setFormDebo({ abierto: false })} />
      )}
      {formMeDeben.abierto && (
        <MeDebenForm existente={formMeDeben.editar} moneda={moneda} onClose={() => setFormMeDeben({ abierto: false })} />
      )}
    </div>
  )
}

function TabObligatorios({
  obligaciones, transacciones, categorias, moneda,
}: {
  obligaciones: ReturnType<typeof useObligaciones>
  transacciones: ReturnType<typeof useTransactions>
  categorias: ReturnType<typeof useCategories>
  moneda: string
}) {
  const totalEstimado = obligaciones.reduce((s, o) => s + estimadoMensual(o, transacciones), 0)
  const totalPendiente = obligaciones
    .filter(o => !pagadoEsteMes(o, transacciones))
    .reduce((s, o) => s + estimadoMensual(o, transacciones), 0)

  if (obligaciones.length === 0) {
    return (
      <p className="py-10 text-center text-slate-400">
        No tienes gastos fijos configurados. Agrégalos en Ajustes → Gastos obligatorios.
      </p>
    )
  }

  return (
    <>
      <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 p-4 text-white shadow-sm">
        <span className="text-sm text-amber-50/90">Gastos fijos este mes</span>
        <div className="mt-1 text-3xl font-bold tracking-tight">{formatMoney(totalEstimado, moneda)}</div>
        {totalPendiente > 0 && (
          <div className="mt-1 text-sm text-amber-100">
            Pendiente: {formatMoney(totalPendiente, moneda)}
          </div>
        )}
      </div>

      <ul className="space-y-2">
        {obligaciones.map(o => {
          const cat = categorias.find(c => c.id === o.categoriaId)
          const pagado = pagadoEsteMes(o, transacciones)
          const dias = diasParaLimite(o)
          const estilo = estiloUrgencia(dias, pagado)
          const estimado = estimadoMensual(o, transacciones)
          const titulo = `${cat?.nombre ?? 'Sin categoría'}${o.subcategoria ? ` · ${o.subcategoria}` : ''}`

          return (
            <li key={o.id} className={`rounded-xl p-3 shadow-sm ${estilo}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{cat?.icono ?? '📌'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{titulo}</div>
                  <div className="text-xs mt-0.5" style={{ opacity: 0.8 }}>
                    {pagado
                      ? '✓ Pagado este mes'
                      : dias < 0
                        ? `⚠️ Venció hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`
                        : dias === 0
                          ? '⚠️ Vence hoy'
                          : `Vence en ${dias} día${dias !== 1 ? 's' : ''}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold">{formatMoney(estimado, moneda)}</div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
