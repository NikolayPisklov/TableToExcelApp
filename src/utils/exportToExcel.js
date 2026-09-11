/**
 * Выгрузка в .xlsx.
 *
 * Оформление сведено к минимуму: ни заливок, ни рамок, ни жирного шрифта.
 * Заданы только то, что нужно для вида табеля — шрифт Times New Roman,
 * вертикальные даты в шапке и ширины колонок под них.
 */

/** Отметка в ячейке. Итоги считаются через COUNTIF по этой букве. */
const MARK = 'Н'

const FONT = { name: 'Times New Roman', size: 11 }

/** Номер колонки (с единицы) -> буква: 1 -> A, 27 -> AA. */
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
 * Собирает книгу по текущей таблице.
 *
 * Итоги записываются живыми формулами, а не готовыми числами, поэтому файл
 * продолжает считать после правок в Excel. Раз в ячейках буква, а не единица,
 * считать приходится через COUNTIF — SUM по тексту дал бы нули.
 *
 * ExcelJS подключается лениво: он весит ~950 кБ и до первой выгрузки не нужен.
 */
export async function buildWorkbook(state) {
  const { default: ExcelJS } = await import('exceljs')
  const { columns, rows } = state

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Табель посещаемости'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Посещаемость')

  const numCol = 1
  const nameCol = 2
  const firstDateCol = 3
  const lastDateCol = firstDateCol + columns.length - 1
  const totalCol = lastDateCol + 1
  const firstDataRow = 2
  const lastDataRow = firstDataRow + rows.length - 1
  const totalRow = lastDataRow + 1

  // Узкие колонки дат — иначе вертикальная надпись теряет смысл.
  sheet.columns = [
    { width: 5 },
    { width: 26 },
    ...columns.map(() => ({ width: 4 })),
    { width: 8 },
  ]

  // Шапка: № | ФИО | даты... | Итого
  const header = sheet.getRow(1)
  header.getCell(numCol).value = '№'
  header.getCell(nameCol).value = 'ФИО'
  columns.forEach((column, index) => {
    const cell = header.getCell(firstDateCol + index)
    // Разбор в UTC намеренно: ExcelJS переводит даты через UTC, и локальная
    // полночь при положительном смещении уехала бы на день назад.
    const date = new Date(`${column.date}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) {
      cell.value = column.date
    } else {
      cell.value = date
      cell.numFmt = 'dd.mm.yyyy'
    }
    // 90 — снизу вверх, как в таблице на странице.
    cell.alignment = { textRotation: 90, horizontal: 'center', vertical: 'bottom' }
  })
  header.getCell(totalCol).value = 'Итого'
  header.height = 72

  // По строке на человека: отмеченная ячейка — буква, неотмеченная пустая.
  rows.forEach((row, index) => {
    const excelRow = sheet.getRow(firstDataRow + index)
    excelRow.getCell(numCol).value = index + 1
    excelRow.getCell(nameCol).value = row.name
    columns.forEach((column, columnIndex) => {
      const cell = excelRow.getCell(firstDateCol + columnIndex)
      if (row.checks[column.id]) cell.value = MARK
      cell.alignment = { horizontal: 'center' }
    })

    excelRow.getCell(totalCol).value = columns.length
      ? {
          formula: `COUNTIF(${columnLetter(firstDateCol)}${excelRow.number}:${columnLetter(lastDateCol)}${excelRow.number},"${MARK}")`,
        }
      : 0
    excelRow.getCell(numCol).alignment = { horizontal: 'center' }
  })

  // Нижняя строка: итоги по датам и общий итог в углу.
  const footer = sheet.getRow(totalRow)
  footer.getCell(nameCol).value = 'Итого'
  columns.forEach((_, index) => {
    const letter = columnLetter(firstDateCol + index)
    const cell = footer.getCell(firstDateCol + index)
    cell.value = rows.length
      ? { formula: `COUNTIF(${letter}${firstDataRow}:${letter}${lastDataRow},"${MARK}")` }
      : 0
    cell.alignment = { horizontal: 'center' }
  })
  // Итоги по строкам — уже числа, поэтому общий итог считается обычной суммой.
  const totalLetter = columnLetter(totalCol)
  footer.getCell(totalCol).value = rows.length
    ? { formula: `SUM(${totalLetter}${firstDataRow}:${totalLetter}${lastDataRow})` }
    : 0

  // Шрифт задаётся поячеечно: у ExcelJS нет надёжного способа сменить
  // шрифт книги целиком.
  for (let rowNumber = 1; rowNumber <= totalRow; rowNumber++) {
    const sheetRow = sheet.getRow(rowNumber)
    for (let colNumber = 1; colNumber <= totalCol; colNumber++) {
      sheetRow.getCell(colNumber).font = FONT
    }
  }

  return workbook
}

/** Собирает .xlsx и отдаёт браузеру на скачивание. */
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
