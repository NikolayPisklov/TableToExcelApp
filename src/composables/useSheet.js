import { computed, reactive, watch } from 'vue'
import { monthWorkdays, toISODate } from '../utils/date.js'

const STORAGE_KEY = 'attendance-sheet'
const STORAGE_VERSION = 1

let nextId = 1
const uid = () => `id-${nextId++}`

/**
 * Shared sheet state.
 *
 * rows[].checks is keyed by column id, so adding or removing a date column
 * never has to touch the order of anything else.
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

function addRow(name = '') {
  const row = { id: uid(), name, checks: {} }
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

/** Day after the last column, or today when the sheet has no dates yet. */
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
 * Swaps in a whole sheet, e.g. from an imported file.
 * Incoming `checks` are positional (one per column), so fresh ids are minted here.
 */
function replaceAll({ columns, rows }) {
  state.columns = columns.map((column) => ({ id: uid(), date: column.date ?? '' }))
  state.rows = rows.map((row) => {
    const checks = {}
    state.columns.forEach((column, index) => {
      checks[column.id] = Boolean(row.checks?.[index])
    })
    return { id: uid(), name: row.name ?? '', checks }
  })
}

/**
 * Сбрасывает даты, оставляя людей.
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

/* ---------------------------------------------------------------- storage */

function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        nextId,
        columns: state.columns,
        rows: state.rows,
      }),
    )
  } catch (cause) {
    // Private mode or a full quota: the sheet still works, it just won't persist.
    console.warn('Could not save the sheet.', cause)
  }
}

/** Returns true when saved state was restored. Bad data is discarded, not thrown. */
function load() {
  let saved
  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch (cause) {
    console.warn('Could not read saved sheet.', cause)
    return false
  }
  if (!saved) return false

  try {
    const parsed = JSON.parse(saved)
    if (!parsed || parsed.version !== STORAGE_VERSION) return false
    if (!Array.isArray(parsed.columns) || !Array.isArray(parsed.rows)) return false

    const columns = parsed.columns
      .filter((column) => column && typeof column.id === 'string')
      .map((column) => ({ id: column.id, date: typeof column.date === 'string' ? column.date : '' }))

    const columnIds = new Set(columns.map((column) => column.id))

    const rows = parsed.rows
      .filter((row) => row && typeof row.id === 'string')
      .map((row) => {
        const checks = {}
        for (const column of columns) {
          checks[column.id] = Boolean(row.checks?.[column.id])
        }
        return { id: row.id, name: typeof row.name === 'string' ? row.name : '', checks }
      })

    state.columns = columns
    state.rows = rows

    // Keep minting unique ids even if the counter was lost or tampered with.
    const usedIds = [...columnIds, ...rows.map((row) => row.id)]
    const highest = usedIds.reduce((max, id) => {
      const match = /^id-(\d+)$/.exec(id)
      return match ? Math.max(max, Number(match[1])) : max
    }, 0)
    nextId = Math.max(Number(parsed.nextId) || 1, highest + 1)

    return true
  } catch (cause) {
    console.warn('Saved sheet was unreadable and has been ignored.', cause)
    return false
  }
}

function seed() {
  const today = new Date()
  for (let offset = 0; offset < 3; offset++) {
    const date = new Date(today)
    date.setDate(today.getDate() + offset)
    addColumn(toISODate(date))
  }
  for (const name of ['Иванов Иван', 'Петрова Анна', 'Сидоров Пётр']) {
    addRow(name)
  }
}

// Seed runs before the watcher below exists, so persist it explicitly.
if (!load()) {
  seed()
  save()
}

// Deep watch: cell ticks and inline name/date edits all mutate nested values.
watch(state, save, { deep: true, flush: 'post' })

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
