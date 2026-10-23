import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { NotificationCapture } from '../plugins/NotificationCapture'
import { repo } from '../data/repository'
import { useBolsillos } from './data'

const KEYWORD_AMOUNT_RE = /(?:envió|recibiste|pagaste|cobré|compra(?:\s+por)?|valor|monto|total|transferencia\s+de|te\s+llega)\s+([\d.,]+)/gi

function parseAmount(raw: string): number {
  // Remove $, spaces, dots (thousands sep) → float
  const s = raw.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')
  return parseFloat(s) || 0
}

function extractAmount(title: string, text: string): number {
  const full = `${title} ${text}`
  // Strip trailing punctuation before parsing
  const clean = (s: string) => s.replace(/[.,]+$/, '')
  let m = full.match(/\$\s?([\d.,]+)/)
  if (m) return parseAmount(clean(m[1]))
  m = full.match(/\b(\d{1,3}(?:\.\d{3})+)\b/)
  if (m) return parseAmount(clean(m[1]))
  KEYWORD_AMOUNT_RE.lastIndex = 0
  const km = KEYWORD_AMOUNT_RE.exec(full)
  if (km) return parseAmount(clean(km[1]))
  return 0
}

function clasificar(title: string, text: string): 'ingreso' | 'gasto' | 'ambiguo' | 'transferencia' {
  const full = `${title} ${text}`.toLowerCase()

  // ── TRANSFERENCIA (retiro en cajero = dinero propio a efectivo) ───────────
  // "sacaste" (Nequi: "Sacaste $20000") o "retiro en cajero"
  if (/sacaste|retiro\s+en\s+cajero/.test(full)) return 'transferencia'

  // ── GASTO (outgoing money) — check first, more specific patterns ──────────
  // "le enviaste", "que enviaste", "envío exitoso", "envío de plata exitoso"
  if (/le\s+enviaste|que\s+enviaste|env[ií]o.*exitoso|exitoso.*env[ií]o/.test(full)) return 'gasto'
  // "pagaste", "ya pagaste", "pago exitoso", "pago aprobado"
  if (/pagaste|pago\s+exitoso|pago\s+aprobado/.test(full)) return 'gasto'
  // "compraste", "compra aprobada", "compra por", "compra en"
  if (/compraste|compra\s+(aprobada|por|en|de)/.test(full)) return 'gasto'
  // "retiraste", "retiro de"
  if (/retiraste|retiro\s+de/.test(full)) return 'gasto'
  // "transferiste", "transferencia enviada"
  if (/transferiste|transferencia\s+enviada/.test(full)) return 'gasto'
  // "débito", "cargo por"
  if (/d[eé]bito|cargo\s+por/.test(full)) return 'gasto'
  // "enviaste" alone (covers "enviaste a", "enviaste por QR")
  if (/enviaste/.test(full)) return 'gasto'

  // ── INGRESO (incoming money) ──────────────────────────────────────────────
  // "te envió", "te enviaron" (someone sent to you)
  if (/te\s+envi[oó]|te\s+enviaron/.test(full)) return 'ingreso'
  // "recibiste", "recibió tu dinero" (you received)
  if (/recibiste/.test(full)) return 'ingreso'
  // "consignación", "consignó", "consignaste" (deposit received)
  if (/consignaci[oó]n|consign[oó]|consignaste/.test(full)) return 'ingreso'
  // "depósito", "depositó"
  if (/dep[oó]sito|deposit[oó]/.test(full)) return 'ingreso'
  // "abono", "abonó"
  if (/abono|abon[oó]/.test(full)) return 'ingreso'
  // "ingresó", "ingresaste", "ingreso de"
  if (/ingres[oó]|ingresaste/.test(full)) return 'ingreso'
  // "llegó", "te llegó", "dinero llegó"
  if (/te\s+lleg[oó]|dinero.*lleg[oó]/.test(full)) return 'ingreso'
  // "transferencia recibida"
  if (/transferencia\s+recibida/.test(full)) return 'ingreso'
  // "te enviaron plata" (Bre-B/TransfiYa)
  if (/enviaron\s+plata/.test(full)) return 'ingreso'

  return 'ambiguo'
}

export async function procesarCaptura(
  capture: { id: string; packageName: string; title?: string; text?: string; timestamp: number },
  mapped: Array<{ id?: number; packageName?: string; tipo?: string }>,
) {
  const bolsillo = mapped.find(b => b.packageName === capture.packageName)
  if (!bolsillo?.id) return

  const monto = extractAmount(capture.title ?? '', capture.text ?? '')
  if (monto <= 0) return

  const tipo = clasificar(capture.title ?? '', capture.text ?? '')
  const descripcion = [capture.title, capture.text].filter(Boolean).join(': ')

  await repo.addCapturaNotif({
    capturaId: capture.id,
    packageName: capture.packageName,
    bolsilloId: bolsillo.id,
    bolsilloTipo: (bolsillo.tipo ?? 'debito') as 'debito' | 'credito',
    monto,
    tipo,
    descripcion,
    timestamp: capture.timestamp,
    estado: 'pendiente',
  })
}

/**
 * Hook global — procesa notificaciones entrantes y guarda en capturasNotif
 * las que correspondan a un bolsillo configurado. Debe llamarse en App.tsx.
 */
export function useNotificationProcessor() {
  const bolsillos = useBolsillos()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const mapped = bolsillos.filter(b => b.packageName)

    // Sincronizar whitelist con el servicio nativo (filtra en Java antes de guardar nada)
    NotificationCapture.setAllowedPackages({
      packages: mapped.map(b => b.packageName!),
    }).catch(() => {})

    if (mapped.length === 0) return

    // Procesar capturas que llegaron mientras la app estaba cerrada
    NotificationCapture.getCaptures()
      .then(({ captures }) => {
        for (const c of captures) procesarCaptura(c, mapped).catch(() => {})
      })
      .catch(() => {})

    let handle: { remove: () => void } | null = null

    NotificationCapture.addListener('notificationReceived', async (capture) => {
      await procesarCaptura(capture, mapped)
    }).then(l => { handle = l }).catch(() => {})

    return () => { handle?.remove() }
  }, [bolsillos])
}
