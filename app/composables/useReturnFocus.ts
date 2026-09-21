/**
 * Put keyboard focus back where it came from when a dialog goes away.
 *
 * `UModal` does this itself, and on this site it cannot: the three pickers are
 * `<Lazy…>` components behind a `v-if`, which is what keeps each one's chunk
 * off the page until it is opened, and the parent drops that `v-if` the moment
 * the dialog emits `close`. The component is gone before Reka's focus scope
 * gets to unwind, and focus lands on `<body>` — which for a keyboard reader
 * means starting the page again from the top.
 *
 * So the dialog remembers its own opener. `onUnmounted` rather than
 * `onBeforeUnmount`: while the dialog is still in the DOM its focus scope will
 * pull focus straight back out again.
 */
export function useReturnFocus() {
  const opener = import.meta.client ? document.activeElement : null

  onUnmounted(() => {
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
  })
}
