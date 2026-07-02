// Pure helper — map GlobalMissionAction.key ↔ entity_signals.external_ref.
// v0: identity mapping. external_ref uses the same opaque keys Mission emits.

export function externalRefForActionKey(key: string): string {
  return key;
}

export type EntityLink = {
  entityId: string;
  entityName: string;
  entitySlug: string;
};

export function buildActionEntityMap(
  signals: Array<{ external_ref: string; entity_id: string }>,
  entities: Array<{ id: string; name: string; slug: string }>,
): Map<string, EntityLink> {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const map = new Map<string, EntityLink>();
  for (const s of signals) {
    const e = byId.get(s.entity_id);
    if (!e) continue;
    map.set(s.external_ref, { entityId: e.id, entityName: e.name, entitySlug: e.slug });
  }
  return map;
}
