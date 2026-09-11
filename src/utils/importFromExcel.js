/**
 * Reads a sheet back out of an .xlsx file.
 *
 * Tolerant on purpose: it round-trips our own export, but also copes with
 * hand-made files — text dates, Excel serial numbers, and "x"/"yes" marks
 * instead of 1s.
 */

import { parseDottedDate } from './date.js'

// Note: 'x' (Latin) and 'х' (Cyrillic kha) are different characters that look
// identical. A sheet filled in on a Russian keyboard will contain the latter.
const TRUTHY_MARKS = new Set([
  'x', 'х', '✓', '✔', 'v', 'в', 'y', 'yes', 'true', '1', '+', 'да', 'д', 'н', 'отм',
])

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)
const MAX_EXCEL_SERIAL = 2958465 // 9999-12-31

/** Flattens whatever ExcelJS hands back into a plain string. */
function cellText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('').trim()
    if ('result' in value) return cellText(value.result)
    if ('text' in value) return cellText(value.text)
  }
  return String(value)
}

/** Header cell -> ISO date string, or '' when it cannot be read as a date. */
function cellToISODate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)

  if (typeof value === 'number' && value > 0 && value < MAX_EXCEL_SERIAL) {
    return new Date(EXCEL_EPOCH_UTC + value * 86400000).toISOString().slice(0, 10)
  }

  const text = cellText(value)
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text

  // Checked before Date parsing: "11.09.2026" is day-first here, not month-first.
  const dotted = parseDottedDate(text)
  if (dotted) return dotted

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

function isChecked(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'object' && 'result' in value) return isChecked(value.result)

  const text = cellText(value)
  if (!text) return false
  const asNumber = Number(text)
  if (!Number.isNaN(asNumber)) return asNumber !== 0
  return TRUTHY_MARKS.has(text.toLowerCase()) || TRUTHY_MARKS.has(text)
}

const NUMBER_LABELS = ['№', '№ п/п', '№п/п', 'n', '#', 'номер', 'nn']

/** Колонка нумерации перед ФИО — её нужно пропустить, а не принять за дату. */
const isNumberLabel = (text) => NUMBER_LABELS.includes(text.toLowerCase())

const isTotalLabel = (text) => ['total', 'totals', 'sum', 'итого', 'сумма'].includes(text.toLowerCase())

/**
 * @param {File|Blob} file
 * @returns {Promise<{columns: {date: string}[], rows: {name: string, checks: boolean[]}[]}>}
 *   `checks` is positional — one boolean per column, in column order.
 */
export async function importFromExcel(file) {
  const { default: ExcelJS } = await import('exceljs')

  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(await file.arrayBuffer())
  } catch (cause) {
    // Anything unreadable surfaces as a JSZip/XML error; don't leak that at the user.
    console.error(cause)
    throw new Error('Не удалось открыть файл как книгу .xlsx.')
  }

  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('В файле нет ни одного листа.')

  const headerRow = sheet.getRow(1)
  let lastColumn = sheet.columnCount

  // Своя же выгрузка начинается с колонки «№»; у чужих файлов её может не быть.
  const numberColumn = isNumberLabel(cellText(headerRow.getCell(1).value)) ? 1 : 0
  const nameColumn = numberColumn ? 2 : 1

  // Drop our own trailing "Total" column so it does not import as a date.
  if (lastColumn > 1 && isTotalLabel(cellText(headerRow.getCell(lastColumn).value))) {
    lastColumn -= 1
  }

  const columnIndexes = []
  const columns = []
  for (let index = nameColumn + 1; index <= lastColumn; index++) {
    columnIndexes.push(index)
    columns.push({ date: cellToISODate(headerRow.getCell(index).value) })
  }

  const rows = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const sheetRow = sheet.getRow(rowNumber)
    const name = cellText(sheetRow.getCell(nameColumn).value)
    const checks = columnIndexes.map((index) => isChecked(sheetRow.getCell(index).value))
    // Номер удерживает строку без имени и без отметок: ФИО приложение не
    // хранит, поэтому пустая строка человека опознаётся только по номеру.
    const numbered = numberColumn > 0 && cellText(sheetRow.getCell(numberColumn).value) !== ''

    // Пропускаем строки, в которых нет вообще ничего.
    if (!name && !numbered && !checks.some(Boolean)) continue
    rows.push({ name, checks })
  }

  // The footer row only looks like a person because it has a label and numbers.
  const last = rows[rows.length - 1]
  if (last && isTotalLabel(last.name)) rows.pop()

  if (!columns.length && !rows.length) {
    throw new Error('Не найдено ни людей, ни дат. Первая строка — это заголовок?')
  }

  return { columns, rows }
}
