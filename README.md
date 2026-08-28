<div align="center">

# tessel

Schema validation for TypeScript. Build a schema once, get the static type for free, and get error paths that point at exactly the field that went wrong.

![License](https://img.shields.io/badge/LICENSE-MIT-blue?style=for-the-badge)  ![Language](https://img.shields.io/badge/TYPESCRIPT-3178c6?style=for-the-badge&logo=typescript&logoColor=white)  ![Tests](https://img.shields.io/badge/TESTS-33-brightgreen?style=for-the-badge)

Refer to [LICENSE](LICENSE) for the legal bits.

</div>

## What's in it

- **Inferred types.** `Infer<typeof schema>` gives you the output type. Keys whose schema accepts `undefined` become optional properties automatically.
- **Primitives** with chainable checks: `string` (min, max, length, regex, email, uuid, url, startsWith, trim), `number` (int, finite, min, max, positive, multipleOf), `boolean`, `date`, `literal`, `enum` and `any`.
- **Composites:** `array`, `tuple`, `object`, `record` and `union`. Objects can be `strict()`, `passthrough()` or stripped (the default), and support `extend`, `pick`, `omit` and `partial`.
- **Wrappers:** `optional`, `nullable`, `nullish`, `default`, `refine`, `transform` and `lazy` for recursive schemas.
- **Error paths.** Every issue carries a path such as `users[1].address.zip`, a code and a message. All issues are collected in one pass instead of stopping at the first. Failed unions keep each member's issues.
- **Two ways to run:** `parse` throws a `TesselError`, `safeParse` returns a result you can narrow on `success`.
- No runtime dependencies, strict TypeScript throughout.

```ts
import { t, type Infer } from 'tessel';

const user = t.object({
  name: t.string().min(1),
  email: t.string().email(),
  age: t.number().int().min(0).optional(),
  tags: t.array(t.string()).default([])
});

type User = Infer<typeof user>;
```

## 🏗️ Architecture

```
 t.*  (builder, src/index.ts)
   │
   ▼
 Schema<Out>  ── run(input, path) ──► Parsed<Out> = { ok, value } | { ok: false, issues[] }
   ├─ StringSchema, NumberSchema, BooleanSchema, DateSchema, LiteralSchema, EnumSchema
   ├─ ArraySchema, TupleSchema, ObjectSchema, RecordSchema, UnionSchema
   └─ OptionalSchema, NullableSchema, DefaultSchema, RefineSchema, TransformSchema, LazySchema
   │
   ▼
 parse() / safeParse() ──► TesselError { issues[], flatten() }
```

- `src/schema.ts` has the abstract `Schema` class and every schema. Each one implements a single `run(input, path)` that returns issues instead of throwing, which is what lets parsers compose and report several errors at once.
- `src/errors.ts` has `Issue`, `TesselError`, path formatting and the `Result` type.
- `src/index.ts` is the `t` builder plus the public exports.
- Schemas are immutable. Every chained check returns a new schema, so `base.min(5)` never changes `base`.

## 🚀 Quick start

```
npm install
npm run typecheck
npm test
```

A quick taste, using the schema above:

```ts
const ok = user.parse({ name: 'Sam', email: 'sam@example.com' });
console.log(ok);

const bad = user.safeParse({ name: '', email: 'nope', age: 1.5, tags: ['a', 7] });
if (!bad.success) console.log(bad.error.flatten());
```

Which prints:

```
{ name: 'Sam', email: 'sam@example.com', tags: [] }
{
  name: [ 'must be at least 1 characters' ],
  email: [ 'must be a valid email address' ],
  age: [ 'expected an integer' ],
  'tags[1]': [ 'expected string, received number' ]
}
```

## 🧪 Testing

33 tests, all passing, and `tsc --noEmit` is clean under `strict` and `noUncheckedIndexedAccess`:

- Primitives (10): every string and number check, formats, trim, NaN handling, dates, literals, enums, global regex state.
- Composites (23): object, array, tuple, record and union behaviour, error paths and `flatten`, strict and passthrough modes, `extend`, `pick`, `omit`, `partial`, wrappers, defaults, refinements with custom paths, transforms, recursive schemas and immutability.
- The inferred types are asserted at compile time with an `Equal` helper in the composite tests, so a regression in inference fails `npm run typecheck`.
