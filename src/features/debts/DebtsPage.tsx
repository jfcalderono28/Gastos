import { useMemo, useState } from 'react'
import DebtForm from './DebtForm'
import MeDebenForm from './MeDebenForm'
import PayDebtForm from './PayDebtForm'
import CobrarForm from './CobrarForm'
import PagarObligacionForm from '../obligatorios/PagarObligacionForm'
import PagarTodoMesForm from './PagarTodoMesForm'
import { useBolsillos, useCategories, useDebts, useMoneda, useObligaciones, useTransactions } from '../../hooks/data'
import type { Bolsillo, Debt, Obligacion, TipoDeuda } from '../../data/db'
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
  const [bolsilloFiltro, setBolsilloFiltro] = useState<number | 'todos' | 'sin'>('todos')
  const [mesFiltro, setMesFiltro] = useState<'todos' | 'este' | 'proximo'>('todos')
  const [orden, setOrden] = useState<'proximoPago' | 'creadoAsc' | 'creadoDesc'>('creadoDesc')
  const [formDebo, setFormDebo] = useState<{ abierto: boolean; editar?: Debt }>({ abierto: false })
  const [formMeDeben, setFormMeDeben] = useState<{ abierto: boolean; editar?: Debt }>({ abierto: false })
  const [pagar, setPagar] = useState<Debt | null>(null)
  const [cobrar, setCobrar] = useState<Debt | null>(null)
  const [pagarOblig, setPagarOblig] = useState<Obligacion | null>(null)
  const [pagarTodoMes, setPagarTodoMes] = useState(false)

  const obligaciones = useObligaciones()
  const transacciones = useTransactions()

  const bolsilloById = useMemo(() => {
    const m = new Map<number, Bolsillo>()
    bolsillos.forEach(b => b.id && m.set(b.id, b))
    return m
  }, [bolsillos])

  const debo = useMemo(() => deudas.filter(d => (d.tipo_deuda ?? 'debo') === 'debo'), [deudas])
  const meDeben = useMemo(() => deudas.filter(d => d.tipo_deuda === 'me_deben'), [deudas])

  const esteMes = mesActual()
  const proximoMes = sumarMeses(esteMes, 1)

  const totalPendienteDebo = useMemo(() => debo.reduce((s, d) => s + pendiente(d), 0), [debo])
  const totalMeDeben = useMemo(() => meDeben.reduce((s, d) => s + pendiente(d), 0), [meDeben])

  // Bolsillos presentes en el tab actual (para chips de filtro)
  const listaActual = tab === 'debo' ? debo : meDeben
  const bolsillosEnTab = useMemo(() => {
    const ids = new Set(listaActual.map(d => d.bolsilloId).filter(Boolean) as number[])
    return bolsillos.filter(b => b.id && ids.has(b.id))
  }, [listaActual, bolsillos])
  const haySinMedio = listaActual.some(d => !d.bolsilloId)

  // Filtrado por medio de pago
  const deudaPorBolsillo = useMemo(() => {
    if (bolsilloFiltro === 'todos') return listaActual
    if (bolsilloFiltro === 'sin') return listaActual.filter(d => !d.bolsilloId)
    return listaActual.filter(d => d.bolsilloId === bolsilloFiltro)
  }, [listaActual, bolsilloFiltro])

  // "Pagas este mes" incluye deudas atrasadas (vencidas y sin pagar)
  const pagaEste = useMemo(() => deudaPorBolsillo.reduce(
    (s, d) => s + montoEnMes(d, esteMes) + montoAtrasado(d, esteMes), 0,
  ), [deudaPorBolsillo, esteMes])
  const pagaProximo = useMemo(() => deudaPorBolsillo.reduce((s, d) => s + montoEnMes(d, proximoMes), 0), [deudaPorBolsillo, proximoMes])

  // Filtrado por mes + ordenamiento
  const deudaFiltradas = useMemo(() => {
    let lista = deudaPorBolsillo
    if (mesFiltro === 'este') lista = lista.filter(d =>
      montoEnMes(d, esteMes) > 0 || estaAtrasada(d, esteMes),
    )
    else if (mesFiltro === 'proximo') lista = lista.filter(d => montoEnMes(d, proximoMes) > 0)

    return [...lista].sort((a, b) => {
      if (orden === 'creadoAsc') return a.fechaCreacion.localeCompare(b.fechaCreacion)
      if (orden === 'creadoDesc') return b.fechaCreacion.localeCompare(a.fechaCreacion)
      // proximoPago: atrasadas primero, luego por fecha
      const atrasadaA = estaAtrasada(a, esteMes)
      const atrasadaB = estaAtrasada(b, esteMes)
      if (atrasadaA !== atrasadaB) return atrasadaA ? -1 : 1
      const proxA = proximaCuota(a, esteMes)?.mes ?? a.fechaPago?.slice(0, 7) ?? '9999-99'
      const proxB = proximaCuota(b, esteMes)?.mes ?? b.fechaPago?.slice(0, 7) ?? '9999-99'
      return proxA.localeCompare(proxB)
    })
  }, [deudaPorBolsillo, mesFiltro, orden, esteMes, proximoMes])

  const totalFiltradoDebo = useMemo(() => deudaPorBolsillo.reduce((s, d) => s + pendiente(d), 0), [deudaPorBolsillo])
  const totalFiltradoMeDeben = useMemo(() => deudaPorBolsillo.reduce((s, d) => s + pendiente(d), 0), [deudaPorBolsillo])

  const chipBase = 'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors'
  const chipActivo = 'text-white shadow-sm'
  const chipInactivo = 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'

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
      {tab !== 'obligatorios' && (bolsillosEnTab.length > 0 || haySinMedio) && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setBolsilloFiltro('todos')} className={`${chipBase} ${bolsilloFiltro === 'todos' ? `${chipActivo} bg-slate-700` : chipInactivo}`}>
            Total
          </button>
          {bolsillosEnTab.map(b => (
            <button key={b.id} onClick={() => setBolsilloFiltro(b.id!)} className={`${chipBase} ${bolsilloFiltro === b.id ? chipActivo : chipInactivo}`} style={bolsilloFiltro === b.id ? { backgroundColor: b.color } : {}}>
              {b.icono} {b.nombre}
            </button>
          ))}
          {haySinMedio && (
            <button onClick={() => setBolsilloFiltro('sin')} className={`${chipBase} ${bolsilloFiltro === 'sin' ? `${chipActivo} bg-slate-500` : chipInactivo}`}>
              Sin medio
            </button>
          )}
        </div>
      )}

      {tab === 'obligatorios' ? (
        <TabObligatorios
          obligaciones={obligaciones}
          transacciones={transacciones}
          categorias={categorias}
          moneda={moneda}
          setPagarOblig={setPagarOblig}
        />
      ) : tab === 'debo' ? (
        <>
          {/* Resumen debo */}
          <div className="rounded-2xl bg-gradient-to-br from-rose-600 to-rose-700 p-4 text-white shadow-sm">
            <span className="text-sm text-rose-50/90">
              {bolsilloFiltro === 'todos' ? 'Te falta pagar' : `Te falta pagar · ${bolsilloFiltro === 'sin' ? 'Sin medio' : (bolsilloById.get(bolsilloFiltro as number)?.nombre ?? '')}`}
            </span>
            <div className="mt-1 text-3xl font-bold tracking-tight">
              {formatMoney(bolsilloFiltro === 'todos' ? totalPendienteDebo : totalFiltradoDebo, moneda)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <Tarjeta
              label={`Pagas este mes (${nombreMes(esteMes).split(' ')[0]})`}
              valor={formatMoney(pagaEste, moneda)}
              activo={mesFiltro === 'este'}
              onClick={() => setMesFiltro(f => f === 'este' ? 'todos' : 'este')}
            />
            <Tarjeta
              label={`Pagas el próximo (${nombreMes(proximoMes).split(' ')[0]})`}
              valor={formatMoney(pagaProximo, moneda)}
              resaltado
              activo={mesFiltro === 'proximo'}
              onClick={() => setMesFiltro(f => f === 'proximo' ? 'todos' : 'proximo')}
            />
          </div>

          {/* Ordenamiento */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 text-xs text-slate-400 self-center">Ordenar:</span>
            {([
              ['proximoPago', '📅 Próximo pago'],
              ['creadoDesc', '🆕 Más reciente'],
              ['creadoAsc', '🕰 Más antigua'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setOrden(val)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  orden === val
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {deudaFiltradas.length === 0 ? (
            <p className="py-10 text-center text-slate-400">Sin deudas registradas.</p>
          ) : (
            <ul className="space-y-2">
              {deudaFiltradas.map((d) => {
                const pend = pendiente(d)
                const saldada = pend <= 0
                const prox = proximaCuota(d, esteMes)
                const cuotaActual = prox ? numeroCuota(d, prox.mes) : null
                const bolsillo = d.bolsilloId ? bolsilloById.get(d.bolsilloId) : undefined
                const bgColor = bolsillo?.color
                const textColor = bgColor ? contrastText(bgColor) : undefined
                const atrasada = !saldada && estaAtrasada(d, esteMes)
                return (
                  <li
                    key={d.id}
                    className={`rounded-xl p-3 shadow-sm ${!bgColor ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100' : ''}`}
                    style={bgColor ? { backgroundColor: bgColor, color: textColor } : undefined}
                  >
                    {bolsillo && (
                      <div className="mb-1.5 flex items-center gap-1 text-xs font-medium" style={{ opacity: 0.8 }}>
                        <span>{bolsillo.icono}</span>
                        <span>{bolsillo.nombre}</span>
                      </div>
                    )}
                    {atrasada && (
                      <div className="mb-1.5 w-fit rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                        ⚠️ Vencida
                      </div>
                    )}
                    <div onClick={() => setFormDebo({ abierto: true, editar: d })} className="cursor-pointer">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">
                          {d.nombre} {saldada && <span className="text-emerald-400">✓ saldada</span>}
                        </span>
                        <span className="shrink-0 font-semibold">
                          {formatMoney(pend, moneda)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs" style={{ opacity: 0.75 }}>
                        Pagado {formatMoney(d.montoPagado ?? 0, moneda)} de {formatMoney(d.montoTotal, moneda)}
                        {d.esCuotas
                          ? ` · ${d.numCuotas} cuotas de ${formatMoney(d.montoCuota ?? 0, moneda)}`
                          : d.fechaPago
                            ? ` · vence ${d.fechaPago.split('-').reverse().join('/')}`
                            : ''}
                      </div>
                      {prox && (
                        <div className="mt-1 text-xs font-medium" style={{ opacity: 0.85 }}>
                          Próximo pago: {formatMoney(prox.monto, moneda)} en {nombreMes(prox.mes)}
                          {cuotaActual ? ` (cuota ${cuotaActual}/${d.numCuotas})` : ''}
                        </div>
                      )}
                    </div>
                    {!saldada && (
                      <button
                        onClick={() => setPagar(d)}
                        className="mt-2 w-full rounded-lg py-2 text-sm font-semibold text-white"
                        style={{ backgroundColor: bgColor ? 'rgba(0,0,0,0.25)' : '#16a34a' }}
                      >
                        Pagar
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {pagaEste > 0 && (
            <button
              onClick={() => setPagarTodoMes(true)}
              className="w-full rounded-lg py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: '#16a34a' }}
            >
              Pagar todo este mes · {formatMoney(pagaEste, moneda)}
            </button>
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
            <span className="text-sm text-emerald-50/90">
              {bolsilloFiltro === 'todos' ? 'Te deben' : `Te deben · ${bolsilloFiltro === 'sin' ? 'Sin medio' : (bolsilloById.get(bolsilloFiltro as number)?.nombre ?? '')}`}
            </span>
            <div className="mt-1 text-3xl font-bold tracking-tight">
              {formatMoney(bolsilloFiltro === 'todos' ? totalMeDeben : totalFiltradoMeDeben, moneda)}
            </div>
          </div>

          {deudaFiltradas.length === 0 ? (
            <p className="py-10 text-center text-slate-400">Nadie te debe nada.</p>
          ) : (
            <ul className="space-y-2">
              {deudaFiltradas.map((d) => {
                const pend = pendiente(d)
                const cobrada = pend <= 0
                const bolsillo = d.bolsilloId ? bolsilloById.get(d.bolsilloId) : undefined
                const bgColor = bolsillo?.color
                const textColor = bgColor ? contrastText(bgColor) : undefined
                return (
                  <li
                    key={d.id}
                    className={`rounded-xl p-3 shadow-sm ${!bgColor ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100' : ''}`}
                    style={bgColor ? { backgroundColor: bgColor, color: textColor } : undefined}
                  >
                    {bolsillo && (
                      <div className="mb-1.5 flex items-center gap-1 text-xs font-medium" style={{ opacity: 0.8 }}>
                        <span>{bolsillo.icono}</span>
                        <span>{bolsillo.nombre}</span>
                      </div>
                    )}
                    <div onClick={() => setFormMeDeben({ abierto: true, editar: d })} className="cursor-pointer">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-medium">
                            {d.deudor ?? d.nombre} {cobrada && <span className="text-emerald-400">✓ cobrada</span>}
                          </span>
                          {d.concepto && (
                            <div className="text-xs truncate" style={{ opacity: 0.75 }}>{d.concepto}</div>
                          )}
                        </div>
                        <span className="shrink-0 font-semibold">
                          {formatMoney(pend, moneda)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs" style={{ opacity: 0.75 }}>
                        {formatMoney(d.montoTotal, moneda)} · {d.fechaCreacion.split('-').reverse().join('/')}
                        {(d.montoPagado ?? 0) > 0 && ` · cobrado ${formatMoney(d.montoPagado ?? 0, moneda)}`}
                      </div>
                    </div>
                    {!cobrada && (
                      <button
                        onClick={() => setCobrar(d)}
                        className="mt-2 w-full rounded-lg py-2 text-sm font-semibold text-white"
                        style={{ backgroundColor: bgColor ? 'rgba(0,0,0,0.25)' : '#16a34a' }}
                      >
                        Pagado
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
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
      {pagar && (
        <PayDebtForm deuda={pagar} categorias={categorias} bolsillos={bolsillos} moneda={moneda} onClose={() => setPagar(null)} />
      )}
      {cobrar && (
        <CobrarForm deuda={cobrar} categorias={categorias} bolsillos={bolsillos} moneda={moneda} onClose={() => setCobrar(null)} />
      )}
      {pagarTodoMes && (
        <PagarTodoMesForm
          deudas={deudaPorBolsillo}
          esteMes={esteMes}
          categorias={categorias}
          bolsillos={bolsillos.filter(b => b.tipo !== 'credito')}
          moneda={moneda}
          onClose={() => setPagarTodoMes(false)}
        />
      )}
      {pagarOblig && (
        <PagarObligacionForm
          obligacion={pagarOblig}
          categoria={categorias.find(c => c.id === pagarOblig.categoriaId)}
          bolsillos={bolsillos.filter(b => b.tipo !== 'credito')}
          estimado={estimadoMensual(pagarOblig, transacciones)}
          moneda={moneda}
          onClose={() => setPagarOblig(null)}
        />
      )}
    </div>
  )
}

function TabObligatorios({
  obligaciones, transacciones, categorias, moneda, setPagarOblig,
}: {
  obligaciones: ReturnType<typeof useObligaciones>
  transacciones: ReturnType<typeof useTransactions>
  categorias: ReturnType<typeof useCategories>
  moneda: string
  setPagarOblig: (o: Obligacion | null) => void
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
      {/* Resumen del mes */}
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
                  {!pagado && (
                    <button
                      onClick={() => setPagarOblig(o)}
                      className="mt-1 rounded-lg bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30"
                    >
                      Pagar
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Tarjeta({ label, valor, resaltado, activo, onClick }: {
  label: string
  valor: string
  resaltado?: boolean
  activo?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl bg-white px-2 py-3 shadow-sm text-left transition dark:bg-slate-800 ${
        activo ? 'ring-2 ring-rose-500' : resaltado ? 'ring-2 ring-rose-200' : ''
      }`}
    >
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-sm font-semibold ${activo ? 'text-rose-600' : 'text-slate-800 dark:text-slate-100'}`}>{valor}</div>
    </button>
  )
}
