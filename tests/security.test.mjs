import test from 'node:test';
import assert from 'node:assert/strict';

const reserved = new Set(['admin','api','auth','login','logout','signup','privacy','terms','dashboard','settings','report','robots.txt','favicon.ico']);
function isValidSlug(value){const slug=value.trim().toLowerCase();return /^[a-z0-9][a-z0-9_-]{2,49}$/.test(slug)&&!reserved.has(slug)}
function isAllowedDestination(value){try{const url=new URL(value);return url.protocol==='https:'||url.protocol==='http:'}catch{return false}}

test('valid slugs',()=>{assert.equal(isValidSlug('abc'),true);assert.equal(isValidSlug('health2026'),true);assert.equal(isValidSlug('my-link_1'),true)});
test('reserved and malformed slugs rejected',()=>{assert.equal(isValidSlug('api'),false);assert.equal(isValidSlug('ab'),false);assert.equal(isValidSlug('a/b'),false);assert.equal(isValidSlug('-abc'),false)});
test('destination allows only http(s)',()=>{assert.equal(isAllowedDestination('https://example.com/x'),true);assert.equal(isAllowedDestination('http://example.com'),true);assert.equal(isAllowedDestination('javascript:alert(1)'),false);assert.equal(isAllowedDestination('data:text/html,x'),false)});
