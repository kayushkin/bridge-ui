// Principals, as principal-store (:8314) serves them.
//
// A principal is whoever a card can be assigned to: a human or a group. The
// store owns the id — `principal_000001`, never a bare uuid, for the same
// reason prediction-store prefixes its ids: dash's resolver probes every
// entity-type row whose id pattern matches, and noteboard already claims the
// uuid shape. Cards join on `id`; `display_name` rides along for display only.
export {};
//# sourceMappingURL=types-principals.js.map