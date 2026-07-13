/** Ayudantes para interpretar datos de un CSV exportado de otra app. */

/**
 * Repara texto con "mojibake" por doble codificación UTF-8 (ej. "categorÃ­a" →
 * "categoría"). Solo actúa si detecta la firma (Ã/Â) y la reparación no genera
 * caracteres inválidos, para no dañar texto ya correcto de otras apps.
 */
export function repararTexto(s: string | undefined): string {
  if (!s || !/[ÃÂ]/.test(s)) return s ?? ''
  try {
    const bytes = Uint8Array.from([...s].map((ch) => ch.charCodeAt(0) & 0xff))
    const fixed = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    return fixed.includes('�') ? s : fixed
  } catch {
    return s
  }
}

/** Intenta normalizar una fecha a 'YYYY-MM-DD'. Soporta ISO y DD/MM/YYYY. */
export function parseFecha(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()

  // Ya es ISO (YYYY-MM-DD o con hora)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  // DD/MM/YYYY o DD-MM-YYYY (formato común en Colombia)
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (dmy) {
    let [, d, m, y] = dmy
    if (y.length === 2) y = '20' + y
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Último recurso: que lo intente Date
  const t = new Date(s)
  if (!isNaN(t.getTime())) {
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(
      t.getDate(),
    ).padStart(2, '0')}`
  }
  return null
}

/**
 * Convierte un monto en texto a número. Maneja símbolos de moneda y los formatos
 * "1.234,56" (es) y "1,234.56" (en). Devuelve el valor absoluto y si era negativo.
 */
export function parseMonto(raw: string): { valor: number; negativo: boolean } | null {
  if (raw == null) return null
  let s = String(raw).trim()
  if (!s) return null

  const negativo = /^-|\(.*\)/.test(s) || s.includes('-')
  s = s.replace(/[^0-9.,]/g, '') // deja solo dígitos, punto y coma
  if (!s) return null

  const tieneComa = s.includes(',')
  const tienePunto = s.includes('.')

  if (tieneComa && tienePunto) {
    // El último separador es el decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.') // formato es: 1.234,56
    } else {
      s = s.replace(/,/g, '') // formato en: 1,234.56
    }
  } else if (tieneComa) {
    s = s.replace(',', '.') // coma como decimal
  }
  // si solo hay puntos, se asume punto decimal (o miles sin decimales: igual sirve)

  const valor = Math.abs(Number(s))
  if (isNaN(valor)) return null
  return { valor, negativo }
}
