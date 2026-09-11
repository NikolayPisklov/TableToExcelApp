<script setup>
import { computed, ref } from 'vue'
import SheetTable from './components/SheetTable.vue'
import { useSheet } from './composables/useSheet.js'
import { exportToExcel } from './utils/exportToExcel.js'
import { importFromExcel } from './utils/importFromExcel.js'
import { monthLabel, plural } from './utils/date.js'

const { state, replaceAll, clearAll, clearDates, fillMonth } = useSheet()

const fileInput = ref(null)
const busy = ref('')
const error = ref('')
const notice = ref('')

const hasData = computed(() => state.rows.length > 0 || state.columns.length > 0)
const currentMonth = monthLabel()

function handleFillMonth() {
  error.value = ''
  const added = fillMonth()
  const month = currentMonth.toLowerCase()
  notice.value = added
    ? `Добавлено ${added} ${plural(added, 'рабочий день', 'рабочих дня', 'рабочих дней')} ` +
      `за ${month}. Выходные пропущены.`
    : `Все рабочие дни за ${month} уже в таблице.`
}
const canExport = computed(() => state.rows.length > 0 && state.columns.length > 0)

async function handleExport() {
  busy.value = 'export'
  error.value = ''
  notice.value = ''
  try {
    await exportToExcel(state)
  } catch (cause) {
    error.value = 'Не удалось создать файл. Подробности в консоли.'
    console.error(cause)
  } finally {
    busy.value = ''
  }
}

function pickFile() {
  error.value = ''
  notice.value = ''
  fileInput.value?.click()
}

async function handleImport(event) {
  const file = event.target.files?.[0]
  // Reset immediately so picking the same file twice still fires a change event.
  event.target.value = ''
  if (!file) return

  if (hasData.value && !confirm('Импорт заменит текущую таблицу. Продолжить?')) return

  busy.value = 'import'
  error.value = ''
  notice.value = ''
  try {
    const sheet = await importFromExcel(file)
    replaceAll(sheet)
    const lines = sheet.rows.length
    const dates = sheet.columns.length
    notice.value =
      `Импортировано: ${lines} ${plural(lines, 'строка', 'строки', 'строк')} ` +
      `и ${dates} ${plural(dates, 'дата', 'даты', 'дат')} из файла «${file.name}». ` +
      'ФИО не переносятся.'
  } catch (cause) {
    error.value = cause?.message || 'Не удалось прочитать файл. Это точно .xlsx?'
    console.error(cause)
  } finally {
    busy.value = ''
  }
}

function handleClearDates() {
  const count = state.columns.length
  if (!confirm(`Удалить все даты (${count}) вместе с отметками? ФИО останутся.`)) return
  clearDates()
  error.value = ''
  notice.value =
    `Удалено ${count} ${plural(count, 'дата', 'даты', 'дат')} вместе с отметками. ФИО остались.`
}

function handleClear() {
  if (confirm('Очистить всю таблицу — и даты, и список людей?')) {
    clearAll()
    error.value = ''
    notice.value = ''
  }
}
</script>

<template>
  <main>
    <header>
      <div>
        <h1>Конструктор табеля</h1>
        <p>Добавляйте людей и даты, отмечайте ячейки — итоги считаются как по строкам, так и по датам.</p>
      </div>

      <div class="actions">
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          @change="handleImport"
        />
        <button
          class="ghost"
          :disabled="!!busy"
          :title="`Добавить все рабочие дни: ${currentMonth}`"
          @click="handleFillMonth"
        >
          Заполнить месяц
        </button>
        <button class="ghost" :disabled="!!busy" @click="pickFile">
          {{ busy === 'import' ? 'Импорт…' : 'Импорт из Excel' }}
        </button>
        <button
          class="ghost"
          :disabled="!!busy || !state.columns.length"
          title="Удалить все столбцы с датами, оставив список людей"
          @click="handleClearDates"
        >
          Очистить даты
        </button>
        <button class="ghost danger" :disabled="!!busy || !hasData" @click="handleClear">
          Очистить всё
        </button>
        <button
          class="primary"
          :disabled="!canExport || !!busy"
          :title="canExport ? 'Скачать как .xlsx' : 'Добавьте хотя бы одного человека и одну дату'"
          @click="handleExport"
        >
          {{ busy === 'export' ? 'Экспорт…' : 'Экспорт в Excel' }}
        </button>
      </div>
    </header>

    <p v-if="error" class="banner error" role="alert">{{ error }}</p>
    <p v-else-if="notice" class="banner notice">{{ notice }}</p>

    <SheetTable />

    <p class="footnote">
      Таблица не сохраняется: после перезагрузки страницы она будет пустой.
      Чтобы не потерять данные, выгрузите их в Excel.
    </p>
  </main>
</template>

<style scoped>
main {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px 20px 64px;
}

header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

h1 {
  margin: 0 0 6px;
  font-size: 24px;
}

header p {
  margin: 0;
  color: var(--muted);
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.file-input {
  display: none;
}

.actions button {
  border-radius: 8px;
  padding: 9px 16px;
  font-weight: 500;
  white-space: nowrap;
  border: 1px solid var(--border);
}

.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.primary:hover:not(:disabled) {
  background: var(--accent-strong);
}

.ghost {
  background: var(--surface);
  color: var(--text);
}

.ghost:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.danger:hover:not(:disabled) {
  border-color: #b91c1c;
  color: #b91c1c;
}

.actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.banner {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: 8px;
}

.error {
  background: #fee2e2;
  color: #b91c1c;
}

.notice {
  background: #eef2ff;
  color: #3730a3;
}

.footnote {
  margin: 12px 2px 0;
  font-size: 13px;
  color: var(--muted);
}
</style>
