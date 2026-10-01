import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

describe('manifest.json', () => {
  it('manifest_version 3', () => {
    expect(manifest.manifest_version).toBe(3);
  });
  it.each([
    ['background', () => manifest.background.service_worker],
    ['content script', () => manifest.content_scripts[0].js[0]],
    ['popup', () => manifest.action.default_popup],
  ])('%s のファイルが存在する', (_, get) => {
    expect(exists(get())).toBe(true);
  });
});
