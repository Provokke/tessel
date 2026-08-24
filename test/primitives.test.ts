import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, TesselError } from '../src/index.js';

test('string accepts strings and rejects other types with a clear message', () => {
  assert.equal(t.string().parse('hi'), 'hi');
  const result = t.string().safeParse(5);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.message, 'expected string, received number');
});

test('string length checks report every failure', () => {
  const schema = t.string().min(3).regex(/^[a-z]+$/);
  const result = schema.safeParse('A');
  assert.ok(!result.success);
  assert.deepEqual(
    result.error.issues.map((i) => i.code),
    ['too_small', 'invalid_format']
  );
  assert.equal(t.string().max(2).safeParse('abc').success, false);
  assert.equal(t.string().length(2).safeParse('abc').success, false);
  assert.equal(t.string().length(3).safeParse('abc').success, true);
  assert.equal(t.string().nonempty().safeParse('').success, false);
});

test('string formats', () => {
  assert.ok(t.string().email().is('a@b.co'));
  assert.ok(!t.string().email().is('nope'));
  assert.ok(t.string().url().is('https://example.com/x'));
  assert.ok(!t.string().url().is('not a url'));
  assert.ok(t.string().uuid().is('123e4567-e89b-12d3-a456-426614174000'));
  assert.ok(!t.string().uuid().is('123'));
  assert.ok(t.string().startsWith('ab').is('abc'));
  assert.ok(!t.string().startsWith('ab').is('xbc'));
});

test('a global regex does not leak state between parses', () => {
  const schema = t.string().regex(/a/g);
  assert.ok(schema.is('a'));
  assert.ok(schema.is('a'));
});

test('trim runs before the checks', () => {
  const schema = t.string().trim().min(2);
  assert.equal(schema.parse('  hi  '), 'hi');
  assert.equal(schema.safeParse('  h  ').success, false);
});

test('number rejects NaN and non numbers', () => {
  assert.equal(t.number().parse(1.5), 1.5);
  assert.equal(t.number().safeParse(NaN).success, false);
  assert.equal(t.number().safeParse('1').success, false);
});

test('number constraints', () => {
  assert.ok(t.number().int().is(3));
  assert.ok(!t.number().int().is(3.5));
  assert.ok(t.number().min(1).max(3).is(2));
  assert.ok(!t.number().min(1).is(0));
  assert.ok(!t.number().max(1).is(2));
  assert.ok(t.number().positive().is(0.1));
  assert.ok(!t.number().positive().is(0));
  assert.ok(!t.number().finite().is(Infinity));
  assert.ok(t.number().multipleOf(0.1).is(0.3));
  assert.ok(!t.number().multipleOf(5).is(7));
});

test('boolean, date and any', () => {
  assert.equal(t.boolean().parse(false), false);
  assert.equal(t.boolean().safeParse(0).success, false);
  assert.ok(t.date().is(new Date()));
  assert.ok(!t.date().is(new Date('nope')));
  assert.ok(!t.date().is('2020-01-01'));
  assert.equal(t.any().parse(undefined), undefined);
});

test('literal and enum', () => {
  assert.equal(t.literal('a').parse('a'), 'a');
  assert.equal(t.literal(1).safeParse(2).success, false);
  assert.ok(t.literal(null).is(null));
  const colour = t.enum(['red', 'green']);
  assert.equal(colour.parse('red'), 'red');
  const bad = colour.safeParse('blue');
  assert.ok(!bad.success);
  assert.equal(bad.error.message, 'expected one of "red", "green"');
  assert.equal(bad.error.issues[0]?.code, 'invalid_enum');
});

test('parse throws a TesselError', () => {
  assert.throws(() => t.number().parse('x'), TesselError);
});
