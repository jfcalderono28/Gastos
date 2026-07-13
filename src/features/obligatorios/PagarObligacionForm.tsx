import { useState } from 'react'
import Modal from '../../components/Modal'
import { repo } from '../../data/repository'
import type { Bolsillo, Category, Obligacion } from '../../data/db'
import { hoyISO } from '../../lib/dates'
import { formatMoney } from '../../lib/format'

export default function PagarObligacionForm({
  obligacion,
  categoria,
  bolsillos,
  estimado,
  moneda,
  onClose,
}: {
  obligacion: Obligacion
  categoria?: Category
  bolsillos: Bolsillo[]
  estimado: number
  moneda: string
  onClose: () => void
}) {
  const [monto, setMonto] = useState(estimado ? String(estimado) : '')
  const [nota, setNota] = useState('')
  const [bolsilloId, setBolsilloId] = useState<number | ''>(bolsillos[0]?.id ?? '')
  const [pagando, setPagando] = useState(false)

  const valor = Number(monto) || 0
  const titulo = `${categoria?.nombre ?? 'Gasto'}${obligacion.subcategoria ? ` · ${obligacion.subcategoria}` : ''}`

  async function pagar() {
    if (valor <= 0) return
    setPagando(true)
    const notaFinal = nota.trim()
    await repo.addTransaction({
      tipo: 'gasto',
      monto: valor,
      fecha: hoyISO(),
      categoriaId: obligacion.categoriaId,
      subcategoria: obligacion.subcategoria,
      nota: notaFinal || undefined,
      bolsilloId: bolsilloId || undefined,
    })
    setPagando(false)
    onClose()
  }

  return (
    <Modal title={`Pagar · ${titulo}`} onClose={onClose}>
      <div className="space-y-4">
        {estimado > 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Estimado del mes: <b>{formatMoney(estimado, moneda)}</b>
          </p>
        )}
        <Campo label="Monto a pagar">
          <input
            type="number"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0"
            autoFocus
            className={inputCls}
          />
        </Campo>
        {bolsillos.length > 1 && (
          <Campo label="Bolsillo">
            <select
              value={bolsilloId}
              onChange={(e) => setBolsilloId(e.target.value ? Number(e.target.value) : '')}
              className={`${inputCls}`}
            >
              {bolsillos.map((b) => (
                <option key={b.id} value={b.id} className="text-black">
                  {b.icono} {b.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo label="Nota (opcional)">
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Detalle del pago"
            className={inputCls}
          />
        </Campo>
        <button
          onClick={pagar}
          disabled={valor <= 0 || pagando}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          {pagando ? 'Registrando…' : 'Registrar pago'}
        </button>
      </div>
    </Modal>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  )
}
