export function parsePrice(text: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Price must be nonnegative with at most two decimal places.')
  const [whole, fraction = ''] = text.split('.')
  const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Price exceeds the supported maximum (90071992547409.91).')
  return Number(value)
}
export function priceText(minor: number): string {
  const value = BigInt(minor)
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`
}
