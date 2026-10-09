<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowsSplit, PhEye } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import { dtPath } from '@/views/broker/case/declarations'
import type { DtReadonlyReason } from './dtPageModel'

// Плашки над разделами ДТ (доска DtReadonly): «ДТ разделена — правки закрыты» со ссылками на ЕТТ и ВТО;
// «Только просмотр» с причиной (закреплена за …, этап …); 409 «изменена в другом окне» с «Перезагрузить»;
// ошибка сохранения с причиной и «Повторить».
interface DtLink { id: string; declarationNumber?: string | null }
defineProps<{
  caseId: string
  readonlyReason: DtReadonlyReason | null
  assignedName: string | null
  stage: string
  /** ДТ заменена разделением: ДТ ЕТТ и ВТО вместо неё; null — не разделена. */
  split: { ett: DtLink | null; vto: DtLink | null } | null
  conflict: boolean
  saveError: string | null
  saving: boolean
}>()
const emit = defineEmits<{ reload: []; retry: [] }>()
const { t } = useI18n()

const linkClass = 'rounded-[4px] font-mono text-zircon-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus'
</script>

<template>
  <div v-if="split || readonlyReason || conflict || saveError" class="flex flex-col gap-3" data-dt-banners>
    <div v-if="split" class="flex items-start gap-3 rounded-panel border border-line bg-sunken px-4 py-3 text-[13.5px] text-ink-2" role="status" data-dt-banner-split>
      <PhArrowsSplit :size="18" class="mt-px shrink-0 text-ink-3" aria-hidden="true" />
      <p class="m-0 min-w-0">
        <b class="font-semibold text-ink">{{ t('broker.dt.banners.splitTitle') }}</b>
        <template v-if="split.ett || split.vto">
          {{ ' ' }}{{ t('broker.dt.banners.splitInstead') }}
          <template v-if="split.ett">
            {{ t('broker.dt.header.tag.ett') }}
            <RouterLink :to="dtPath(caseId, split.ett.id)" :class="linkClass" data-dt-split-ett>{{ split.ett.declarationNumber || t('broker.dt.banners.noNumber') }}</RouterLink>
          </template>
          <template v-if="split.ett && split.vto"> {{ t('broker.dt.banners.splitAnd') }} </template>
          <template v-if="split.vto">
            {{ t('broker.dt.header.tag.vto') }}
            <RouterLink :to="dtPath(caseId, split.vto.id)" :class="linkClass" data-dt-split-vto>{{ split.vto.declarationNumber || t('broker.dt.banners.noNumber') }}</RouterLink>
          </template>.
        </template>
      </p>
    </div>

    <div v-if="readonlyReason" class="flex items-start gap-3 rounded-panel border border-tone-info-bg bg-tone-info-bg px-4 py-3 text-[13.5px] text-ink-2" role="status" data-dt-banner-view>
      <PhEye :size="18" class="mt-px shrink-0 text-zircon-ink" aria-hidden="true" />
      <p class="m-0 min-w-0">
        <b class="font-semibold text-ink">{{ t('broker.dt.banners.viewTitle') }}</b>{{ ' ' }}
        <template v-if="readonlyReason === 'assigned'">{{ t('broker.dt.banners.viewAssigned', { name: assignedName || t('broker.dt.banners.nobody'), stage }) }}</template>
        <template v-else-if="readonlyReason === 'role'">{{ t('broker.dt.banners.viewRole', { stage }) }}</template>
        <template v-else>{{ t('broker.dt.banners.viewClient') }}</template>
      </p>
    </div>

    <ZAlert v-if="conflict" type="warning" show-icon :message="t('broker.dt.banners.conflictTitle')" data-dt-conflict>
      {{ t('broker.dt.banners.conflictText') }}
      <template #action>
        <ZButton size="sm" variant="primary" class="max-sm:h-11" data-dt-conflict-reload @click="emit('reload')">{{ t('broker.dt.banners.conflictReload') }}</ZButton>
      </template>
    </ZAlert>
    <ZAlert v-else-if="saveError" type="error" show-icon :message="t('broker.dt.banners.saveFailedTitle')" data-dt-save-error>
      {{ t('broker.dt.banners.saveFailedText', { reason: saveError }) }}
      <template #action>
        <ZButton size="sm" variant="danger" :loading="saving" class="max-sm:h-11" data-dt-save-retry @click="emit('retry')">{{ t('broker.dt.banners.retry') }}</ZButton>
      </template>
    </ZAlert>
  </div>
</template>
