/**
 * Design-token lint.
 *
 * `tokens.css` claimed "npm run lint:tokens fails the build if one appears".
 * That script did not exist — the rule held by discipline alone, which is the
 * same shape as the false comment that started the UI audit. This is that gate.
 *
 * It flags raw px values for spacing and font-size in component CSS, and raw
 * colours outside the token file. Deliberate exceptions are listed below with a
 * reason, because a linter nobody can satisfy gets deleted.
 *
 *   npm run lint:tokens
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STYLES = path.join(root, 'apps/web/src/shared/styles');

/** Files that define the tokens themselves are where raw values belong. */
const TOKEN_FILES = new Set(['tokens.css']);

/**
 * Allowed exceptions, each with the reason it is not expressible as a token.
 * Keyed by `file:property` — hairlines, rings and borders are rendering
 * details measured in device pixels, not spacing decisions on the 4px grid.
 */
const ALLOWED_PROPERTIES = new Set(['border', 'border-top', 'border-bottom', 'border-left', 'border-right',
  'border-width', 'box-shadow', 'outline', 'outline-width', 'stroke-width', 'height', 'width', 'min-width',
  'max-width', 'min-height', 'max-height', 'top', 'right', 'bottom', 'left', 'inset', 'transform', 'flex-basis']);

const SPACING_PROPERTIES = /^(gap|row-gap|column-gap|padding|padding-[a-z]+|margin|margin-[a-z]+|font-size)$/;

/** `margin-bottom: -1px` pulls a 2px tab underline onto a 1px border. */
const ALLOWED_LINES = [
  /margin-bottom:\s*-1px/,      // pulls a 2px tab underline onto a 1px border
  /margin:\s*-1px/,             // the standard .sr-only clip idiom
];

const findings = [];

const lintCss = (file) => {
  const name = path.basename(file);
  const isTokenFile = TOKEN_FILES.has(name);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let inComment = false;

  lines.forEach((line, index) => {
    // Skip comments and media-query conditions: breakpoints are not spacing.
    if (inComment) {
      if (line.includes('*/')) inComment = false;
      return;
    }
    if (line.trimStart().startsWith('/*')) {
      if (!line.includes('*/')) inComment = true;
      return;
    }
    if (line.trimStart().startsWith('@media') || line.trimStart().startsWith('//')) return;
    if (ALLOWED_LINES.some((rule) => rule.test(line))) return;

    const declaration = line.match(/^\s*([a-z-]+)\s*:\s*(.+?);/);
    if (!declaration) return;
    const [, property, value] = declaration;

    if (!isTokenFile && SPACING_PROPERTIES.test(property) && /(^|\s|-)\d*\.?\d+px/.test(value)) {
      findings.push({ file, line: index + 1, message: `raw px in \`${property}\` — use a --sp-* or --fs-* token`, text: line.trim() });
    }

    if (!isTokenFile && !ALLOWED_PROPERTIES.has(property)) {
      const colour = value.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
      if (colour) {
        findings.push({ file, line: index + 1, message: `raw colour in \`${property}\` — use a colour token`, text: line.trim() });
      }
    }
  });
};

for (const entry of fs.readdirSync(STYLES)) {
  if (entry.endsWith('.css')) lintCss(path.join(STYLES, entry));
}

if (findings.length === 0) {
  console.log('lint:tokens — no raw spacing, type or colour values in component CSS.');
  process.exit(0);
}

console.error(`\nlint:tokens — ${findings.length} finding${findings.length === 1 ? '' : 's'}:\n`);
for (const f of findings) {
  console.error(`  ${path.relative(root, f.file)}:${f.line}  ${f.message}`);
  console.error(`      ${f.text}\n`);
}
process.exit(1);
