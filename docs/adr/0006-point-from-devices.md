# A point is composed of devices and cables

Status: accepted

The «point from devices» model (`src/domain/compose.js`) replaced the first attempt, a manual «cat7×1» field. Chain: cable (kind and works per cable) → device (cables and its works) → point type (default composition and works per point) → the point's own composition. Tasks and statuses are computed from it.

## Consequences

- Keystone termination at the point and termination in the rack are different works.
- A pull of a point with several cable kinds is marked per kind, so an extra cat7 is not forgotten.
- Cables by label is the default rule (single 1, double 2, triple 3) only for types whose composition has one cable kind and it is cat7; doors (6005×3) are untouched; exceptions are edited by hand.
- `ownWorks` sits on top of type, devices and cables without changing them; pulls are not edited this way (they come from cables); it does not work for legacy types.
- Two type schemes coexist: legacy (no `devices`/`cables`, statuses in `status.js`) and composite; the owner's project is all composite, `seed.js` still has legacy types.
