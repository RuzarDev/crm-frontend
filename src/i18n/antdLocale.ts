import ruRU from 'ant-design-vue/es/locale/ru_RU'
import kkKZ from 'ant-design-vue/es/locale/kk_KZ'
import enUS from 'ant-design-vue/es/locale/en_US'
import type { AppLocale } from './index'

// Локаль AntD-компонентов (date-picker, pagination, select и т.д.) под текущий язык.
export function antdLocaleFor(locale: AppLocale) {
  switch (locale) {
    case 'kk':
      return kkKZ
    case 'en':
      return enUS
    default:
      return ruRU
  }
}
