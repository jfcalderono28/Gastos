import { useEffect, useRef, useState } from 'react'
import Modal from '../../components/Modal'
import { repo } from '../../data/repository'
import type { Bolsillo } from '../../data/db'
import { useBolsillos } from '../../hooks/data'

export default function BolsillosManager({ onVolver }: { onVolver: () => void }) {
  const bolsillosDB = useBolsillos()
  const [lista, setLista] = useState<Bolsillo[]>([])
  const [dirty, setDirty] = useState(false)
  const [editar, setEditar] = useState<Bolsillo | null | 'nuevo'>(null)
  const [mostrarPresets, setMostrarPresets] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const touchRef = useRef<{ fromIdx: number; overIdx: number } | null>(null)

  useEffect(() => {
    setLista([...bolsillosDB])
    setDirty(false)
  }, [bolsillosDB])

  // Touch drag
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
    function onMove(e: TouchEvent) { e.preventDefault(); recalcOver(e.touches[0].clientY) }
    function onEnd() {
      if (touchRef.current) {
        const { fromIdx, overIdx: to } = touchRef.current
        if (fromIdx !== to) {
          setLista(prev => {
            const copy = [...prev]
            const [item] = copy.splice(fromIdx, 1)
            copy.splice(to, 0, item)
            return copy
          })
          setDirty(true)
        }
      }
      touchRef.current = null; setDragIdx(null); setOverIdx(null)
    }
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    return () => { document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd) }
  }, [dragIdx])

  function onDragStart(e: React.DragEvent, idx: number) { e.dataTransfer.effectAllowed = 'move'; setDragIdx(idx) }
  function onDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setOverIdx(idx) }
  function onDrop(e: React.DragEvent, to: number) {
    e.preventDefault()
    if (dragIdx !== null && dragIdx !== to) {
      const copy = [...lista]; const [item] = copy.splice(dragIdx, 1); copy.splice(to, 0, item); setLista(copy)
      setDirty(true)
    }
    setDragIdx(null); setOverIdx(null)
  }
  function onHandleTouchStart(_e: React.TouchEvent, idx: number) {
    touchRef.current = { fromIdx: idx, overIdx: idx }; setDragIdx(idx); setOverIdx(idx)
  }

  async function guardarOrden() {
    for (let i = 0; i < lista.length; i++) {
      const b = lista[i]
      if (b.id) await repo.updateBolsillo(b.id, { orden: i })
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="text-sm text-emerald-600">
        ‹ Volver a Ajustes
      </button>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Bolsillos</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setMostrarPresets(true)}
            className="rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-600"
          >
            🏦 Desde banco
          </button>
          <button
            onClick={() => setEditar('nuevo')}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            + Nuevo
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-400">
        Arrastra ⠿ para reordenar · Toca el nombre para editar.
      </p>

      {lista.length === 0 ? (
        <p className="py-8 text-center text-slate-400">No hay bolsillos creados.</p>
      ) : (
        <ul ref={listRef} className="space-y-2 select-none">
          {lista.map((b, i) => {
            const isDragging = dragIdx === i
            const isOver = overIdx === i && dragIdx !== null && dragIdx !== i
            return (
              <li
                key={b.id}
                data-idx={i}
                draggable
                onDragStart={e => onDragStart(e, i)}
                onDragOver={e => onDragOver(e, i)}
                onDrop={e => onDrop(e, i)}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
                className={[
                  'flex items-center gap-3 rounded-xl p-3 shadow-sm transition-all bg-white dark:bg-slate-800',
                  isDragging ? 'opacity-30 scale-[0.97]' : '',
                  isOver ? 'ring-2 ring-emerald-500 ring-offset-1' : '',
                ].join(' ')}
              >
                <span
                  className="cursor-grab touch-none select-none px-1 text-lg text-slate-300 dark:text-slate-600 active:cursor-grabbing"
                  onTouchStart={e => onHandleTouchStart(e, i)}
                >
                  ⠿
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg bg-slate-200 dark:bg-slate-600">
                  {b.icono}
                </span>
                <span className="flex-1 cursor-pointer font-medium text-slate-800 dark:text-slate-100" onClick={() => setEditar(b)}>
                  {b.nombre}
                  <span className="ml-1 text-xs text-slate-400">{b.tipo === 'credito' ? '· crédito' : '· débito'}</span>
                </span>
                <span className="cursor-pointer text-slate-300" onClick={() => setEditar(b)}>›</span>
              </li>
            )
          })}
        </ul>
      )}

      {dirty && (
        <button
          onClick={guardarOrden}
          className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white"
        >
          Guardar orden
        </button>
      )}

      {editar !== null && (
        <BolsilloEditor
          inicial={editar === 'nuevo' ? null : editar}
          totalBolsillos={lista.length}
          onClose={() => setEditar(null)}
        />
      )}

      {mostrarPresets && (
        <PresetsModal
          onSeleccionar={preset => {
            setMostrarPresets(false)
            setEditar({
              nombre: preset.nombre,
              icono: preset.icono,
              color: preset.color,
              tipo: preset.tipo,
              packageName: preset.packageName || undefined,
              diaCorte: preset.tipo === 'credito' ? 15 : undefined,
            } as Bolsillo)
          }}
          onClose={() => setMostrarPresets(false)}
        />
      )}
    </div>
  )
}

// ── Presets bancarios Colombia ──────────────────────────────────────────────
interface PresetBancario {
  banco: string
  nombre: string
  tipo: 'debito' | 'credito'
  icono: string
  color: string
  packageName: string   // vacío = sin app vinculada confirmada
}

// Package names verificados en Google Play Colombia.
// Los marcados con * son los ya vinculados con APPS_BANCARIAS.
const PRESETS_BANCARIOS: PresetBancario[] = [
  // ── Bancolombia ──
  { banco: 'Bancolombia', nombre: 'Bancolombia Débito',  tipo: 'debito',  icono: '🏦', color: '#F5A800', packageName: 'co.com.bancolombia.personas.superapp' },
  { banco: 'Bancolombia', nombre: 'Bancolombia Crédito', tipo: 'credito', icono: '💳', color: '#F5A800', packageName: 'co.com.bancolombia.personas.superapp' },
  // ── Nequi ──
  { banco: 'Nequi',       nombre: 'Nequi',               tipo: 'debito',  icono: '📱', color: '#FF0066', packageName: 'com.nequi.MobileApp' },
  // ── Davivienda ──
  { banco: 'Davivienda',  nombre: 'Davivienda Débito',   tipo: 'debito',  icono: '🏦', color: '#DA291C', packageName: 'com.todo1.davivienda.mobileapp' },
  { banco: 'Davivienda',  nombre: 'Davivienda Crédito',  tipo: 'credito', icono: '💳', color: '#DA291C', packageName: 'com.todo1.davivienda.mobileapp' },
  // ── Daviplata ──
  { banco: 'Daviplata',   nombre: 'Daviplata',            tipo: 'debito',  icono: '📱', color: '#E84142', packageName: 'com.davivienda.daviplataapp' },
  // ── Nu (Nubank) ──
  { banco: 'Nu',          nombre: 'Nu Cuenta',            tipo: 'debito',  icono: '📱', color: '#820AD1', packageName: 'com.nu.production' },
  { banco: 'Nu',          nombre: 'Nu Tarjeta Crédito',   tipo: 'credito', icono: '💳', color: '#820AD1', packageName: 'com.nu.production' },
  // ── BBVA ──
  { banco: 'BBVA',        nombre: 'BBVA Débito',          tipo: 'debito',  icono: '🏦', color: '#004481', packageName: 'co.com.bbva.mb' },
  { banco: 'BBVA',        nombre: 'BBVA Crédito',         tipo: 'credito', icono: '💳', color: '#004481', packageName: 'co.com.bbva.mb' },
  // ── Falabella ──
  { banco: 'Falabella',   nombre: 'Falabella Crédito',    tipo: 'credito', icono: '💳', color: '#00693E', packageName: 'co.com.bancofalabella.mobile.omc' },
  { banco: 'Falabella',   nombre: 'Falabella Débito',     tipo: 'debito',  icono: '🏦', color: '#00693E', packageName: 'co.com.bancofalabella.mobile.omc' },
  // ── Banco de Bogotá ──
  { banco: 'Banco de Bogotá', nombre: 'Bogotá Débito',   tipo: 'debito',  icono: '🏦', color: '#003087', packageName: 'com.bancodebogota.bancamovil' },
  { banco: 'Banco de Bogotá', nombre: 'Bogotá Crédito',  tipo: 'credito', icono: '💳', color: '#003087', packageName: 'com.bancodebogota.bancamovil' },
  // ── AV Villas ──
  { banco: 'AV Villas',   nombre: 'AV Villas Débito',     tipo: 'debito',  icono: '🏦', color: '#78BE20', packageName: 'com.grupoavalav1.bancamovil' },
  { banco: 'AV Villas',   nombre: 'AV Villas Crédito',    tipo: 'credito', icono: '💳', color: '#78BE20', packageName: 'com.grupoavalav1.bancamovil' },
  // ── Banco de Occidente ──
  { banco: 'Banco de Occidente', nombre: 'Occidente Débito',  tipo: 'debito',  icono: '🏦', color: '#0057A8', packageName: 'com.grupoavaloc1.bancamovil' },
  { banco: 'Banco de Occidente', nombre: 'Occidente Crédito', tipo: 'credito', icono: '💳', color: '#0057A8', packageName: 'com.grupoavaloc1.bancamovil' },
  // ── Banco Caja Social ──
  { banco: 'Banco Caja Social', nombre: 'Caja Social Débito',  tipo: 'debito',  icono: '🏦', color: '#F05A28', packageName: 'com.bcs.retail' },
  { banco: 'Banco Caja Social', nombre: 'Caja Social Crédito', tipo: 'credito', icono: '💳', color: '#F05A28', packageName: 'com.bcs.retail' },
  // ── Scotiabank Colpatria ──
  { banco: 'Scotiabank Colpatria', nombre: 'Colpatria Débito',  tipo: 'debito',  icono: '🏦', color: '#EC111A', packageName: '' },
  { banco: 'Scotiabank Colpatria', nombre: 'Colpatria Crédito', tipo: 'credito', icono: '💳', color: '#EC111A', packageName: '' },
  // ── Banco Popular ──
  { banco: 'Banco Popular', nombre: 'Popular Débito',  tipo: 'debito',  icono: '🏦', color: '#005A9C', packageName: '' },
  { banco: 'Banco Popular', nombre: 'Popular Crédito', tipo: 'credito', icono: '💳', color: '#005A9C', packageName: '' },
  // ── Itaú ──
  { banco: 'Itaú', nombre: 'Itaú Débito',  tipo: 'debito',  icono: '🏦', color: '#FF6200', packageName: '' },
  { banco: 'Itaú', nombre: 'Itaú Crédito', tipo: 'credito', icono: '💳', color: '#FF6200', packageName: '' },
  // ── Lulo Bank ──
  { banco: 'Lulo Bank', nombre: 'Lulo Bank', tipo: 'debito', icono: '📱', color: '#FF5B5B', packageName: '' },
  // ── Movii ──
  { banco: 'Movii', nombre: 'Movii', tipo: 'debito', icono: '📱', color: '#F5C300', packageName: '' },
  // ── RappiPay ──
  { banco: 'RappiPay', nombre: 'RappiPay Cuenta',  tipo: 'debito',  icono: '📱', color: '#FF0000', packageName: '' },
  { banco: 'RappiPay', nombre: 'RappiPay Crédito', tipo: 'credito', icono: '💳', color: '#FF0000', packageName: '' },
  // ── Efectivo ──
  { banco: 'Efectivo', nombre: 'Efectivo', tipo: 'debito', icono: '💵', color: '#22c55e', packageName: '' },
]

function PresetsModal({
  onSeleccionar,
  onClose,
}: {
  onSeleccionar: (preset: PresetBancario) => void
  onClose: () => void
}) {
  const [filtro, setFiltro] = useState('')
  const bancos = [...new Set(PRESETS_BANCARIOS.map(p => p.banco))]
  const bancosFiltrados = filtro
    ? bancos.filter(b => b.toLowerCase().includes(filtro.toLowerCase()))
    : bancos

  return (
    <Modal title="Seleccionar banco" onClose={onClose}>
      <input
        placeholder="Buscar banco…"
        value={filtro}
        onChange={e => setFiltro(e.target.value)}
        className="mb-3 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-600"
        autoFocus
      />
      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {bancosFiltrados.map(banco => {
          const opciones = PRESETS_BANCARIOS.filter(p => p.banco === banco)
          return (
            <div key={banco}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{banco}</p>
              <div className="flex flex-wrap gap-2">
                {opciones.map(preset => (
                  <button
                    key={preset.nombre}
                    onClick={() => onSeleccionar(preset)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:border-emerald-400 active:scale-95 dark:border-slate-700"
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-base shrink-0"
                      style={{ backgroundColor: preset.color + '22', color: preset.color }}
                    >
                      {preset.icono}
                    </span>
                    <span className="text-slate-700 dark:text-slate-200">
                      {preset.tipo === 'debito' ? 'Débito' : 'Crédito'}
                    </span>
                    {!preset.packageName && (
                      <span className="text-[10px] text-slate-400">(sin app)</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

const ICONOS = ['👛', '💵', '💳', '🏦', '📱', '🐷', '💰', '🎯']

const APPS_BANCARIAS = [
  { value: '', label: 'Ninguna' },
  { value: 'com.nequi.MobileApp',                   label: 'Nequi' },
  { value: 'co.com.bancolombia.personas.superapp',   label: 'Bancolombia' },
  { value: 'com.nu.production',                      label: 'Nu (Nubank)' },
  { value: 'com.todo1.davivienda.mobileapp',         label: 'Davivienda' },
  { value: 'com.davivienda.daviplataapp',            label: 'Daviplata' },
  { value: 'co.com.bbva.mb',                        label: 'BBVA' },
  { value: 'co.com.bancofalabella.mobile.omc',       label: 'Falabella' },
  { value: 'com.whatsapp',                           label: 'WhatsApp (pruebas)' },
]

function BolsilloEditor({
  inicial,
  totalBolsillos,
  onClose,
}: {
  inicial: Bolsillo | null
  totalBolsillos: number
  onClose: () => void
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [icono, setIcono] = useState(inicial?.icono ?? '👛')
  const [color, setColor] = useState(inicial?.color ?? '#10b981')
  const [tipo, setTipo] = useState<'debito' | 'credito'>(inicial?.tipo ?? 'debito')
  const [diaCorte, setDiaCorte] = useState(inicial?.diaCorte ? String(inicial.diaCorte) : '15')
  const [packageName, setPackageName] = useState(inicial?.packageName ?? '')

  const valido = nombre.trim().length > 0 && (tipo === 'debito' || (Number(diaCorte) >= 1 && Number(diaCorte) <= 31))

  async function guardar() {
    if (!valido) return
    const datos: any = { nombre: nombre.trim(), icono, color, tipo }
    if (tipo === 'credito') datos.diaCorte = Number(diaCorte)
    datos.packageName = packageName || undefined
    if (inicial?.id) await repo.updateBolsillo(inicial.id, datos)
    else await repo.addBolsillo(datos)
    onClose()
  }

  return (
    <Modal title={inicial ? 'Editar bolsillo' : 'Nuevo bolsillo'} onClose={onClose}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Nequi, Efectivo, Ahorros…"
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Tipo de bolsillo</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as 'debito' | 'credito')}
            className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-black dark:border-slate-600"
          >
            <option value="debito" className="text-black">Contenedor de dinero (Débito, Efectivo)</option>
            <option value="credito" className="text-black">Crédito (Tarjeta de crédito)</option>
          </select>
        </label>

        {tipo === 'credito' && (
          <label className="block">
            <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Día de corte (1-31)</span>
            <input
              type="number"
              min="1"
              max="31"
              value={diaCorte}
              onChange={(e) => setDiaCorte(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600"
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">App bancaria (para captura automática)</span>
          <select
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-black dark:border-slate-600"
          >
            {APPS_BANCARIAS.map(a => (
              <option key={a.value} value={a.value} className="text-black">{a.label}</option>
            ))}
          </select>
          <p className="mt-0.5 text-xs text-slate-400">
            Las notificaciones de esta app se registrarán en este bolsillo.
          </p>
        </label>

        <div>
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Ícono</span>
          <div className="flex flex-wrap gap-2">
            {ICONOS.map((i) => (
              <button
                key={i}
                onClick={() => setIcono(i)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg text-xl ${
                  icono === i ? 'ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-700'
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Color</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-full cursor-pointer rounded-lg border border-slate-300 dark:border-slate-600"
          />
        </label>

        <button
          onClick={guardar}
          disabled={!valido}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          Guardar
        </button>

        {inicial?.id && totalBolsillos > 1 && (
          <button
            onClick={async () => {
              if (inicial.id) await repo.deleteBolsillo(inicial.id)
              onClose()
            }}
            className="w-full rounded-lg py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Eliminar
          </button>
        )}
      </div>
    </Modal>
  )
}
