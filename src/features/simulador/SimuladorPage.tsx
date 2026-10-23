import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCategories, useMoneda, useObligaciones, useSueldo, useTransactions } from '../../hooks/data'
import { repo } from '../../data/repository'
import { formatMoney } from '../../lib/format'
import { estimadoMensual } from '../obligatorios/calc'
import { mesActual } from '../../lib/dates'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Simulacion {
  id: string
  nombre: string
  fecha: string
  valores: Record<string, number>
  valoresOblig: Record<string, number>
  filtro: 'todos' | 'mesActual'
  minMeses: number
}

const NOMBRES_EXCLUIR = ['transferencias', 'gastos no registrados']

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcularPromedios(
  transacciones: ReturnType<typeof useTransactions>,
): Map<string, { promedio: number; meses: number }> {
  const porMesCat = new Map<string, Map<string, number>>()
  for (const t of transacciones) {
    if (t.tipo !== 'gasto' || t.categoriaId == null) continue
    const mes = t.fecha.slice(0, 7)
    const keyC = String(t.categoriaId)
    if (!porMesCat.has(keyC)) porMesCat.set(keyC, new Map())
    const mC = porMesCat.get(keyC)!
    mC.set(mes, (mC.get(mes) ?? 0) + t.monto)
    if (t.subcategoria) {
      const keyS = `${t.categoriaId}:${t.subcategoria}`
      if (!porMesCat.has(keyS)) porMesCat.set(keyS, new Map())
      const mS = porMesCat.get(keyS)!
      mS.set(mes, (mS.get(mes) ?? 0) + t.monto)
    }
  }
  const result = new Map<string, { promedio: number; meses: number }>()
  for (const [key, meses] of porMesCat) {
    const vals = [...meses.values()]
    result.set(key, { promedio: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length), meses: vals.length })
  }
  return result
}

// ── Slider ─────────────────────────────────────────────────────────────────────

function ReglaSlider({ promedio, valor, onChange, max }: {
  promedio: number; valor: number; onChange: (v: number) => void; max: number
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const pctPromedio = max > 0 ? Math.min(100, (promedio / max) * 100) : 0
  const pctValor = max > 0 ? Math.min(100, (valor / max) * 100) : 0

  const getValor = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return valor
    return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * max)
  }, [max, valor])

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    onChange(getValor(e.clientX))
    const mv = (ev: MouseEvent) => onChange(getValor(ev.clientX))
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }
  const onTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    onChange(getValor(e.touches[0].clientX))
    const mv = (ev: TouchEvent) => onChange(getValor(ev.touches[0].clientX))
    const end = () => { window.removeEventListener('touchmove', mv); window.removeEventListener('touchend', end) }
    window.addEventListener('touchmove', mv, { passive: false }); window.addEventListener('touchend', end)
  }
  const bajo = valor <= promedio
  return (
    <div ref={trackRef} className="relative h-7 cursor-pointer select-none" onMouseDown={onMouseDown} onTouchStart={onTouchStart}>
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200 dark:bg-slate-700" />
      <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-none" style={{ left: 0, width: `${pctValor}%`, backgroundColor: bajo ? '#10b981' : '#ef4444' }} />
      <div className="absolute top-0 h-7 w-0.5 rounded-full bg-slate-500 dark:bg-slate-400" style={{ left: `${pctPromedio}%`, transform: 'translateX(-50%)' }} />
      <div className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-none" style={{ left: `${pctValor}%`, backgroundColor: bajo ? '#10b981' : '#ef4444' }} />
    </div>
  )
}

// ── Fila categoría ─────────────────────────────────────────────────────────────

function FilaCategoria({ icono, nombre, promedio, mesesProm, valor, onChange, sueldo, moneda, max, indent = false, onTapValue }: {
  icono: string; nombre: string; promedio: number; mesesProm: number; valor: number
  onChange: (v: number) => void; sueldo: number; moneda: string; max: number; indent?: boolean
  onTapValue?: () => void
}) {
  const pctS = sueldo > 0 ? Math.round((valor / sueldo) * 100) : 0
  const pctP = sueldo > 0 ? Math.round((promedio / sueldo) * 100) : 0
  const diff = valor - promedio
  const bajo = diff <= 0
  return (
    <div className={indent ? 'ml-4 border-l-2 border-slate-100 pl-3 dark:border-slate-700' : ''}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{icono}</span>
        <span className={`flex-1 text-sm font-medium ${indent ? 'text-slate-600 dark:text-slate-300' : 'text-slate-800 dark:text-slate-100'}`}>{nombre}</span>
        <button
          onClick={onTapValue}
          className={`text-xs font-semibold ${bajo ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'} active:opacity-60`}
        >
          {formatMoney(valor, moneda)}
        </button>
        {sueldo > 0 && <span className="text-[11px] text-slate-400 w-9 text-right">{pctS}%</span>}
      </div>
      <ReglaSlider promedio={promedio} valor={valor} onChange={onChange} max={max} />
      <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-400">
        <span>Prom. {formatMoney(promedio, moneda)}{sueldo > 0 && ` · ${pctP}%`}{mesesProm > 0 && <span className="ml-1 opacity-70">({mesesProm} {mesesProm === 1 ? 'mes' : 'meses'})</span>}</span>
        {diff !== 0 && <span className={bajo ? 'text-emerald-500' : 'text-red-400'}>{bajo ? '▼' : '▲'} {formatMoney(Math.abs(diff), moneda)}</span>}
      </div>
    </div>
  )
}

// ── Panel resumen ──────────────────────────────────────────────────────────────

function PanelResumen({ sueldo, totalSimulado, totalOblig, moneda, onReset }: {
  sueldo: number; totalSimulado: number; totalOblig: number; moneda: string; onReset: () => void
}) {
  const disponible = sueldo - totalSimulado - totalOblig
  const pctGasto = sueldo > 0 ? Math.round(((totalSimulado + totalOblig) / sueldo) * 100) : 0
  return (
    <div className="sticky top-0 z-10 rounded-xl bg-white p-3 shadow-md dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Resumen simulado</span>
        <button onClick={onReset} className="text-[11px] text-sky-500 active:text-sky-700">↺ Resetear</button>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
          <p className="text-[10px] text-slate-400">Sueldo</p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{formatMoney(sueldo, moneda)}</p>
        </div>
        <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 px-3 py-2">
          <p className="text-[10px] text-rose-400">Gastos variables</p>
          <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{formatMoney(totalSimulado, moneda)}</p>
        </div>
        <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 px-3 py-2">
          <p className="text-[10px] text-orange-500">Total gastos</p>
          <p className="text-sm font-bold text-orange-700 dark:text-orange-400">{formatMoney(totalSimulado + totalOblig, moneda)}</p>
        </div>
        <div className={`rounded-lg px-3 py-2 ${disponible >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
          <p className={`text-[10px] ${disponible >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>{disponible >= 0 ? 'Sobraría' : 'Faltaría'}</p>
          <p className={`text-sm font-bold ${disponible >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatMoney(Math.abs(disponible), moneda)}</p>
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div className={`h-full rounded-full transition-none ${pctGasto > 100 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pctGasto)}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-right text-slate-400">{pctGasto}% del sueldo en gastos</p>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function SimuladorPage() {
  const categorias = useCategories()
  const transacciones = useTransactions()
  const obligaciones = useObligaciones()
  const sueldo = useSueldo()
  const moneda = useMoneda()

  const categoriasGasto = useMemo(
    () => categorias.filter(c => {
      if (c.tipo !== 'gasto') return false
      const n = c.nombre.toLowerCase().trim()
      return !NOMBRES_EXCLUIR.some(ex => n.includes(ex))
    }),
    [categorias],
  )

  const promedios = useMemo(() => calcularPromedios(transacciones), [transacciones])

  const totalObligBase = useMemo(
    () => obligaciones.reduce((s, o) => s + estimadoMensual(o, transacciones), 0),
    [obligaciones, transacciones],
  )

  const catsObligatorias = useMemo(() => {
    const s = new Set<number>()
    obligaciones.forEach(o => s.add(o.categoriaId))
    return s
  }, [obligaciones])

  const obligPorCategoria = useMemo(() => {
    const m = new Map<number, number>()
    for (const o of obligaciones) {
      const est = estimadoMensual(o, transacciones)
      m.set(o.categoriaId, (m.get(o.categoriaId) ?? 0) + est)
    }
    return m
  }, [obligaciones, transacciones])

  const categoriasOblig = useMemo(
    () => categoriasGasto.filter(c => c.id != null && catsObligatorias.has(c.id!)),
    [categoriasGasto, catsObligatorias],
  )

  const categoriasAjustables = useMemo(
    () => categoriasGasto.filter(c => c.id == null || !catsObligatorias.has(c.id)),
    [categoriasGasto, catsObligatorias],
  )

  // Ventana 12 meses: desde 11 meses atrás hasta hoy
  const mesHoy = useMemo(() => mesActual(), [])
  const ventanaInicio = useMemo(() => {
    const [y, mo] = mesHoy.split('-').map(Number)
    const backMo = mo - 11
    const backY = backMo <= 0 ? y - 1 : y
    const adjMo = backMo <= 0 ? backMo + 12 : backMo
    return `${backY}-${String(adjMo).padStart(2, '0')}`
  }, [mesHoy])

  // Cuántos meses distintos (últimos 12) tiene cada categoría y subcategoría
  const mesesEnAñoMap = useMemo(() => {
    const catMeses = new Map<string, Set<string>>()
    for (const t of transacciones) {
      if (t.tipo !== 'gasto' || t.categoriaId == null) continue
      const mes = t.fecha.slice(0, 7)
      if (mes < ventanaInicio || mes > mesHoy) continue
      const key = String(t.categoriaId)
      if (!catMeses.has(key)) catMeses.set(key, new Set())
      catMeses.get(key)!.add(mes)
      if (t.subcategoria) {
        const keyS = `${t.categoriaId}:${t.subcategoria}`
        if (!catMeses.has(keyS)) catMeses.set(keyS, new Set())
        catMeses.get(keyS)!.add(mes)
      }
    }
    const result = new Map<string, number>()
    for (const [key, months] of catMeses) result.set(key, months.size)
    return result
  }, [transacciones, ventanaInicio, mesHoy])

  const { catsEnMesActual, gastosMesActual } = useMemo(() => {
    const ids = new Set<number>()
    const gastos = new Map<string, number>()
    for (const t of transacciones) {
      if (t.tipo !== 'gasto' || t.categoriaId == null) continue
      if (!t.fecha.startsWith(mesHoy)) continue
      ids.add(t.categoriaId)
      const keyC = String(t.categoriaId)
      gastos.set(keyC, (gastos.get(keyC) ?? 0) + t.monto)
      if (t.subcategoria) {
        const keyS = `${t.categoriaId}:${t.subcategoria}`
        gastos.set(keyS, (gastos.get(keyS) ?? 0) + t.monto)
      }
    }
    return { catsEnMesActual: ids, gastosMesActual: gastos }
  }, [transacciones, mesHoy])

  const [filtro, setFiltro] = useState<'todos' | 'mesActual'>('todos')
  const [minMeses, setMinMeses] = useState(1)

  const aplicarFiltroMeses = useCallback((n: number) => {
    setMinMeses(n)
    const nuevos = new Map<string, number>()
    for (const c of categoriasAjustables) {
      if (!c.id) continue
      const allSubs = (c.subcategorias ?? []).filter(s => (promedios.get(`${c.id}:${s}`)?.meses ?? 0) > 0)
      if (allSubs.length > 0) {
        for (const sub of allSubs) {
          const keyS = `${c.id}:${sub}`
          const cumple = n <= 1 || (mesesEnAñoMap.get(keyS) ?? 0) >= n
          nuevos.set(keyS, cumple ? (promedios.get(keyS)?.promedio ?? 0) : 0)
        }
      } else {
        const cumple = n <= 1 || (mesesEnAñoMap.get(String(c.id)) ?? 0) >= n
        nuevos.set(String(c.id), cumple ? (promedios.get(String(c.id))?.promedio ?? 0) : 0)
      }
    }
    setValores(nuevos)
  }, [categoriasAjustables, promedios, mesesEnAñoMap])

  // Subcategorías con datos históricos por categoría (sin filtro de meses — siempre visibles)
  const subcatsFiltradas = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const c of categoriasAjustables) {
      if (!c.id) continue
      m.set(c.id, (c.subcategorias ?? []).filter(sub => (promedios.get(`${c.id}:${sub}`)?.meses ?? 0) > 0))
    }
    return m
  }, [categoriasAjustables, promedios])

  const categoriasFiltradas = useMemo(() => {
    let cats = categoriasAjustables
    if (filtro === 'mesActual') cats = cats.filter(c => c.id != null && catsEnMesActual.has(c.id!))
    return cats
  }, [categoriasAjustables, filtro, catsEnMesActual])

  // ── Simulaciones guardadas ─────────────────────────────────────────────────

  const simRaw = useLiveQuery(() => repo.getSetting('simulacionesSimulador'), [], '[]') ?? '[]'
  const simulacionesGuardadas = useMemo<Simulacion[]>(() => {
    try { return JSON.parse(simRaw) } catch { return [] }
  }, [simRaw])

  const [mostrandoSims, setMostrandoSims] = useState(false)
  const [nombreGuardar, setNombreGuardar] = useState('')
  const [guardandoInput, setGuardandoInput] = useState(false)

  // ── Sliders valores ────────────────────────────────────────────────────────

  const valoresIniciales = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of categoriasAjustables) {
      const key = String(c.id)
      m.set(key, promedios.get(key)?.promedio ?? 0)
      if (c.subcategorias) {
        for (const sub of c.subcategorias) {
          const keyS = `${c.id}:${sub}`
          m.set(keyS, promedios.get(keyS)?.promedio ?? 0)
        }
      }
    }
    return m
  }, [categoriasAjustables, promedios])

  const [valores, setValores] = useState<Map<string, number>>(valoresIniciales)
  const initializedRef = useRef(false)
  useEffect(() => {
    if (!initializedRef.current && valoresIniciales.size > 0) {
      setValores(new Map(valoresIniciales))
      initializedRef.current = true
    }
  }, [valoresIniciales])

  const setValor = useCallback((key: string, v: number) => {
    setValores(prev => new Map(prev).set(key, v))
  }, [])

  // Sliders obligaciones ajustables
  const valoresObligIniciales = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of categoriasOblig) {
      if (!c.id) continue
      m.set(String(c.id), obligPorCategoria.get(c.id) ?? 0)
    }
    return m
  }, [categoriasOblig, obligPorCategoria])

  const [valoresOblig, setValoresOblig] = useState<Map<string, number>>(new Map())
  const [obligAjustando, setObligAjustando] = useState(false)
  const obligInitRef = useRef(false)
  useEffect(() => {
    if (!obligInitRef.current && valoresObligIniciales.size > 0) {
      setValoresOblig(new Map(valoresObligIniciales))
      obligInitRef.current = true
    }
  }, [valoresObligIniciales])

  const setValorOblig = useCallback((key: string, v: number) => {
    setValoresOblig(prev => new Map(prev).set(key, v))
  }, [])

  const totalObligSimulado = useMemo(() => {
    if (!obligAjustando) return totalObligBase
    return [...valoresOblig.values()].reduce((s, v) => s + v, 0)
  }, [obligAjustando, valoresOblig, totalObligBase])

  // ── Presets ────────────────────────────────────────────────────────────────

  const aplicarPreset = useCallback((accion: 'cero' | 'mesActual') => {
    const nuevoFiltro: 'todos' | 'mesActual' = accion === 'cero' ? 'todos' : (filtro === accion ? 'todos' : accion)
    setFiltro(nuevoFiltro)
    const getValor = (key: string) => {
      if (accion === 'cero') return 0
      if (accion === 'mesActual') return gastosMesActual.get(key) ?? 0
      return promedios.get(key)?.promedio ?? 0
    }
    const nuevos = new Map<string, number>()
    for (const c of categoriasAjustables) {
      if (!c.id) continue
      const incluir = nuevoFiltro === 'todos' || (nuevoFiltro === 'mesActual' && catsEnMesActual.has(c.id))
      nuevos.set(String(c.id), incluir ? getValor(String(c.id)) : 0)
      if (c.subcategorias) {
        for (const sub of c.subcategorias) {
          const keyS = `${c.id}:${sub}`
          nuevos.set(keyS, incluir ? getValor(keyS) : 0)
        }
      }
    }
    setValores(nuevos)
  }, [filtro, categoriasAjustables, catsEnMesActual, promedios, gastosMesActual])

  const reset = useCallback(() => {
    const getValor = (key: string) =>
      filtro === 'mesActual' ? (gastosMesActual.get(key) ?? 0) : (promedios.get(key)?.promedio ?? 0)
    const nuevos = new Map<string, number>()
    for (const c of categoriasAjustables) {
      if (!c.id) continue
      const incluir = filtro === 'todos' || (filtro === 'mesActual' && catsEnMesActual.has(c.id))
      nuevos.set(String(c.id), incluir ? getValor(String(c.id)) : 0)
      if (c.subcategorias) {
        for (const sub of c.subcategorias) {
          const keyS = `${c.id}:${sub}`
          nuevos.set(keyS, incluir ? getValor(keyS) : 0)
        }
      }
    }
    setValores(nuevos)
  }, [filtro, categoriasAjustables, catsEnMesActual, promedios, gastosMesActual])

  // ── Guardar / cargar simulaciones ──────────────────────────────────────────

  const guardarSimulacion = useCallback(async () => {
    const nombre = nombreGuardar.trim()
    if (!nombre) return
    const nueva: Simulacion = {
      id: Date.now().toString(),
      nombre,
      fecha: new Date().toISOString(),
      valores: Object.fromEntries(valores),
      valoresOblig: Object.fromEntries(valoresOblig),
      filtro,
      minMeses,
    }
    await repo.setSetting('simulacionesSimulador', JSON.stringify([...simulacionesGuardadas, nueva]))
    setNombreGuardar('')
    setGuardandoInput(false)
  }, [nombreGuardar, valores, valoresOblig, filtro, minMeses, simulacionesGuardadas])

  const eliminarSimulacion = useCallback(async (id: string) => {
    await repo.setSetting('simulacionesSimulador', JSON.stringify(simulacionesGuardadas.filter(s => s.id !== id)))
  }, [simulacionesGuardadas])

  const cargarSimulacion = useCallback((sim: Simulacion) => {
    setValores(new Map(Object.entries(sim.valores).map(([k, v]) => [k, Number(v)])))
    setValoresOblig(new Map(Object.entries(sim.valoresOblig).map(([k, v]) => [k, Number(v)])))
    setFiltro(sim.filtro)
    setMinMeses(sim.minMeses)
    initializedRef.current = true
    obligInitRef.current = true
    setMostrandoSims(false)
  }, [])

  // ── Total simulado ─────────────────────────────────────────────────────────

  const totalSimulado = useMemo(() => {
    let total = 0
    for (const c of categoriasAjustables) {
      if (!c.id) continue
      const subs = subcatsFiltradas.get(c.id) ?? []
      if (subs.length > 0) {
        for (const sub of subs) total += valores.get(`${c.id}:${sub}`) ?? 0
      } else {
        total += valores.get(String(c.id)) ?? 0
      }
    }
    return total
  }, [valores, categoriasAjustables, subcatsFiltradas])

  const getMax = (p: number) => Math.max(p * 2.5, 50000)

  const [expandidas, setExpandidas] = useState<Set<number>>(new Set())
  const toggleExpandir = (id: number) => setExpandidas(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const [editandoModal, setEditandoModal] = useState<{ nombre: string; valor: number; onChange: (v: number) => void } | null>(null)
  const [editandoValorStr, setEditandoValorStr] = useState('')

  const abrirEditor = useCallback((nombre: string, valor: number, onChange: (v: number) => void) => {
    setEditandoModal({ nombre, valor, onChange })
    setEditandoValorStr(String(valor))
  }, [])

  const confirmarEdicion = useCallback(() => {
    if (!editandoModal) return
    const parsed = parseInt(editandoValorStr.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(parsed)) editandoModal.onChange(parsed)
    setEditandoModal(null)
  }, [editandoModal, editandoValorStr])

  if (sueldo === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-3xl">💡</p>
        <p className="mt-2 text-sm text-slate-400">Configura tu sueldo en <b>Ajustes → Ajustar saldo</b> para usar el simulador.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Título */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Simulador de presupuesto</h2>
        <button
          onClick={() => setMostrandoSims(v => !v)}
          className={`rounded-xl px-3 py-1.5 text-xs font-medium ${mostrandoSims ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}
        >
          📂 {simulacionesGuardadas.length > 0 ? `${simulacionesGuardadas.length} guardadas` : 'Guardadas'}
        </button>
      </div>

      {/* Panel simulaciones guardadas */}
      {mostrandoSims && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30 space-y-2">
          {simulacionesGuardadas.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-1">No hay simulaciones guardadas aún</p>
          )}
          {simulacionesGuardadas.map(sim => (
            <div key={sim.id} className="flex items-center gap-2">
              <button
                onClick={() => cargarSimulacion(sim)}
                className="flex-1 text-left rounded-lg bg-white dark:bg-slate-800 px-3 py-2 shadow-sm"
              >
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{sim.nombre}</p>
                <p className="text-[10px] text-slate-400">{new Date(sim.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              </button>
              <button onClick={() => eliminarSimulacion(sim.id)} className="text-slate-400 px-2 py-2 text-lg">🗑</button>
            </div>
          ))}

          {/* Guardar actual */}
          {guardandoInput ? (
            <div className="flex gap-2 pt-1">
              <input
                autoFocus
                value={nombreGuardar}
                onChange={e => setNombreGuardar(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && guardarSimulacion()}
                placeholder="Nombre de la simulación…"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <button onClick={guardarSimulacion} className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-bold text-white">Guardar</button>
              <button onClick={() => { setGuardandoInput(false); setNombreGuardar('') }} className="text-slate-400 px-2">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setGuardandoInput(true)}
              className="w-full rounded-lg border border-dashed border-indigo-300 py-2 text-xs font-medium text-indigo-600 dark:border-indigo-700 dark:text-indigo-400"
            >
              💾 Guardar simulación actual
            </button>
          )}
        </div>
      )}

      {/* Presets */}
      <div className="flex gap-2">
        <button onClick={() => aplicarPreset('cero')} className="flex-1 rounded-xl bg-slate-100 py-2 text-xs font-medium text-slate-700 active:bg-slate-200 dark:bg-slate-700 dark:text-slate-300">
          🔢 Todo en cero
        </button>
        <button
          onClick={() => aplicarPreset('mesActual')}
          className={`flex-1 rounded-xl py-2 text-xs font-medium active:opacity-80 ${filtro === 'mesActual' ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}
        >
          📅 Mes actual
        </button>
      </div>

      {/* Filtro por registros/año */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">Meses/año ≥</span>
        {[1, 2, 3, 4, 6, 9, 12].map(n => (
          <button
            key={n}
            onClick={() => aplicarFiltroMeses(n)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${minMeses === n ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
          >
            {n}
          </button>
        ))}
      </div>

      <PanelResumen sueldo={sueldo} totalSimulado={totalSimulado} totalOblig={totalObligSimulado} moneda={moneda} onReset={reset} />

      {/* Obligaciones fijas ajustables */}
      {totalObligBase > 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 overflow-hidden">
          <button
            onClick={() => setObligAjustando(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300"
          >
            <span className="font-semibold">📌 Obligaciones fijas: {formatMoney(totalObligSimulado, moneda)}/mes</span>
            <span className="text-xs opacity-70">{obligAjustando ? '▲ cerrar' : '▼ clic para ajustar'}</span>
          </button>
          {obligAjustando && (
            <div className="px-3 pb-3 space-y-3 border-t border-amber-200 dark:border-amber-800 pt-3">
              {categoriasOblig.map(c => {
                if (!c.id) return null
                const key = String(c.id)
                const estimado = obligPorCategoria.get(c.id) ?? 0
                const valor = valoresOblig.get(key) ?? 0
                return (
                  <FilaCategoria key={c.id} icono={c.icono} nombre={c.nombre} promedio={estimado} mesesProm={0}
                    valor={valor} onChange={v => setValorOblig(key, v)} sueldo={sueldo} moneda={moneda} max={getMax(Math.max(estimado, valor))}
                    onTapValue={() => abrirEditor(c.nombre, valor, v => setValorOblig(key, v))} />
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Categorías ajustables */}
      <ul className="space-y-3">
        {categoriasFiltradas.map(c => {
          if (!c.id) return null
          const key = String(c.id)
          const pd = promedios.get(key)
          const promedio = pd?.promedio ?? 0
          const mesesProm = pd?.meses ?? 0
          const valor = valores.get(key) ?? 0
          const mesesAño = mesesEnAñoMap.get(key) ?? 0

          const subcatsConDatos = subcatsFiltradas.get(c.id) ?? []
          const tieneSubcats = subcatsConDatos.length > 0
          const expandido = expandidas.has(c.id)
          const valorMostrado = tieneSubcats ? subcatsConDatos.reduce((s, sub) => s + (valores.get(`${c.id}:${sub}`) ?? 0), 0) : valor
          const maxCat = getMax(Math.max(promedio, valorMostrado))

          return (
            <li key={c.id} className="rounded-xl bg-white p-3 shadow-sm dark:bg-slate-800">
              <div className={tieneSubcats ? 'cursor-pointer' : ''} onClick={tieneSubcats ? () => toggleExpandir(c.id!) : undefined}>
                {tieneSubcats ? (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">{c.icono}</span>
                    <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{c.nombre}</span>
                    {mesesAño > 0 && <span className="text-[10px] text-slate-400">{mesesAño}m</span>}
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{formatMoney(valorMostrado, moneda)}</span>
                    {sueldo > 0 && <span className="text-[11px] text-slate-400 w-9 text-right">{Math.round((valorMostrado / sueldo) * 100)}%</span>}
                    <span className="text-slate-400 text-sm">{expandido ? '▲' : '▼'}</span>
                  </div>
                ) : (
                  <div>
                    {mesesAño > 0 && <span className="float-right text-[10px] text-slate-400 mt-0.5">{mesesAño}/12 meses</span>}
                    <FilaCategoria icono={c.icono} nombre={c.nombre} promedio={promedio} mesesProm={mesesProm}
                      valor={valor} onChange={v => setValor(key, v)} sueldo={sueldo} moneda={moneda} max={maxCat}
                      onTapValue={() => abrirEditor(c.nombre, valor, v => setValor(key, v))} />
                  </div>
                )}
              </div>
              {tieneSubcats && expandido && (
                <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-700">
                  {subcatsConDatos.map(sub => {
                    const keyS = `${c.id}:${sub}`
                    const pdS = promedios.get(keyS)
                    const promedioS = pdS?.promedio ?? 0
                    const mesesS = pdS?.meses ?? 0
                    const valorS = valores.get(keyS) ?? 0
                    return (
                      <FilaCategoria key={sub} icono="·" nombre={sub} promedio={promedioS} mesesProm={mesesS}
                        valor={valorS} onChange={v => setValor(keyS, v)} sueldo={sueldo} moneda={moneda} max={getMax(Math.max(promedioS, valorS))} indent
                        onTapValue={() => abrirEditor(sub, valorS, v => setValor(keyS, v))} />
                    )
                  })}
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700">
                    <span>Total {c.nombre}</span>
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      {formatMoney(valorMostrado, moneda)}{sueldo > 0 && <span className="ml-1 font-normal">· {Math.round((valorMostrado / sueldo) * 100)}%</span>}
                    </span>
                  </div>
                </div>
              )}
              {tieneSubcats && !expandido && (
                <p className="text-[10px] text-slate-400 mt-1">{subcatsConDatos.length} subcategorías · toca para ajustar</p>
              )}
            </li>
          )
        })}
      </ul>

      {/* Modal de edición exacta */}
      {editandoModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center pb-10 sm:items-center"
          onClick={() => setEditandoModal(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative mx-4 w-full max-w-sm rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-xs text-slate-400 mb-0.5">Valor para</p>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4">{editandoModal.nombre}</h3>
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              value={editandoValorStr}
              onChange={e => setEditandoValorStr(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmarEdicion()}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-4 py-3 text-xl font-bold text-slate-800 dark:text-slate-100 text-right focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="0"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setEditandoModal(null)}
                className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-700 py-3 text-sm font-medium text-slate-600 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEdicion}
                className="flex-1 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
