import { computed, reactive } from 'vue'
import { monthWorkdays, toISODate } from '../utils/date.js'

let nextId = 1
const uid = () => `id-${nextId++}`

/**
 * Общее состояние таблицы. Живёт только в памяти и стартует пустым: при
 * перезагрузке страницы всё начинается заново, единственный способ сохранить
 * данные — выгрузка в Excel.
 *
 * ФИО не хранятся — колонка есть, но ячейки всегда пустые, строки различаются
 * по номеру. checks у каждой строки — по id колонки, поэтому добавление и
 * удаление дат не задевает порядок остального.
 */
const state = reactive({
  columns: [],
  rows: [],
})

function addColumn(date) {
  const column = { id: uid(), date: date ?? suggestNextDate() }
  state.columns.push(column)
  for (const row of state.rows) {
    row.checks[column.id] = false
  }
  return column
}

function removeColumn(columnId) {
  const index = state.columns.findIndex((column) => column.id === columnId)
  if (index === -1) return
  state.columns.splice(index, 1)
  for (const row of state.rows) {
    delete row.checks[columnId]
  }
}

function addRow() {
  const row = { id: uid(), checks: {} }
  for (const column of state.columns) {
    row.checks[column.id] = false
  }
  state.rows.push(row)
  return row
}

function removeRow(rowId) {
  const index = state.rows.findIndex((row) => row.id === rowId)
  if (index !== -1) state.rows.splice(index, 1)
}

/** Следующий день после последней колонки, либо сегодня, если дат ещё нет. */
function suggestNextDate() {
  const last = state.columns[state.columns.length - 1]
  const date = last ? new Date(`${last.date}T00:00:00`) : new Date()
  if (last) date.setDate(date.getDate() + 1)
  return toISODate(date)
}

/** Хронологический порядок; колонки без даты уходят в конец. */
function sortColumnsByDate() {
  state.columns.sort((a, b) => {
    if (!a.date) return b.date ? 1 : 0
    if (!b.date) return -1
    return a.date.localeCompare(b.date)
  })
}

/**
 * Добавляет недостающие рабочие дни месяца.
 *
 * Ничего не удаляет: уже существующие колонки и отметки остаются на месте,
 * поэтому кнопку можно нажимать повторно без потери данных.
 *
 * @returns {number} сколько колонок реально добавлено
 */
function fillMonth(reference = new Date()) {
  const existing = new Set(state.columns.map((column) => column.date))
  let added = 0
  for (const date of monthWorkdays(reference)) {
    if (existing.has(date)) continue
    existing.add(date)
    addColumn(date)
    added += 1
  }
  sortColumnsByDate()
  return added
}

/**
 * Подставляет таблицу целиком, например из импортированного файла.
 * Во входных данных checks позиционные (по одному на колонку), поэтому id
 * выдаются заново. ФИО из файла игнорируются — их негде хранить.
 */
function replaceAll({ columns, rows }) {
  state.columns = columns.map((column) => ({ id: uid(), date: column.date ?? '' }))
  state.rows = rows.map((row) => {
    const checks = {}
    state.columns.forEach((column, index) => {
      checks[column.id] = Boolean(row.checks?.[index])
    })
    return { id: uid(), checks }
  })
}

/**
 * Сбрасывает даты, оставляя строки.
 *
 * Отметки хранятся по id колонок, поэтому checks нужно очищать явно —
 * иначе в строках остались бы ключи на уже несуществующие даты.
 *
 * @returns {number} сколько колонок удалено
 */
function clearDates() {
  const removed = state.columns.length
  state.columns = []
  for (const row of state.rows) {
    row.checks = {}
  }
  return removed
}

function clearAll() {
  state.columns = []
  state.rows = []
}

/** Строка отмечена целиком. Пустая таблица без дат — не «целиком». */
const isRowFull = (row) =>
  state.columns.length > 0 && state.columns.every((column) => row.checks[column.id])

/**
 * «Отметить всё» по строке: отмечает все ячейки, а если строка уже
 * отмечена целиком — снимает отметки.
 */
function toggleRow(rowId) {
  const row = state.rows.find((item) => item.id === rowId)
  if (!row || !state.columns.length) return
  const value = !isRowFull(row)
  for (const column of state.columns) {
    row.checks[column.id] = value
  }
}

const rowTotal = (row) =>
  state.columns.reduce((sum, column) => sum + (row.checks[column.id] ? 1 : 0), 0)

const columnTotals = computed(() => {
  const totals = {}
  for (const column of state.columns) {
    totals[column.id] = state.rows.reduce(
      (sum, row) => sum + (row.checks[column.id] ? 1 : 0),
      0,
    )
  }
  return totals
})

const grandTotal = computed(() =>
  state.rows.reduce((sum, row) => sum + rowTotal(row), 0),
)

export function useSheet() {
  return {
    state,
    addColumn,
    removeColumn,
    addRow,
    removeRow,
    replaceAll,
    clearAll,
    clearDates,
    fillMonth,
    toggleRow,
    isRowFull,
    rowTotal,
    columnTotals,
    grandTotal,
  }
}
