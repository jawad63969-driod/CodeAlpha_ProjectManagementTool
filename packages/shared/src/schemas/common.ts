import { z } from 'zod';

export const idSchema = z.string().min(6).max(64);
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex colour like #6366f1');
export const emailSchema = z.string().trim().toLowerCase().pipe(z.string().email('Enter a valid email address'));
/** Calendar date with no time component — due dates are days, not instants. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const versionSchema = z.number().int().min(1);

/** `null` clears the field, `undefined` leaves it untouched — see ARCHITECTURE §8. */
export const nullableOptional = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional();
