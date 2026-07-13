import { useState } from 'react'
import Modal from '../../components/Modal'
import { repo } from '../../data/repository'
import type { Bolsillo } from '../../data/db'
import { hoyISO } from '../../lib/dates'
import { formatMoney } from '../../lib/format'
import { useBolsillosSaldos } from '../../hooks/data'

export default function TransferirForm({
  bolsillos,
  moneda,
  onClose,
}: {
  bolsillos: Bolsillo[]
  moneda: string
  onClose: () => void
}) {
  const bolsillosDebito = bolsillos.filter(b => b.tipo !== 'credito')
  const [origenId, setOrigenId] = useState<number>(bolsillosDebito[0]?.id ?? 0)
  const [destinoId, setDestinoId] = useState<number>(bolsillosDebito[1]?.id ?? bolsillosDebito[0]?.id ?? 0)
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)

  const saldos = useBolsillosSaldos()
  const valor = Number(monto) || 0
  const saldoOrigen = saldos.get(origenId) ?? null
  const saldoInsuficiente = saldoOrigen !== null && valor > saldoOrigen
  const valido = valor > 0 && origenId !== destinoId && !saldoInsuficiente

  const origenNombre = bolsillos.find((b) => b.id === origenId)?.nombre ?? ''
  const destinoNombre = bolsillos.find((b) => b.id === destinoId)?.nombre ?? ''

  async function transferir() {
    if (!valido) return
    setEnviando(true)

    const fecha = hoyISO()
    const ref = `Transferencia: ${origenNombre} → ${destinoNombre}`
    const notaFinal = nota.trim() ? `${ref} · ${nota.trim()}` : ref

    // Buscar o crear categoría "Transferencias"
    const cats = await repo.getCategories()
    let catGasto = cats.find((c) => c.tipo === 'gasto' && c.nombre.toLowerCase() === 'transferencias')
    let catIngreso = cats.find((c) => c.tipo === 'ingreso' && c.nombre.toLowerCase() === 'transferencias')

    const gastoId = catGasto?.id ?? await repo.addCategory({
      nombre: 'Transferencias',
      tipo: 'gasto',
      color: '#6366f1',
      icono: '🔄',
    })
    const ingresoId = catIngreso?.id ?? await repo.addCategory({
      nombre: 'Transferencias',
      tipo: 'ingreso',
      color: '#6366f1',
      icono: '🔄',
    })

    await repo.addTransaction({
      tipo: 'gasto',
      monto: valor,
      fecha,
      categoriaId: gastoId,
      nota: notaFinal,
      bolsilloId: origenId,
    })
    await repo.addTransaction({
      tipo: 'ingreso',
      monto: valor,
      fecha,
      categoriaId: ingresoId,
      nota: notaFinal,
      bolsilloId: destinoId,
    })

    setEnviando(false)
    onClose()
  }

  return (
    <Modal title="Transferir entre bolsillos" onClose={onClose}>
      <div className="space-y-4">
        <Campo label="Desde">
          <select
            value={origenId}
            onChange={(e) => setOrigenId(Number(e.target.value))}
            className={`${inputCls}`}
          >
            {bolsillosDebito.map((b) => (
              <option key={b.id} value={b.id} className="text-black">
                {b.icono} {b.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo label="Hacia">
          <select
            value={destinoId}
            onChange={(e) => setDestinoId(Number(e.target.value))}
            className={`${inputCls}`}
          >
            {bolsillosDebito.filter((b) => b.id !== origenId).map((b) => (
              <option key={b.id} value={b.id} className="text-black">
                {b.icono} {b.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo label="Monto">
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

        <Campo label="Nota (opcional)">
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej. pasar a ahorros"
            className={inputCls}
          />
        </Campo>

        {valido && (
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            {formatMoney(valor, moneda)} de <b>{origenNombre}</b> → <b>{destinoNombre}</b>
          </p>
        )}

        {origenId === destinoId && valor > 0 && (
          <p className="text-center text-xs text-amber-600">
            El origen y destino deben ser diferentes.
          </p>
        )}

        {saldoInsuficiente && saldoOrigen !== null && (
          <p className="text-center text-xs text-red-600 dark:text-red-400">
            ⚠️ Saldo insuficiente en {origenNombre} (disponible: {formatMoney(saldoOrigen, moneda)}).
          </p>
        )}

        <button
          onClick={transferir}
          disabled={!valido || enviando}
          className="w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          {enviando ? 'Transfiriendo…' : 'Transferir'}
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
