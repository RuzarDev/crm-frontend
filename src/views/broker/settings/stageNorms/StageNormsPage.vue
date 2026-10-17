<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { stagesApi, type StageNorm, type StageNormKey } from '@/api/stages'
import { useAuthStore } from '@/stores/auth'
import { message } from '@/ui/message'
import { durationText } from '@/utils/import40StageModel'

// «Нормы этапов» раздела «Настройки» (хронометраж, 17.10): сколько часов заявка может быть на шаге 1–6 и на доработке
// у клиента. Просрочка видна в карточке заявки и в «Распределении». Менять — руководитель (import40.assign) и админ,
// как проверяет сервер (PUT import40/stage-norms); остальным — только чтение.
const { t } = useI18n()
const auth = useAuthStore()
const canEdit = computed(() => auth.hasPermission('import40.assign'))

const state = ref<'loading' | 'ready' | 'error'>('loading')
const saved = ref<StageNorm[]>([])
const draft = reactive<Record<string, number | null>>({})
const saving = ref(false)

const apply = (list: StageNorm[]) => {
  saved.value = list
  for (const n of list) draft[n.key] = n.hours
}
const load = async () => {
  state.value = 'loading'
  try {
    apply(await stagesApi.norms({ silent: true }))
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const label = (key: StageNormKey) =>
  key === 'rework' ? t('stages.norms.rework') : `${key.slice(4)}. ${t(`enum.step.s${key.slice(4)}`)}`
const valid = (v: number | null | undefined) => v != null && Number.isInteger(v) && v >= 1 && v <= 2000
const changed = computed(() => saved.value.filter((n) => draft[n.key] !== n.hours))
const invalid = computed(() => saved.value.some((n) => !valid(draft[n.key])))

const reset = () => apply(saved.value)
const save = async () => {
  if (!canEdit.value || saving.value || invalid.value || !changed.value.length) return
  saving.value = true
  try {
    apply(await stagesApi.saveNorms(changed.value.map((n) => ({ key: n.key, hours: draft[n.key] as number }))))
    message.success(t('stages.norms.saved'))
  } catch {
    // Текст ошибки показал общий перехватчик (api/client.ts).
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4" data-stage-norms-page>
    <div class="min-w-0">
      <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('stages.norms.title') }}</h1>
      <p class="m-0 mt-1 max-w-[46rem] text-sm text-muted">{{ t('stages.norms.lead') }}</p>
      <p v-if="!canEdit" class="m-0 mt-1 text-sm text-ink-2" data-norms-readonly>{{ t('stages.norms.readOnly') }}</p>
    </div>

    <div v-if="state === 'error'" role="alert" class="flex max-w-[40rem] flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-norms-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('stages.norms.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-norms-retry @click="load">{{ t('stages.norms.retry') }}</ZButton>
    </div>
    <div v-else-if="state === 'loading'" class="max-w-[40rem] rounded-panel border border-line bg-surface p-5"><ZSkeleton :lines="7" height="18px" /></div>

    <form v-else class="flex max-w-[40rem] flex-col rounded-panel border border-line bg-surface" novalidate data-norms-form @submit.prevent="save">
      <div
        v-for="n in saved"
        :key="n.key"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3 last:border-b-0 max-sm:px-4"
        :data-norm="n.key"
      >
        <label :for="`norm-${n.key}`" class="min-w-0 flex-1 text-sm">
          <span class="block font-medium text-ink">{{ label(n.key) }}</span>
          <span class="block text-xs text-muted">
            <template v-if="n.key === 'rework'">{{ t('stages.norms.reworkHint') }} · </template>{{ t('stages.norms.defaultHint', { n: n.defaultHours }) }}
            <template v-if="valid(draft[n.key])"> · {{ durationText((draft[n.key] as number) * 60, t) }}</template>
          </span>
          <span v-if="!valid(draft[n.key])" class="block text-xs text-tone-danger-fg" data-norm-error>{{ t('stages.norms.invalid') }}</span>
        </label>
        <div class="flex items-center gap-2">
          <ZNumber
            :id="`norm-${n.key}`"
            v-model:value="draft[n.key]"
            :min="1"
            :max="2000"
            :disabled="!canEdit"
            class="w-28 max-sm:h-11"
            :data-norm-input="n.key"
          />
          <span class="text-sm text-muted">{{ t('stages.norms.hours') }}</span>
        </div>
      </div>
      <div v-if="canEdit" class="flex flex-wrap justify-end gap-2 px-5 py-3 max-sm:px-4">
        <ZButton :disabled="!changed.length || saving" class="max-sm:h-11 max-sm:flex-1" data-norms-reset @click="reset">{{ t('stages.norms.reset') }}</ZButton>
        <ZButton
          variant="primary"
          html-type="submit"
          :loading="saving"
          :disabled="!changed.length || invalid"
          class="max-sm:h-11 max-sm:flex-1"
          data-norms-save
        >{{ t('stages.norms.save') }}</ZButton>
      </div>
    </form>
  </div>
</template>
