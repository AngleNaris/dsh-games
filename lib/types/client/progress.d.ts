import { type GameRules } from '../rules.ts';
export interface TokenProgressBaseline {
    tokens: number;
    crowns: number[];
    ruleKey: string;
}
export interface TokenProgressResult {
    baseline: TokenProgressBaseline;
    delta: number;
    crownTier: number | null;
}
export declare function crownsAtTokens(tokens: number, rules: GameRules | null): number[];
export declare function createTokenProgressBaseline(tokens: number, rules: GameRules | null): TokenProgressBaseline;
export declare function settleTokenProgress(previous: TokenProgressBaseline, nextTokens: number, rules: GameRules | null): TokenProgressResult;
//# sourceMappingURL=progress.d.ts.map