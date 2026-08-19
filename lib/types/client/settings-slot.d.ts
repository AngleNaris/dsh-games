/** Stable keyed-slot cell occupied by the games settings card. */
export declare const GAMES_SETTINGS_SLOT: {
    readonly name: "settings.plugin.item";
    readonly key: "games";
};
/**
 * Compatibility fields for pre-keyed DSH builds. New keyed runtimes ignore
 * them, while older list runtimes still require them during registration.
 */
export declare const LEGACY_GAMES_SETTINGS_SLOT: {
    readonly id: "games";
    readonly order: 150;
};
//# sourceMappingURL=settings-slot.d.ts.map