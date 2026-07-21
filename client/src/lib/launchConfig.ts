/**
 * Pre-launch gating.
 *
 * During the go-live countdown, staking is disabled: tapping any stake CTA shows a
 * "coming soon / countdown" popup instead of creating an order. Flip STAKING_ENABLED
 * to `true` at launch to re-enable staking everywhere.
 */
export const STAKING_ENABLED = false;
