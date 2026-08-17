/**
 * dsh-games settings card — a self-contained form over the games HTTP API
 * (enabled / hide-pet / nickname / pet pattern / server URL + auth token +
 * demo boost). Game rules (crown ladder, upload caps) are configured on the
 * game server and shown read-only here.
 *
 * It deliberately does not depend on the settings-surface namespace exposure:
 * the official dsh-host-apiproxy allowlists third-party namespaces out, so
 * the card talks to `/api/games/*` directly (the host mirrors values into the
 * settings document itself).
 * @module @linxin666/dsh-games/client/SettingsCard
 */

import { useEffect, useState, type ReactElement } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { gameServerApi, gamesApi, type GameRules, type GamesState } from './api.ts'
import { formatTokens } from './locales.ts'
import { PET_VARIANTS } from './whale.tsx'

/** The registration-side face (empty: the card drives itself via the API). */
export interface GamesSettingsCardFace {
  /** Marker field: no injected share is needed. */
  children?: never
}

/** Props the renderer binds for the games settings card. */
export type GamesSettingsCardProps =
  PropsRuntime<'settings.plugin.item'>
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
  const [rules, setRules] = useState<GameRules | null>(null)
  const [nickname, setNickname] = useState<Draft<string>>({ text: '', dirty: false })
  const [serverUrl, setServerUrl] = useState<Draft<string>>({ text: '', dirty: false })
  const [authToken, setAuthToken] = useState<Draft<string>>({ text: '', dirty: false })
  const [enabledDraft, setEnabledDraft] = useState<boolean | null>(null)
  const [variantDraft, setVariantDraft] = useState<string | null>(null)
  const [visibleDraft, setVisibleDraft] = useState<boolean | null>(null)
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
      setServerUrl({ text: next.serverUrl, dirty: false })
      setAuthToken({ text: next.authToken, dirty: false })
    }, () => {
      if (!cancelled) setNote(t('room.offline'))
    })
    return () => { cancelled = true }
  }, [t])

  // Fetch the game server's rules for the read-only summary and the boost amount.
  useEffect(() => {
    if (state === null) return
    let cancelled = false
    gameServerApi.rules(state.serverUrl, state.authToken).then((result) => {
      if (!cancelled) setRules(result.rules)
    }, () => {
      if (!cancelled) setRules(null)
    })
    return () => { cancelled = true }
  }, [state?.serverUrl, state?.authToken])

  const dirty = nickname.dirty || serverUrl.dirty || authToken.dirty
    || enabledDraft !== null || variantDraft !== null || visibleDraft !== null

  const save = async (): Promise<void> => {
    setSaving(true)
    setNote(null)
    try {
      if (nickname.dirty && nickname.text.trim() !== '') {
        const result = await gamesApi.setNickname(nickname.text.trim())
        if (result.ok) setNickname({ text: nickname.text.trim(), dirty: false })
      }
      if (variantDraft !== null) {
        const result = await gamesApi.config({ petVariant: variantDraft })
        if (result.ok) setVariantDraft(null)
      }
      if (serverUrl.dirty) {
        const result = await gamesApi.config({ serverUrl: serverUrl.text.trim() })
        if (result.ok) setServerUrl({ text: serverUrl.text.trim(), dirty: false })
      }
      if (authToken.dirty) {
        const result = await gamesApi.config({ authToken: authToken.text.trim() })
        if (result.ok) setAuthToken({ text: authToken.text.trim(), dirty: false })
      }
      if (enabledDraft !== null) {
        const result = await gamesApi.config({ enabled: enabledDraft })
        if (result.ok) setEnabledDraft(null)
      }
      if (visibleDraft !== null) {
        const result = await gamesApi.setDisplay({ visible: visibleDraft })
        if (result.ok) setVisibleDraft(null)
      }
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1_500)
      // Refresh the host state so crowns/step stay in sync.
      const next = await gamesApi.state()
      setState(next)
      setNote(null)
    } catch {
      setNote(t('room.offline'))
    } finally {
      setSaving(false)
    }
  }

  const boost = async (): Promise<void> => {
    setNote(null)
    try {
      // One bronze crown's worth, per the game server's rules.
      const step = rules?.crown.tokenStep ?? state?.crownTokenStep ?? 1_000_000
      const result = await gamesApi.boost(Math.max(1, Math.round(step)))
      setNote(t('settings.boosted', { tokens: formatTokens(result.tokens), crowns: result.crownUnits }))
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
  const visibleValue = visibleDraft ?? state.display.visible
  const variantValue = variantDraft ?? state.petVariant
  const step = rules?.crown.tokenStep ?? state.crownTokenStep

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
        <label title={t('settings.hidePetHint')}>{t('settings.hidePet')}</label>
        <button
          type="button"
          className="dsg-toggle"
          data-on={!visibleValue}
          aria-pressed={!visibleValue}
          onClick={() => setVisibleDraft(!visibleValue)}
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
        <label title={t('settings.petVariantHint')}>{t('settings.petVariant')}</label>
        <select
          className="dsg-input dsg-select"
          value={variantValue}
          onChange={(e) => setVariantDraft(e.target.value)}
        >
          {PET_VARIANTS.map((variant) => (
            <option key={variant.id} value={variant.id}>{t(variant.nameKey as 'petVariant.default')}</option>
          ))}
        </select>
      </div>

      <div className="dsg-field-row">
        <label title={t('settings.serverUrlHint')}>{t('settings.serverUrl')}</label>
        <input
          className="dsg-input"
          value={serverUrl.text}
          placeholder={t('settings.inherit')}
          onChange={(e) => setServerUrl({ text: e.target.value, dirty: e.target.value !== state.serverUrl })}
        />
      </div>

      <div className="dsg-field-row">
        <label title={t('settings.authTokenHint')}>{t('settings.authToken')}</label>
        <input
          className="dsg-input"
          value={authToken.text}
          placeholder={t('settings.inherit')}
          onChange={(e) => setAuthToken({ text: e.target.value, dirty: e.target.value !== state.authToken })}
        />
      </div>

      {rules !== null && (
        <p className="dsg-hint" data-testid="games-rules-note">
          {t('settings.rulesSummary', {
            step: formatTokens(step),
            base: rules.crown.base,
            levels: rules.crown.levels.length,
            maxBytes: Math.round(rules.pet.maxBytes / 1024 / 1024 * 10) / 10,
            maxDimension: rules.pet.maxDimension,
          })}
        </p>
      )}

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
