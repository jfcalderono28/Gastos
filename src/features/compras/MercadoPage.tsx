import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '../../components/Modal'
import { repo } from '../../data/repository'
import { useBolsillos, useBolsillosSaldos, useCategories, useMoneda } from '../../hooks/data'
import { hoyISO } from '../../lib/dates'
import { formatMoney } from '../../lib/format'
import type { ItemLista } from '../../data/db'

const NONE = '__none__' // clave interna para "Sin categoría"

function itemVacio(subcategoria?: string): ItemLista {
  return { id: Date.now().toString() + Math.random(), nombre: '', costo: '', cantidad: '1', subcategoria }
}

// ── Fila de un producto ───────────────────────────────────────────────────────
function ItemRow({
  it, isDragging, moneda, inputRef,
  onPointerDown, onPointerMove, onPointerUp, onPointerCancel,
  onActualizar, onEliminar,
}: {
  it: ItemLista
  isDragging: boolean
  moneda: string
  inputRef?: React.RefObject<HTMLInputElement | null>
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onPointerCancel: (e: React.PointerEvent) => void
  onActualizar: (id: string, campo: 'nombre' | 'costo' | 'cantidad', v: string) => void
  onEliminar: (id: string) => void
}) {
  const sub = (Number(it.costo) || 0) * (Number(it.cantidad) || 0)
  return (
    <div className={`grid grid-cols-[24px_1fr_44px_76px_68px_28px] items-center border-b border-slate-50 px-2 py-1.5 transition-opacity last:border-b-0 dark:border-slate-700/40 ${isDragging ? 'pointer-events-none opacity-25' : ''}`}>
      {/* Drag handle */}
      <span
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="touch-none select-none cursor-grab text-center text-base text-slate-300 dark:text-slate-600 active:cursor-grabbing"
      >⠿</span>

      <input
        ref={inputRef}
        value={it.nombre}
        onChange={e => onActualizar(it.id, 'nombre', e.target.value)}
        placeholder="Producto…"
        className="w-full bg-transparent pr-2 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none dark:text-slate-100"
      />
      <input
        type="number" inputMode="numeric"
        value={it.cantidad}
        onChange={e => onActualizar(it.id, 'cantidad', e.target.value)}
        placeholder="1"
        className="w-full bg-transparent text-center text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none dark:text-slate-200"
      />
      <input
        type="number" inputMode="decimal"
        value={it.costo}
        onChange={e => onActualizar(it.id, 'costo', e.target.value)}
        placeholder="0"
        className="w-full bg-transparent text-right text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none dark:text-slate-200"
      />
      <span className="text-right text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">
        {sub > 0 ? formatMoney(sub, moneda) : <span className="text-slate-300">—</span>}
      </span>
      <button type="button" onClick={() => onEliminar(it.id)}
        className="text-center text-base leading-none text-slate-300 hover:text-rose-400">×</button>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MercadoPage({ listaId, onVolver }: { listaId: number; onVolver: () => void }) {
  const [items, setItems] = useState<ItemLista[]>([itemVacio()])
  const [nombre, setNombre] = useState('')
  const [subcategorias, setSubcategorias] = useState<string[]>([])
  const [editandoNombre, setEditandoNombre] = useState(false)
  const [nuevaSeccion, setNuevaSeccion] = useState<string | null>(null)
  const [registradoId, setRegistradoId] = useState<number | null>(null)
  const [listaCategoriaId, setListaCategoriaId] = useState<number | undefined>(undefined)
  const [registrar, setRegistrar] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Drag & drop
  const [dragItemId, setDragItemId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const dragItemIdRef = useRef<string | null>(null)
  const dropTargetRef = useRef<string | null>(null)

  const lastInputRef = useRef<HTMLInputElement>(null)
  const moneda = useMoneda()
  const bolsillos = useBolsillos()
  const saldos = useBolsillosSaldos()
  const categorias = useCategories()

  // Subcategorías de la categoría asociada que aún no son secciones en esta lista
  const subsDisponibles = useMemo(() => {
    if (!listaCategoriaId) return []
    const cat = categorias.find(c => c.id === listaCategoriaId)
    return (cat?.subcategorias ?? []).filter(s => !subcategorias.includes(s))
  }, [categorias, listaCategoriaId, subcategorias])

  // Carga inicial
  useEffect(() => {
    repo.getListaMercado(listaId).then(lista => {
      if (lista) {
        setItems(lista.items.length > 0 ? lista.items : [itemVacio()])
        setNombre(lista.nombre)
        setSubcategorias(lista.subcategorias ?? [])
        setRegistradoId(lista.transaccionId ?? null)
        setListaCategoriaId(lista.categoriaId)
      }
      setLoaded(true)
    })
  }, [listaId])

  // Auto-guarda
  useEffect(() => {
    if (!loaded) return
    const total = items.reduce((s, it) => s + (Number(it.costo) || 0) * (Number(it.cantidad) || 0), 0)
    repo.updateListaMercado(listaId, { items, total, subcategorias })
  }, [items, subcategorias, loaded, listaId])

  // ── Drag & drop via Pointer Events ────────────────────────────────────────
  function onHandlePointerDown(e: React.PointerEvent, itemId: string) {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragItemIdRef.current = itemId
    dropTargetRef.current = null
    setDragItemId(itemId)
    setDropTarget(null)
  }

  function onHandlePointerMove(e: React.PointerEvent) {
    if (!dragItemIdRef.current) return
    // elementFromPoint ignora pointer-events:none, así llega al drop zone detrás del item arrastrado
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const zone = el?.closest?.('[data-drop-zone]')
    const target = (zone as HTMLElement | null)?.dataset.dropZone ?? null
    if (target !== dropTargetRef.current) {
      dropTargetRef.current = target
      setDropTarget(target)
    }
  }

  function onHandlePointerUp() {
    const itemId = dragItemIdRef.current
    const target = dropTargetRef.current
    if (itemId && target !== null) {
      const seccion = target === NONE ? undefined : target
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, subcategoria: seccion } : it))
    }
    dragItemIdRef.current = null
    dropTargetRef.current = null
    setDragItemId(null)
    setDropTarget(null)
  }

  function onHandlePointerCancel() {
    dragItemIdRef.current = null
    dropTargetRef.current = null
    setDragItemId(null)
    setDropTarget(null)
  }

  // ── Funciones de lista ────────────────────────────────────────────────────
  function actualizar(id: string, campo: 'nombre' | 'costo' | 'cantidad', v: string) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [campo]: v } : it))
  }

  function eliminar(id: string) {
    setItems(prev => {
      const next = prev.filter(it => it.id !== id)
      return next.length === 0 ? [itemVacio()] : next
    })
  }

  function crearSubcategoria(nombre: string) {
    setSubcategorias(prev => prev.includes(nombre) ? prev : [...prev, nombre])
  }

  function eliminarSeccion(sc: string) {
    setSubcategorias(prev => prev.filter(s => s !== sc))
    setItems(prev => prev.map(it => it.subcategoria === sc ? { ...it, subcategoria: undefined } : it))
  }

  function agregarProducto() {
    setItems(prev => [...prev, itemVacio(undefined)])
    setTimeout(() => lastInputRef.current?.focus(), 50)
  }

  function confirmarNuevaSeccion(v: string) {
    const n = v.trim()
    if (n) crearSubcategoria(n)
    setNuevaSeccion(null)
  }

  function guardarNombre(v: string) {
    const n = v.trim() || nombre
    setNombre(n)
    setEditandoNombre(false)
    repo.updateListaMercado(listaId, { nombre: n })
  }

  // ── Cálculos ───────────────────────────────────────────────────────────────
  const total = items.reduce((s, it) => s + (Number(it.costo) || 0) * (Number(it.cantidad) || 0), 0)
  const sinSeccion = items.filter(it => !it.subcategoria)
  const grupos = subcategorias.map(sc => {
    const grpItems = items.filter(it => it.subcategoria === sc)
    const subtotal = grpItems.reduce((s, it) => s + (Number(it.costo) || 0) * (Number(it.cantidad) || 0), 0)
    return { nombre: sc, items: grpItems, subtotal }
  })
  const bolsillosDebito = bolsillos.filter(b => b.tipo !== 'credito')
  const sugerencias = bolsillosDebito
    .map(b => ({ b, saldo: saldos.get(b.id!) ?? 0, alcanza: (saldos.get(b.id!) ?? 0) >= total }))
    .sort((a, b) => (b.alcanza ? 1 : 0) - (a.alcanza ? 1 : 0) || b.saldo - a.saldo)

  const isDragging = dragItemId !== null

  const itemRowProps = (it: ItemLista, isLast: boolean) => ({
    it,
    isDragging: dragItemId === it.id,
    moneda,
    inputRef: isLast ? lastInputRef : undefined,
    onPointerDown: (e: React.PointerEvent) => onHandlePointerDown(e, it.id),
    onPointerMove: onHandlePointerMove,
    onPointerUp: onHandlePointerUp,
    onPointerCancel: onHandlePointerCancel,
    onActualizar: actualizar,
    onEliminar: eliminar,
  })

  if (!loaded) return <div className="py-10 text-center text-slate-400">Cargando…</div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onVolver} className="text-sm text-emerald-600">‹ Compras</button>
        {registradoId && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            ✓ Gasto registrado
          </span>
        )}
      </div>

      {/* Nombre */}
      {editandoNombre ? (
        <input autoFocus defaultValue={nombre}
          onBlur={e => guardarNombre(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') guardarNombre((e.target as HTMLInputElement).value) }}
          className="w-full rounded-xl border border-emerald-400 bg-transparent px-3 py-1.5 text-lg font-bold text-slate-800 focus:outline-none dark:text-slate-100"
        />
      ) : (
        <button onClick={() => setEditandoNombre(true)} className="flex items-center gap-2 text-left">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{nombre || '🛒 Mercado'}</h2>
          <span className="text-xs text-slate-400">✏️</span>
        </button>
      )}

      {/* Hint de arrastre */}
      {isDragging && (
        <p className="text-center text-xs text-indigo-500 dark:text-indigo-400">
          Arrastra sobre una sección para mover el producto
        </p>
      )}

      {/* Tabla principal */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-slate-800">
        {/* Cabecera de columnas */}
        <div className="grid grid-cols-[24px_1fr_44px_76px_68px_28px] border-b border-slate-100 px-2 py-2 dark:border-slate-700">
          <span />
          <span className="text-xs font-semibold text-slate-400">Producto</span>
          <span className="text-center text-xs font-semibold text-slate-400">Cant.</span>
          <span className="text-right text-xs font-semibold text-slate-400">Precio</span>
          <span className="text-right text-xs font-semibold text-slate-400">Total</span>
          <span />
        </div>

        {/* Secciones con nombre */}
        {grupos.map(grupo => {
          const isDropTarget = dropTarget === grupo.nombre
          return (
            <div
              key={grupo.nombre}
              data-drop-zone={grupo.nombre}
              className={`transition-colors ${isDropTarget ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400 dark:bg-indigo-900/20 dark:ring-indigo-600' : ''}`}
            >
              {/* Cabecera de sección */}
              <div className={`flex items-center justify-between border-y py-2 pr-3 ${
                isDropTarget
                  ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/30'
                  : 'border-slate-100 bg-slate-50 dark:border-slate-700/60 dark:bg-slate-700/30'
              }`}>
                {/* Franja de color izquierda */}
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div className={`h-8 w-1 shrink-0 rounded-r-full ${isDropTarget ? 'bg-indigo-400' : 'bg-indigo-300 dark:bg-indigo-600'}`} />
                  <div className="min-w-0">
                    <div className={`truncate text-sm font-bold leading-tight ${isDropTarget ? 'text-indigo-700 dark:text-indigo-200' : 'text-slate-700 dark:text-slate-200'}`}>
                      {isDropTarget ? '📥 ' : ''}{grupo.nombre}
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500">
                      {grupo.items.length} {grupo.items.length === 1 ? 'producto' : 'productos'}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {grupo.subtotal > 0 && (
                    <span className="text-sm font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                      {formatMoney(grupo.subtotal, moneda)}
                    </span>
                  )}
                  <button type="button" onClick={() => eliminarSeccion(grupo.nombre)}
                    className="text-xs text-slate-300 hover:text-rose-400" title="Eliminar sección">✕</button>
                </div>
              </div>

              {/* Items de la sección */}
              {grupo.items.length > 0
                ? grupo.items.map((it) => (
                    <ItemRow key={it.id} {...itemRowProps(it, false)} />
                  ))
                : (
                  <div className={`px-3 py-3 text-center text-xs text-slate-400 ${isDropTarget ? 'text-indigo-500 dark:text-indigo-400' : ''}`}>
                    {isDropTarget ? 'Suelta aquí' : 'Sin productos · arrastra aquí'}
                  </div>
                )
              }
            </div>
          )
        })}

        {/* Sin categoría — siempre al final */}
        <div
          data-drop-zone={NONE}
          className={`transition-colors ${dropTarget === NONE ? 'bg-slate-50 ring-2 ring-inset ring-slate-400 dark:bg-slate-700/60 dark:ring-slate-500' : ''}`}
        >
          {subcategorias.length > 0 && (
            <div className={`flex items-center gap-2 border-y px-3 py-2 ${
              dropTarget === NONE
                ? 'border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-700'
                : 'border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-700/40'
            }`}>
              {dropTarget === NONE && <span className="text-sm">📥</span>}
              <span className={`text-xs font-semibold ${dropTarget === NONE ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                Sin categoría
              </span>
            </div>
          )}

          {sinSeccion.map((it, idx) => (
            <ItemRow key={it.id} {...itemRowProps(it, idx === sinSeccion.length - 1)} />
          ))}

          {/* Botón agregar (siempre en sin categoría) */}
          <button type="button" onClick={agregarProducto}
            className="w-full border-t border-slate-50 py-2.5 text-sm font-semibold text-black bg-emerald-400 hover:bg-emerald-500 dark:border-slate-700">
            + Agregar producto
          </button>
        </div>

        {/* Footer: nueva sección */}
        <div className="border-t border-slate-100 dark:border-slate-700">
          {nuevaSeccion !== null ? (
            <div className="px-3 py-2 space-y-2">
              {/* Chips de sugerencia (subcategorías no usadas aún) */}
              {subsDisponibles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {subsDisponibles.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => confirmarNuevaSeccion(s)}
                      className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              )}
              {/* Input para nombre nuevo */}
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={nuevaSeccion}
                  onChange={e => setNuevaSeccion(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmarNuevaSeccion(nuevaSeccion)
                    if (e.key === 'Escape') setNuevaSeccion(null)
                  }}
                  placeholder="Nueva sección…"
                  className="min-w-0 flex-1 rounded-lg border border-indigo-300 bg-transparent px-3 py-1.5 text-sm focus:outline-none dark:border-indigo-700 dark:text-slate-100"
                />
                <button type="button" onClick={() => confirmarNuevaSeccion(nuevaSeccion)}
                  className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white">✓</button>
                <button type="button" onClick={() => setNuevaSeccion(null)}
                  className="shrink-0 text-slate-400">✕</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setNuevaSeccion('')}
              className="w-full py-2.5 text-sm font-semibold text-black bg-blue-400 hover:bg-blue-500">
              + Nueva sección
            </button>
          )}
        </div>
      </div>

      {/* Resumen por sección */}
      {grupos.some(g => g.subtotal > 0 || g.items.length > 0) && (
        <div className="space-y-1.5 rounded-xl bg-white p-3 shadow-sm dark:bg-slate-800">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Resumen</p>
          {(() => {
            const sub = sinSeccion.reduce((s, it) => s + (Number(it.costo)||0)*(Number(it.cantidad)||0), 0)
            return sub > 0 ? (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Sin categoría</span>
                <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{formatMoney(sub, moneda)}</span>
              </div>
            ) : null
          })()}
          {grupos.filter(g => g.subtotal > 0).map(g => (
            <div key={g.nombre} className="flex justify-between text-sm">
              <span className="text-indigo-600 dark:text-indigo-400">{g.nombre}</span>
              <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{formatMoney(g.subtotal, moneda)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-slate-100 pt-1.5 text-sm font-semibold dark:border-slate-700">
            <span className="text-slate-700 dark:text-slate-200">Total</span>
            <span className="tabular-nums text-emerald-600">{formatMoney(total, moneda)}</span>
          </div>
        </div>
      )}

      {/* Total */}
      <div className="rounded-xl bg-emerald-600 p-4 text-white shadow-sm">
        <div className="flex items-end justify-between">
          <span className="text-sm text-emerald-100">Total a pagar</span>
          <span className="text-3xl font-bold tabular-nums">{formatMoney(total, moneda)}</span>
        </div>
        <div className="mt-1 text-xs text-emerald-200">
          {items.filter(it => it.nombre.trim() || Number(it.costo) > 0).length} productos
          {subcategorias.length > 0 && ` · ${subcategorias.length} secciones`}
        </div>
      </div>

      {/* Sugerencia de bolsillo */}
      {total > 0 && bolsillosDebito.length > 0 && (
        <div className="space-y-2 rounded-xl bg-white p-4 shadow-sm dark:bg-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">💡 Puedes pagar con</p>
          <div className="space-y-2">
            {sugerencias.map(({ b, saldo, alcanza }) => (
              <div key={b.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${alcanza ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-rose-50 dark:bg-rose-900/30'}`}>
                    {b.icono}
                  </span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{b.nombre}</span>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold tabular-nums ${alcanza ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {formatMoney(saldo, moneda)}
                  </div>
                  {!alcanza && <div className="text-xs text-rose-400">faltan {formatMoney(total - saldo, moneda)}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Registrar */}
      {total > 0 && !registradoId && (
        <button onClick={() => setRegistrar(true)}
          className="w-full rounded-xl bg-slate-800 py-3 font-semibold text-white dark:bg-slate-700">
          Registrar como gasto
        </button>
      )}

      {registrar && (
        <RegistrarGastoModal
          listaId={listaId}
          listaNombre={nombre}
          listaSubcategorias={subcategorias}
          listaCategoriaId={listaCategoriaId}
          total={total}
          moneda={moneda}
          bolsillos={bolsillosDebito}
          saldos={saldos}
          onClose={() => setRegistrar(false)}
          onGuardado={txId => {
            setRegistrar(false)
            setRegistradoId(txId)
            repo.updateListaMercado(listaId, { transaccionId: txId })
          }}
        />
      )}
    </div>
  )
}

// ── Modal registrar gasto ─────────────────────────────────────────────────────
function RegistrarGastoModal({
  listaId, listaNombre, listaSubcategorias, listaCategoriaId, total, moneda, bolsillos, saldos, onClose, onGuardado,
}: {
  listaId: number
  listaNombre: string
  listaSubcategorias: string[]
  listaCategoriaId?: number
  total: number
  moneda: string
  bolsillos: ReturnType<typeof useBolsillos>
  saldos: Map<number, number>
  onClose: () => void
  onGuardado: (transaccionId: number) => void
}) {
  const categorias = useCategories()
  const [bolsilloId, setBolsilloId] = useState<number | ''>(
    bolsillos.find(b => (saldos.get(b.id!) ?? 0) >= total)?.id ?? bolsillos[0]?.id ?? ''
  )
  const [categoriaId, setCategoriaId] = useState<number | ''>(listaCategoriaId ?? '')
  const [nota, setNota] = useState(listaNombre || 'Mercado')
  const [fecha, setFecha] = useState(hoyISO())
  const categoriasGasto = categorias.filter(c => c.tipo === 'gasto')

  async function guardar() {
    let catId = Number(categoriaId)
    if (!catId) {
      const existing = categorias.find(c => c.tipo === 'gasto' && c.nombre.toLowerCase() === 'mercado')
      catId = existing?.id ?? await repo.addCategory({
        nombre: 'Mercado', tipo: 'gasto', color: '#10b981', icono: '🛒', subcategorias: listaSubcategorias,
      })
    }
    if (listaSubcategorias.length > 0) {
      const cat = categorias.find(c => c.id === catId)
      const merged = [...new Set([...(cat?.subcategorias ?? []), ...listaSubcategorias])]
      await repo.updateCategory(catId, { subcategorias: merged })
    }
    const txId = await repo.addTransaction({
      tipo: 'gasto', monto: total, fecha,
      categoriaId: catId,
      nota: nota.trim() || 'Mercado',
      bolsilloId: bolsilloId || undefined,
      listaId,
    })
    onGuardado(txId)
  }

  const cls = 'w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600'

  return (
    <Modal title="Registrar gasto" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-700">
          <div className="text-xs text-slate-400">Total</div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{formatMoney(total, moneda)}</div>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Nota</span>
          <input value={nota} onChange={e => setNota(e.target.value)} className={cls} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Categoría</span>
          <select value={categoriaId} onChange={e => setCategoriaId(e.target.value ? Number(e.target.value) : '')} className={cls}>
            <option value="" className="text-black">🛒 Mercado (automática)</option>
            {categoriasGasto.map(c => (
              <option key={c.id} value={c.id} className="text-black">{c.icono} {c.nombre}</option>
            ))}
          </select>
        </label>

        {bolsillos.length > 1 && (
          <label className="block">
            <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Bolsillo</span>
            <select value={bolsilloId} onChange={e => setBolsilloId(e.target.value ? Number(e.target.value) : '')} className={cls}>
              {bolsillos.map(b => {
                const s = saldos.get(b.id!) ?? 0
                return (
                  <option key={b.id} value={b.id} className="text-black">
                    {b.icono} {b.nombre} — {formatMoney(s, moneda)}{s >= total ? ' ✓' : ` (faltan ${formatMoney(total - s, moneda)})`}
                  </option>
                )
              })}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Fecha</span>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={cls} />
        </label>

        {listaSubcategorias.length > 0 && (
          <div className="rounded-lg bg-indigo-50 p-2.5 dark:bg-indigo-900/20">
            <p className="mb-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
              Secciones que se guardarán en la categoría:
            </p>
            <div className="flex flex-wrap gap-1">
              {listaSubcategorias.map(s => (
                <span key={s} className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">{s}</span>
              ))}
            </div>
          </div>
        )}

        <button onClick={guardar} className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white">
          Guardar gasto
        </button>
      </div>
    </Modal>
  )
}
