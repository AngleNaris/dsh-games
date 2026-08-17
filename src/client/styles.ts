/**
 * dsh-games plain CSS, injected as one <style data-plugin-css> tag by the
 * client entry. Colors follow the DSH web skin's own semantic tokens
 * (`--dsw-alias-*`, defined on the DSH page for light/dark themes) with
 * neutral fallbacks, so the plugin matches DSH's look in both themes.
 *
 * Floating surfaces that sit on top of arbitrary page content (pet label,
 * bubble, summon button) use the fixed dark tooltip palette like DSH's own
 * hovercards; in-page UI (popover, room list, settings card) uses the theme
 * tokens.
 * @module @linxin666/dsh-games/client/styles
 */

export const STYLE_TAG_ID = '@linxin666/dsh-games/styles'

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
.dsg-pet .dsg-whale-wrap {
  position: relative;
  display: block;
  filter: drop-shadow(0 4px 10px rgba(77, 107, 254, 0.35));
  animation: dsg-float 3.2s ease-in-out infinite;
}
.dsg-pet[data-phase='thinking'] .dsg-whale-wrap {
  animation: dsg-think 0.9s ease-in-out infinite;
}
.dsg-pet[data-phase='tool'] .dsg-whale-wrap {
  animation: dsg-tool 0.5s linear infinite;
}
.dsg-pet[data-phase='done'] .dsg-whale-wrap {
  animation: dsg-cheer 0.6s ease-in-out 2;
}
@keyframes dsg-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes dsg-think {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-8px) rotate(2deg); }
}
@keyframes dsg-tool {
  0%, 100% { transform: rotate(-6deg); }
  50% { transform: rotate(6deg); }
}
@keyframes dsg-cheer {
  0%, 100% { transform: translateY(0) scale(1); }
  40% { transform: translateY(-12px) scale(1.08); }
}
.dsg-hat {
  pointer-events: none;
  z-index: 1;
}
.dsg-hat svg {
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35));
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
.dsg-phase-dot {
  position: absolute;
  right: 2px;
  bottom: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.85));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
.dsg-phase-dot[data-phase='idle'] { background: var(--dsw-alias-label-tertiary, #8e8e93); }
.dsg-phase-dot[data-phase='waiting'] { background: var(--dsw-alias-label-tertiary, #8e8e93); }
.dsg-phase-dot[data-phase='thinking'] { background: var(--dsw-alias-state-business-primary, #4d6bfe); animation: dsg-pulse 1s ease-in-out infinite; }
.dsg-phase-dot[data-phase='tool'] { background: var(--dsw-alias-state-warn-primary, #ff9500); }
.dsg-phase-dot[data-phase='done'] { background: var(--dsw-alias-state-success-primary, #34c759); }
@keyframes dsg-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.25); opacity: 0.7; }
}
/* Floating labels keep the fixed dark tooltip look on any page background. */
.dsg-pet-label {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% + 2px);
  max-width: 220px;
  background: var(--dsw-alias-tooltip-bg, rgba(67, 69, 74, 0.95));
  color: #fff;
  border: 1px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.16));
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px rgba(0, 0, 0, 0.2));
}
.dsg-pet-bubble {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(100% + 10px);
  background: var(--dsw-alias-tooltip-bg, rgba(67, 69, 74, 0.95));
  color: #fff;
  border: 1px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.16));
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
  background: var(--dsw-alias-tooltip-bg, rgba(67, 69, 74, 0.95));
  border-right: 1px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.16));
  border-bottom: 1px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.16));
}
@keyframes dsg-bubble {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
/* The popover is in-page UI: it follows the DSH theme like any DSH menu. */
.dsg-popover {
  position: absolute;
  right: 0;
  bottom: calc(100% + 14px);
  width: 320px;
  max-height: 66vh;
  overflow-y: auto;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  color: var(--dsw-alias-label-primary, #e8e8f0);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: 12px;
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0, 0, 0, 0.3));
  padding: 14px;
  font-size: 13px;
  animation: dsg-pop 0.18s ease-out;
}
@keyframes dsg-pop {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.dsg-popover h3 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #fff);
}
.dsg-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
.dsg-field label {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.75));
}
.dsg-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--dsw-specific-input-major, rgba(0, 0, 0, 0.3));
  color: var(--dsw-alias-label-primary, #e8e8f0);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
  border-radius: 6px;
  padding: 6px 9px;
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
.dsg-btn {
  background: var(--dsw-alias-button-info-fill, #4d6bfe);
  color: var(--dsw-alias-label-primary-foreground, #fff);
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 120ms ease;
}
.dsg-btn:hover { background: var(--dsw-alias-button-info-hover, #5f7aff); }
.dsg-btn:disabled { opacity: 0.5; cursor: default; }
.dsg-btn-ghost {
  background: transparent;
  color: var(--dsw-alias-label-secondary, #e8e8f0);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.dsg-btn-ghost:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-primary, #fff);
}
.dsg-btn-danger {
  background: transparent;
  color: var(--dsw-alias-state-error-primary, #ff453a);
  border-color: var(--dsw-alias-state-error-primary, #ff453a);
}
.dsg-btn-danger:hover {
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
  background: var(--dsw-alias-interactive-bg-hover-accent, rgba(77, 107, 254, 0.14));
  border: 1px solid var(--dsw-alias-button-info-fill, rgba(77, 107, 254, 0.4));
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 10px;
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
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.05));
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
.dsg-member .dsg-member-you {
  background: var(--dsw-alias-interactive-bg-hover-accent, rgba(77, 107, 254, 0.35));
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
.dsg-summon {
  position: fixed;
  z-index: 900;
  background: var(--dsw-alias-tooltip-bg, rgba(67, 69, 74, 0.92));
  color: #fff;
  border: 1px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.16));
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px rgba(0, 0, 0, 0.25));
}
.dsg-summon:hover { border-color: var(--dsw-alias-button-info-fill, #4d6bfe); }
.dsg-settings-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dsg-settings-card .dsg-field-row {
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
.dsg-dirty {
  font-size: 11px;
  color: var(--dsw-alias-state-warn-primary, #ffb400);
}

/* ---- crowns ---- */
.dsg-crown {
  pointer-events: none;
  z-index: 1;
}
.dsg-crown svg {
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4));
}
.dsg-crown-magic svg {
  animation: dsg-magic-glow 1.6s ease-in-out infinite;
}
@keyframes dsg-magic-glow {
  0%, 100% { filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4)) drop-shadow(0 0 3px rgba(160, 220, 255, 0.55)); }
  50% { filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4)) drop-shadow(0 0 9px rgba(180, 230, 255, 0.95)); }
}
.dsg-crown-badge {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: -6px;
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
  animation: dsg-label-shimmer 1.4s linear infinite;
}
@keyframes dsg-label-shimmer {
  0% { background-position: -120px 0; }
  100% { background-position: 220px 0; }
}
.dsg-label-active {
  background-image: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0) 30%,
    rgba(103, 158, 254, 0.45) 50%,
    rgba(255, 255, 255, 0) 70%
  );
  background-size: 220px 100%;
  background-repeat: no-repeat;
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
  width: 100%;
  accent-color: var(--dsw-alias-button-info-fill, #4d6bfe);
  cursor: pointer;
}
.dsg-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.25));
  cursor: pointer;
  padding: 0;
  transition: transform 0.12s, border-color 0.12s;
}
.dsg-swatch:hover { transform: scale(1.15); }
.dsg-swatch[data-on='true'] {
  border-color: var(--dsw-alias-label-primary, #fff);
  box-shadow: 0 0 0 2px var(--dsw-alias-button-info-fill, #4d6bfe);
  transform: scale(1.15);
}
.dsg-pet-img {
  display: block;
  object-fit: contain;
  filter: drop-shadow(0 4px 10px rgba(77, 107, 254, 0.35));
}
.dsg-pet-preview {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
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
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.8));
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.dsg-radio input { display: none; }
.dsg-radio:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
}
.dsg-radio[data-on='true'] {
  background: var(--dsw-alias-interactive-bg-hover-accent, rgba(77, 107, 254, 0.3));
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
  color: var(--dsw-alias-label-primary, #fff);
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
  background: var(--dsw-alias-tooltip-bg, rgba(67, 69, 74, 0.95));
  color: #fff;
  border: 1px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.16));
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
.dsg-scene-label:hover {
  opacity: 1;
}
`

/** Inject the stylesheet once (idempotent); returns the tag for later removal. */
export function injectStyles(): HTMLStyleElement | undefined {
  const existing = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${STYLE_TAG_ID}"]`)
  if (existing !== null) return existing
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
