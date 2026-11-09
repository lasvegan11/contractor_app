/** "(702) 555-0100" → "+17025550100". US numbers by default; a leading "+" keeps any country. */
export function toE164(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (input.trim().startsWith('+') && digits.length >= 10) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

/** "+17025550100" or "17025550100" → "702-555-0100" */
export function prettyPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  if (ten.length === 10) return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`
  return phone
}

/** As-you-type formatting for the login field. */
export function formatPhoneInput(raw: string): string {
  if (raw.trim().startsWith('+')) return raw
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  d = d.slice(0, 10)
  if (d.length < 4) return d
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}
