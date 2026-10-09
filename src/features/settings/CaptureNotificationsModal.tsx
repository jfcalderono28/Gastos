import { useEffect, useRef, useState } from 'react'
import Modal from '../../components/Modal'
import { NotificationCapture, type NotifCapture } from '../../plugins/NotificationCapture'

// Financial keywords that precede a bare number (no $ sign)
const KEYWORD_AMOUNT_RE = /(?:envió|recibiste|pagaste|cobré|compra(?:\s+por)?|valor|monto|total|transferencia\s+de|te\s+llega)\s+([\d.,]+)/gi

function extractAmounts(text: string): string[] {
  const found = new Set<string>()
  // Pattern 1: $ + number  →  "$15000", "$1.500.000"
  for (const m of text.matchAll(/\$\s?[\d.,]+/g)) found.add(m[0].trim())
  // Pattern 2: dot-thousands without $  →  "150.000", "1.500.000"
  for (const m of text.matchAll(/\b\d{1,3}(?:\.\d{3})+\b/g)) found.add(m[0])
  // Pattern 3: bare number after financial keyword  →  "te envió 1000"
  KEYWORD_AMOUNT_RE.lastIndex = 0
  for (const m of text.matchAll(KEYWORD_AMOUNT_RE)) found.add(m[1])
  return [...found]
}

// Skip WhatsApp "N mensajes nuevos" summaries — keep only real message text
const SKIP_RE = /^\d+\s+mensajes?\s+nuevos?$/i

function dedupe(list: NotifCapture[]): NotifCapture[] {
  const seen = new Set<string>()
  return list.filter(c => {
    if (SKIP_RE.test(c.text.trim())) return false
    // Collapse identical text from same app within 3 seconds
    const key = `${c.packageName}|${c.title}|${c.text}|${Math.floor(c.timestamp / 3000)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function friendlyPackage(pkg: string): string {
  const known: Record<string, string> = {
    'com.whatsapp':                  'WhatsApp',
    'com.bancolombia.bancolombia':   'Bancolombia',
    'com.nu.production':             'Nu',
    'com.davivienda.mibankapp':      'Davivienda',
    'com.bbva.android':              'BBVA',
    'com.falabella.banking':         'Falabella',
    'com.google.android.gm':         'Gmail',
    'com.android.mms':               'SMS',
  }
  return known[pkg] ?? pkg.split('.').pop() ?? pkg
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `hace ${diff}s`
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`
  return `hace ${Math.floor(diff / 3600)}h`
}

export default function CaptureNotificationsModal({ onClose }: { onClose: () => void }) {
  const [granted, setGranted] = useState<boolean | null>(null)
  const [captures, setCaptures] = useState<NotifCapture[]>([])
  const listenerRef = useRef<{ remove: () => void } | null>(null)

  // Check permission and load existing captures on mount
  useEffect(() => {
    NotificationCapture.getCaptures().then(r => {
      const sorted = [...r.captures].reverse()
      setCaptures(dedupe(sorted))
      // If we're already receiving captures, permission is granted
      if (sorted.length > 0) setGranted(true)
    }).catch(() => {})

    NotificationCapture.isPermissionGranted().then(r => setGranted(r.granted)).catch(() => setGranted(false))

    // Subscribe to live captures
    NotificationCapture.addListener('notificationReceived', (capture) => {
      setGranted(true)
      setCaptures(prev => dedupe([capture, ...prev]))
    }).then(l => { listenerRef.current = l }).catch(() => {})

    return () => { listenerRef.current?.remove() }
  }, [])

  // Re-check permission after returning from settings
  useEffect(() => {
    const onFocus = () => {
      NotificationCapture.isPermissionGranted().then(r => { if (r.granted) setGranted(true) }).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  function handleClear() {
    NotificationCapture.clearCaptures().catch(() => {})
    setCaptures([])
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
            Para capturar notificaciones de WhatsApp y tu banco, activa el acceso en Ajustes del sistema.
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
          {captures.length > 0 && (
            <button
              onClick={handleClear}
              className="text-xs text-slate-400 hover:text-rose-500"
            >
              Limpiar todo
            </button>
          )}
        </div>
      )}

      {/* Capture list */}
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
                {/* Header: app + time */}
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {friendlyPackage(c.packageName)}
                  </span>
                  <span className="text-[10px] text-slate-400">{timeAgo(c.timestamp)}</span>
                </div>

                {/* Notification content */}
                {c.title && (
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{c.title}</p>
                )}
                {c.text && (
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{c.text}</p>
                )}
                {c.subText && (
                  <p className="mt-0.5 text-xs text-slate-400">{c.subText}</p>
                )}

                {/* Extracted amounts */}
                {amounts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {amounts.map((a, j) => (
                      <span
                        key={j}
                        className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      >
                        💰 {a}
                      </span>
                    ))}
                  </div>
                )}

                {/* Raw package name */}
                <p className="mt-1.5 truncate text-[10px] text-slate-300 dark:text-slate-600">
                  {c.packageName}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
