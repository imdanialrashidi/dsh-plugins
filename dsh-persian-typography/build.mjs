/**
 * Build step: inline the Vazirmatn variable font into `client.js`.
 *
 * The Web client only serves a package's `client.js` (and its chunk files), so
 * a font cannot be fetched from the package directory at runtime. Embedding it
 * as a data URI keeps the plugin self-contained and offline-safe.
 */
import { readFile, writeFile } from 'node:fs/promises';

const here = new URL('.', import.meta.url);
const font = await readFile(new URL('./assets/vazirmatn-var.woff2', here));
const source = await readFile(new URL('./src/client.js', here), 'utf8');
if (!source.includes('__FONT_BASE64__')) throw new Error('client.js source lost its font placeholder');
const output = source.replace('__FONT_BASE64__', font.toString('base64'));
await writeFile(new URL('./client.js', here), output);
console.log(`client.js written (${(output.length / 1024).toFixed(1)} KiB, font ${(font.length / 1024).toFixed(1)} KiB)`);
