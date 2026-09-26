import { createElement } from 'react'
import { toast as sonnerToast } from 'sonner'

// Keep Sonner's API while applying the shared notification policy to every call.
export const toast = Object.assign((...args: Parameters<typeof sonnerToast>) => sonnerToast(...args), sonnerToast, {
  error: (...[message, options]: Parameters<typeof sonnerToast.error>) => sonnerToast.error(
    createElement('span', { role: 'alert' }, typeof message === 'function' ? message() : message),
    { ...options, duration: Infinity },
  ),
  warning: (...[message, options]: Parameters<typeof sonnerToast.warning>) => sonnerToast.warning(message, { ...options, duration: Infinity }),
})
