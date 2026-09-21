import { defineStore } from 'pinia'
import { ref } from 'vue'
import { profileApi } from '@/api/profile'
import type { ProfileDto, UpdateProfileRequest } from '@/types/api'
import { message } from 'ant-design-vue'
import { i18n } from '@/i18n'

export const useProfileStore = defineStore('profile', () => {
  const profile = ref<ProfileDto | null>(null)
  const loading = ref(false)
  const saving = ref(false)

  const fetch = async () => {
    loading.value = true
    try {
      const res = await profileApi.get()
      profile.value = res.data
    } catch {
      message.error(i18n.global.t('profile.loadError'))
    } finally {
      loading.value = false
    }
  }

  const update = async (data: UpdateProfileRequest): Promise<boolean> => {
    saving.value = true
    try {
      const res = await profileApi.update(data)
      profile.value = res.data
      message.success(i18n.global.t('profile.saved'))
      return true
    } catch {
      return false
    } finally {
      saving.value = false
    }
  }

  return { profile, loading, saving, fetch, update }
})
