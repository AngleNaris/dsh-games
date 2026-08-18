/**
 * dsh-games plain CSS, injected as one <style data-plugin-css> tag by the
 * client entry. Colors follow the DSH web skin's own semantic tokens
 * (`--dsw-alias-*`, defined on the DSH page for light/dark themes) with
 * neutral fallbacks, so the plugin matches DSH's look in both themes.
 *
 * Floating surfaces use the same semantic layer, label, and border tokens as
 * the surrounding DSH theme so light and dark appearances stay consistent.
 * @module @anglenaris/dsh-games/client/styles
 */

export const STYLE_TAG_ID = '@anglenaris/dsh-games/styles'

export const CSS = `
.dsg-pet-root {
  position: fixed;
  /* Above page chrome (aionui float = 100) but below modal overlays (= 1000),
     so the pet never blocks the settings dialog. */
  z-index: 900;
  user-select: none;
  -webkit-user-select: none;
}
.dsg-pet-root[data-dragging='true'] {
  cursor: grabbing;
}
.dsg-pet {
  position: relative;
  cursor: pointer;
  touch-action: none;
}
.dsg-pet:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 5px;
  border-radius: 8px;
}
.dsg-pet .dsg-whale-wrap {
  position: relative;
  display: block;
  transform: translateY(0) rotate(0deg);
  will-change: transform;
  transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.dsg-pet .dsg-whale-breathe {
  position: relative;
  display: block;
  transform-origin: 50% 78%;
  animation: dsg-sleep-breathe 3.8s ease-in-out infinite;
}
.dsg-whale-breathe > svg,
.dsg-whale-breathe > .dsg-pet-img {
  filter:
    drop-shadow(0 5px 7px rgba(15, 23, 42, 0.26))
    drop-shadow(0 1px 2px rgba(15, 23, 42, 0.18));
}
.dsg-pet[data-active='true'] .dsg-whale-wrap {
  animation: dsg-active-float 1.05s ease-in-out infinite;
}
.dsg-pet[data-active='true'][data-phase='tool'] .dsg-whale-wrap {
  animation-duration: 0.72s;
}
.dsg-pet[data-active='true'] .dsg-whale-breathe {
  animation: dsg-wake-up 280ms ease-out both;
}
@keyframes dsg-sleep-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.025, 0.975); }
}
@keyframes dsg-wake-up {
  from { transform: scale(1.025, 0.975); }
  to { transform: scale(1); }
}
@keyframes dsg-active-float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-14px) rotate(2.5deg); }
}
.dsg-hat {
  pointer-events: none;
  z-index: 1;
}
.dsg-hat-badge {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: -6px;
  background: var(--dsw-alias-tooltip-bg, rgba(67, 69, 74, 0.92));
  color: #fff;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 9px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
  border: 1px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.16));
}
/* Floating labels follow DSH's semantic surfaces in both light and dark mode. */
.dsg-pet-label {
  position: absolute;
  isolation: isolate;
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% + 2px);
  max-width: 220px;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  color: var(--dsw-alias-label-primary, #e8e8f0);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px rgba(0, 0, 0, 0.2));
  transition:
    border-color 260ms ease,
    box-shadow 260ms ease;
}
.dsg-pet-label::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background-image: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0) 30%,
    rgba(103, 158, 254, 0.45) 50%,
    rgba(255, 255, 255, 0) 70%
  );
  background-size: 220px 100%;
  background-repeat: no-repeat;
  opacity: 0;
  pointer-events: none;
  animation: dsg-label-shimmer 1.4s linear infinite;
  transition: opacity 260ms ease;
}
.dsg-label-content {
  position: relative;
  z-index: 1;
}
/* Bubbles sit right above the bottom label bar (never under the crown pile)
   and on top of every pet layer. */
.dsg-pet-bubble {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% - 30px);
  z-index: 6;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  color: var(--dsw-alias-label-primary, #e8e8f0);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px rgba(0, 0, 0, 0.2));
  animation: dsg-bubble 0.25s ease-out;
}
.dsg-pet-bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -5px;
  transform: translateX(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  border-right: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
}
@keyframes dsg-bubble {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
/* The pet panel follows the DSH theme and stays inside the viewport even when
   the draggable pet is parked against an edge. Its header remains visible
   while the content below it scrolls. */
.dsg-popover {
  position: fixed;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(380px, calc(100vw - 24px));
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  color: var(--dsw-alias-label-primary, #e8e8f0);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  box-shadow: var(--dsw-shadow-lv3, 0 18px 48px rgba(0, 0, 0, 0.38));
  font-size: 13px;
  animation: dsg-pop 0.18s ease-out;
  isolation: isolate;
}
.dsg-popover-header {
  display: flex;
  align-items: center;
  gap: 11px;
  flex: none;
  min-height: 48px;
  padding: 12px 14px;
  background: var(--dsw-alias-bg-layer-2, #19212d);
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.1));
}
.dsg-popover-avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: none;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.06));
}
.dsg-popover-avatar img {
  display: block;
  width: 38px;
  height: 38px;
  object-fit: contain;
}
.dsg-popover-heading {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.dsg-popover h3 {
  margin: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary, #fff);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsg-popover-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.58));
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}
.dsg-popover-meta span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsg-phase-indicator {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary, #8e8e93);
  box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-2, #19212d);
}
.dsg-phase-indicator[data-phase='thinking'] { background: var(--dsw-alias-state-business-primary, #4d6bfe); }
.dsg-phase-indicator[data-phase='tool'] { background: var(--dsw-alias-state-warn-primary, #ff9500); }
.dsg-phase-indicator[data-phase='done'] { background: var(--dsw-alias-state-success-primary, #34c759); }
.dsg-icon-btn {
  appearance: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: none;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.62));
  cursor: pointer;
  font: inherit;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.dsg-icon-btn span {
  font-size: 20px;
  line-height: 1;
  transform: translateY(-1px);
}
.dsg-icon-btn:hover {
  border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.07));
  color: var(--dsw-alias-label-primary, #fff);
}
.dsg-icon-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: -2px;
}
.dsg-popover-body {
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}
.dsg-popover-body::-webkit-scrollbar { width: 8px; }
.dsg-popover-body::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
  border-radius: 4px;
}
.dsg-popover-section {
  padding: 15px 16px 2px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
}
.dsg-popover-section-last {
  padding-bottom: 16px;
  border-bottom: 0;
}
.dsg-popover-section > h4 {
  margin: 0 0 12px;
  color: var(--dsw-alias-label-primary, #fff);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
}
@keyframes dsg-pop {
  from { opacity: 0; transform: translateY(8px) scale(0.985); }
  to { opacity: 1; transform: translateY(0); }
}
.dsg-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.dsg-popover-section .dsg-field:last-child {
  margin-bottom: 12px;
}
.dsg-field label {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.75));
}
.dsg-field-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dsg-field-heading output {
  flex: none;
  min-width: 50px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.07));
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.76));
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}
.dsg-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--dsw-specific-input-major, rgba(0, 0, 0, 0.3));
  color: var(--dsw-alias-label-primary, #e8e8f0);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.dsg-input:focus {
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
  box-shadow: 0 0 0 2px var(--dsw-alias-button-info-fill, #4d6bfe);
}
.dsg-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.dsg-input-action .dsg-input {
  min-width: 0;
  flex: 1;
}
.dsg-position-actions > * {
  min-width: 0;
  flex: 1;
  padding-right: 10px;
  padding-left: 10px;
}
/* Buttons share one family everywhere (popover, room panel, settings card):
   primary is the official DSH inverted pill (label-primary background with
   layer-3 text), ghost is the bordered outline button. The upload button is a
   <label> inside .dsg-field, whose label rule would otherwise win on color —
   the explicit .dsg-field label.dsg-btn selector keeps the button text dark. */
.dsg-btn,
.dsg-field label.dsg-btn {
  appearance: none;
  font: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px 14px;
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
  background: var(--dsw-alias-label-primary, #fff);
  color: var(--dsw-alias-bg-layer-3, #1f2836);
  transition: filter 120ms ease;
}
.dsg-btn:hover:not(:disabled) { filter: brightness(1.08); }
.dsg-btn:disabled { opacity: 0.4; cursor: default; }
.dsg-field label.dsg-btn[data-disabled='true'] {
  opacity: 0.4;
  cursor: default;
  pointer-events: none;
}
.dsg-btn:focus-visible,
.dsg-btn-ghost:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: -2px;
}
.dsg-btn-ghost {
  appearance: none;
  font: inherit;
  cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
  border-radius: 8px;
  padding: 5px 14px;
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #e8e8f0);
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.dsg-btn-ghost:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary, #fff);
  border-color: var(--dsw-alias-label-dimmed, rgba(255, 255, 255, 0.35));
}
.dsg-btn-ghost[data-on='true'] {
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
  background: var(--dsw-alias-interactive-bg-hover-accent, rgba(77, 107, 254, 0.18));
  color: var(--dsw-alias-label-primary, #fff);
}
.dsg-btn-ghost:disabled { opacity: 0.4; cursor: default; }
.dsg-btn-danger {
  background: transparent;
  color: var(--dsw-alias-state-error-primary, #ff453a);
  border-color: var(--dsw-alias-state-error-primary, #ff453a);
}
.dsg-btn-danger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger, rgba(255, 69, 58, 0.15));
  color: var(--dsw-alias-state-error-primary, #ff453a);
}
.dsg-divider {
  height: 1px;
  background: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.1));
  margin: 12px 0;
}
.dsg-hint {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.55));
  margin: 6px 0 0;
  line-height: 1.4;
}
.dsg-error {
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary, #ff6b62);
  margin: 6px 0 0;
}
.dsg-note {
  font-size: 12px;
  color: var(--dsw-alias-state-success-primary, #7ee2a8);
  margin: 6px 0 0;
}
.dsg-room-info {
  background: var(--dsw-alias-bg-layer-2, #19212d);
  border: 1px solid var(--dsw-alias-button-info-fill, rgba(77, 107, 254, 0.4));
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 10px;
}
.dsg-room-info .dsg-room-copy {
  background-color: rgb(53, 54, 56) !important;
  border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
}
.dsg-room-info .dsg-room-copy:hover:not(:disabled) {
  background-color: rgb(53, 54, 56) !important;
  border-color: var(--dsw-alias-label-dimmed, rgba(255, 255, 255, 0.35));
}
.dsg-room-info .dsg-room-code {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--dsw-alias-label-primary, #fff);
}
.dsg-members {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}
.dsg-member {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--dsw-alias-bg-layer-2, #19212d);
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  padding: 6px 10px;
}
.dsg-member .dsg-member-whale {
  position: relative;
  flex: none;
}
.dsg-member .dsg-member-meta {
  min-width: 0;
  flex: 1;
}
.dsg-member .dsg-member-name {
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #fff);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsg-member .dsg-member-sub {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.6));
}
.dsg-member.dsg-member-you {
  background: var(--dsw-alias-bg-layer-2, #19212d);
  border: 1px solid var(--dsw-alias-button-info-fill, rgba(77, 107, 254, 0.55));
}
.dsg-member-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.dsg-member-dot[data-phase='idle'] { background: var(--dsw-alias-label-tertiary, #8e8e93); }
.dsg-member-dot[data-phase='waiting'] { background: var(--dsw-alias-label-tertiary, #8e8e93); }
.dsg-member-dot[data-phase='thinking'] { background: var(--dsw-alias-state-business-primary, #4d6bfe); }
.dsg-member-dot[data-phase='tool'] { background: var(--dsw-alias-state-warn-primary, #ff9500); }
.dsg-member-dot[data-phase='done'] { background: var(--dsw-alias-state-success-primary, #34c759); }
/* The settings card mirrors the official DSH plugin-item PluginCard chrome
   (dsh-client-ui-settings-plugins): a layer-3 card with 12px radius, a
   name/description header with a rotating chevron, and a body separated by
   a border-top. */
.dsg-settings-card {
  list-style: none;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  border-radius: 12px;
  transition: border-color 0.16s, background 0.16s;
}
.dsg-settings-card:hover,
.dsg-settings-card[data-open='true'] {
  border-color: var(--dsw-alias-label-dimmed, rgba(255, 255, 255, 0.35));
}
.dsg-settings-card[data-open='true'] {
  background: var(--dsw-alias-bg-layer-2, #1a222e);
}
.dsg-settings-header {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.dsg-settings-header:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: -2px;
}
.dsg-settings-head-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 4px;
  min-width: 0;
}
.dsg-settings-name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--dsw-alias-label-primary, #fff);
}
.dsg-settings-desc {
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.55));
}
.dsg-settings-chevron {
  display: block;
  flex: none;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.55));
  transition: transform 0.16s;
}
.dsg-settings-card[data-open='true'] .dsg-settings-chevron,
.dsg-settings-chevron.dsg-settings-chevron-open {
  transform: rotate(180deg);
}
/* "Unsaved changes" pill in the header while drafts are staged (official
   PluginCard.pending). */
.dsg-settings-pending {
  white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.7));
  border-radius: 999px;
  flex: none;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 17px;
}
.dsg-settings-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  margin: 0 16px;
  padding: 12px 0 8px;
}
.dsg-settings-body .dsg-field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dsg-settings-card .dsg-field-row label {
  font-size: 13px;
  color: var(--dsw-alias-label-primary, rgba(232, 232, 240, 0.85));
  flex: none;
}
.dsg-settings-card .dsg-input {
  max-width: 200px;
}
.dsg-settings-card .dsg-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  align-items: center;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  padding: 12px 0 4px;
}
.dsg-toggle {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
  border: none;
  cursor: pointer;
  flex: none;
  transition: background 0.15s;
}
.dsg-toggle[data-on='true'] { background: var(--dsw-alias-button-info-fill, #4d6bfe); }
.dsg-toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.dsg-toggle[data-on='true']::after { transform: translateX(16px); }

/* ---- crowns ---- */
.dsg-crown {
  position: absolute;
  left: 50%;
  top: 0;
  pointer-events: none;
  z-index: 1;
  will-change: transform;
  /* the pile re-collapses on every merge: crowns glide to their new slot */
  transition: transform 0.55s cubic-bezier(0.3, 1.15, 0.4, 1), opacity 0.3s ease;
}
.dsg-crown svg {
  transform: rotate(var(--dsg-rot, 0deg));
}
.dsg-crown-magic svg {
  animation: dsg-magic-glow 1.6s ease-in-out infinite;
}
@keyframes dsg-magic-glow {
  0%, 100% { filter: brightness(1.04) saturate(1.05); }
  50% { filter: brightness(1.28) saturate(1.2); }
}
/* a crown that just crafted up: it inherits a consumed crown's key and slides
   to its new slot (transition above) while popping bright at the destination */
.dsg-crown-merged svg {
  animation: dsg-crown-merged 0.6s cubic-bezier(0.3, 1.2, 0.4, 1);
}
@keyframes dsg-crown-merged {
  0% {
    transform: rotate(var(--dsg-rot, 0deg)) scale(0.45);
    filter: brightness(2.1);
  }
  45% {
    transform: rotate(var(--dsg-rot, 0deg)) scale(1.1);
    filter: brightness(1.45);
  }
  100% {
    transform: rotate(var(--dsg-rot, 0deg)) scale(1);
    filter: brightness(1);
  }
}
/* a freshly earned crown pops in at its slot */
.dsg-crown-in svg {
  animation: dsg-crown-in 0.5s cubic-bezier(0.2, 1.4, 0.4, 1);
}
@keyframes dsg-crown-in {
  0% { opacity: 0; transform: rotate(var(--dsg-rot, 0deg)) scale(0.15); }
  60% { opacity: 1; transform: rotate(var(--dsg-rot, 0deg)) scale(1.12); }
  100% { opacity: 1; transform: rotate(var(--dsg-rot, 0deg)) scale(1); }
}
/* consumed crowns shrink + fade away at their old spot (later rules win
   over the magic glow for the animation property) */
.dsg-crown-ghost {
  transition: none;
  animation: dsg-crown-ghost-fade 0.45s ease-in forwards;
}
.dsg-crown-ghost svg {
  animation: dsg-crown-ghost-shrink 0.45s ease-in forwards;
}
@keyframes dsg-crown-ghost-fade {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes dsg-crown-ghost-shrink {
  from { transform: rotate(var(--dsg-rot, 0deg)) scale(1); }
  to { transform: rotate(var(--dsg-rot, 0deg)) scale(0.5); }
}
/* one-shot burst at the merge point */
.dsg-crown-flash {
  position: absolute;
  left: 50%;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 3;
}
.dsg-crown-flash b,
.dsg-crown-flash i {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 50%;
}
.dsg-crown-flash i {
  width: 52px;
  height: 52px;
  margin: -26px 0 0 -26px;
  border: 2.5px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 14px rgba(160, 220, 255, 0.9);
  animation: dsg-flash-ring 0.65s ease-out forwards;
}
.dsg-crown-flash b {
  width: 26px;
  height: 26px;
  margin: -13px 0 0 -13px;
  background: radial-gradient(circle, #fff 0%, rgba(255, 255, 255, 0.9) 35%, rgba(255, 255, 255, 0) 70%);
  animation: dsg-flash-core 0.65s ease-out forwards;
}
@keyframes dsg-flash-ring {
  0% { opacity: 0.95; transform: scale(0.25); }
  100% { opacity: 0; transform: scale(1.5); }
}
@keyframes dsg-flash-core {
  0% { opacity: 0; transform: scale(0.3); }
  25% { opacity: 1; transform: scale(1.25); }
  100% { opacity: 0; transform: scale(0.45); }
}
.dsg-crown-badge {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  background: var(--dsw-alias-tooltip-bg, rgba(20, 20, 30, 0.78));
  color: #ffd54f;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 9px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
  border: 1px solid rgba(255, 215, 79, 0.4);
}
.dsg-mini-crown {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translate(-50%, -22%);
  pointer-events: none;
  z-index: 1;
}
.dsg-mini-crown svg {
  transform: rotate(var(--dsg-rot, -3deg));
}
.dsg-mini-crown-count {
  position: absolute;
  left: 50%;
  bottom: -12px;
  transform: translateX(-50%);
  font-style: normal;
  font-size: 10px;
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.85));
  background: var(--dsw-alias-tooltip-bg, rgba(20, 20, 30, 0.7));
  border-radius: 7px;
  padding: 1px 4px;
  white-space: nowrap;
}

/* ---- token-usage FX on the pet label ---- */
.dsg-label-active {
  box-shadow: 0 0 0 1px var(--dsw-alias-button-info-fill, #4d6bfe), 0 0 10px var(--dsw-alias-button-info-fill, #4d6bfe);
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
.dsg-label-active::before {
  opacity: 1;
}
@keyframes dsg-label-shimmer {
  0% { background-position: -120px 0; }
  100% { background-position: 220px 0; }
}
.dsg-label-burst {
  animation: dsg-label-burst 0.6s ease-out;
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
@keyframes dsg-label-burst {
  0% { transform: translateX(-50%) scale(1); }
  40% { transform: translateX(-50%) scale(1.12); }
  100% { transform: translateX(-50%) scale(1); }
}
.dsg-token-chip {
  display: inline-block;
  font-style: normal;
  color: var(--dsw-alias-state-success-primary, #7ee2a8);
  margin-left: 6px;
  font-weight: 700;
  animation: dsg-chip-pop 1.8s ease-out forwards;
}
@keyframes dsg-chip-pop {
  0% { opacity: 0; transform: translateY(4px) scale(0.8); }
  15% { opacity: 1; transform: translateY(0) scale(1.1); }
  30% { transform: translateY(0) scale(1); }
  75% { opacity: 1; }
  100% { opacity: 0; }
}

/* ---- pet customization ---- */
.dsg-slider {
  appearance: none;
  width: 100%;
  height: 18px;
  margin: 0;
  background: transparent;
  accent-color: var(--dsw-alias-button-info-fill, #4d6bfe);
  cursor: pointer;
}
.dsg-slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
}
.dsg-slider::-webkit-slider-thumb {
  appearance: none;
  width: 17px;
  height: 17px;
  margin-top: -6.5px;
  border: 3px solid var(--dsw-alias-button-info-fill, #4d6bfe);
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.28);
}
.dsg-slider::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
}
.dsg-slider::-moz-range-thumb {
  width: 11px;
  height: 11px;
  border: 3px solid var(--dsw-alias-button-info-fill, #4d6bfe);
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.28);
}
.dsg-slider:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 2px;
  border-radius: 8px;
}
.dsg-swatch-grid {
  display: grid;
  grid-template-columns: repeat(7, 32px);
  justify-content: space-between;
  gap: 8px;
}
.dsg-swatch {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.25));
  cursor: pointer;
  padding: 0;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s;
}
.dsg-swatch:hover { transform: translateY(-2px); }
.dsg-swatch:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 2px;
}
.dsg-swatch[data-on='true'] {
  border-color: var(--dsw-alias-label-primary, #fff);
  box-shadow: 0 0 0 2px var(--dsw-alias-button-info-fill, #4d6bfe);
  transform: translateY(-2px);
}
.dsg-swatch[data-on='true']::after {
  content: '✓';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.72);
}
/* The custom-color swatch shows a rainbow until a custom gradient is picked. */
.dsg-swatch-custom {
  background: conic-gradient(#6d8bff, #ff8a80, #5eead4, #ffe082, #c4b5fd, #67e8f9, #6d8bff);
}
.dsg-custom-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 4px;
}
.dsg-color-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 116px;
  flex: 1;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.04));
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.75));
}
.dsg-color-field input[type='color'] {
  width: 34px;
  height: 26px;
  padding: 1px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
  border-radius: 6px;
  background: var(--dsw-specific-input-major, rgba(0, 0, 0, 0.3));
  cursor: pointer;
}
.dsg-color-field input[type='color']:focus {
  outline: none;
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
  box-shadow: 0 0 0 2px var(--dsw-alias-button-info-fill, #4d6bfe);
}
.dsg-pet-img {
  display: block;
  object-fit: contain;
}
.dsg-pet-preview {
  width: 52px;
  height: 52px;
  flex: none;
  object-fit: contain;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
}
.dsg-upload-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 50px;
  padding: 9px;
  border: 1px dashed var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.035));
}
.dsg-upload-content {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}
.dsg-upload-meta {
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.58));
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- room list + create options ---- */
.dsg-room-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
}
.dsg-room-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  padding: 6px 10px;
}
.dsg-room-row-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.dsg-room-row-name {
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #fff);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsg-room-row-meta {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.6));
}
.dsg-radio {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.8));
  background: var(--dsw-alias-bg-layer-2, #19212d);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.dsg-radio input { display: none; }
.dsg-radio:hover {
  background: var(--dsw-alias-bg-layer-3, #1f2836);
}
.dsg-radio[data-on='true'] {
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
  color: var(--dsw-alias-label-primary, #fff);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-button-info-fill, rgba(77, 107, 254, 0.45));
}
.dsg-room-visibility-tag {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  vertical-align: 1px;
  background: var(--dsw-alias-interactive-bg-hover-accent, rgba(77, 107, 254, 0.25));
  border: 1px solid var(--dsw-alias-button-info-fill, rgba(77, 107, 254, 0.5));
}
.dsg-room-visibility-tag[data-public='false'] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 149, 0, 0.2));
  border-color: var(--dsw-alias-state-warn-primary, rgba(255, 149, 0, 0.5));
}
.dsg-member-pet {
  display: block;
  object-fit: contain;
  border-radius: 8px;
}
.dsg-select {
  max-width: 200px;
}
.dsg-select option {
  background: var(--dsw-alias-bg-layer-3, #24242f);
  color: var(--dsw-alias-label-primary, #e8e8f0);
}

/* ---- room pet scene (member pets around the anchor) ---- */
.dsg-scene-root {
  z-index: 900;
}
.dsg-scene-root[data-dragging='false'] .dsg-pet {
  cursor: default;
}
.dsg-scene-label {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% + 2px);
  max-width: 200px;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  color: var(--dsw-alias-label-primary, #e8e8f0);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 11px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms ease;
  box-shadow: var(--dsw-shadow-lv1, 0 2px 6px rgba(0, 0, 0, 0.2));
  z-index: 3;
}
.dsg-pet:hover > .dsg-scene-label,
.dsg-pet[data-show-label='true'] > .dsg-scene-label,
.dsg-scene-label:hover {
  opacity: 1;
}

/* ---- room chat (hover hint, composer, message bubbles) ---- */
.dsg-chat-hint,
.dsg-chat-bubble {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% - 30px);
  z-index: 6;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  color: var(--dsw-alias-label-primary, #e8e8f0);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px rgba(0, 0, 0, 0.2));
}
.dsg-chat-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  pointer-events: none;
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease;
}
.dsg-pet:hover > .dsg-chat-hint {
  opacity: 1;
  pointer-events: auto;
}
.dsg-chat-hint[data-disabled='true'] {
  opacity: 0.5;
  cursor: default;
}
.dsg-chat-bubble {
  /* 10 CJK chars at 14px + padding: lines wrap at ~10 chars even when the
     hosting pet is smaller than the bubble (the bubble overflows the pet). */
  min-width: 168px;
  max-width: 280px;
  white-space: normal;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.5;
  padding: 6px 14px;
  animation: dsg-chat-pop 0.35s cubic-bezier(0.2, 1.4, 0.4, 1);
}
@keyframes dsg-chat-pop {
  0% { opacity: 0; transform: translateX(-50%) translateY(6px) scale(0.5); }
  60% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.08); }
  100% { opacity: 1; transform: translateX(-50%) scale(1); }
}
.dsg-chat-bubble.dsg-chat-leaving {
  animation: dsg-chat-out 0.25s ease forwards;
}
@keyframes dsg-chat-out {
  0% { opacity: 1; transform: translateX(-50%) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(0.9); }
}
.dsg-chat-from {
  font-weight: 600;
}
.dsg-chat-composer {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% - 30px);
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  border-radius: 999px;
  padding: 4px 6px 4px 12px;
  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px rgba(0, 0, 0, 0.2));
}
.dsg-chat-composer .dsg-chat-input {
  width: 170px;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary, #e8e8f0);
  font-size: 12px;
  outline: none;
  padding: 0;
}
.dsg-chat-composer .dsg-chat-input::placeholder {
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.6));
}
.dsg-chat-composer .dsg-btn {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 999px;
}
.dsg-chat-close {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.8));
  font: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.dsg-chat-close:hover {
  background: var(--dsw-alias-interactive-bg-hover-accent, rgba(77, 107, 254, 0.2));
  color: var(--dsw-alias-label-primary, #e8e8f0);
}
.dsg-chat-close:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 1px;
}

@media (max-width: 480px) {
  .dsg-popover-header {
    padding: 11px 12px;
  }
  .dsg-popover-section {
    padding-right: 13px;
    padding-left: 13px;
  }
  .dsg-swatch-grid {
    grid-template-columns: repeat(7, 30px);
    gap: 5px;
  }
  .dsg-swatch {
    width: 30px;
    height: 30px;
  }
  .dsg-position-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .dsg-position-actions > * {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dsg-popover,
  .dsg-swatch {
    animation: none;
    transition: none;
  }
}
`

/** Inject the stylesheet once (idempotent); returns the tag for later removal. */
export function injectStyles(): HTMLStyleElement | undefined {
  const existing = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${STYLE_TAG_ID}"]`)
  if (existing !== null) {
    // HMR re-applies the plugin while preserving the shared style element.
    // Refresh its contents so CSS changes do not lag behind component code.
    if (existing.textContent !== CSS) existing.textContent = CSS
    return existing
  }
  const tag = document.createElement('style')
  tag.dataset.pluginCss = STYLE_TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
  return tag
}

/** Remove the injected stylesheet. */
export function removeStyles(): void {
  const existing = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${STYLE_TAG_ID}"]`)
  existing?.remove()
}
