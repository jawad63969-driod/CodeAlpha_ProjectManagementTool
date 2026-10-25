import crypto from 'node:crypto';

/**
 * Lexicographically sortable, URL-safe, prefixed identifiers.
 *
 * Layout: `<prefix>_<10 chars of timestamp><16 chars of randomness>` in Crockford
 * base32. Sorting by id therefore sorts by creation time, which makes cursor
 * pagination and "newest first" queries index-friendly without a second column.
 * Prefixes make an id self-describing in logs and error reports.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LEN = 10;
const RANDOM_LEN = 16;

const encodeTime = (ms: number): string => {
  let value = ms;
  let out = '';
  for (let i = TIME_LEN - 1; i >= 0; i -= 1) {
    out = ALPHABET[value % 32] + out;
    value = Math.floor(value / 32);
  }
  return out;
};

const encodeRandom = (): string => {
  const bytes = crypto.randomBytes(RANDOM_LEN);
  let out = '';
  for (let i = 0; i < RANDOM_LEN; i += 1) out += ALPHABET[bytes[i]! % 32];
  return out;
};

export const ID_PREFIX = {
  organization: 'org',
  user: 'usr',
  orgMember: 'omb',
  session: 'ses',
  family: 'fam',
  project: 'prj',
  projectMember: 'pmb',
  board: 'brd',
  status: 'sts',
  column: 'col',
  label: 'lbl',
  task: 'tsk',
  comment: 'cmt',
  attachment: 'att',
  activity: 'act',
  notification: 'ntf',
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

export const newId = (prefix: IdPrefix): string =>
  `${prefix}_${encodeTime(Date.now())}${encodeRandom()}`;

/**
 * An id whose embedded timestamp is `ms` rather than now.
 *
 * Only the seed uses this. Back-dating a row's `created_at` without also
 * back-dating its id silently breaks the ordering invariant above: the
 * activity feed sorts by id, so history written in one transaction came back
 * in random order and the day headings repeated.
 */
export const newIdAt = (prefix: IdPrefix, ms: number): string =>
  `${prefix}_${encodeTime(ms)}${encodeRandom()}`;

export const isId = (value: unknown, prefix?: IdPrefix): value is string =>
  typeof value === 'string' && (prefix ? value.startsWith(`${prefix}_`) : /^[a-z]{3}_[0-9A-Z]{26}$/.test(value));
