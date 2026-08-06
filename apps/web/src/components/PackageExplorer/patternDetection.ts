/**
 * Heuristic detection of Sui Move's three signature design patterns -
 * Capability, Witness/OTW, and Hot Potato - purely from the normalized
 * datatype/function shapes the package explorer already has (abilities,
 * field names, and pre-rendered parameter/return type strings). No bytecode
 * or on-chain calls involved, so every result here is a suggestive signal
 * for the UI, not a proof.
 */
import type { MoveDatatype, MoveFunction, MoveModule } from '@/api/services/packages';

export type AbilityPattern = 'capability' | 'witness-shape' | 'hot-potato';

/** Classify a datatype by its ability set alone - the cheapest, first-pass
 * signal for which of the three patterns (if any) it might be. */
export function classifyByAbilities(dt: MoveDatatype): AbilityPattern | null {
  if (dt.abilities.includes('key')) return 'capability';
  if (dt.abilities.length === 1 && dt.abilities[0] === 'drop') return 'witness-shape';
  if (dt.abilities.length === 0) return 'hot-potato';
  return null;
}

/** Every real Sui object's first field is its `UID` - this is enforced by the
 * verifier for every `key`-ability datatype, so on its own it's a no-op
 * filter (every `key` datatype already satisfies it). It exists to rule out
 * the hypothetical non-object shape, not to distinguish capabilities from
 * plain objects - see `hasCapabilityName` for that. */
export function hasUidFirstField(dt: MoveDatatype): boolean {
  return /::object::UID$/.test(dt.fields[0]?.type ?? '');
}

/** Sui's near-universal naming convention for capability/authorization
 * tokens - `AdminCap`, `MintCap`, `TreasuryCap`, `UpgradeCap`, etc. Because
 * every `key`-ability datatype trivially satisfies `hasUidFirstField` (the
 * verifier requires it), this name check is what actually separates a
 * genuine capability from the far more common case of a plain owned/shared
 * object (an NFT, a pool, a config record) that merely has `key`. */
export function hasCapabilityName(dt: MoveDatatype): boolean {
  return dt.name.endsWith('Cap');
}

/** 3 of the 4 One-Time-Witness rules that need no function correlation: no
 * fields, no generics, and an all-caps name matching its module. The 4th
 * rule (the `drop`-only ability set) is `classifyByAbilities === 'witness-shape'`. */
export function isOtwNameShape(dt: MoveDatatype, moduleName: string): boolean {
  return (
    dt.fields.length === 0 &&
    dt.typeParameters.length === 0 &&
    dt.name === moduleName.toUpperCase()
  );
}

// ---------------------------------------------------------------------------
// Module-level correlation: these scan function signatures for strings that
// reference a given datatype by name.
//
// RISK: parameters/returns are pre-rendered strings (e.g. "&mut AdminCap",
// "0xPKG::lp::LPCap<T0, T1>"), not structured types, so matching is a suffix
// regex against `::${dt.name}`, tolerant of a trailing generic instantiation.
// This cannot distinguish a real reference to `dt` from an unrelated struct
// that happens to share its name in another module, and it cannot tell a
// generic type parameter placeholder (rendered as "T0", "T1", ...) from an
// actual datatype literally named "T0". Treat every result below as a
// suggestive signal to surface alongside the related functions, never as a
// confirmed fact about the bytecode.
// ---------------------------------------------------------------------------

/** Whether a pre-rendered parameter/return type string is a reference to
 * `dt` - by value or by `&`/`&mut` - tolerant of `dt` being instantiated
 * generically (e.g. `LPCap<T0, T1>` still counts for `dt.name === 'LPCap'`).
 * Move identifiers are alphanumeric/underscore only, so no regex-escaping
 * of `dt.name` is needed. */
export function referencesType(typeStr: string, dt: MoveDatatype): { byRef: boolean } | null {
  const pattern = new RegExp(`::${dt.name}(<.*>)?$`);
  return pattern.test(typeStr) ? { byRef: typeStr.startsWith('&') } : null;
}

/** The module initializer Sui calls once at publish time - the only place an
 * OTW can legitimately be consumed. */
export function findInitFunction(mod: MoveModule): MoveFunction | undefined {
  return mod.functions.find((f) => f.name === 'init' && f.visibility === 'private' && !f.isEntry);
}

/** Confirms an OTW-shaped witness is actually consumed the way an OTW must
 * be: as `init`'s first parameter, by value (a reference can't be the OTW). */
export function confirmOtw(dt: MoveDatatype, mod: MoveModule): boolean {
  const firstParam = findInitFunction(mod)?.parameters[0];
  if (!firstParam) return false;
  const ref = referencesType(firstParam, dt);
  return ref !== null && !ref.byRef;
}

/** Functions that hand out (`producers`, via return type) or unpack by value
 * (`consumers`, via a non-reference parameter - a hot potato must be
 * destructured, so a `&`/`&mut` parameter doesn't count) a hot-potato type.
 * Move's field-privacy rules confine both construction and destructuring of
 * `dt` to its own defining module, so same-module scanning is correct here
 * (unlike `findCapabilityGates` below). */
export function findHotPotatoFlow(
  dt: MoveDatatype,
  mod: MoveModule
): { producers: string[]; consumers: string[] } {
  const producers: string[] = [];
  const consumers: string[] = [];
  for (const fn of mod.functions) {
    if (fn.returns.some((r) => referencesType(r, dt) !== null)) producers.push(fn.name);
    if (
      fn.parameters.some((p) => {
        const ref = referencesType(p, dt);
        return ref !== null && !ref.byRef;
      })
    )
      consumers.push(fn.name);
  }
  return { producers, consumers };
}

/** Functions gated behind holding a reference to a capability type, searched
 * across every module in the package - not just `dt`'s own defining module.
 * Unlike Hot-Potato/OTW, a capability has no field-privacy restriction on
 * where it's *used*: it's common (and idiomatic) to define the cap in one
 * module and gate functions in others. Each result is qualified with its
 * module (`module::function`) since it may not be `dt`'s home module. */
export function findCapabilityGates(dt: MoveDatatype, modules: MoveModule[]): string[] {
  const gates: string[] = [];
  for (const mod of modules) {
    for (const fn of mod.functions) {
      const isGated = fn.parameters.some((p) => {
        const ref = referencesType(p, dt);
        return ref !== null && ref.byRef;
      });
      if (isGated) gates.push(`${mod.name}::${fn.name}`);
    }
  }
  return gates;
}
