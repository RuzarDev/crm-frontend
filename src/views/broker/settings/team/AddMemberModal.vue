<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCopy, PhPassword } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import { extractServerText } from '@/api/client'
import { permissionsApi } from '@/api/permissions'
import { usersApi } from '@/api/users'
import { useAuthStore } from '@/stores/auth'
import { message } from '@/ui/message'
import { MIN_PASSWORD, STAFF_ROLES, generatePassword, orderRoles, systemRoleFor } from './team'
import { useTeamRoleLabels } from './useTeamRoleLabels'

// «Добавить сотрудника» (users.write): логин, пароль (≥ 8, проверка на месте, «Сгенерировать»), повтор, роли — флажки
// бизнес-ролей (≥ 1). Флажок «Администратор» — только администратору. Сохранение: POST auth/register/staff (тип аккаунта по
// основной роли), затем PUT users/{id}/business-roles со всеми выбранными ролями. Ошибки сервера показываются в окне
// (администратора заводит только администратор — 403 с текстом сервера).
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; created: [member: { id: string | null; username: string }] }>()

const { t } = useI18n()
const auth = useAuthStore()
const { roleLabel, roleScope } = useTeamRoleLabels()
const isAdmin = computed(() => (auth.role ?? '').trim().toLowerCase() === 'administrator')

// Каталог ролей с сервера (единый источник); пока не пришёл или не загрузился — запасной список.
const catalog = ref<{ code: string; scope: string }[]>([])
const roleOrder = computed<string[]>(() => (catalog.value.length ? catalog.value.map((r) => r.code) : [...STAFF_ROLES]))
const roleOptions = computed(() => roleOrder.value.map((code) => ({
  code,
  label: roleLabel(code),
  scope: roleScope(code, catalog.value.find((r) => r.code === code)?.scope ?? ''),
})))
let catalogLoaded = false
const loadCatalog = async () => {
  if (catalogLoaded) return
  try {
    const items = await permissionsApi.catalog({ silent: true })
    catalog.value = items.filter((r) => r.code !== 'client' && r.code !== 'expeditor').map((r) => ({ code: r.code, scope: r.scope }))
    catalogLoaded = true
  } catch { /* запасной список ролей */ }
}

const draft = reactive({ username: '', password: '', repeat: '', roles: [] as string[], admin: false })
const tried = ref(false)
const saving = ref(false)
const serverError = ref('')
const generated = ref('')

const reset = () => {
  draft.username = ''
  draft.password = ''
  draft.repeat = ''
  draft.roles = []
  draft.admin = false
  tried.value = false
  serverError.value = ''
  generated.value = ''
}
watch(() => props.open, (o) => { if (o) { reset(); void loadCatalog() } }, { immediate: true })

const usernameError = computed(() => (tried.value && !draft.username.trim() ? t('broker.settings.team.addModal.usernameRequired') : ''))
// Длину проверяем на месте, как только начали вводить; «повтор» — когда его начали заполнять или была попытка сохранить.
const passwordError = computed(() => {
  if (!draft.password) return tried.value ? t('broker.settings.team.addModal.passwordShort') : ''
  return draft.password.length < MIN_PASSWORD ? t('broker.settings.team.addModal.passwordShort') : ''
})
const repeatError = computed(() => ((tried.value || draft.repeat) && draft.repeat !== draft.password ? t('broker.settings.team.addModal.passwordMismatch') : ''))
// Администратору бизнес-роль не обязательна (у него все права); остальным нужна хотя бы одна.
const rolesError = computed(() => (tried.value && !draft.admin && !draft.roles.length ? t('broker.settings.team.addModal.rolesRequired') : ''))

const toggleRole = (code: string, on: boolean) => {
  draft.roles = on ? [...draft.roles, code] : draft.roles.filter((r) => r !== code)
}

// Набрали пароль руками — сгенерированный больше не актуален: строку с ним и «Скопировать» убираем.
const onPasswordInput = (v: string) => {
  draft.password = v
  generated.value = ''
}
const generate = () => {
  const p = generatePassword()
  draft.password = p
  draft.repeat = p
  generated.value = p
}
const copy = async () => {
  try {
    await navigator.clipboard.writeText(generated.value)
    message.success(t('broker.settings.team.addModal.copied'))
  } catch { /* нет доступа к буферу — пароль виден на экране */ }
}

const errorText = (err: unknown): string =>
  extractServerText((err as { response?: { data?: unknown } })?.response?.data) ?? t('broker.settings.team.addModal.createFailed')

const submit = async () => {
  if (saving.value) return
  tried.value = true
  if (!draft.username.trim() || passwordError.value || repeatError.value || rolesError.value) return
  const username = draft.username.trim()
  const roles = orderRoles(draft.roles, roleOrder.value)
  saving.value = true
  serverError.value = ''
  try {
    await usersApi.registerStaff({
      username,
      password: draft.password,
      role: systemRoleFor(roles[0], draft.admin),
      ...(roles[0] ? { businessRole: roles[0] } : {}),
    })
  } catch (err) {
    serverError.value = errorText(err)
    saving.value = false
    return
  }
  // Сотрудник создан. Регистрация не возвращает id — берём его из списка команды по логину.
  let id: string | null = null
  try {
    const team = await usersApi.team({ silent: true })
    id = team.find((m) => m.username.toLowerCase() === username.toLowerCase())?.id ?? null
    if (id && roles.length) await permissionsApi.setUserRoles(id, roles, { silent: true })
  } catch (err) {
    message.warning(t('broker.settings.team.addModal.rolesFailed', { text: errorText(err) }))
  } finally {
    saving.value = false
  }
  emit('created', { id, username })
  emit('update:open', false)
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('broker.settings.team.addModal.title')"
    :width="520"
    :ok-text="t('broker.settings.team.addModal.create')"
    :cancel-text="t('admin.otmena')"
    :confirm-loading="saving"
    data-add-member-modal
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <div class="flex flex-col gap-4 pb-2" data-add-member-form>
      <ZAlert v-if="serverError" type="error" show-icon :message="serverError" data-add-member-error />
      <ZField :label="t('broker.settings.team.addModal.username')" required :error="usernameError">
        <ZInput
          :value="draft.username"
          autocomplete="off"
          :placeholder="t('broker.settings.team.addModal.usernamePh')"
          mono
          class="max-sm:h-11"
          data-add-username
          @update:value="draft.username = $event"
        />
      </ZField>
      <ZField :label="t('broker.settings.team.addModal.password')" required :error="passwordError">
        <div class="flex gap-2">
          <ZInput
            :value="draft.password"
            type="password"
            autocomplete="new-password"
            :placeholder="t('broker.settings.team.addModal.passwordPh')"
            class="min-w-0 flex-1 max-sm:h-11"
            data-add-password
            @update:value="onPasswordInput"
          />
          <ZButton class="shrink-0 max-sm:h-11 max-sm:px-4" data-add-generate @click="generate">
            <template #icon><PhPassword :size="16" aria-hidden="true" /></template>
            {{ t('broker.settings.team.addModal.generate') }}
          </ZButton>
        </div>
      </ZField>
      <p v-if="generated" class="m-0 -mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2" data-add-generated>
        <span class="font-mono" data-add-generated-text>{{ t('broker.settings.team.addModal.generated', { password: generated }) }}</span>
        <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-add-copy @click="copy">
          <template #icon><PhCopy :size="14" aria-hidden="true" /></template>
          {{ t('broker.settings.team.addModal.copy') }}
        </ZButton>
      </p>
      <ZField :label="t('broker.settings.team.addModal.repeat')" required :error="repeatError">
        <ZInput
          :value="draft.repeat"
          type="password"
          autocomplete="new-password"
          class="max-sm:h-11"
          data-add-repeat
          @update:value="draft.repeat = $event"
        />
      </ZField>
      <fieldset class="m-0 flex min-w-0 flex-col gap-1 border-0 p-0" :aria-describedby="rolesError ? 'add-member-roles-error' : undefined" data-add-roles>
        <legend class="mb-1.5 p-0 text-sm font-medium text-ink-2">{{ t('broker.settings.team.addModal.roles') }}</legend>
        <ZCheckbox
          v-for="r in roleOptions"
          :key="r.code"
          :checked="draft.roles.includes(r.code)"
          class="min-h-11 items-start gap-2.5 border-b border-line py-2 last:border-b-0"
          :data-add-role="r.code"
          @update:checked="toggleRole(r.code, $event)"
        >
          <span class="block font-semibold text-ink">{{ r.label }}</span>
          <span v-if="r.scope" class="block text-xs font-normal text-muted">{{ r.scope }}</span>
        </ZCheckbox>
        <p v-if="rolesError" id="add-member-roles-error" role="alert" class="m-0 mt-1 text-xs text-danger" data-add-roles-error>{{ rolesError }}</p>
        <p class="m-0 mt-1 text-xs text-muted">{{ t('broker.settings.team.addModal.rolesHint') }}</p>
      </fieldset>
      <ZCheckbox
        v-if="isAdmin"
        :checked="draft.admin"
        class="min-h-11 items-start gap-2.5"
        data-add-admin
        @update:checked="draft.admin = $event"
      >
        <span class="block font-semibold text-ink">{{ t('broker.settings.team.addModal.admin') }}</span>
        <span class="block text-xs font-normal text-muted">{{ t('broker.settings.team.addModal.adminHint') }}</span>
      </ZCheckbox>
    </div>
  </ZModal>
</template>
