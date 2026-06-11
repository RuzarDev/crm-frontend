import { defineStore } from 'pinia'
import { ref } from 'vue'
import { profileApi } from '@/api/profile'
import type { ProfileDto, UpdateProfileRequest } from '@/types/api'
import { message } from 'ant-design-vue'

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
      message.error('Не удалось загрузить профиль')
    } finally {
      loading.value = false
    }
  }

  const update = async (data: UpdateProfileRequest): Promise<boolean> => {
    saving.value = true
    try {
      const res = await profileApi.update(data)
      profile.value = res.data
      message.success('Профиль сохранён')
      return true
    } catch {
      return false
    } finally {
      saving.value = false
    }
  }

  return { profile, loading, saving, fetch, update }
})
