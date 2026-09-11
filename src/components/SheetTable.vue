<script setup>
import { nextTick, ref } from 'vue'
import { useSheet } from '../composables/useSheet.js'
import { formatDate, isWeekend, weekdayLong, weekdayShort } from '../utils/date.js'

const {
  state,
  addColumn,
  removeColumn,
  addRow,
  removeRow,
  toggleRow,
  isRowFull,
  rowTotal,
  columnTotals,
  grandTotal,
} = useSheet()

// A native date input cannot shrink to the ~32px a 30-column sheet needs, so the
// header shows rotated text and swaps in a real picker only while editing.
const editingId = ref('')
const editEl = ref(null)

async function startEdit(columnId) {
  editingId.value = columnId
  await nextTick()
  editEl.value?.focus()
  try {
    editEl.value?.showPicker?.()
  } catch {
    // showPicker throws in browsers that gate it behind a user gesture; typing still works.
  }
}

const stopEdit = () => {
  editingId.value = ''
}

async function addAndEdit() {
  const column = addColumn()
  await startEdit(column.id)
}

const headerTitle = (iso) => {
  const formatted = formatDate(iso)
  if (!formatted) return 'Нажмите, чтобы задать дату'
  return `${weekdayLong(iso)}, ${formatted} — нажмите, чтобы изменить`
}
</script>

<template>
  <div class="sheet">
    <table>
      <thead>
        <tr>
          <th class="col-num">№</th>
          <th class="col-name">ФИО</th>
          <th
            v-for="column in state.columns"
            :key="column.id"
            class="col-date"
            :class="{ weekend: isWeekend(column.date) }"
          >
            <button class="remove" title="Удалить дату" @click="removeColumn(column.id)">×</button>

            <div
              v-if="editingId !== column.id"
              class="date-head"
              :title="headerTitle(column.date)"
              @click="startEdit(column.id)"
            >
              <span class="weekday">{{ weekdayShort(column.date) || '—' }}</span>
              <span class="date-text">{{ formatDate(column.date) || 'нет даты' }}</span>
            </div>

            <input
              v-else
              :ref="(el) => (editEl = el)"
              v-model="column.date"
              class="date-edit"
              type="date"
              @blur="stopEdit"
              @keydown.enter="stopEdit"
              @keydown.esc="stopEdit"
            />
          </th>
          <th class="col-total">
            <button class="add" title="Добавить дату" @click="addAndEdit">+ Дата</button>
          </th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="(row, index) in state.rows" :key="row.id">
          <td class="col-num">{{ index + 1 }}</td>
          <th class="col-name">
            <div class="name-cell">
              <span class="name-blank"></span>
              <button
                class="mark"
                :class="{ active: isRowFull(row) }"
                :disabled="!state.columns.length"
                :title="isRowFull(row) ? 'Снять все отметки в строке' : 'Отметить всё в строке'"
                @click="toggleRow(row.id)"
              >
                ✓
              </button>
              <button class="remove" title="Удалить человека" @click="removeRow(row.id)">×</button>
            </div>
          </th>
          <td
            v-for="column in state.columns"
            :key="column.id"
            class="check"
            :class="{ weekend: isWeekend(column.date) }"
          >
            <label>
              <input v-model="row.checks[column.id]" type="checkbox" />
            </label>
          </td>
          <td class="total">{{ rowTotal(row) }}</td>
        </tr>

        <tr v-if="!state.rows.length">
          <td class="empty" :colspan="state.columns.length + 3">
            {{
              state.columns.length
                ? 'Даты есть — добавьте строки кнопкой «+ Человек».'
                : 'Таблица пуста. Нажмите «Заполнить месяц» и добавьте строки.'
            }}
          </td>
        </tr>
      </tbody>

      <tfoot>
        <tr>
          <td class="col-num"></td>
          <th class="col-name">
            <button class="add" title="Добавить человека" @click="addRow()">+ Человек</button>
          </th>
          <td
            v-for="column in state.columns"
            :key="column.id"
            class="total"
            :class="{ weekend: isWeekend(column.date) }"
          >
            {{ columnTotals[column.id] }}
          </td>
          <td class="grand-total">{{ grandTotal }}</td>
        </tr>
      </tfoot>
    </table>

  </div>
</template>

<style scoped>
.sheet {
  overflow-x: auto;
  /* Hug the table instead of stretching: a fixed-layout table handed spare
     width distributes it across every column, which would undo the 32px dates. */
  width: fit-content;
  max-width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
}

table {
  border-collapse: collapse;
  /* Fixed layout keeps the date columns at exactly 32px instead of letting the
     browser widen them to fill the container. */
  table-layout: fixed;
  width: auto;
  /* Floor so a nearly empty sheet still reads as a table, not a sliver. */
  min-width: 420px;
}

th,
td {
  border: 1px solid var(--border);
  padding: 3px 2px;
  text-align: center;
  font-weight: 400;
  font-size: 13px;
}

thead th,
tfoot th,
tfoot td {
  background: var(--total-bg);
}

/* Обе левые колонки залипают при горизонтальной прокрутке: № у края,
   ФИО сразу за ней. */
.col-num {
  width: 34px;
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--surface);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.col-name {
  width: 190px;
  text-align: left;
  position: sticky;
  left: 34px;
  z-index: 2;
  background: var(--surface);
  padding: 3px 6px;
}

thead .col-num,
tfoot .col-num,
thead .col-name,
tfoot .col-name {
  background: var(--total-bg);
}

.col-date {
  width: 32px;
  position: relative;
  vertical-align: bottom;
  padding: 4px 0 6px;
}

.col-total {
  width: 50px;
}

/* Rotated header: reads bottom-to-top, the usual convention for narrow columns. */
.date-head {
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  margin: 0 auto;
}

.date-head:hover .date-text {
  color: var(--accent);
}

.weekday {
  font-size: 11px;
  color: var(--muted);
  text-transform: lowercase;
}

.date-text {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Wider than its cell on purpose — it only exists while the picker is open. */
.date-edit {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: 145px;
  z-index: 6;
  font: inherit;
  padding: 4px 6px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--surface);
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ФИО не заполняются в приложении: ячейка остаётся пустой и в таблице,
   и в выгрузке — под запись от руки или правку в Excel. */
.name-blank {
  flex: 1;
  min-width: 0;
}

.check {
  padding: 0;
}

.check label {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  cursor: pointer;
}

.check input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.weekend {
  background: var(--weekend-bg);
}

.total {
  background: var(--total-bg);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

tfoot .total.weekend {
  background: var(--weekend-total-bg);
}

.grand-total {
  background: var(--grand-bg);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.empty {
  color: var(--muted);
  padding: 20px;
}

.add {
  border: 1px dashed var(--accent);
  background: transparent;
  color: var(--accent);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 12px;
  white-space: nowrap;
}

.add:hover {
  background: var(--surface);
}

.remove {
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
  line-height: 1;
  padding: 1px 4px;
  border-radius: 4px;
}

.col-date .remove {
  position: absolute;
  top: 1px;
  left: 50%;
  transform: translateX(-50%);
  opacity: 0;
  padding: 0 3px;
}

.col-date:hover .remove,
.col-name:hover .remove,
.col-name:hover .mark {
  opacity: 1;
}

/* Кнопки в строке появляются при наведении, чтобы не отнимать ширину у имени.
   Полностью отмеченная строка — исключение: её галочка видна всегда. */
.name-cell .remove,
.name-cell .mark {
  opacity: 0;
}

.mark {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 4px;
}

.mark:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.mark.active {
  opacity: 1;
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.mark:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.col-name:hover .mark:disabled {
  opacity: 0.35;
}

.remove:hover {
  background: #fee2e2;
  color: #b91c1c;
}
</style>
