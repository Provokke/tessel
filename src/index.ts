import {
  AnySchema,
  ArraySchema,
  BooleanSchema,
  DateSchema,
  EnumSchema,
  LazySchema,
  LiteralSchema,
  NumberSchema,
  ObjectSchema,
  RecordSchema,
  Schema,
  StringSchema,
  TupleSchema,
  UnionSchema,
  type Primitive,
  type Shape
} from './schema.js';

export const t = {
  string: (): StringSchema => new StringSchema(),
  number: (): NumberSchema => new NumberSchema(),
  boolean: (): BooleanSchema => new BooleanSchema(),
  date: (): DateSchema => new DateSchema(),
  any: (): AnySchema => new AnySchema(),
  literal: <T extends Primitive>(value: T): LiteralSchema<T> => new LiteralSchema(value),
  enum: <const T extends readonly [string, ...string[]]>(options: T): EnumSchema<T> => new EnumSchema(options),
  array: <S extends Schema<unknown>>(element: S): ArraySchema<S> => new ArraySchema(element),
  tuple: <const T extends readonly Schema<unknown>[]>(items: T): TupleSchema<T> => new TupleSchema(items),
  object: <S extends Shape>(shape: S): ObjectSchema<S> => new ObjectSchema(shape),
  record: <V extends Schema<unknown>>(value: V): RecordSchema<V> => new RecordSchema(value),
  union: <const T extends readonly [Schema<unknown>, Schema<unknown>, ...Schema<unknown>[]]>(options: T): UnionSchema<T> =>
    new UnionSchema(options),
  lazy: <Out>(factory: () => Schema<Out>): Schema<Out> => new LazySchema(factory)
};

export { Schema } from './schema.js';
export type { Infer, ObjectOutput, Shape } from './schema.js';
export { TesselError, formatPath } from './errors.js';
export type { Issue, IssueCode, Path, Result } from './errors.js';

