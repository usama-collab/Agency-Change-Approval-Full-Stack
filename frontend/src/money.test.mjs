import { Buffer } from 'node:buffer'
import { URL } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const compiled = ts.transpileModule(readFileSync(new URL('./money.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { parsePrice, priceText } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
test('exact decimal prices round trip, including zero and the safe integer boundary', () => {
  for (const [text, minor] of [['0.00', 0], ['0.01', 1], ['100.10', 10010], ['90071992547409.91', 9007199254740991]]) {
    assert.equal(parsePrice(text), minor)
    assert.equal(priceText(minor), text)
  }
  assert.equal(parsePrice('1.2'), 120)
})
test('reject precision loss and malformed or unsupported amounts', () => {
  for (const text of ['1.001', '-1', '90071992547409.92', '1e2', 'NaN', '', '.5', '1,000', 'Infinity']) assert.throws(() => parsePrice(text))
})
