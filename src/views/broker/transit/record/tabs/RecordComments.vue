<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPaperPlaneTilt, PhTrash } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag, { type ZTone } from '@/components/z/ZTag.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import { reestrApi } from '@/api/reestr'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import type { ReestrCommentDto } from '@/types/api'
import { formatRole } from '@/utils/labels'
import { formatStamp } from '@/views/broker/packages/packages'
import { useRecordPermissions } from './recordPermissions'

// Вкладка «Комментарии» записи транзита: лента (автор, роль-тег, время, текст, удаление по правам) и поле ввода
// на 2000 знаков со счётчиком; Ctrl/⌘+Enter отправляет. Клиенту — только чтение, как в прежнем окне
// (readonly=true переводит в чтение и остальных: страница может так показать запись «на просмотре»).
// Список грузится при монтировании и сразу сообщает длину (count) — страница держит вкладку смонтированной скрытой,
// чтобы счётчик «Комментарии n» был виден до перехода во вкладку.
const MAX = 2000
const props = withDefaults(defineProps<{ reestrId: string; readonly?: boolean }>(), { readonly: false })
const emit = defineEmits<{ count: [n: number] }>()

const { t } = useI18n()
const { confirm } = useConfirm()
const perms = useRecordPermissions()

const comments = ref<ReestrCommentDto[]>([])
const loading = ref(false)
const loaded = ref(false)
const posting = ref(false)
const deleting = ref<string | null>(null)
const text = ref('')
let seq = 0
let alive = true
onBeforeUnmount(() => { alive = false })

const canPost = computed(() => !props.readonly && perms.canPostComment())
const canDelete = (c: ReestrCommentDto) => !props.readonly && perms.canDeleteComment(c)
const emitCount = () => emit('count', comments.value.length)

const load = async () => {
  if (!props.reestrId) return
  const mine = ++seq
  loading.value = true
  try {
    const list = await reestrApi.listComments(props.reestrId)
    if (mine !== seq || !alive) return
    comments.value = list
    emitCount()
  } catch {
    // тост показал перехватчик; лента остаётся как была
  } finally {
    if (mine === seq) {
      loading.value = false
      loaded.value = true
    }
  }
}
watch(() => props.reestrId, () => { comments.value = []; loaded.value = false; void load() }, { immediate: true })

const post = async () => {
  const body = text.value.trim()
  if (!body || posting.value || !canPost.value) return
  posting.value = true
  try {
    const created = await reestrApi.addComment(props.reestrId, body)
    comments.value.push(created)
    text.value = ''
    emitCount()
  } catch {
    message.error(t('sales.neUdalosOtpravitKommentariy'))
  } finally {
    posting.value = false
  }
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.isComposing) return
  e.preventDefault()
  void post()
}

const remove = async (c: ReestrCommentDto) => {
  if (deleting.value) return
  const ok = await confirm({ title: t('sales.udalitKommentariy'), okText: t('sales.da'), cancelText: t('sales.net'), danger: true })
  if (!ok) return
  deleting.value = c.id
  try {
    await reestrApi.deleteComment(props.reestrId, c.id)
    comments.value = comments.value.filter((x) => x.id !== c.id)
    emitCount()
  } catch {
    message.error(t('sales.neUdalosUdalitKommentariy'))
  } finally {
    deleting.value = null
  }
}

const TONE: Record<string, ZTone> = { administrator: 'neutral', expeditor: 'done', client: 'accent' }
const tone = (role: string): ZTone => TONE[role.trim().toLowerCase()] ?? 'info'
const roleLabel = (role: string) => formatRole(role)

const iconBtn = 'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors duration-150 hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none max-sm:size-11'
</script>

<template>
  <div class="flex flex-col gap-4" data-record-comments>
    <ZSkeleton v-if="!loaded" :lines="3" height="56px" />
    <ul v-else-if="comments.length" role="list" class="m-0 flex list-none flex-col gap-2.5 p-0" :aria-label="t('transit.kommentarii')">
      <li v-for="c in comments" :key="c.id" class="rounded-row border border-line bg-canvas px-3.5 py-3" data-comment>
        <div class="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span class="text-sm font-semibold text-ink" data-comment-author>{{ c.authorUsername }}</span>
          <ZTag :tone="tone(c.authorRole)" size="sm" data-comment-role>{{ roleLabel(c.authorRole) }}</ZTag>
          <span class="text-xs tabular-nums text-muted">{{ formatStamp(c.createdAtUtc) }}</span>
          <button
            v-if="canDelete(c)"
            type="button"
            :class="[iconBtn, 'ml-auto']"
            :disabled="deleting !== null"
            :aria-label="t('common.delete')"
            :title="t('common.delete')"
            data-comment-delete
            @click="remove(c)"
          >
            <PhTrash :size="17" aria-hidden="true" />
          </button>
        </div>
        <p class="m-0 text-sm leading-relaxed whitespace-pre-wrap text-ink [overflow-wrap:anywhere]" data-comment-text>{{ c.text }}</p>
      </li>
    </ul>
    <ZEmpty v-else :title="t('sales.netKommentariev')" data-comments-empty />

    <div v-if="canPost" class="flex flex-col gap-2 border-t border-line pt-4" data-comment-form>
      <ZTextarea
        v-model:value="text"
        :rows="3"
        :maxlength="MAX"
        :disabled="posting"
        :placeholder="t('sales.napisatKommentariy')"
        :aria-label="t('transit.kommentariy')"
        @keydown="onKeydown"
      />
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span class="text-xs tabular-nums text-muted" data-comment-count>{{ text.length }} / {{ MAX }}</span>
        <span class="text-xs text-muted max-sm:hidden">{{ t('broker.transitRecord.comments.shortcut') }}</span>
        <ZButton variant="primary" class="ml-auto max-sm:h-11 max-sm:flex-1" :loading="posting" :disabled="!text.trim()" data-comment-send @click="post">
          <template #icon><PhPaperPlaneTilt :size="16" aria-hidden="true" /></template>
          {{ t('sales.otpravit') }}
        </ZButton>
      </div>
    </div>
  </div>
</template>
