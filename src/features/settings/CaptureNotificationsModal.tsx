import { useEffect, useRef, useState } from 'react'
import Modal from '../../components/Modal'
import { NotificationCapture, type NotifCapture } from '../../plugins/NotificationCapture'
import { useCapturasNotifPendientes, useCapturasNotifHistorial, useCategories, useBolsillos } from '../../hooks/data'
import { repo } from '../../data/repository'
import type { CapturaNotif } from '../../data/db'
import { formatMoney } from '../../lib/format'
import { procesarCaptura } from '../../hooks/useNotificationProcessor'

// ── Raw capture helpers ────────────────────────────────────────────────────

const KEYWORD_AMOUNT_RE = /(?:envió|recibiste|pagaste|cobré|compra(?:\s+por)?|valor|monto|total|transferencia\s+de|te\s+llega)\s+([\d.,]+)/gi

function parseCOP(raw: string): number {
  // Colombian format: dots = thousands, comma = decimal  →  "37.950" → 37950
  return parseFloat(raw.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0
}

function extractAmounts(text: string): string[] {
  const byValue = new Map<number, string>()
  const add = (raw: string) => {
    const clean = raw.replace(/[.,]+$/, '') // strip trailing punctuation
    const val = parseCOP(clean)
    if (val > 0 && !byValue.has(val)) byValue.set(val, clean)
  }
  for (const m of text.matchAll(/\$\s?[\d.,]+/g)) add(m[0].trim())
  for (const m of text.matchAll(/\b\d{1,3}(?:\.\d{3})+\b/g)) add(m[0])
  KEYWORD_AMOUNT_RE.lastIndex = 0
  for (const m of text.matchAll(KEYWORD_AMOUNT_RE)) add(m[1])
  return [...byValue.values()]
}

const SKIP_RE = /^\d+\s+mensajes?\s+nuevos?$/i

function dedupe(list: NotifCapture[]): NotifCapture[] {
  const seen = new Set<string>()
  return list.filter(c => {
    if (SKIP_RE.test(c.text.trim())) return false
    const key = `${c.packageName}|${c.title}|${c.text}|${Math.floor(c.timestamp / 3000)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function friendlyPackage(pkg: string): string {
  const known: Record<string, string> = {
    'com.whatsapp':                          'WhatsApp',
    'com.nequi.MobileApp':                   'Nequi',
    'co.com.bancolombia.personas.superapp':   'Bancolombia',
    'com.nu.production':                      'Nu',
    'com.todo1.davivienda.mobileapp':         'Davivienda',
    'com.davivienda.daviplataapp':            'Daviplata',
    'co.com.bbva.mb':                        'BBVA',
    'co.com.bancofalabella.mobile.omc':       'Falabella',
    'com.google.android.gm':                  'Gmail',
    'com.android.mms':                        'SMS',
  }
  return known[pkg] ?? pkg.split('.').pop() ?? pkg
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `hace ${diff}s`
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`
  return `hace ${Math.floor(diff / 3600)}h`
}

// ── Pending capture card ───────────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: CapturaNotif['tipo'] }) {
  if (tipo === 'ingreso') return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
      ↑ ingreso
    </span>
  )
  if (tipo === 'gasto') return (
    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
      ↓ gasto
    </span>
  )
  if (tipo === 'transferencia') return (
    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
      ⇄ retiro cajero
    </span>
  )
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      ? ambiguo
    </span>
  )
}

function CapturaCard({ captura }: { captura: CapturaNotif }) {
  const [expandido, setExpandido] = useState(false)
  const [loading, setLoading] = useState(false)

  // ── Transacción ──────────────────────────────────────────────────────────
  const [tipoSel, setTipoSel] = useState<'ingreso' | 'gasto'>(
    captura.tipo === 'ambiguo' || captura.tipo === 'transferencia' ? 'gasto' : captura.tipo,
  )
  const [categoriaSel, setCategoriaSel] = useState<number | ''>('')
  const [subcatTxSel, setSubcatTxSel] = useState('')

  // ── Deuda opcional (débito) o deuda principal (crédito) ──────────────────
  const [registrarDeuda, setRegistrarDeuda] = useState(false)
  const [nombreDeuda, setNombreDeuda] = useState(captura.descripcion.slice(0, 60))
  const [esCuotas, setEsCuotas] = useState(false)
  const [numCuotas, setNumCuotas] = useState('12')
  const [categDeudaSel, setCategDeudaSel] = useState<number | ''>('')
  const [subcategoria, setSubcategoria] = useState('')

  const categorias = useCategories()
  const bolsillos = useBolsillos()
  const bolsillo = bolsillos.find(b => b.id === captura.bolsilloId)
  const esCredito = captura.bolsilloTipo === 'credito'
  const esTransferencia = captura.tipo === 'transferencia'

  // ── Transferencia: bolsillo destino (default: efectivo o primer bolsillo distinto) ──
  const bolsilloEfectivoId = bolsillos.find(
    b => b.id !== captura.bolsilloId && /efectivo|cash|billetera/i.test(b.nombre)
  )?.id ?? bolsillos.find(b => b.id !== captura.bolsilloId)?.id
  const [transferDestId, setTransferDestId] = useState<number | ''>(bolsilloEfectivoId ?? '')

  const categsFiltradas = categorias.filter(c => c.tipo === tipoSel)
  const categsGasto = categorias.filter(c => c.tipo === 'gasto')
  const subcatsTx = categsFiltradas.find(c => c.id === Number(categoriaSel))?.subcategorias ?? []
  const subcats = categsGasto.find(c => c.id === Number(categDeudaSel))?.subcategorias ?? []
  const montoCuota = esCuotas && Number(numCuotas) > 0 ? captura.monto / Number(numCuotas) : captura.monto

  // ingreso → yo debo (me prestaron) | gasto → me deben (les presté)
  const tipoDeudaImplied: 'debo' | 'me_deben' = tipoSel === 'gasto' ? 'me_deben' : 'debo'

  const puedeConfirmar = esTransferencia
    ? Boolean(transferDestId)
    : esCredito
    ? nombreDeuda.trim().length > 0
    : Boolean(categoriaSel) && (!registrarDeuda || nombreDeuda.trim().length > 0)

  async function confirmar() {
    if (!captura.id || !puedeConfirmar) return
    setLoading(true)
    try {
      let txId: number | undefined
      let txDestinoId: number | undefined
      let deudaId: number | undefined
      const fecha = new Date(captura.timestamp).toISOString().slice(0, 10)

      if (esTransferencia) {
        // Gasto desde el bolsillo origen (ej. Nequi)
        txId = await repo.addTransaction({
          tipo: 'gasto',
          monto: captura.monto,
          fecha,
          bolsilloId: captura.bolsilloId,
          nota: captura.descripcion,
        })
        // Ingreso al bolsillo destino (ej. efectivo)
        txDestinoId = await repo.addTransaction({
          tipo: 'ingreso',
          monto: captura.monto,
          fecha,
          bolsilloId: Number(transferDestId),
          nota: captura.descripcion,
        })
      } else if (!esCredito) {
        // Siempre registrar la transacción en débito
        txId = await repo.addTransaction({
          tipo: tipoSel,
          monto: captura.monto,
          fecha,
          categoriaId: Number(categoriaSel),
          subcategoria: subcatTxSel || undefined,
          bolsilloId: captura.bolsilloId,
          nota: captura.descripcion,
        })
      }

      if (esCredito || registrarDeuda) {
        const cuotas = esCuotas && Number(numCuotas) > 0
        deudaId = await repo.addDebt({
          tipo_deuda: esCredito ? 'debo' : tipoDeudaImplied,
          nombre: nombreDeuda.trim(),
          montoTotal: captura.monto,
          fechaCreacion: fecha,
          esCuotas: cuotas,
          numCuotas: cuotas ? Number(numCuotas) : undefined,
          montoCuota: cuotas ? Math.round(captura.monto / Number(numCuotas)) : undefined,
          mesPrimeraCuota: cuotas ? new Date(captura.timestamp).toISOString().slice(0, 7) : undefined,
          bolsilloId: esCredito ? captura.bolsilloId : undefined,
          categoriaId: categDeudaSel ? Number(categDeudaSel) : undefined,
          subcategoria: subcategoria || undefined,
        })
      }

      await repo.updateCapturaNotif(captura.id, {
        estado: 'aceptado',
        transaccionId: txId,
        transaccionDestinoId: txDestinoId,
        deudaId,
        fechaAccion: Date.now(),
      })
    } finally {
      setLoading(false)
    }
  }

  async function descartar() {
    if (!captura.id) return
    await repo.updateCapturaNotif(captura.id, { estado: 'descartado', fechaAccion: Date.now() })
  }

  // Sub-formulario de deuda (compartido entre crédito y el toggle de débito)
  const formDeuda = (
    <div className="space-y-2.5 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
      {/* Etiqueta del tipo de deuda — fija, no editable */}
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
          (esCredito ? 'debo' : tipoDeudaImplied) === 'debo'
            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
        }`}>
          {(esCredito ? 'debo' : tipoDeudaImplied) === 'debo' ? '🔴 Yo debo' : '🟢 Me deben'}
        </span>
      </div>

      <label className="block">
        <span className="text-xs text-slate-500">Nombre de la deuda</span>
        <input
          value={nombreDeuda}
          onChange={e => setNombreDeuda(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-sm dark:border-slate-600"
        />
      </label>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">¿Es a cuotas?</span>
        <button
          onClick={() => setEsCuotas(v => !v)}
          className={`relative h-5 w-9 rounded-full transition-colors ${esCuotas ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${esCuotas ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {esCuotas && (
        <div className="flex items-center gap-3">
          <label className="flex-1">
            <span className="text-xs text-slate-500">Número de cuotas</span>
            <input
              type="number" min="2" max="60" value={numCuotas}
              onChange={e => setNumCuotas(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-sm dark:border-slate-600"
            />
          </label>
          <div className="flex-1 pt-4 text-center">
            <p className="text-[10px] text-slate-400">Cuota mensual</p>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{formatMoney(Math.round(montoCuota))}</p>
          </div>
        </div>
      )}

      <label className="block">
        <span className="text-xs text-slate-500">Categoría (opcional)</span>
        <select
          value={categDeudaSel}
          onChange={e => { setCategDeudaSel(Number(e.target.value)); setSubcategoria('') }}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-sm text-slate-800 dark:text-white dark:border-slate-600"
        >
          <option value="">Sin categoría</option>
          {categsGasto.map(c => <option key={c.id} value={c.id} className="text-black">{c.nombre}</option>)}
        </select>
      </label>

      {subcats.length > 0 && (
        <label className="block">
          <span className="text-xs text-slate-500">Subcategoría</span>
          <select
            value={subcategoria}
            onChange={e => setSubcategoria(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-sm text-slate-800 dark:text-white dark:border-slate-600"
          >
            <option value="">Sin subcategoría</option>
            {subcats.map(s => <option key={s} value={s} className="text-black">{s}</option>)}
          </select>
        </label>
      )}
    </div>
  )

  return (
    <li className="rounded-xl border border-slate-100 p-3 dark:border-slate-700">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {friendlyPackage(captura.packageName)}
            </span>
            {bolsillo && <span className="text-[10px] text-slate-400">→ {bolsillo.icono} {bolsillo.nombre}</span>}
            {esCredito
              ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">💳 deuda</span>
              : <TipoBadge tipo={captura.tipo} />
            }
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{formatMoney(captura.monto)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{captura.descripcion}</p>
        </div>
        <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(captura.timestamp)}</span>
      </div>

      {/* Actions */}
      {!expandido ? (
        <div className="mt-2 flex gap-2">
          <button onClick={() => setExpandido(true)} className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white active:scale-95">
            Registrar
          </button>
          <button onClick={descartar} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 active:scale-95 dark:border-slate-600">
            Descartar
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-700">

          {esTransferencia ? (
            /* Transferencia: selector de bolsillo destino */
            <div className="space-y-3 rounded-xl bg-indigo-50 p-3 dark:bg-indigo-950/30">
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                ⇄ Retiro en cajero — transferencia entre bolsillos
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="rounded-lg bg-white px-2 py-1 font-medium shadow-sm dark:bg-slate-800">
                  {bolsillo?.icono} {bolsillo?.nombre ?? friendlyPackage(captura.packageName)}
                </span>
                <span className="text-slate-400">→</span>
                <select
                  value={transferDestId}
                  onChange={e => setTransferDestId(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-slate-800 dark:border-indigo-800 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Seleccionar destino…</option>
                  {bolsillos.filter(b => b.id !== captura.bolsilloId).map(b => (
                    <option key={b.id} value={b.id} className="text-black">{b.icono} {b.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : esCredito ? (
            /* Crédito: solo deuda */
            formDeuda
          ) : (
            /* Débito: transacción siempre + deuda opcional */
            <>
              {/* Tipo (solo si es ambiguo) */}
              {captura.tipo === 'ambiguo' && (
                <div>
                  <p className="mb-1 text-xs text-slate-500">Tipo de movimiento</p>
                  <div className="flex gap-2">
                    {(['ingreso', 'gasto'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => { setTipoSel(t); setCategoriaSel(''); setSubcatTxSel('') }}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-semibold border transition-colors ${
                          tipoSel === t
                            ? t === 'ingreso' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-rose-600 text-white border-rose-600'
                            : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {t === 'ingreso' ? '↑ Ingreso' : '↓ Gasto'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Categoría de la transacción */}
              <label className="block">
                <span className="text-xs text-slate-500">Categoría</span>
                <select
                  value={categoriaSel}
                  onChange={e => { setCategoriaSel(Number(e.target.value)); setSubcatTxSel('') }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-sm text-slate-800 dark:text-white dark:border-slate-600"
                >
                  <option value="">Seleccionar…</option>
                  {categsFiltradas.map(c => <option key={c.id} value={c.id} className="text-black">{c.nombre}</option>)}
                </select>
              </label>

              {/* Subcategoría de la transacción */}
              {subcatsTx.length > 0 && (
                <label className="block">
                  <span className="text-xs text-slate-500">Subcategoría</span>
                  <select
                    value={subcatTxSel}
                    onChange={e => setSubcatTxSel(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-sm text-slate-800 dark:text-white dark:border-slate-600"
                  >
                    <option value="">Sin subcategoría</option>
                    {subcatsTx.map(s => <option key={s} value={s} className="text-black">{s}</option>)}
                  </select>
                </label>
              )}

              {/* Toggle: también registrar deuda */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  ¿También registrar como deuda?{' '}
                  <span className="text-slate-400">
                    ({tipoDeudaImplied === 'debo' ? 'yo debo' : 'me deben'})
                  </span>
                </span>
                <button
                  onClick={() => setRegistrarDeuda(v => !v)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${registrarDeuda ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${registrarDeuda ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {registrarDeuda && formDeuda}
            </>
          )}

          {/* Botones confirmar / cancelar */}
          <div className="flex gap-2">
            <button
              onClick={confirmar}
              disabled={loading || !puedeConfirmar}
              className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white disabled:opacity-40 active:scale-95"
            >
              {loading ? 'Guardando…' : 'Confirmar'}
            </button>
            <button onClick={() => setExpandido(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-600 active:scale-95">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

// ── Historial card ─────────────────────────────────────────────────────────

function HistorialCard({ captura }: { captura: CapturaNotif }) {
  const bolsillos = useBolsillos()
  const bolsillo = bolsillos.find(b => b.id === captura.bolsilloId)
  const aceptado = captura.estado === 'aceptado'
  const fechaTs = captura.fechaAccion ?? captura.timestamp

  function formatFecha(ts: number) {
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff < 60) return `hace ${diff}s`
    if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
    return new Date(ts).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
  }

  return (
    <li className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
      aceptado
        ? 'border-emerald-100 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20'
        : 'border-slate-100 bg-slate-50/50 dark:border-slate-700/50 dark:bg-slate-800/20'
    }`}>
      <span className={`mt-0.5 text-base shrink-0 ${aceptado ? 'text-emerald-500' : 'text-slate-400'}`}>
        {aceptado ? '✓' : '✗'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {formatMoney(captura.monto)}
          </span>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            {friendlyPackage(captura.packageName)}
          </span>
          {bolsillo && (
            <span className="text-[10px] text-slate-400">→ {bolsillo.icono} {bolsillo.nombre}</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">{captura.descripcion}</p>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-medium ${aceptado ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
            {aceptado ? 'Registrado' : 'Descartado'} · {formatFecha(fechaTs)}
          </span>
          {aceptado && captura.transaccionId && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              transacción #{captura.transaccionId}
            </span>
          )}
          {aceptado && captura.deudaId && (
            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
              deuda #{captura.deudaId}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

// ── Main modal ─────────────────────────────────────────────────────────────

export default function CaptureNotificationsModal({ onClose }: { onClose: () => void }) {
  const [granted, setGranted] = useState<boolean | null>(null)
  const [batteryOptimized, setBatteryOptimized] = useState(false)
  const [captures, setCaptures] = useState<NotifCapture[]>([])
  const listenerRef = useRef<{ remove: () => void } | null>(null)
  const pendientes = useCapturasNotifPendientes()
  const historial = useCapturasNotifHistorial()
  const [verHistorial, setVerHistorial] = useState(false)

  useEffect(() => {
    NotificationCapture.getCaptures().then(r => {
      const sorted = [...r.captures].reverse()
      setCaptures(dedupe(sorted))
      if (sorted.length > 0) setGranted(true)
    }).catch(() => {})

    NotificationCapture.isPermissionGranted().then(r => setGranted(r.granted)).catch(() => setGranted(false))

    NotificationCapture.isBatteryOptimized().then(r => setBatteryOptimized(r.optimized)).catch(() => {})

    NotificationCapture.addListener('notificationReceived', (capture) => {
      setGranted(true)
      setCaptures(prev => dedupe([capture, ...prev]))
    }).then(l => { listenerRef.current = l }).catch(() => {})

    return () => { listenerRef.current?.remove() }
  }, [])

  useEffect(() => {
    const onFocus = () => {
      NotificationCapture.isPermissionGranted().then(r => { if (r.granted) setGranted(true) }).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const [scanning, setScanning] = useState(false)
  const bolsillos = useBolsillos()

  function handleClear() {
    NotificationCapture.clearCaptures().catch(() => {})
    setCaptures([])
  }

  async function handleScanActive() {
    setScanning(true)
    try {
      // Java persists new captures to SharedPreferences and fires events
      await NotificationCapture.scanActiveNotifications()
      // Fetch the updated capture list (includes newly persisted ones)
      const { captures: raw } = await NotificationCapture.getCaptures()
      const sorted = [...raw].reverse()
      setCaptures(dedupe(sorted))
      // Process directly — don't rely solely on the notificationReceived event path,
      // which can miss captures if the listener is momentarily being re-registered.
      const mapped = bolsillos.filter(b => b.packageName)
      if (mapped.length > 0) {
        for (const c of sorted) {
          await procesarCaptura(c, mapped).catch(() => {})
        }
      }
    } finally {
      setTimeout(() => setScanning(false), 1500)
    }
  }

  return (
    <Modal title="Captura de notificaciones" onClose={onClose}>
      {/* Permission banner */}
      {granted === false && (
        <div className="mb-4 rounded-xl bg-amber-50 p-3 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Permiso de notificaciones no activado
          </p>
          <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
            Para capturar notificaciones de tu banco, activa el acceso en Ajustes del sistema.
          </p>
          <button
            onClick={() => NotificationCapture.openSettings()}
            className="mt-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white active:scale-95"
          >
            Abrir Ajustes del sistema →
          </button>
        </div>
      )}

      {granted === true && (
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Capturando notificaciones
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={handleScanActive}
              disabled={scanning}
              className="text-xs text-sky-500 disabled:opacity-50"
            >
              {scanning ? 'Escaneando…' : '🔍 Re-escanear barra'}
            </button>
            {captures.length > 0 && (
              <button onClick={handleClear} className="text-xs text-slate-400 hover:text-rose-500">
                Limpiar todo
              </button>
            )}
          </div>
        </div>
      )}

      {granted === true && batteryOptimized && (
        <div className="mb-4 rounded-xl bg-amber-50 p-3 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Optimización de batería activa
          </p>
          <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
            Android puede apagar la captura cuando el celular lleva tiempo sin usar. Desactiva la optimización para esta app.
          </p>
          <button
            onClick={() => NotificationCapture.requestBatteryExemption()}
            className="mt-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white active:scale-95"
          >
            Desactivar optimización →
          </button>
        </div>
      )}

      {/* Pending captures to register */}
      {pendientes.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Pendientes de registrar ({pendientes.length})
          </p>
          <ul className="space-y-2">
            {pendientes.map(c => <CapturaCard key={c.id} captura={c} />)}
          </ul>
        </div>
      )}

      {/* History of processed notifications */}
      {historial.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setVerHistorial(v => !v)}
            className="flex w-full items-center justify-between mb-2"
          >
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Historial ({historial.length})
            </p>
            <span className="text-xs text-slate-400">{verHistorial ? '▲ ocultar' : '▼ ver'}</span>
          </button>
          {verHistorial && (
            <ul className="space-y-1.5">
              {historial.map(c => (
                <HistorialCard key={c.id} captura={c} />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Raw capture log */}
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Registro de capturas
      </p>
      {captures.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-3xl">🔔</p>
          <p className="mt-2 text-sm text-slate-400">
            {granted
              ? 'Esperando notificaciones… Envíate un mensaje de WhatsApp.'
              : 'Activa el permiso para empezar a capturar.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {captures.map((c, i) => {
            const amounts = extractAmounts(`${c.title} ${c.text} ${c.subText}`)
            return (
              <li key={`${c.id}-${i}`} className="rounded-xl border border-slate-100 p-3 dark:border-slate-700">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {friendlyPackage(c.packageName)}
                  </span>
                  <span className="text-[10px] text-slate-400">{timeAgo(c.timestamp)}</span>
                </div>
                {c.title && <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{c.title}</p>}
                {c.text && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{c.text}</p>}
                {c.subText && <p className="mt-0.5 text-xs text-slate-400">{c.subText}</p>}
                {amounts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {amounts.map((a, j) => (
                      <span key={j} className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        💰 {a}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 truncate text-[10px] text-slate-300 dark:text-slate-600">{c.packageName}</p>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
