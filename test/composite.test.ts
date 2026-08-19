import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, formatPath, type Infer, type Schema } from '../src/index.js';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function expectType<_T extends true>(): void {}

const user = t.object({
  name: t.string().min(1),
  age: t.number().int().optional(),
  tags: t.array(t.string()),
  role: t.enum(['admin', 'user'])
});

test('infers object types with optional keys', () => {
  type User = Infer<typeof user>;
  expectType<Equal<User, { name: string; tags: string[]; role: 'admin' | 'user'; age?: number | undefined }>>();
  const parsed: User = user.parse({ name: 'sam', tags: [], role: 'user' });
  assert.deepEqual(parsed, { name: 'sam', tags: [], role: 'user' });
});

test('infers unions, tuples, records, nullable and literals', () => {
  expectType<Equal<Infer<ReturnType<typeof t.string>>, string>>();
  const u = t.union([t.string(), t.number()]);
  expectType<Equal<Infer<typeof u>, string | number>>();
  const tuple = t.tuple([t.string(), t.number()]);
  expectType<Equal<Infer<typeof tuple>, [string, number]>>();
  const rec = t.record(t.number());
  expectType<Equal<Infer<typeof rec>, Record<string, number>>>();
  const n = t.string().nullable();
  expectType<Equal<Infer<typeof n>, string | null>>();
  const lit = t.literal('x');
  expectType<Equal<Infer<typeof lit>, 'x'>>();
  const d = t.number().default(3);
  expectType<Equal<Infer<typeof d>, number>>();
  const tr = t.string().transform((s) => s.length);
  expectType<Equal<Infer<typeof tr>, number>>();
  assert.ok(true);
});

test('error paths point at the failing field', () => {
  const result = user.safeParse({ name: '', tags: ['ok', 3], role: 'guest', age: 1.5 });
  assert.ok(!result.success);
  const paths = result.error.issues.map((i) => formatPath(i.path));
  assert.deepEqual(paths.sort(), ['age', 'name', 'role', 'tags[1]']);
});

test('nested paths combine keys and indexes', () => {
  const schema = t.object({ users: t.array(t.object({ address: t.object({ zip: t.string().length(4) }) })) });
  const result = schema.safeParse({ users: [{ address: { zip: '2000' } }, { address: { zip: '20' } }] });
  assert.ok(!result.success);
  assert.equal(formatPath(result.error.issues[0]!.path), 'users[1].address.zip');
  assert.equal(result.error.message, 'users[1].address.zip: must be exactly 4 characters');
});

test('flatten groups messages by path', () => {
  const result = t.object({ a: t.string().min(3).email() }).safeParse({ a: 'x' });
  assert.ok(!result.success);
  assert.deepEqual(result.error.flatten(), { a: ['must be at least 3 characters', 'must be a valid email address'] });
});

test('missing required keys are reported as invalid types', () => {
  const result = t.object({ a: t.string() }).safeParse({});
  assert.ok(!result.success);
  assert.equal(result.error.issues[0]?.message, 'expected string, received undefined');
});

test('unknown keys are stripped, rejected or kept depending on the mode', () => {
  const base = t.object({ a: t.number() });
  assert.deepEqual(base.parse({ a: 1, b: 2 }), { a: 1 });
  const strict = base.strict().safeParse({ a: 1, b: 2, c: 3 });
  assert.ok(!strict.success);
  assert.equal(strict.error.issues[0]?.code, 'unrecognised_keys');
  assert.match(strict.error.message, /"b", "c"/);
  assert.deepEqual(base.passthrough().parse({ a: 1, b: 2 }), { a: 1, b: 2 });
  assert.deepEqual(base.passthrough().strip().parse({ a: 1, b: 2 }), { a: 1 });
});

test('objects reject arrays, null and primitives', () => {
  const schema = t.object({});
  assert.equal(schema.safeParse([]).success, false);
  assert.equal(schema.safeParse(null).success, false);
  assert.equal(schema.safeParse(1).success, false);
});

test('extend, pick, omit and partial compose', () => {
  const base = t.object({ a: t.string(), b: t.number() });
  const extended = base.extend({ c: t.boolean() });
  assert.deepEqual(extended.parse({ a: 'x', b: 1, c: true }), { a: 'x', b: 1, c: true });
  assert.deepEqual(base.pick('a').parse({ a: 'x', b: 1 }), { a: 'x' });
  assert.deepEqual(base.omit('a').parse({ a: 'x', b: 1 }), { b: 1 });
  const partial = base.partial();
  assert.deepEqual(partial.parse({}), {});
  assert.equal(partial.safeParse({ a: 1 }).success, false);
  const replaced = base.extend({ a: t.number() });
  assert.deepEqual(replaced.parse({ a: 1, b: 2 }), { a: 1, b: 2 });
});

test('optional keys are omitted when absent but kept when present as undefined', () => {
  const schema = t.object({ a: t.string().optional() });
  assert.deepEqual(schema.parse({}), {});
  assert.ok('a' in schema.parse({ a: undefined }));
});

test('arrays validate every element and respect bounds', () => {
  const schema = t.array(t.number()).min(1).max(2);
  assert.deepEqual(schema.parse([1, 2]), [1, 2]);
  assert.equal(schema.safeParse([]).success, false);
  assert.equal(schema.safeParse([1, 2, 3]).success, false);
  assert.equal(t.array(t.number()).nonempty().safeParse([]).success, false);
  const bad = t.array(t.number()).safeParse([1, 'a', 'b']);
  assert.ok(!bad.success);
  assert.equal(bad.error.issues.length, 2);
  assert.equal(t.string().array().safeParse(['a']).success, true);
});

test('tuples check length and positions', () => {
  const schema = t.tuple([t.string(), t.number()]);
  assert.deepEqual(schema.parse(['a', 1]), ['a', 1]);
  assert.equal(schema.safeParse(['a']).success, false);
  assert.equal(schema.safeParse(['a', 1, 2]).success, false);
  const bad = schema.safeParse([1, 'a']);
  assert.ok(!bad.success);
  assert.deepEqual(bad.error.issues.map((i) => formatPath(i.path)), ['[0]', '[1]']);
});

test('records validate values and report the key in the path', () => {
  const schema = t.record(t.number());
  assert.deepEqual(schema.parse({ a: 1, b: 2 }), { a: 1, b: 2 });
  const bad = schema.safeParse({ a: 1, b: 'x' });
  assert.ok(!bad.success);
  assert.equal(formatPath(bad.error.issues[0]!.path), 'b');
});

test('unions take the first matching option and explain failures', () => {
  const schema = t.union([t.string(), t.number()]);
  assert.equal(schema.parse('a'), 'a');
  assert.equal(schema.parse(1), 1);
  const bad = schema.safeParse(true);
  assert.ok(!bad.success);
  const issue = bad.error.issues[0]!;
  assert.equal(issue.code, 'invalid_union');
  assert.equal(issue.unionIssues?.length, 2);
  assert.equal(t.string().or(t.number()).is(1), true);
});

test('union members transform independently', () => {
  const schema = t.union([t.string().transform((s) => s.length), t.number()]);
  assert.equal(schema.parse('four'), 4);
  assert.equal(schema.parse(9), 9);
});

test('optional, nullable and nullish', () => {
  assert.equal(t.string().optional().parse(undefined), undefined);
  assert.equal(t.string().optional().safeParse(null).success, false);
  assert.equal(t.string().nullable().parse(null), null);
  assert.equal(t.string().nullable().safeParse(undefined).success, false);
  const both = t.string().nullish();
  assert.equal(both.parse(null), null);
  assert.equal(both.parse(undefined), undefined);
  assert.equal(both.parse('x'), 'x');
});

test('defaults apply to undefined only and are validated', () => {
  assert.equal(t.number().default(5).parse(undefined), 5);
  assert.equal(t.number().default(5).parse(7), 7);
  assert.equal(t.number().default(() => 9).parse(undefined), 9);
  assert.equal(t.number().min(10).default(5).safeParse(undefined).success, false);
  const obj = t.object({ n: t.number().default(1) });
  assert.deepEqual(obj.parse({}), { n: 1 });
});

test('refine adds custom issues and supports a custom path', () => {
  const schema = t
    .object({ password: t.string(), confirm: t.string() })
    .refine((v) => v.password === v.confirm, { message: 'passwords differ', path: ['confirm'] });
  assert.ok(schema.is({ password: 'a', confirm: 'a' }));
  const bad = schema.safeParse({ password: 'a', confirm: 'b' });
  assert.ok(!bad.success);
  assert.equal(formatPath(bad.error.issues[0]!.path), 'confirm');
  assert.equal(bad.error.issues[0]?.code, 'custom');
  assert.equal(t.number().refine((n) => n > 0, 'must be positive').safeParse(-1).success, false);
  assert.equal(t.number().refine((n) => n > 0).safeParse(-1).success === false, true);
});

test('refine does not run when the base schema already failed', () => {
  let calls = 0;
  const schema = t.string().refine(() => {
    calls += 1;
    return true;
  });
  schema.safeParse(1);
  assert.equal(calls, 0);
});

test('transform changes the output and failures become issues', () => {
  const schema = t.string().transform((s) => Number(s));
  assert.equal(schema.parse('42'), 42);
  const strict = t.string().transform((s) => {
    if (s === '') throw new Error('empty!');
    return s;
  });
  const bad = strict.safeParse('');
  assert.ok(!bad.success);
  assert.equal(bad.error.message, 'empty!');
});

test('lazy schemas support recursion', () => {
  interface Tree {
    value: number;
    children: Tree[];
  }
  const tree: Schema<Tree> = t.object({
    value: t.number(),
    children: t.array(t.lazy(() => tree))
  });
  const good = { value: 1, children: [{ value: 2, children: [] }] };
  assert.deepEqual(tree.parse(good), good);
  const bad = tree.safeParse({ value: 1, children: [{ value: 'x', children: [] }] });
  assert.ok(!bad.success);
  assert.equal(formatPath(bad.error.issues[0]!.path), 'children[0].value');
});

test('schemas are immutable when chained', () => {
  const base = t.string();
  const longer = base.min(5);
  assert.ok(base.is('a'));
  assert.ok(!longer.is('a'));
});

test('empty path formats to an empty string and root errors have no prefix', () => {
  assert.equal(formatPath([]), '');
  assert.equal(formatPath(['a', 0, 'b']), 'a[0].b');
  const bad = t.string().safeParse(1);
  assert.ok(!bad.success);
  assert.deepEqual(bad.error.flatten(), { '': ['expected string, received number'] });
});
