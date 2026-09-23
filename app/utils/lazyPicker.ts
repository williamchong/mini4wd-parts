/**
 * A builder dialog loaded on first open, with something on screen while its
 * chunk is in flight and when it fails. A bare `Lazy…` component shows nothing
 * for either: the tap looks ignored, and a 503 on the chunk leaves it ignored
 * for good.
 *
 * Not suspensible, because the page's Suspense has long since resolved and
 * would otherwise swallow the loading and error states without showing them.
 *
 * No retry. The 503s this exists for are transient, but a retry cannot see
 * that: Chrome keeps a failed module import for the life of the document and
 * answers every later `import()` of that URL from it without a request
 * (verified 2026-09-23), and Vue keeps the rejected load besides. A reload is
 * the only thing that fetches the chunk again, so the error state offers one —
 * and it loses nothing, because the build lives in the `#hash`.
 *
 * `onClose` is passed in rather than picked up from the picker's listeners
 * because Vue hands those to the loading component but not the error one,
 * which gets `{ error }` and nothing else.
 */
import type { Component, FunctionalComponent } from 'vue'
import PickerPending from '~/components/build/PickerPending.vue'

export function lazyPicker<T extends Component>(loader: () => Promise<{ default: T }>, onClose: () => void): T {
  const pending: FunctionalComponent<{ error?: Error }> = props =>
    h(PickerPending, { error: props.error, onClose })
  // The loading state is mounted with the picker's own props, which include
  // the picker's `onClose`; left to fall through it would close twice.
  pending.inheritAttrs = false

  return defineAsyncComponent({
    loader: () => loader().then(module => module.default),
    loadingComponent: pending,
    errorComponent: pending,
    delay: 150,
    suspensible: false
  })
}
