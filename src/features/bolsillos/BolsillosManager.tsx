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
        <button
          onClick={() => setEditar('nuevo')}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          + Nuevo
        </button>
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
    </div>
  )
}

const ICONOS = ['👛', '💵', '💳', '🏦', '📱', '🐷', '💰', '🎯']

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

  const valido = nombre.trim().length > 0 && (tipo === 'debito' || (Number(diaCorte) >= 1 && Number(diaCorte) <= 31))

  async function guardar() {
    if (!valido) return
    const datos: any = { nombre: nombre.trim(), icono, color, tipo }
    if (tipo === 'credito') datos.diaCorte = Number(diaCorte)
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
