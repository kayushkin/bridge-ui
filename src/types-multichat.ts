// multichat's unified contact list as the Inbound rules page reads it. The rule
// records themselves come from `@kayushkin/multichat-types`, rendered from Go;
// this one is hand-written because multichat assembles the contact answer from
// unnamed types in its router, so there is nothing for tygo to render yet.

/** One person on one app: the bridge puppet id a rule's `sender_user_id` names. */
export interface MultichatContactIdentity {
  user_id: string
  platform: string
}

/** `GET {multichatBasePath}/contacts/unified` — one row per person, with every
 *  app identity multichat merged under that display name. */
export interface MultichatUnifiedContact {
  display_name: string
  identities: MultichatContactIdentity[]
}
