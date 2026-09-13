import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import rule, { PORT_FILES } from './tts-port-contract-parity.mjs';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));

function ctxOverRealTree() {
  return { read: (path) => { try { return readFileSync(join(root, path), 'utf8'); } catch { return null; } } };
}

function ctxWithPorts(oneSrc, twoSrc) {
  const files = { [PORT_FILES[0]]: oneSrc, [PORT_FILES[1]]: twoSrc };
  return { read: (path) => (path in files ? files[path] : null) };
}

describe('tts-port-contract-parity', () => {
  test('stays quiet on this repo\'s real tts-port.js / remote-tts-port.js', () => {
    expect(rule.run(ctxOverRealTree())).toEqual([]);
  });

  test('stays quiet on a synthetic pair whose returned objects declare the same methods', () => {
    const ctx = ctxWithPorts(
      `export function createOne() {
        return {
          async speak(text, opts = {}) {
            if (opts.rate) return new Promise((resolve) => { resolve(); });
            return Promise.resolve();
          },
          cancel() {
            doSomething();
          },
        };
      }`,
      `export function createTwo(port) {
        return {
          speak(text) {
            return new Promise((resolve) => {
              port.postMessage({ type: 'speak', text });
              resolve();
            });
          },
          cancel() {
            port.postMessage({ type: 'cancel' });
          },
        };
      }`,
    );
    expect(rule.run(ctx)).toEqual([]);
  });

  test('fires when one port exposes a method the other does not', () => {
    const ctx = ctxWithPorts(
      `export function createOne() {
        return {
          speak(text) {
            return Promise.resolve();
          },
          cancel() {},
          ping() {
            return true;
          },
        };
      }`,
      `export function createTwo(port) {
        return {
          speak(text) {
            return Promise.resolve();
          },
          cancel() {},
        };
      }`,
    );
    const findings = rule.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'tts-port-contract-parity',
      file: PORT_FILES[0],
      what: expect.stringContaining('"ping"'),
    });
  });
});
