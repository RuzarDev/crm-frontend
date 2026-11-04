<script lang="ts">
import type { Import40ExtractionResult } from '@/api/import40'

/** Что показывает окно: один разбор или сводка по файлам («Каждый файл — отдельная ДТ»). */
export type ExtractionIssues = Pick<Import40ExtractionResult, 'warnings' | 'criticalWarnings' | 'conflicts'>
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZModal from '@/components/z/ZModal.vue'
import type { Import40ExtractionConflict } from '@/api/import40'

// Замечания по пакету документов после автозаполнения ДТ (прежнее окно issues карточки): поля, где документы
// разошлись (выбрано одно значение, остальные — для сверки), и прочие предупреждения.
// Закрытие любым способом (кнопка, крестик, Escape, фон) — одно событие close: родитель переходит к созданной ДТ.
const props = defineProps<{ open: boolean; issues: ExtractionIssues | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const quoted = (value: string | null | undefined, source: string | null | undefined) =>
  `«${value ?? '—'}»${source ? ` (${source})` : ''}`
const conflictLine = (c: Import40ExtractionConflict) =>
  `${quoted(c.value, c.sourceDocument)} — ${c.alternatives.map((a) => quoted(a.value, a.sourceDocument)).join(', ')}`
const onOpen = (v: boolean) => { if (!v) emit('close') }
// Важность error каталога флагов (04.11.2026): данные не получены — заметным блоком, остальные — списком ниже.
const critical = computed(() => props.issues?.criticalWarnings ?? [])
const warnings = computed(() => (props.issues?.warnings ?? []).filter((w) => !critical.value.includes(w)))
</script>

<template>
  <ZModal :open="open" :title="t('import40Case.issuesTitle')" :width="760" data-extraction-issues @update:open="onOpen">
    <div class="flex flex-col gap-4 text-sm text-ink">
      <section v-if="critical.length" class="rounded-row bg-tone-danger-bg px-3 py-2 text-tone-danger-fg" data-issues-critical>
        <p class="m-0 mb-2 font-medium">{{ t('import40Case.criticalIntro') }}</p>
        <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5">
          <li v-for="(w, i) in critical" :key="`e${i}`" class="[overflow-wrap:anywhere]">{{ w }}</li>
        </ul>
      </section>
      <section v-if="issues?.conflicts.length" data-issues-conflicts>
        <p class="m-0 mb-2 text-ink-2">{{ t('import40Case.conflictsIntro') }}</p>
        <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5">
          <li v-for="(c, i) in issues.conflicts" :key="`c${i}`" class="[overflow-wrap:anywhere]">
            <strong class="font-semibold">{{ c.fieldLabel }}</strong>: {{ conflictLine(c) }}
          </li>
        </ul>
      </section>
      <section v-if="warnings.length" data-issues-warnings>
        <p class="m-0 mb-2 text-ink-2">{{ t('import40Case.warningsIntro') }}</p>
        <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5">
          <li v-for="(w, i) in warnings" :key="`w${i}`" class="[overflow-wrap:anywhere]">{{ w }}</li>
        </ul>
      </section>
    </div>
    <template #footer>
      <ZButton variant="primary" class="max-sm:min-h-11 max-sm:w-full" data-issues-ok @click="emit('close')">{{ t('import40Case.issuesOk') }}</ZButton>
    </template>
  </ZModal>
</template>
