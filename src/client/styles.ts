/**
 * dsh-games plain CSS, injected as one <style data-plugin-css> tag by the
 * client entry. Neutral colors that work on both light and dark themes.
 * @module @linxin666/dsh-games/client/styles
 */

export const STYLE_TAG_ID = '@linxin666/dsh-games/styles'

export const CSS = `
.dsg-pet-root {
  position: fixed;
  z-index: 2147483000;
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
  background: rgba(20, 20, 30, 0.78);
  color: #fff;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 9px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.dsg-phase-dot {
  position: absolute;
  right: 2px;
  bottom: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
.dsg-phase-dot[data-phase='idle'] { background: #8e8e93; }
.dsg-phase-dot[data-phase='waiting'] { background: #8e8e93; }
.dsg-phase-dot[data-phase='thinking'] { background: #4d6bfe; animation: dsg-pulse 1s ease-in-out infinite; }
.dsg-phase-dot[data-phase='tool'] { background: #ff9500; }
.dsg-phase-dot[data-phase='done'] { background: #34c759; }
@keyframes dsg-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.25); opacity: 0.7; }
}
.dsg-pet-label {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% + 2px);
  max-width: 220px;
  background: rgba(18, 18, 26, 0.82);
  color: #e8e8f0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  padding: 4px 9px;
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  backdrop-filter: blur(4px);
}
.dsg-pet-bubble {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(100% + 10px);
  background: rgba(18, 18, 26, 0.88);
  color: #e8e8f0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  padding: 5px 10px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
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
  background: rgba(18, 18, 26, 0.88);
  border-right: 1px solid rgba(255, 255, 255, 0.14);
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
}
@keyframes dsg-bubble {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
.dsg-popover {
  position: absolute;
  right: 0;
  bottom: calc(100% + 14px);
  width: 320px;
  max-height: 66vh;
  overflow-y: auto;
  background: rgba(24, 24, 34, 0.96);
  color: #e8e8f0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  padding: 14px;
  font-size: 13px;
  backdrop-filter: blur(8px);
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
  color: #fff;
}
.dsg-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
.dsg-field label {
  font-size: 12px;
  color: rgba(232, 232, 240, 0.75);
}
.dsg-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.3);
  color: #e8e8f0;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  padding: 6px 9px;
  font-size: 13px;
  outline: none;
}
.dsg-input:focus {
  border-color: #4d6bfe;
}
.dsg-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.dsg-btn {
  background: #4d6bfe;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.dsg-btn:hover { background: #5f7aff; }
.dsg-btn:disabled { opacity: 0.5; cursor: default; }
.dsg-btn-ghost {
  background: rgba(255, 255, 255, 0.08);
  color: #e8e8f0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.dsg-btn-ghost:hover { background: rgba(255, 255, 255, 0.14); }
.dsg-btn-danger {
  background: rgba(255, 69, 58, 0.85);
}
.dsg-btn-danger:hover { background: rgba(255, 69, 58, 1); }
.dsg-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 12px 0;
}
.dsg-hint {
  font-size: 11px;
  color: rgba(232, 232, 240, 0.55);
  margin: 6px 0 0;
  line-height: 1.4;
}
.dsg-error {
  font-size: 12px;
  color: #ff6b62;
  margin: 6px 0 0;
}
.dsg-note {
  font-size: 12px;
  color: #7ee2a8;
  margin: 6px 0 0;
}
.dsg-room-info {
  background: rgba(77, 107, 254, 0.14);
  border: 1px solid rgba(77, 107, 254, 0.4);
  border-radius: 10px;
  padding: 8px 10px;
  margin-bottom: 10px;
}
.dsg-room-info .dsg-room-code {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 3px;
  color: #fff;
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
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
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
  color: #fff;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsg-member .dsg-member-sub {
  font-size: 11px;
  color: rgba(232, 232, 240, 0.6);
}
.dsg-member .dsg-member-you {
  background: rgba(77, 107, 254, 0.35);
  border: 1px solid rgba(77, 107, 254, 0.55);
}
.dsg-member-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.dsg-member-dot[data-phase='idle'] { background: #8e8e93; }
.dsg-member-dot[data-phase='waiting'] { background: #8e8e93; }
.dsg-member-dot[data-phase='thinking'] { background: #4d6bfe; }
.dsg-member-dot[data-phase='tool'] { background: #ff9500; }
.dsg-member-dot[data-phase='done'] { background: #34c759; }
.dsg-summon {
  position: fixed;
  z-index: 2147483000;
  background: rgba(24, 24, 34, 0.9);
  color: #e8e8f0;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(6px);
}
.dsg-summon:hover { border-color: #4d6bfe; }
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
  color: rgba(232, 232, 240, 0.85);
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
  background: rgba(255, 255, 255, 0.18);
  border: none;
  cursor: pointer;
  flex: none;
  transition: background 0.15s;
}
.dsg-toggle[data-on='true'] { background: #4d6bfe; }
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
  color: #ffb400;
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
