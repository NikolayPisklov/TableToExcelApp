const HEADER_FILL = 'FFEEF2FF'
const TOTAL_FILL = 'FFEEF2FF'
const GRAND_FILL = 'FFDBEAFE'
const BORDER = 'FFDFE3E8'

const thinBorder = {
  top: { style: 'thin', color: { argb: BORDER } },
  left: { style: 'thin', color: { argb: BORDER } },
  bottom: { style: 'thin', color: { argb: BORDER } },
  right: { style: 'thin', color: { argb: BORDER } },
}

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

/** 1-based column index -> spreadsheet letter (1 -> A, 27 -> AA). */
function columnLetter(index) {
  let letter = ''
  let n = index
  while (n > 0) {
    const remainder = (n - 1) % 26
    letter = String.fromCharCode(65 + remainder) + letter
    n = Math.floor((n - 1) / 26)
  }
  return letter
}

/**
 * Builds the workbook for the current sheet.
 *
 * Totals are written as live SUM formulas rather than baked-in numbers, so the
 * file keeps working when someone edits it in Excel. ExcelJS is imported
 * lazily - it is ~950 kB and nothing needs it until the first export.
 */
export async function buildWorkbook(state) {
  const { default: ExcelJS } = await import('exceljs')
  const { columns, rows } = state

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Табель посещаемости'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Посещаемость', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
  })

  const firstDateCol = 2
  const lastDateCol = firstDateCol + columns.length - 1
  const totalCol = lastDateCol + 1
  const firstDataRow = 2
  const lastDataRow = firstDataRow + rows.length - 1
  const totalRow = lastDataRow + 1

  sheet.columns = [
    { width: 26 },
    ...columns.map(() => ({ width: 11 })),
    { width: 9 },
  ]

  // Header: Name | dates... | Total
  const header = sheet.getRow(1)
  header.getCell(1).value = 'ФИО'
  columns.forEach((column, index) => {
    const cell = header.getCell(firstDateCol + index)
    // Parsed as UTC midnight on purpose: ExcelJS serializes dates via UTC, so
    // local midnight would land on the previous day for any positive offset.
    const date = new Date(`${column.date}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) {
      cell.value = column.date
    } else {
      cell.value = date
      cell.numFmt = 'dd.mm.yyyy'
    }
  })
  header.getCell(totalCol).value = 'Итого'
  header.height = 20
  header.eachCell((cell) => {
    cell.font = { bold: true }
    cell.fill = fill(HEADER_FILL)
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = thinBorder
  })
  header.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }

  // One row per person: checked cells become 1, unchecked stay empty.
  rows.forEach((row, index) => {
    const excelRow = sheet.getRow(firstDataRow + index)
    excelRow.getCell(1).value = row.name
    columns.forEach((column, columnIndex) => {
      const cell = excelRow.getCell(firstDateCol + columnIndex)
      if (row.checks[column.id]) cell.value = 1
    })

    if (columns.length) {
      excelRow.getCell(totalCol).value = {
        formula: `SUM(${columnLetter(firstDateCol)}${excelRow.number}:${columnLetter(lastDateCol)}${excelRow.number})`,
      }
    } else {
      excelRow.getCell(totalCol).value = 0
    }

    excelRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { horizontal: 'center' }
      cell.border = thinBorder
    })
    excelRow.getCell(1).alignment = { horizontal: 'left' }
    const total = excelRow.getCell(totalCol)
    total.font = { bold: true }
    total.fill = fill(TOTAL_FILL)
  })

  // Footer: per-date totals, then the grand total in the corner.
  const footer = sheet.getRow(totalRow)
  footer.getCell(1).value = 'Итого'
  columns.forEach((_, index) => {
    const letter = columnLetter(firstDateCol + index)
    footer.getCell(firstDateCol + index).value = rows.length
      ? { formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})` }
      : 0
  })
  const totalLetter = columnLetter(totalCol)
  footer.getCell(totalCol).value = rows.length
    ? { formula: `SUM(${totalLetter}${firstDataRow}:${totalLetter}${lastDataRow})` }
    : 0

  footer.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true }
    cell.fill = fill(TOTAL_FILL)
    cell.alignment = { horizontal: 'center' }
    cell.border = thinBorder
  })
  footer.getCell(1).alignment = { horizontal: 'left' }
  footer.getCell(totalCol).fill = fill(GRAND_FILL)

  return workbook
}

/** Builds the .xlsx and hands it to the browser as a download. */
export async function exportToExcel(state, filename) {
  const workbook = await buildWorkbook(state)
  const buffer = await workbook.xlsx.writeBuffer()
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename ?? defaultFilename(),
  )
}

function defaultFilename() {
  return `Табель-${new Date().toISOString().slice(0, 10)}.xlsx`
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
