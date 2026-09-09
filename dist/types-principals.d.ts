export type PrincipalKind = 'human' | 'group';
export interface Principal {
    /** `principal_000001`. The only thing a card assignment stores. */
    id: string;
    kind: PrincipalKind;
    display_name: string;
    email: string;
    /** Unix seconds. 0 while the principal is active; set once they are
     * disabled. A disabled principal still resolves — a card assigned to someone
     * who left must keep showing their name — but is never offered again. */
    disabled_at: number;
    /** Unix seconds. */
    created_at: number;
    /** Unix seconds. */
    updated_at: number;
}
//# sourceMappingURL=types-principals.d.ts.map