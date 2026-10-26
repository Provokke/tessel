import { TesselError, type Issue, type IssueCode, type Path, type Result } from './errors.js';

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly Issue[] };

export function pass<T>(value: T): Parsed<T> {
  return { ok: true, value };
}

export function fail(path: Path, code: IssueCode, message: string): Parsed<never> {
  return { ok: false, issues: [{ path, code, message }] };
}

export function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
  return typeof value;
}

export abstract class Schema<Out> {
  declare readonly _output: Out;

  abstract run(input: unknown, path: Path): Parsed<Out>;

  parse(input: unknown): Out {
    const result = this.run(input, []);
    if (!result.ok) throw new TesselError(result.issues);
    return result.value;
  }

  safeParse(input: unknown): Result<Out> {
    const result = this.run(input, []);
    if (result.ok) return { success: true, data: result.value };
    return { success: false, error: new TesselError(result.issues) };
  }

  is(input: unknown): input is Out {
    return this.run(input, []).ok;
  }

  optional(): Schema<Out | undefined> {
    return new OptionalSchema(this);
  }

  nullable(): Schema<Out | null> {
    return new NullableSchema(this);
  }

  nullish(): Schema<Out | null | undefined> {
    return new NullableSchema(new OptionalSchema(this));
  }

  default(fallback: Out | (() => Out)): Schema<Exclude<Out, undefined>> {
    return new DefaultSchema(this, fallback);
  }

  array(): ArraySchema<this> {
    return new ArraySchema(this);
  }

  or<Other>(other: Schema<Other>): Schema<Out | Other> {
    return new UnionSchema<readonly [Schema<Out>, Schema<Other>]>([this, other]);
  }

  refine(check: (value: Out) => boolean, options: string | { message?: string; path?: Path } = {}): Schema<Out> {
    const config = typeof options === 'string' ? { message: options } : options;
    return new RefineSchema(this, check, config.message ?? 'failed custom validation', config.path ?? []);
  }

  transform<Next>(fn: (value: Out) => Next): Schema<Next> {
    return new TransformSchema(this, fn);
  }
}

export type Infer<S extends Schema<unknown>> = S['_output'];

export class StringSchema extends Schema<string> {
  constructor(private readonly checks: readonly ((value: string, path: Path) => Issue | null)[] = [], private readonly trimmed = false) {
    super();
  }

  private with(check: (value: string, path: Path) => Issue | null): StringSchema {
    return new StringSchema([...this.checks, check], this.trimmed);
  }

  run(input: unknown, path: Path): Parsed<string> {
    if (typeof input !== 'string') return fail(path, 'invalid_type', `expected string, received ${describe(input)}`);
    const value = this.trimmed ? input.trim() : input;
    const issues: Issue[] = [];
    for (const check of this.checks) {
      const issue = check(value, path);
      if (issue) issues.push(issue);
    }
    return issues.length > 0 ? { ok: false, issues } : pass(value);
  }

  min(length: number): StringSchema {
    return this.with((v, path) =>
      v.length < length ? { path, code: 'too_small', message: `must be at least ${length} characters` } : null
    );
  }

  max(length: number): StringSchema {
    return this.with((v, path) =>
      v.length > length ? { path, code: 'too_big', message: `must be at most ${length} characters` } : null
    );
  }

  length(length: number): StringSchema {
    return this.with((v, path) =>
      v.length !== length ? { path, code: v.length < length ? 'too_small' : 'too_big', message: `must be exactly ${length} characters` } : null
    );
  }

  nonempty(): StringSchema {
    return this.min(1);
  }

  regex(pattern: RegExp, message = `must match ${pattern}`): StringSchema {
    return this.with((v, path) => {
      pattern.lastIndex = 0;
      return pattern.test(v) ? null : { path, code: 'invalid_format', message };
    });
  }

  email(): StringSchema {
    return this.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'must be a valid email address');
  }

  uuid(): StringSchema {
    return this.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'must be a valid uuid');
  }

  url(): StringSchema {
    return this.with((v, path) => {
      try {
        new URL(v);
        return null;
      } catch {
        return { path, code: 'invalid_format', message: 'must be a valid url' };
      }
    });
  }

  startsWith(prefix: string): StringSchema {
    return this.with((v, path) =>
      v.startsWith(prefix) ? null : { path, code: 'invalid_format', message: `must start with "${prefix}"` }
    );
  }

  trim(): StringSchema {
    return new StringSchema(this.checks, true);
  }
}

export class NumberSchema extends Schema<number> {
  constructor(private readonly checks: readonly ((value: number, path: Path) => Issue | null)[] = []) {
    super();
  }

  private with(check: (value: number, path: Path) => Issue | null): NumberSchema {
    return new NumberSchema([...this.checks, check]);
  }

  run(input: unknown, path: Path): Parsed<number> {
    if (typeof input !== 'number' || Number.isNaN(input)) {
      return fail(path, 'invalid_type', `expected number, received ${describe(input)}`);
    }
    const issues: Issue[] = [];
    for (const check of this.checks) {
      const issue = check(input, path);
      if (issue) issues.push(issue);
    }
    return issues.length > 0 ? { ok: false, issues } : pass(input);
  }

  int(): NumberSchema {
    return this.with((v, path) => (Number.isInteger(v) ? null : { path, code: 'invalid_type', message: 'expected an integer' }));
  }

  finite(): NumberSchema {
    return this.with((v, path) => (Number.isFinite(v) ? null : { path, code: 'invalid_type', message: 'must be finite' }));
  }

  min(limit: number): NumberSchema {
    return this.with((v, path) => (v < limit ? { path, code: 'too_small', message: `must be at least ${limit}` } : null));
  }

  max(limit: number): NumberSchema {
    return this.with((v, path) => (v > limit ? { path, code: 'too_big', message: `must be at most ${limit}` } : null));
  }

  positive(): NumberSchema {
    return this.with((v, path) => (v > 0 ? null : { path, code: 'too_small', message: 'must be greater than 0' }));
  }

  multipleOf(step: number): NumberSchema {
    return this.with((v, path) =>
      Math.abs(v / step - Math.round(v / step)) < 1e-9 ? null : { path, code: 'invalid_format', message: `must be a multiple of ${step}` }
    );
  }
}

export class BooleanSchema extends Schema<boolean> {
  run(input: unknown, path: Path): Parsed<boolean> {
    return typeof input === 'boolean' ? pass(input) : fail(path, 'invalid_type', `expected boolean, received ${describe(input)}`);
  }
}

export class DateSchema extends Schema<Date> {
  run(input: unknown, path: Path): Parsed<Date> {
    if (!(input instanceof Date)) return fail(path, 'invalid_type', `expected date, received ${describe(input)}`);
    if (Number.isNaN(input.getTime())) return fail(path, 'invalid_format', 'invalid date');
    return pass(input);
  }
}

export type Primitive = string | number | boolean | null | undefined;

export class LiteralSchema<T extends Primitive> extends Schema<T> {
  constructor(private readonly expected: T) {
    super();
  }

  run(input: unknown, path: Path): Parsed<T> {
    return input === this.expected ? pass(input as T) : fail(path, 'invalid_literal', `expected ${JSON.stringify(this.expected) ?? 'undefined'}`);
  }
}

export class EnumSchema<T extends readonly [string, ...string[]]> extends Schema<T[number]> {
  constructor(readonly options: T) {
    super();
  }

  run(input: unknown, path: Path): Parsed<T[number]> {
    if (typeof input === 'string' && (this.options as readonly string[]).includes(input)) return pass(input);
    return fail(path, 'invalid_enum', `expected one of ${this.options.map((o) => JSON.stringify(o)).join(', ')}`);
  }
}

export class AnySchema extends Schema<unknown> {
  run(input: unknown): Parsed<unknown> {
    return pass(input);
  }
}

export class ArraySchema<S extends Schema<unknown>> extends Schema<S['_output'][]> {
  constructor(
    readonly element: S,
    private readonly bounds: { readonly min?: number; readonly max?: number } = {}
  ) {
    super();
  }

  min(length: number): ArraySchema<S> {
    return new ArraySchema(this.element, { ...this.bounds, min: length });
  }

  max(length: number): ArraySchema<S> {
    return new ArraySchema(this.element, { ...this.bounds, max: length });
  }

  nonempty(): ArraySchema<S> {
    return this.min(1);
  }

  run(input: unknown, path: Path): Parsed<S['_output'][]> {
    if (!Array.isArray(input)) return fail(path, 'invalid_type', `expected array, received ${describe(input)}`);
    const issues: Issue[] = [];
    const { min, max } = this.bounds;
    if (min !== undefined && input.length < min) issues.push({ path, code: 'too_small', message: `must contain at least ${min} items` });
    if (max !== undefined && input.length > max) issues.push({ path, code: 'too_big', message: `must contain at most ${max} items` });
    const out: S['_output'][] = [];
    input.forEach((item, index) => {
      const result = this.element.run(item, [...path, index]);
      if (result.ok) out.push(result.value);
      else issues.push(...result.issues);
    });
    return issues.length > 0 ? { ok: false, issues } : pass(out);
  }
}

type TupleOutput<T extends readonly Schema<unknown>[]> = { -readonly [K in keyof T]: T[K] extends Schema<infer O> ? O : never };

export class TupleSchema<T extends readonly Schema<unknown>[]> extends Schema<TupleOutput<T>> {
  constructor(private readonly items: T) {
    super();
  }

  run(input: unknown, path: Path): Parsed<TupleOutput<T>> {
    if (!Array.isArray(input)) return fail(path, 'invalid_type', `expected array, received ${describe(input)}`);
    if (input.length !== this.items.length) {
      return fail(path, input.length < this.items.length ? 'too_small' : 'too_big', `expected exactly ${this.items.length} items`);
    }
    const issues: Issue[] = [];
    const out: unknown[] = [];
    this.items.forEach((schema, index) => {
      const result = schema.run(input[index], [...path, index]);
      if (result.ok) out.push(result.value);
      else issues.push(...result.issues);
    });
    return issues.length > 0 ? { ok: false, issues } : pass(out as TupleOutput<T>);
  }
}

export type Shape = Record<string, Schema<unknown>>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type OptionalKeys<S extends Shape> = { [K in keyof S]: undefined extends S[K]['_output'] ? K : never }[keyof S];
export type ObjectOutput<S extends Shape> = Simplify<
  { [K in Exclude<keyof S, OptionalKeys<S>>]: S[K]['_output'] } & { [K in OptionalKeys<S>]?: S[K]['_output'] }
>;

type UnknownKeys = 'strip' | 'strict' | 'passthrough';

export class ObjectSchema<S extends Shape> extends Schema<ObjectOutput<S>> {
  constructor(
    readonly shape: S,
    private readonly mode: UnknownKeys = 'strip'
  ) {
    super();
  }

  strict(): ObjectSchema<S> {
    return new ObjectSchema(this.shape, 'strict');
  }

  passthrough(): ObjectSchema<S> {
    return new ObjectSchema(this.shape, 'passthrough');
  }

  strip(): ObjectSchema<S> {
    return new ObjectSchema(this.shape, 'strip');
  }

  extend<Extra extends Shape>(extra: Extra): ObjectSchema<Omit<S, keyof Extra> & Extra> {
    return new ObjectSchema({ ...this.shape, ...extra } as Omit<S, keyof Extra> & Extra, this.mode);
  }

  pick<K extends keyof S>(...keys: K[]): ObjectSchema<Pick<S, K>> {
    const next: Shape = {};
    for (const key of keys) next[key as string] = this.shape[key as string] as Schema<unknown>;
    return new ObjectSchema(next as Pick<S, K>, this.mode);
  }

  omit<K extends keyof S>(...keys: K[]): ObjectSchema<Omit<S, K>> {
    const next: Shape = { ...this.shape };
    for (const key of keys) delete next[key as string];
    return new ObjectSchema(next as Omit<S, K>, this.mode);
  }

  partial(): ObjectSchema<{ [K in keyof S]: Schema<S[K]['_output'] | undefined> }> {
    const next: Shape = {};
    for (const [key, schema] of Object.entries(this.shape)) next[key] = schema.optional();
    return new ObjectSchema(next as { [K in keyof S]: Schema<S[K]['_output'] | undefined> }, this.mode);
  }

  run(input: unknown, path: Path): Parsed<ObjectOutput<S>> {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return fail(path, 'invalid_type', `expected object, received ${describe(input)}`);
    }
    const record = input as Record<string, unknown>;
    const issues: Issue[] = [];
    const out: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(this.shape)) {
      const result = schema.run(record[key], [...path, key]);
      if (result.ok) {
        if (result.value !== undefined || key in record) out[key] = result.value;
      } else {
        issues.push(...result.issues);
      }
    }
    const extras = Object.keys(record).filter((key) => !(key in this.shape));
    if (this.mode === 'strict' && extras.length > 0) {
      issues.push({ path, code: 'unrecognised_keys', message: `unrecognised keys: ${extras.map((k) => JSON.stringify(k)).join(', ')}` });
    } else if (this.mode === 'passthrough') {
      for (const key of extras) out[key] = record[key];
    }
    return issues.length > 0 ? { ok: false, issues } : pass(out as ObjectOutput<S>);
  }
}

export class RecordSchema<V extends Schema<unknown>> extends Schema<Record<string, V['_output']>> {
  constructor(private readonly valueSchema: V) {
    super();
  }

  run(input: unknown, path: Path): Parsed<Record<string, V['_output']>> {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return fail(path, 'invalid_type', `expected object, received ${describe(input)}`);
    }
    const issues: Issue[] = [];
    const out: Record<string, V['_output']> = {};
    for (const [key, value] of Object.entries(input)) {
      const result = this.valueSchema.run(value, [...path, key]);
      if (result.ok) out[key] = result.value;
      else issues.push(...result.issues);
    }
    return issues.length > 0 ? { ok: false, issues } : pass(out);
  }
}

type UnionOutput<T extends readonly Schema<unknown>[]> = T[number]['_output'];

export class UnionSchema<T extends readonly Schema<unknown>[]> extends Schema<UnionOutput<T>> {
  constructor(private readonly options: T) {
    super();
  }

  run(input: unknown, path: Path): Parsed<UnionOutput<T>> {
    const failures: (readonly Issue[])[] = [];
    for (const option of this.options) {
      const result = option.run(input, path);
      if (result.ok) return pass(result.value);
      failures.push(result.issues);
    }
    return { ok: false, issues: [{ path, code: 'invalid_union', message: 'did not match any option', unionIssues: failures }] };
  }
}

export class OptionalSchema<Out> extends Schema<Out | undefined> {
  constructor(private readonly inner: Schema<Out>) {
    super();
  }

  run(input: unknown, path: Path): Parsed<Out | undefined> {
    return input === undefined ? pass(undefined) : this.inner.run(input, path);
  }
}

export class NullableSchema<Out> extends Schema<Out | null> {
  constructor(private readonly inner: Schema<Out>) {
    super();
  }

  run(input: unknown, path: Path): Parsed<Out | null> {
    return input === null ? pass(null) : this.inner.run(input, path);
  }
}

export class DefaultSchema<Out> extends Schema<Exclude<Out, undefined>> {
  constructor(
    private readonly inner: Schema<Out>,
    private readonly fallback: Out | (() => Out)
  ) {
    super();
  }

  run(input: unknown, path: Path): Parsed<Exclude<Out, undefined>> {
    const value = input === undefined ? (typeof this.fallback === 'function' ? (this.fallback as () => Out)() : this.fallback) : input;
    return this.inner.run(value, path) as Parsed<Exclude<Out, undefined>>;
  }
}

export class RefineSchema<Out> extends Schema<Out> {
  constructor(
    private readonly inner: Schema<Out>,
    private readonly check: (value: Out) => boolean,
    private readonly message: string,
    private readonly extraPath: Path
  ) {
    super();
  }

  run(input: unknown, path: Path): Parsed<Out> {
    const result = this.inner.run(input, path);
    if (!result.ok) return result;
    return this.check(result.value) ? result : fail([...path, ...this.extraPath], 'custom', this.message);
  }
}

export class TransformSchema<Out, Next> extends Schema<Next> {
  constructor(
    private readonly inner: Schema<Out>,
    private readonly fn: (value: Out) => Next
  ) {
    super();
  }

  run(input: unknown, path: Path): Parsed<Next> {
    const result = this.inner.run(input, path);
    if (!result.ok) return result;
    try {
      return pass(this.fn(result.value));
    } catch (error) {
      return fail(path, 'custom', error instanceof Error ? error.message : 'transform failed');
    }
  }
}

export class LazySchema<Out> extends Schema<Out> {
  private cached: Schema<Out> | null = null;

  constructor(private readonly factory: () => Schema<Out>) {
    super();
  }

  run(input: unknown, path: Path): Parsed<Out> {
    this.cached ??= this.factory();
    return this.cached.run(input, path);
  }
}
