/* Dependency-free checks for app entry points, icon files and original branding. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const origin = 'https://example.invalid/';
const read = file => fs.readFileSync(path.join(root, file));
const local = url => {
  assert.equal(url.origin, new URL(origin).origin, 'Assets and app entry points must stay on this site');
  return read(decodeURIComponent(url.pathname.slice(1)));
};
function pngSize(data) {
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Expected a real PNG file');
  assert.equal(data.toString('ascii', 12, 16), 'IHDR');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}
function losslessWebpSize(data) {
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WEBP');
  assert.equal(data.readUInt32LE(4) + 8, data.length, 'WebP must not be truncated');
  for (let offset = 12; offset + 8 < data.length;) {
    const size = data.readUInt32LE(offset + 4);
    if (data.toString('ascii', offset, offset + 4) === 'VP8L') {
      assert.equal(data[offset + 8], 0x2f);
      const bits = data.readUInt32LE(offset + 9);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('Optimized logo must use lossless WebP');
}
function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1];
}
function tagWith(html, tagName, key, value) {
  return (html.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) || []).find(tag => attribute(tag, key) === value);
}
const publicManifest = JSON.parse(read('manifest.webmanifest'));
const adminManifest = JSON.parse(read('admin.webmanifest'));
assert.notEqual(publicManifest.id, adminManifest.id, 'Public and private apps need separate identities');
for (const [file, manifest, startPath] of [
  ['manifest.webmanifest', publicManifest, '/'],
  ['admin.webmanifest', adminManifest, '/admin.html']
]) {
  const manifestUrl = new URL(file, origin);
  const start = new URL(manifest.start_url, manifestUrl), scope = new URL(manifest.scope, manifestUrl);
  assert.equal(start.origin, new URL(origin).origin);
  assert.equal(start.pathname, startPath, 'Installation must open the correct public/private page');
  assert.equal(start.search, ''); assert.equal(start.hash, '');
  assert.ok(start.href.startsWith(scope.href), 'App start URL must be in scope');
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.lang, 'en-GB');
  assert.ok(manifest.name && manifest.short_name);
  const anySizes = [], purposes = [];
  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/png');
    const size = pngSize(local(new URL(icon.src, manifestUrl)));
    assert.equal(icon.sizes, size.join('x'), 'Manifest dimensions must match the icon file');
    assert.equal(size[0], size[1], 'Home-screen icons must be square');
    purposes.push(icon.purpose);
    if (icon.purpose === 'any') anySizes.push(size[0]);
  }
  assert.ok(anySizes.includes(192) && anySizes.includes(512));
  assert.ok(purposes.includes('maskable'), 'Provide artwork padded for Android icon masks');
  console.log('PASS:', file, 'entry point, identity, scope and icon headers/dimensions');
}
for (const [file, route, expectedManifest, expectedTitle] of [
  ['index.html', '/', 'manifest.webmanifest', 'RM Small Jobs'],
  ['thank-you/index.html', '/thank-you/', 'manifest.webmanifest', 'RM Small Jobs'],
  ['admin.html', '/admin.html', 'admin.webmanifest', 'RM Business']
]) {
  const html = read(file).toString(), base = new URL(route, origin);
  const manifest = tagWith(html, 'link', 'rel', 'manifest');
  assert.ok(manifest, `${file} needs a manifest link`);
  assert.equal(new URL(attribute(manifest, 'href'), base).pathname, '/' + expectedManifest);
  const apple = tagWith(html, 'link', 'rel', 'apple-touch-icon');
  assert.ok(apple); assert.deepEqual(pngSize(local(new URL(attribute(apple, 'href'), base))), [180, 180]);
  assert.equal(attribute(tagWith(html, 'meta', 'name', 'apple-mobile-web-app-title') || '', 'content'), expectedTitle);
  const viewport = attribute(tagWith(html, 'meta', 'name', 'viewport') || '', 'content');
  assert.ok(viewport?.includes('viewport-fit=cover')); assert.ok(!/user-scalable=no|maximum-scale=1/.test(viewport), 'Keep mobile zoom available');
  const favicon = tagWith(html, 'link', 'rel', 'icon');
  assert.ok(favicon); assert.deepEqual(pngSize(local(new URL(attribute(favicon, 'href'), base))), [32, 32]);
  console.log('PASS:', file, 'resolved manifest, Apple icon/name, favicon and mobile viewport');
}
const originalSize = pngSize(read('logo.png'));
for (const file of ['logo-160.webp', 'logo-320.webp']) {
  const data = read(file), size = losslessWebpSize(data);
  assert.ok(size[0] <= 320 && size[0] > 100);
  assert.equal(size[1], Math.round(originalSize[1] * size[0] / originalSize[0]), 'Retain the original logo aspect ratio');
  assert.ok(data.length < read('logo.png').length / 10, 'Avoid sending the original large logo to small screen slots');
  console.log('PASS:', file, 'lossless WebP header, aspect ratio and transfer budget:', data.length, 'bytes');
}
// Recorded from the original committed assets before this audit. An intentional
// future branding/QR replacement should update this explicit preservation baseline.
const originalHashes = {
  'logo.png': '8a85c3d2bb2a95270383777f180352a64e7c81012ff08b94e6ce09012c5025d1',
  'favicon.png': 'e7dce898cd7f882597c0421368187bd1d4eda9f66ed5827d8f6350ee30ca4665',
  'whatsapp-qr.png': '5252d94382b0ab47e1df204ffa2a92f93926097e992eaa479b23c37556642b05'
};
for (const [file, expected] of Object.entries(originalHashes)) {
  const hash = data => createHash('sha256').update(data).digest('hex');
  assert.equal(hash(read(file)), expected, `${file}: preserve original artwork/QR bytes during this audit`);
  console.log('PASS:', file, 'original SHA-256 unchanged');
}
