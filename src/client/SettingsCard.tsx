/**
 * dsh-games settings card — a self-contained form over the games HTTP API
 * (nickname / hatTokenStep / enabled + demo boost). It deliberately does not
 * depend on the settings-surface namespace exposure: the official
 * dsh-host-apiproxy allowlists third-party namespaces out, so the card
 * talks to `/api/games/*` directly (the host mirrors values into the
 * settings document itself).
 * @module @linxin666/dsh-games/client/SettingsCard
 */

import { useEffect, useState, type ReactElement } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { gamesApi, type GamesState } from './api.ts'
import { formatTokens } from './locales.ts'

/** The registration-side face (empty: the card drives itself via the API). */
export interface GamesSettingsCardFace {
  /** Marker field: no injected share is needed. */
  children?: never
}

/** Props the renderer binds for the games settings card. */
export type GamesSettingsCardProps =
  PropsRuntime<'web-ui.plugin.item'>
  & PropsLocale<'games'>
  & GamesSettingsCardFace

/** Draft state of one editable field. */
interface Draft<T> {
  /** Staged text the input renders. */
  text: string
  /** True while the draft differs from the stored value. */
  dirty: boolean
}

/** The games settings card body. */
export function GamesSettingsCard(props: GamesSettingsCardProps): ReactElement {
  const { t } = props
  const [state, setState] = useState<GamesState | null>(null)
  const [nickname, setNickname] = useState<Draft<string>>({ text: '', dirty: false })
  const [hatStep, setHatStep] = useState<Draft<string>>({ text: '', dirty: false })
  const [enabledDraft, setEnabledDraft] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // Load the current host state once; the card is a snapshot, not a poller.
  useEffect(() => {
    let cancelled = false
    gamesApi.state().then((next) => {
      if (cancelled) return
      setState(next)
      setNickname({ text: next.nickname, dirty: false })
      setHatStep({ text: String(next.hatTokenStep), dirty: false })
    }, () => {
      if (!cancelled) setNote(t('room.offline'))
    })
    return () => { cancelled = true }
  }, [t])

  const hatStepParsed = Number(hatStep.text)
  const hatStepValid = hatStep.text.trim() === '' || (Number.isFinite(hatStepParsed) && hatStepParsed >= 1)
  const dirty = nickname.dirty || hatStep.dirty || enabledDraft !== null

  const save = async (): Promise<void> => {
    if (!hatStepValid) return
    setSaving(true)
    setNote(null)
    try {
      if (nickname.dirty && nickname.text.trim() !== '') {
        const result = await gamesApi.setNickname(nickname.text.trim())
        if (result.ok) setNickname({ text: nickname.text.trim(), dirty: false })
      }
      if (hatStep.dirty && hatStepValid) {
        const result = await gamesApi.config({ hatTokenStep: Math.round(hatStepParsed) })
        if (result.ok) setHatStep({ text: String(Math.round(hatStepParsed)), dirty: false })
      }
      if (enabledDraft !== null) {
        const result = await gamesApi.config({ enabled: enabledDraft })
        if (result.ok) setEnabledDraft(null)
      }
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1_500)
      // Refresh the host state so hats/step stay in sync.
      const next = await gamesApi.state()
      setState(next)
    } catch {
      setNote(t('room.offline'))
    } finally {
      setSaving(false)
    }
  }

  const boost = async (): Promise<void> => {
    setNote(null)
    try {
      const step = state?.hatTokenStep ?? (Number.isFinite(hatStepParsed) ? hatStepParsed : 100_000_000)
      const result = await gamesApi.boost(Math.max(1, Math.round(step)))
      setNote(t('settings.boosted', { tokens: formatTokens(result.tokens), hats: result.hats }))
      const next = await gamesApi.state()
      setState(next)
    } catch {
      setNote(t('room.offline'))
    }
  }

  if (state === null) {
    return (
      <div className="dsg-settings-card" data-testid="games-settings-card">
        <h3>{t('settings.title')}</h3>
        <p className="dsg-hint">{t('room.connecting')}</p>
      </div>
    )
  }

  const enabledValue = enabledDraft ?? state.enabled

  return (
    <div className="dsg-settings-card" data-testid="games-settings-card">
      <h3>{t('settings.title')}</h3>
      <p className="dsg-hint" style={{ marginTop: 0 }}>{t('settings.description')}</p>

      <div className="dsg-field-row">
        <label>{t('settings.enabled')}</label>
        <button
          type="button"
          className="dsg-toggle"
          data-on={enabledValue}
          aria-pressed={enabledValue}
          onClick={() => setEnabledDraft(!enabledValue)}
        />
      </div>

      <div className="dsg-field-row">
        <label>{t('settings.nickname')}</label>
        <input
          className="dsg-input"
          value={nickname.text}
          maxLength={24}
          placeholder={t('settings.inherit')}
          onChange={(e) => setNickname({ text: e.target.value, dirty: e.target.value !== state.nickname })}
        />
      </div>

      <div className="dsg-field-row">
        <label title={t('settings.hatTokenStepHint')}>{t('settings.hatTokenStep')}</label>
        <input
          className="dsg-input"
          value={hatStep.text}
          placeholder={t('settings.inherit')}
          onChange={(e) => setHatStep({ text: e.target.value, dirty: e.target.value !== String(state.hatTokenStep) })}
        />
      </div>
      {!hatStepValid && <p className="dsg-error">{t('settings.invalidNumber')}</p>}

      <div className="dsg-actions">
        {dirty && <span className="dsg-dirty">{t('settings.unsaved')}</span>}
        {saved && <span className="dsg-note">{t('settings.saved')}</span>}
        <button
          type="button"
          className="dsg-btn-ghost"
          disabled={!dirty || saving}
          onClick={() => { void save() }}
          data-testid="games-settings-save"
        >
          {t('settings.save')}
        </button>
        <button
          type="button"
          className="dsg-btn"
          disabled={saving}
          onClick={() => { void boost() }}
          data-testid="games-settings-boost"
        >
          {t('settings.boost')}
        </button>
      </div>
      {note !== null && <p className="dsg-note" data-testid="games-settings-note">{note}</p>}
    </div>
  )
}
