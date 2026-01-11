/**
 * Unit tests for utility functions
 */

const { slugify, sanitizeFilename, escapeRegex } = require('../src/migrator');

describe('slugify', () => {
  test('converts simple text to lowercase slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  test('handles multiple spaces', () => {
    expect(slugify('Hello   World')).toBe('hello-world');
  });

  test('removes special characters', () => {
    expect(slugify('Hello! World?')).toBe('hello-world');
  });

  test('handles leading and trailing dashes', () => {
    expect(slugify('---Hello World---')).toBe('hello-world');
  });

  test('handles numbers', () => {
    expect(slugify('Page 123')).toBe('page-123');
  });

  test('handles unicode characters', () => {
    expect(slugify('Café Menu')).toBe('caf-menu');
  });

  test('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  test('handles only special characters', () => {
    expect(slugify('!@#$%')).toBe('');
  });

  test('handles mixed case with numbers', () => {
    expect(slugify('AUI Model V2.0')).toBe('aui-model-v2-0');
  });

  test('handles forward slashes', () => {
    expect(slugify('Command / Operation Model')).toBe('command-operation-model');
  });

  test('handles parentheses', () => {
    expect(slugify('HTML templates (Work in progress)')).toBe('html-templates-work-in-progress');
  });

  test('handles colons', () => {
    expect(slugify('Discussion : connexions entre AUI')).toBe('discussion-connexions-entre-aui');
  });

  test('handles ampersand', () => {
    expect(slugify('AUI & CUI Interface')).toBe('aui-cui-interface');
  });
});

describe('sanitizeFilename', () => {
  test('replaces colons with underscores', () => {
    expect(sanitizeFilename('file:name.png')).toBe('file_name.png');
  });

  test('replaces spaces with underscores', () => {
    expect(sanitizeFilename('file name.png')).toBe('file_name.png');
  });

  test('replaces multiple invalid characters', () => {
    expect(sanitizeFilename('file<>:"/\\|?*.png')).toBe('file_________.png');
  });

  test('handles timestamp format in filename', () => {
    expect(sanitizeFilename('image2013-10-18 18:1:19.png')).toBe('image2013-10-18_18_1_19.png');
  });

  test('preserves valid characters', () => {
    expect(sanitizeFilename('valid-file_name.png')).toBe('valid-file_name.png');
  });

  test('handles multiple spaces', () => {
    // \s+ replaces multiple spaces with single underscore
    expect(sanitizeFilename('file   name.png')).toBe('file_name.png');
  });

  test('handles mixed invalid characters', () => {
    expect(sanitizeFilename('Report: Q1 <summary>.pdf')).toBe('Report__Q1__summary_.pdf');
  });
});

describe('escapeRegex', () => {
  test('escapes dot', () => {
    expect(escapeRegex('file.txt')).toBe('file\\.txt');
  });

  test('escapes asterisk', () => {
    // Also escapes the dot
    expect(escapeRegex('file*.txt')).toBe('file\\*\\.txt');
  });

  test('escapes brackets', () => {
    expect(escapeRegex('file[1].txt')).toBe('file\\[1\\]\\.txt');
  });

  test('escapes parentheses', () => {
    expect(escapeRegex('file(1).txt')).toBe('file\\(1\\)\\.txt');
  });

  test('escapes pipe', () => {
    expect(escapeRegex('a|b')).toBe('a\\|b');
  });

  test('escapes backslash', () => {
    expect(escapeRegex('path\\file')).toBe('path\\\\file');
  });

  test('escapes question mark and plus', () => {
    expect(escapeRegex('file?.txt+')).toBe('file\\?\\.txt\\+');
  });

  test('escapes caret and dollar', () => {
    expect(escapeRegex('^start$end')).toBe('\\^start\\$end');
  });

  test('escapes curly braces', () => {
    expect(escapeRegex('file{1,2}.txt')).toBe('file\\{1,2\\}\\.txt');
  });

  test('handles string with no special characters', () => {
    expect(escapeRegex('simple-file')).toBe('simple-file');
  });
});
