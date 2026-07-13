import { useState } from 'react'
import Modal from '../../components/Modal'
import { repo } from '../../data/repository'
import type { Debt } from '../../data/db'
import { hoyISO } from '../../lib/dates'

export default function MeDebenForm({
  existente,
  moneda,
  onClose,
}: {
  existente?: Debt
  moneda: string
  onClose: () => void
}) {
  const [deudor, setDeudor] = useState(existente?.deudor ?? '')
  const [monto, setMonto] = useState(existente ? String(existente.montoTotal) : '')
  const [fecha, setFecha] = useState(existente?.fechaCreacion ?? hoyISO())
  const [concepto, setConcepto] = useState(existente?.concepto ?? '')

  const total = Number(monto) || 0
  const valido = deudor.trim() && total > 0

  async function guardar() {
    if (!valido) return
    const datos: Omit<Debt, 'id'> = {
      tipo_deuda: 'me_deben',
      nombre: deudor.trim(),
      deudor: deudor.trim(),
      montoTotal: total,
      fechaCreacion: fecha,
      concepto: concepto.trim() || undefined,
      esCuotas: false,
    }
    if (existente?.id) await repo.updateDebt(existente.id, datos)
    else await repo.addDebt(datos)
    onClose()
  }

  return (
    <Modal title={existente ? 'Editar' : 'Me deben'} onClose={onClose}>
      <div className="space-y-4">
        <Campo label="¿Quién te debe?">
          <input
            value={deudor}
            onChange={(e) => setDeudor(e.target.value)}
            placeholder="Nombre de la persona"
            autoFocus
            className={inputCls}
          />
        </Campo>

        <Campo label={`Monto (${moneda})`}>
          <input
            type="number"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0"
            className={inputCls}
          />
        </Campo>

        <Campo label="¿Cuándo?">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        </Campo>

        <Campo label="¿De qué?">
          <input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej. Almuerzo, préstamo…"
            className={inputCls}
          />
        </Campo>

        <button
          onClick={guardar}
          disabled={!valido}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          Guardar
        </button>

        {existente?.id && (
          <button
            onClick={async () => {
              if (existente.id) await repo.deleteDebt(existente.id)
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
