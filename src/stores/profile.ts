import { defineStore } from 'pinia'
import { ref } from 'vue'
import { profileApi } from '@/api/profile'
import type { ProfileDto, UpdateProfileRequest } from '@/types/api'
import { message } from '@/ui/message'
import { i18n } from '@/i18n'

export const useProfileStore = defineStore('profile', () => {
  const profile = ref<ProfileDto | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  // Профиль не загрузился: страница показывает ошибку с «Повторить», а не пустую форму, которую можно сохранить поверх данных.
  const loadError = ref(false)

  const fetch = async () => {
    loading.value = true
    try {
      // silent: ошибку рисует страница (свой блок с «Повторить»), общий тост не нужен.
      const res = await profileApi.get({ silent: true })
      profile.value = res.data
      loadError.value = false
    } catch {
      loadError.value = true
    } finally {
      loading.value = false
    }
  }

  const update = async (data: UpdateProfileRequest, silent = false): Promise<boolean> => {
    saving.value = true
    try {
      const res = await profileApi.update(data)
      profile.value = res.data
      if (!silent) message.success(i18n.global.t('personal.profile.personal.saved'))
      return true
    } catch {
      return false
    } finally {
      saving.value = false
    }
  }

  // Выход: следующий пользователь в этой вкладке не должен увидеть чужое имя (вход — SPA-переход, стор живёт).
  const reset = () => {
    profile.value = null
    loading.value = false
    saving.value = false
    loadError.value = false
  }

  return { profile, loading, saving, loadError, fetch, update, reset }
})
