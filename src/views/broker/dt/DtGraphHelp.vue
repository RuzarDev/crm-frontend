<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { PhQuestion } from '@phosphor-icons/vue'
import ZPopover from '@/components/z/ZPopover.vue'
import ZSpin from '@/components/z/ZSpin.vue'
import ZButton from '@/components/z/ZButton.vue'
import { useAuthStore } from '@/stores/auth'
import { sanitizeHtml } from '@/ui/sanitizeHtml'
import type { DtGuideEntry } from '@/types/api'
import { canManageDeclarations, dtUserFrom } from '@/views/import40/dtAccess'
import { loadDtGuide } from './dtGuideCache'

// Справка по графе (порядок заполнения по КТС 257): «?» у подписи → окно с текстом графы. Текст грузится при
// первом открытии и кэшируется на сессию (dtGuideCache), ссылка ведёт в «Порядок заполнения ДТ» на эту графу.
// Справочник ДТ открыт только декларанту (маршрут /dt-guide) — остальным ссылку не показываем.
const props = defineProps<{ graph: string }>()
const { t } = useI18n()
const auth = useAuthStore()

const open = ref(false)
const entry = ref<DtGuideEntry | null>(null)
const loading = ref(false)
const failed = ref(false)
let seq = 0

const load = async () => {
  if (entry.value || loading.value) return
  const my = ++seq
  loading.value = true
  failed.value = false
  try {
    const e = await loadDtGuide(props.graph)
    if (my === seq) entry.value = e
  } catch {
    if (my === seq) failed.value = true
  } finally {
    if (my === seq) loading.value = false
  }
}
watch(open, (v) => { if (v) void load() })

const html = computed(() => sanitizeHtml(entry.value?.html))
const title = computed(() => `${t('broker.dt.guide.title', { n: props.graph })}${entry.value?.title ? ` — ${entry.value.title}` : ''}`)
const canOpenGuide = computed(() => canManageDeclarations(dtUserFrom(auth)))
</script>

<template>
  <ZPopover v-model:open="open" side="right" align="start" :width="460" content-class="p-4" focus-content>
    <template #trigger>
      <button
        type="button"
        :aria-label="t('broker.dt.guide.label', { n: graph })"
        class="m-0.5 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center self-center rounded-pill border-0 bg-transparent p-0 text-muted outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus max-sm:size-6"
        data-dt-guide-trigger
      >
        <PhQuestion :size="14" weight="bold" />
      </button>
    </template>
    <div class="flex flex-col gap-3" data-dt-guide>
      <p class="m-0 text-sm font-semibold text-ink">{{ title }}</p>
      <div v-if="loading" class="flex justify-center py-4"><ZSpin /></div>
      <div v-else-if="failed" class="flex flex-wrap items-center gap-3 text-sm text-muted" role="alert" data-dt-guide-error>
        <span class="min-w-0 flex-1">{{ t('broker.dt.guide.notFound') }}</span>
        <ZButton size="sm" @click="load">{{ t('broker.dt.page.retry') }}</ZButton>
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -- очищено sanitizeHtml: белый список тегов, без скриптов и on* -->
      <div v-else-if="html" class="dt-guide-body max-h-96 overflow-y-auto text-[13px] leading-relaxed text-ink-2" data-dt-guide-html v-html="html" />
      <RouterLink
        v-if="canOpenGuide"
        :to="{ path: '/dt-guide', query: { graph } }"
        class="w-fit rounded-field text-sm font-medium text-zircon-ink outline-hidden underline-offset-2 hover:underline focus-visible:shadow-focus"
        data-dt-guide-link
      >{{ t('broker.dt.guide.open', { n: graph }) }}</RouterLink>
    </div>
  </ZPopover>
</template>

<style scoped>
.dt-guide-body :deep(p) { margin: 0 0 8px; }
.dt-guide-body :deep(ul),
.dt-guide-body :deep(ol) { margin: 0 0 8px; padding-left: 20px; }
.dt-guide-body :deep(table) { border-collapse: collapse; width: 100%; margin: 0 0 8px; font-size: 12px; display: block; overflow-x: auto; }
.dt-guide-body :deep(td),
.dt-guide-body :deep(th) { border: 1px solid var(--color-line); padding: 3px 6px; vertical-align: top; }
.dt-guide-body :deep(img) { max-width: 100%; height: auto; }
.dt-guide-body { overflow-wrap: anywhere; }
</style>
