import { useMemo, useState } from 'react'
import type { Category, Obligacion } from '../../data/db'
import { useBolsillos, useCategories, useMoneda, useObligaciones, useTransactions } from '../../hooks/data'
import { formatMoney } from '../../lib/format'
import PagarObligacionForm from './PagarObligacionForm'
import { diasParaLimite, estiloUrgencia, estimadoMensual, pagadoEsteMes } from './calc'

export default function RecordatoriosCard() {
  const obligaciones = useObligaciones()
  const categorias = useCategories()
  const transacciones = useTransactions()
  const bolsillos = useBolsillos()
  const moneda = useMoneda()
  const [pagar, setPagar] = useState<{ o: Obligacion; estimado: number } | null>(null)

  const catById = useMemo(() => {
    const m = new Map<number, Category>()
    categorias.forEach((c) => c.id && m.set(c.id, c))
    return m
  }, [categorias])

  const items = useMemo(() => {
    return obligaciones
      .map((o) => ({
        o,
        dias: diasParaLimite(o),
        pagado: pagadoEsteMes(o, transacciones),
        estimado: estimadoMensual(o, transacciones),
      }))
      .sort((a, b) => {
        if (a.pagado !== b.pagado) return a.pagado ? 1 : -1
        return a.dias - b.dias
      })
  }, [obligaciones, transacciones])

  if (obligaciones.length === 0) return null

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
      <h2 className="mb-2 font-semibold text-slate-800 dark:text-slate-100">⏰ Recordatorios</h2>
      <ul className="space-y-2">
        {items.map(({ o, dias, pagado, estimado }) => {
          const cat = catById.get(o.categoriaId)
          return (
            <li key={o.id} className={`rounded-xl px-3 py-2 ${estiloUrgencia(dias, pagado)}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {cat?.icono ?? '📌'} {cat?.nombre ?? 'Gasto'}
                  {o.subcategoria ? ` · ${o.subcategoria}` : ''}
                </span>
                <span className="font-semibold">{formatMoney(estimado, moneda)}</span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="text-xs opacity-90">
                  {pagado
                    ? '✓ pagado este mes'
                    : dias < 0
                      ? `Venció hace ${-dias} día${-dias === 1 ? '' : 's'} (límite día ${o.diaFin})`
                      : dias === 0
                        ? `Vence hoy (día ${o.diaFin})`
                        : `Vence en ${dias} día${dias === 1 ? '' : 's'} · pago del ${o.diaInicio} al ${o.diaFin}`}
                </div>
                {!pagado && (
                  <button
                    onClick={() => setPagar({ o, estimado })}
                    className="shrink-0 rounded-lg bg-white/25 px-3 py-1 text-xs font-semibold hover:bg-white/40"
                  >
                    Pagar
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {pagar && (
        <PagarObligacionForm
          obligacion={pagar.o}
          categoria={catById.get(pagar.o.categoriaId)}
          bolsillos={bolsillos}
          estimado={pagar.estimado}
          moneda={moneda}
          onClose={() => setPagar(null)}
        />
      )}
    </section>
  )
}
