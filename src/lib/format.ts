/** Formatea un número como moneda. Por defecto COP sin decimales. */
export function formatMoney(value: number, moneda = 'COP'): string {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: moneda,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `$${Math.round(value).toLocaleString('es-CO')}`
  }
}
