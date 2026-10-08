<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { import40Api } from '@/api/import40'
import { referencesApi } from '@/api/references'
import { message } from '@/ui/message'

// Окно «Новая заявка» за клиента (сотрудник): клиент, груз, необязательный пост → создание → карточка заявки.
// Справочники (клиенты, посты) грузятся при первом открытии окна, а не при открытии списка.
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const router = useRouter()

const draft = reactive<{ clientId: string | null; cargo: string; post: string | null }>({ clientId: null, cargo: '', post: null })
const clientOptions = ref<{ value: string; label: string }[]>([])
const postOptions = ref<{ value: string; label: string }[]>([])
const clientNames = new Map<string, string>()
const clientsLoading = ref(false)
const creating = ref(false)
const cargoTouched = ref(false)
let loaded = false

const loadRefs = async () => {
  if (loaded) return
  loaded = true
  clientsLoading.value = true
  try {
    // Посты — вспомогательный справочник: сбой не мешает создать заявку (как раньше).
    const [clients, posts] = await Promise.all([
      import40Api.listClients(),
      referencesApi.listCustomsPosts().catch(() => []),
    ])
    clientOptions.value = clients.map((c) => {
      const name = c.companyName || c.username
      clientNames.set(c.id, name)
      return { value: c.id, label: c.companyName ? `${c.companyName} (${c.username})` : c.username }
    })
    postOptions.value = posts.map((p) => ({ value: p.name, label: p.name }))
  } catch {
    // Ошибку показал общий перехватчик; следующее открытие окна пробует снова.
    loaded = false
  } finally {
    clientsLoading.value = false
  }
}

watch(() => props.open, (v) => {
  if (!v) return
  draft.clientId = null
  draft.cargo = ''
  draft.post = null
  cargoTouched.value = false
  void loadRefs()
}, { immediate: true })

const cargoTooShort = computed(() => draft.cargo.trim().length < 2)
const canSubmit = computed(() => !!draft.clientId && !cargoTooShort.value)
// Ошибка по месту: когда уже что-то набрано или поле покинули пустым.
const cargoError = computed(() => (cargoTooShort.value && (cargoTouched.value || draft.cargo.length > 0) ? t('broker.requests.create.cargoMin') : ''))

const submit = async () => {
  cargoTouched.value = true
  if (!canSubmit.value || creating.value) return
  creating.value = true
  try {
    const created = await import40Api.create({
      clientId: draft.clientId!,
      clientName: clientNames.get(draft.clientId!) ?? '',
      cargo: draft.cargo.trim(),
      // Очищенный пост — undefined/null: пустая строка, а не падение на trim().
      post: (draft.post ?? '').trim(),
    })
    emit('update:open', false)
    message.success(t('import40List.created'))
    void router.push(`/import-40/${created.id}`)
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем.
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('broker.requests.create.title')"
    :width="520"
    :ok-text="t('broker.requests.create.submit')"
    :cancel-text="t('broker.requests.create.cancel')"
    :confirm-loading="creating"
    :ok-button-props="{ disabled: !canSubmit }"
    data-create-request
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <div class="flex flex-col gap-4 pb-2">
      <p class="m-0 text-sm text-ink-3">{{ t('broker.requests.create.hint') }}</p>
      <ZField :label="t('broker.requests.create.client')" required>
        <ZSelect
          :value="draft.clientId"
          :options="clientOptions"
          show-search
          :loading="clientsLoading"
          :placeholder="t('broker.requests.create.selectClient')"
          data-create-client
          @update:value="draft.clientId = ($event as string | null)"
        />
      </ZField>
      <ZField :label="t('broker.requests.create.cargo')" required :error="cargoError">
        <ZInput
          :value="draft.cargo"
          :placeholder="t('broker.requests.create.cargoPh')"
          data-create-cargo
          @update:value="draft.cargo = $event"
          @blur="cargoTouched = true"
          @press-enter="submit"
        />
      </ZField>
      <ZField :label="`${t('broker.requests.create.post')} (${t('broker.requests.create.optional')})`">
        <ZSelect
          :value="draft.post"
          :options="postOptions"
          show-search
          allow-clear
          :placeholder="t('broker.requests.create.postPh')"
          data-create-post
          @update:value="draft.post = ($event as string | null)"
        />
      </ZField>
    </div>
  </ZModal>
</template>
