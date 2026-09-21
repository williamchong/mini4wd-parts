/**
 * Whether a button carries the weight on the page or stands back.
 *
 * The site makes this choice in nine places and always the same way — a solid
 * button in the site's blue when the thing is pressed, active or the only move
 * available; an outline in neutral when it is one option among several. Written
 * out at each call site that was two `:color`/`:variant` ternaries repeating the
 * same pair of words, which is how a toggle ends up quietly disagreeing with
 * the toggle beside it.
 *
 * Spread with `v-bind`. It does not set `aria-pressed`: this is how a control
 * looks, and only the toggles among these are pressed at all.
 */
export const emphasis = (strong: boolean) => strong
  ? { color: 'primary' as const, variant: 'solid' as const }
  : { color: 'neutral' as const, variant: 'outline' as const }
