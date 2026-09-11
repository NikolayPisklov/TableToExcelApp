/** Date helpers. Sheet state always stores dates as ISO `YYYY-MM-DD`. */

const weekdayShortFormatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
const weekdayLongFormatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' })

/** ISO date -> Date at local midnight, or null when unparseable. */
function fromISO(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function toISODate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** `2026-09-11` -> `11.09.2026` */
export function formatDate(iso) {
  const date = fromISO(iso)
  if (!date) return ''
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
}

/** `11.09.2026` or `11.9.26` -> `2026-09-11`, else ''. Dots mean day-first. */
export function parseDottedDate(text) {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(String(text).trim())
  if (!match) return ''
  const day = Number(match[1])
  const month = Number(match[2])
  let year = Number(match[3])
  if (match[3].length === 2) year += year < 70 ? 2000 : 1900
  if (day < 1 || day > 31 || month < 1 || month > 12) return ''

  const date = new Date(year, month - 1, day)
  // Rejects overflow like 31.02.2026, which Date would roll into March.
  if (date.getDate() !== day || date.getMonth() !== month - 1) return ''
  return toISODate(date)
}

export const weekdayShort = (iso) => {
  const date = fromISO(iso)
  return date ? weekdayShortFormatter.format(date) : ''
}

export const weekdayLong = (iso) => {
  const date = fromISO(iso)
  return date ? weekdayLongFormatter.format(date) : ''
}

/** Saturday or Sunday — shaded in the table so long date ranges stay readable. */
export const isWeekend = (iso) => {
  const date = fromISO(iso)
  if (!date) return false
  const day = date.getDay()
  return day === 0 || day === 6
}

/** Russian plural picker: plural(2, 'дата', 'даты', 'дат') -> 'даты' */
export function plural(count, one, few, many) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

/** `Сентябрь 2026` */
export const monthLabel = (date = new Date()) =>
  `${MONTHS_NOMINATIVE[date.getMonth()]} ${date.getFullYear()}`


/**
 * Все будние дни месяца в порядке возрастания, в формате ISO.
 * Суббота и воскресенье пропускаются.
 */
export function monthWorkdays(reference = new Date()) {
  const month = reference.getMonth()
  const cursor = new Date(reference.getFullYear(), month, 1)
  const dates = []
  while (cursor.getMonth() === month) {
    if (!isWeekend(toISODate(cursor))) dates.push(toISODate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}
