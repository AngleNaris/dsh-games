/**
 * dsh-games settings card — a collapsible DSH-style plugin item: a card
 * header (name + description + chevron) that reveals the form below, like the
 * official plugin cards in DSH's own 设置 → 插件 list. The form is a
 * self-contained editor over the games HTTP API (enabled / hide-pet /
 * server URL + auth token). Game rules (crown ladder, upload caps) are
 * configured on the game server and shown read-only here.
 *
 * It deliberately does not depend on the settings-surface namespace exposure:
 * the official dsh-host-apiproxy allowlists third-party namespaces out, so
 * the card talks to `/api/games/*` directly (the host mirrors values into the
 * settings document itself).
 * @module @linxin666/dsh-games/client/SettingsCard
 */

import { useEffect, useState, type ReactElement } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { gameServerApi, gamesApi, type GameRules, type GamesState } from './api.ts'
import { formatTokens } from './locales.ts'

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
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<GamesState | null>(null)
  const [rules, setRules] = useState<GameRules | null>(null)
  const [serverUrl, setServerUrl] = useState<Draft<string>>({ text: '', dirty: false })
  const [authToken, setAuthToken] = useState<Draft<string>>({ text: '', dirty: false })
  const [enabledDraft, setEnabledDraft] = useState<boolean | null>(null)
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
      setServerUrl({ text: next.serverUrl, dirty: false })
      setAuthToken({ text: next.authToken, dirty: false })
    }, () => {
      if (!cancelled) setNote(t('room.offline'))
    })
    return () => { cancelled = true }
  }, [t])

  // Fetch the game server's rules for the read-only summary.
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

  const dirty = serverUrl.dirty || authToken.dirty
    || enabledDraft !== null || visibleDraft !== null

  const save = async (): Promise<void> => {
    setSaving(true)
    setNote(null)
    try {
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

  const header = (
    <button
      type="button"
      className="dsg-settings-header"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      data-testid="games-settings-toggle"
    >
      <span className="dsg-settings-head-text">
        <span className="dsg-settings-name">{t('settings.title')}</span>
        <span className="dsg-settings-desc">{t('settings.description')}</span>
      </span>
      {dirty && <span className="dsg-settings-pending">{t('settings.unsaved')}</span>}
      <IconChevronDownOutline14 className={open ? 'dsg-settings-chevron dsg-settings-chevron-open' : 'dsg-settings-chevron'} />
    </button>
  )

  if (state === null) {
    return (
      <div className="dsg-settings-card" data-testid="games-settings-card">
        {header}
        {open && <div className="dsg-settings-body"><p className="dsg-hint">{t('room.connecting')}</p></div>}
      </div>
    )
  }

  const enabledValue = enabledDraft ?? state.enabled
  const visibleValue = visibleDraft ?? state.display.visible
  const step = rules?.crown.tokenStep ?? state.crownTokenStep

  return (
    <div className="dsg-settings-card" data-open={open} data-testid="games-settings-card">
      {header}
      {open && (
        <div className="dsg-settings-body">
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
            {saved && <span className="dsg-note">{t('settings.saved')}</span>}
            <button
              type="button"
              className="dsg-btn"
              disabled={!dirty || saving}
              onClick={() => { void save() }}
              data-testid="games-settings-save"
            >
              {t('settings.save')}
            </button>
          </div>
          {note !== null && <p className="dsg-note" data-testid="games-settings-note">{note}</p>}
        </div>
      )}
    </div>
  )
}
