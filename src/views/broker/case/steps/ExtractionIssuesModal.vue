<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZModal from '@/components/z/ZModal.vue'
import type { Import40ExtractionConflict, Import40ExtractionResult } from '@/api/import40'

// Замечания по пакету документов после автозаполнения ДТ (прежнее окно issues карточки): поля, где документы
// разошлись (выбрано одно значение, остальные — для сверки), и прочие предупреждения.
// Закрытие любым способом (кнопка, крестик, Escape, фон) — одно событие close: родитель переходит к созданной ДТ.
defineProps<{ open: boolean; issues: Import40ExtractionResult | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const quoted = (value: string | null | undefined, source: string | null | undefined) =>
  `«${value ?? '—'}»${source ? ` (${source})` : ''}`
const conflictLine = (c: Import40ExtractionConflict) =>
  `${quoted(c.value, c.sourceDocument)} — ${c.alternatives.map((a) => quoted(a.value, a.sourceDocument)).join(', ')}`
const onOpen = (v: boolean) => { if (!v) emit('close') }
</script>

<template>
  <ZModal :open="open" :title="t('import40Case.issuesTitle')" :width="760" data-extraction-issues @update:open="onOpen">
    <div class="flex flex-col gap-4 text-sm text-ink">
      <section v-if="issues?.conflicts.length" data-issues-conflicts>
        <p class="m-0 mb-2 text-ink-2">{{ t('import40Case.conflictsIntro') }}</p>
        <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5">
          <li v-for="(c, i) in issues.conflicts" :key="`c${i}`" class="[overflow-wrap:anywhere]">
            <strong class="font-semibold">{{ c.fieldLabel }}</strong>: {{ conflictLine(c) }}
          </li>
        </ul>
      </section>
      <section v-if="issues?.warnings.length" data-issues-warnings>
        <p class="m-0 mb-2 text-ink-2">{{ t('import40Case.warningsIntro') }}</p>
        <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5">
          <li v-for="(w, i) in issues.warnings" :key="`w${i}`" class="[overflow-wrap:anywhere]">{{ w }}</li>
        </ul>
      </section>
    </div>
    <template #footer>
      <ZButton variant="primary" class="max-sm:min-h-11 max-sm:w-full" data-issues-ok @click="emit('close')">{{ t('import40Case.issuesOk') }}</ZButton>
    </template>
  </ZModal>
</template>
