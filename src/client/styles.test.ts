// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import {
  CSS,
  STYLE_TAG_ID,
  injectStyles,
  removeStyles,
} from './styles.ts'

afterEach(() => {
  removeStyles()
})

describe('injectStyles', () => {
  it('injects one shared style tag', () => {
    const first = injectStyles()
    const second = injectStyles()

    expect(first).toBe(second)
    expect(first?.textContent).toBe(CSS)
    expect(document.querySelectorAll(`style[data-plugin-css="${STYLE_TAG_ID}"]`)).toHaveLength(1)
  })

  it('refreshes a preserved style tag during HMR re-apply', () => {
    const style = injectStyles()
    if (style === undefined) throw new Error('style injection failed')
    style.textContent = '.stale { background: white; }'

    expect(injectStyles()).toBe(style)
    expect(style.textContent).toBe(CSS)
  })

  it('keeps sleep breathing while shadowing only the pet artwork', () => {
    expect(CSS).toMatch(/\.dsg-whale-breathe > svg,[^{]*\.dsg-whale-breathe > \.dsg-pet-img \{[^}]*display: block/s)
    expect(CSS).toMatch(/\.dsg-whale-breathe > svg,[^{]*\.dsg-whale-breathe > \.dsg-pet-img \{[^}]*drop-shadow\(/s)
    expect(CSS).not.toMatch(/\.dsg-crown svg \{[^}]*drop-shadow\(/s)
    expect(CSS).not.toMatch(/\.dsg-mini-crown svg \{[^}]*drop-shadow\(/s)
    expect(CSS).not.toContain('@property --dsg-float-y')
    expect(CSS).toMatch(/\.dsg-pet \.dsg-whale-wrap \{[^}]*transform: translateY\(0\) rotate\(0deg\)[^}]*transition: transform 280ms/s)
    expect(CSS).toMatch(/\.dsg-pet \.dsg-whale-breathe \{[^}]*animation: dsg-sleep-breathe/s)
    expect(CSS).toMatch(/\[data-active='true'\] \.dsg-whale-wrap \{[^}]*animation: dsg-active-float 1\.05s/s)
    expect(CSS).toMatch(/\[data-active='true'\]\[data-phase='tool'\] \.dsg-whale-wrap \{[^}]*animation-duration: 0\.72s/s)
    expect(CSS).toMatch(/\[data-active='true'\] \.dsg-whale-breathe \{[^}]*animation: dsg-wake-up/s)
    expect(CSS).not.toMatch(/\[data-phase='(?:waiting|thinking)'\] \.dsg-whale-wrap/)
    expect(CSS).toMatch(/@keyframes dsg-sleep-breathe \{[\s\S]*?50% \{ transform: scale\(1\.04, 0\.96\)/)
    expect(CSS).toMatch(/@keyframes dsg-wake-up \{[\s\S]*?from \{ transform: scale\(1\.04, 0\.96\)/)
    expect(CSS).toMatch(/@keyframes dsg-active-float \{[\s\S]*?50% \{ transform: translateY\(-14px\)/)
  })

  it('maps a waiting single-player pet to the active CSSOM rule', () => {
    const style = injectStyles()
    if (style?.sheet === null || style?.sheet === undefined) throw new Error('style sheet unavailable')
    const pet = document.createElement('div')
    pet.className = 'dsg-pet'
    pet.dataset.active = 'true'
    pet.dataset.phase = 'waiting'
    expect(pet.matches(".dsg-pet[data-active='true']")).toBe(true)

    const rules = [...style.sheet.cssRules].filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
    const waitingRule = rules.find((rule) => rule.selectorText === ".dsg-pet[data-active='true'] .dsg-whale-wrap")
    const baseRule = rules.find((rule) => rule.selectorText === '.dsg-pet .dsg-whale-wrap')
    const breatheRule = rules.find((rule) => rule.selectorText === '.dsg-pet .dsg-whale-breathe')
    const wakeRule = rules.find((rule) => rule.selectorText === ".dsg-pet[data-active='true'] .dsg-whale-breathe")
    expect(waitingRule?.style.animation).toContain('dsg-active-float')
    expect(baseRule?.style.animation).toBe('')
    expect(baseRule?.style.transform).toBe('translateY(0) rotate(0deg)')
    expect(breatheRule?.style.animation).toContain('dsg-sleep-breathe')
    expect(wakeRule?.style.animation).toContain('dsg-wake-up')

    pet.dataset.active = 'false'
    pet.dataset.phase = 'idle'
    expect(pet.matches(".dsg-pet[data-active='true']")).toBe(false)
  })

  it('maps plain token output to active float even while phase stays idle', () => {
    const style = injectStyles()
    if (style?.sheet === null || style?.sheet === undefined) throw new Error('style sheet unavailable')
    const rules = [...style.sheet.cssRules].filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
    const outputRule = rules.find((rule) => rule.selectorText === ".dsg-pet[data-active='true'] .dsg-whale-wrap")

    expect(outputRule?.style.animation).toContain('dsg-active-float')
  })

  it('fades the token shimmer in and out without replacing the label animation', () => {
    expect(CSS).toMatch(/\.dsg-pet-label::before \{[^}]*opacity: 0;[^}]*animation: dsg-label-shimmer[^}]*transition: opacity 260ms ease/s)
    expect(CSS).toMatch(/\.dsg-label-active::before \{[^}]*opacity: 1/s)
    expect(CSS).toMatch(/\.dsg-pet-label \{[^}]*transition:[^}]*box-shadow 260ms ease/s)
    expect(CSS).not.toMatch(/\.dsg-label-active \{[^}]*animation: dsg-label-shimmer/s)
  })

  it('uses DSH semantic surfaces for labels and chat in light and dark themes', () => {
    expect(CSS).toMatch(/\.dsg-pet-label \{[^}]*background: var\(--dsw-alias-bg-layer-3[^}]*color: var\(--dsw-alias-label-primary/s)
    expect(CSS).not.toMatch(/\.dsg-scene-label \{[^}]*(?:background|color|padding|font-size|box-shadow):/s)
    expect(CSS).toMatch(/\.dsg-chat-hint,[^{]*\.dsg-chat-bubble \{[^}]*background: var\(--dsw-alias-bg-layer-3[^}]*color: var\(--dsw-alias-label-primary/s)
    expect(CSS).toMatch(/\.dsg-chat-composer \{[^}]*background: var\(--dsw-alias-bg-layer-3/s)
    expect(CSS).toMatch(/\.dsg-chat-composer \.dsg-chat-input \{[^}]*color: var\(--dsw-alias-label-primary/s)
  })

  it('shows room labels by default and restores hover-only behavior when disabled', () => {
    expect(CSS).toMatch(/\.dsg-scene-label \{[^}]*opacity: 0/s)
    expect(CSS).toContain(".dsg-pet[data-show-label='true'] > .dsg-pet-label.dsg-scene-label")
    expect(CSS).toContain('.dsg-pet:hover > .dsg-pet-label.dsg-scene-label')
  })

  it('uses compact two-line labels with a bold own-player variant', () => {
    expect(CSS).toMatch(/\.dsg-pet-label \{[^}]*top: 100%[^}]*width: max-content[^}]*max-width: min\(var\(--dsg-label-max-width, 160px\), calc\(100vw - 16px\)\)[^}]*border-radius: 8px/s)
    expect(CSS).toMatch(/\.dsg-label-content \{[^}]*display: grid[^}]*justify-items: center/s)
    expect(CSS).toMatch(/\.dsg-label-player \{[^}]*max-width: 100%[^}]*font-weight: 400[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/s)
    expect(CSS).toMatch(/\.dsg-label-tokens \{[^}]*font-size: 11px[^}]*white-space: nowrap/s)
    expect(CSS).toContain(".dsg-pet-root[data-own='true'] > .dsg-pet > .dsg-pet-label .dsg-label-player,")
    expect(CSS).not.toContain(".dsg-pet-root[data-own='true'] .dsg-label-player,")
    expect(CSS).toMatch(/\.dsg-member \.dsg-member-name \{[^}]*font-weight: 400/s)
    expect(CSS).toMatch(/\.dsg-member\.dsg-member-you \.dsg-member-sub \{[^}]*font-weight: 700/s)
  })

  it('raises the hovered pet root and its active child surfaces', () => {
    expect(CSS).toMatch(/\.dsg-pet-root:hover,[^{]*\.dsg-pet-root:focus-within \{[^}]*z-index: 970/s)
    expect(CSS).toMatch(/\.dsg-pet-root\[data-dragging='true'\] \{[^}]*z-index: 980/s)
    expect(CSS).toMatch(/\.dsg-pet:hover > \.dsg-pet-label \{[^}]*z-index: 30/s)
    expect(CSS).toContain('.dsg-pet:hover > .dsg-chat-hint,')
    expect(CSS).toMatch(/\.dsg-pet-root\[data-own='true'\]\[data-chat-open='true'\] \{[^}]*z-index: 990/s)
    expect(CSS).toMatch(/\.dsg-pet-root\[data-own='true'\]\[data-chat-open='true'\] > \.dsg-pet \{[^}]*z-index: 990/s)
    expect(CSS).toMatch(/\.dsg-chat-composer \{[^}]*z-index: 40/s)
  })

  it('keeps the chat composer viewport-safe near either screen edge', () => {
    expect(CSS).toMatch(/\.dsg-chat-composer \{[^}]*left: calc\(50% \+ var\(--dsg-chat-composer-shift-x, 0px\)\)[^}]*box-sizing: border-box[^}]*width: min\(286px, calc\(100vw - 16px\)\)/s)
    expect(CSS).toMatch(/\.dsg-chat-composer \.dsg-chat-input \{[^}]*flex: 1[^}]*width: auto[^}]*min-width: 0/s)
  })

  it('sizes chat bubbles to their content within a viewport-safe cap', () => {
    expect(CSS).toMatch(/\.dsg-chat-bubble \{[^}]*box-sizing: border-box[^}]*width: max-content[^}]*min-width: 0[^}]*max-width: min\(280px, calc\(100vw - 24px\)\)/s)
    expect(CSS).toMatch(/\.dsg-chat-bubble \{[^}]*overflow-wrap: anywhere/s)
  })

  it('styles grid dimensions as compact theme-aware numeric controls', () => {
    expect(CSS).toMatch(/\.dsg-grid-size \{[^}]*grid-template-columns: 1fr auto 1fr/s)
    expect(CSS).toMatch(/\.dsg-grid-size input \{[^}]*background: var\(--dsw-alias-bg-layer-2[^}]*color: var\(--dsw-alias-label-primary/s)
    expect(CSS).not.toContain('.dsg-chat-from')
  })
})
