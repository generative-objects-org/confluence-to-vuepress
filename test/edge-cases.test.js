/**
 * Unit tests for edge cases and specific bug fixes
 */

const { preprocessConfluenceHtml, ConfluenceToVuePress } = require('../src/migrator');

describe('Edge Cases', () => {
  describe('P-tag regex not matching PRE tags (bug fix)', () => {
    test('p-tag stripping does not affect pre tags', () => {
      const html = '<table><tr><td><p>text</p><pre>code</pre></td></tr></table>';
      const result = preprocessConfluenceHtml(html, 'test-page');
      expect(result).toContain('<pre>code</pre>');
    });

    test('multiple p tags converted to br without affecting pre', () => {
      const html = '<table><tr><td><p>line1</p><pre>code</pre><p>line2</p></td></tr></table>';
      const result = preprocessConfluenceHtml(html, 'test-page');
      expect(result).toContain('<pre>code</pre>');
      expect(result).toContain('line1');
      expect(result).toContain('line2');
    });

    test('does not match param tags', () => {
      const html = '<table><tr><td><p>text</p></td></tr></table><param name="test" />';
      const result = preprocessConfluenceHtml(html, 'test-page');
      // param should not be stripped or modified
      expect(result).not.toMatch(/<br\/>.*<param/);
    });
  });

  describe('Adjacent HTML tag escaping (bug fix)', () => {
    let migrator;

    beforeEach(() => {
      migrator = new ConfluenceToVuePress({
        confluenceUrl: 'https://test.atlassian.net',
        rootPageId: '12345',
        email: 'test@example.com',
        apiToken: 'test-token'
      });
    });

    // Note: In real Confluence content, HTML tags as text would be HTML-escaped
    test('escapes <ol><li> when adjacent and HTML-escaped', () => {
      const html = '<p>Tags &lt;ol&gt;&lt;li&gt; are used for lists</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<ol>`');
      expect(result).toContain('`<li>`');
    });

    test('escapes closing tag sequence when HTML-escaped', () => {
      const html = '<p>Text &lt;/p&gt;&lt;/li&gt;&lt;li&gt;&lt;p&gt; more text</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`</p>`');
      expect(result).toContain('`</li>`');
      expect(result).toContain('`<li>`');
      expect(result).toContain('`<p>`');
    });

    test('escapes multiple adjacent closing tags when HTML-escaped', () => {
      const html = '<p>End tags: &lt;/div&gt;&lt;/span&gt;&lt;/section&gt;</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`</div>`');
      expect(result).toContain('`</span>`');
      expect(result).toContain('`</section>`');
    });

    test('escapes tags with attributes when HTML-escaped', () => {
      const html = '<p>Use &lt;div class="container"&gt; for styling</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<div class="container">`');
    });
  });

  describe('Table protection (bug fix)', () => {
    let migrator;

    beforeEach(() => {
      migrator = new ConfluenceToVuePress({
        confluenceUrl: 'https://test.atlassian.net',
        rootPageId: '12345',
        email: 'test@example.com',
        apiToken: 'test-token'
      });
    });

    test('preserves tables with complex content', () => {
      const html = '<table><tbody><tr><td>Text with <strong>bold</strong><ul><li>Item 1</li><li>Item 2</li></ul></td></tr></tbody></table>';
      const result = migrator.convertToMarkdown(html);
      // Table should be preserved as HTML
      expect(result).toContain('<table>');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>');
    });

    test('preserves actual tables (table tags not escaped since they are protected)', () => {
      // Table tags are protected entirely, not escaped with backticks
      // So we test with div instead which IS in the escape list
      const html = '<p>Use &lt;div&gt; here</p><table><tbody><tr><td>Cell</td></tr></tbody></table>';
      const result = migrator.convertToMarkdown(html);
      // The div mention should be escaped with backticks
      expect(result).toMatch(/`<div>`/);
      // Actual table preserved as HTML
      expect(result).toContain('<td>Cell</td>');
    });
  });

  describe('Code block handling', () => {
    test('converts code macro with JS binding code', () => {
      const html = `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">js</ac:parameter><ac:plain-text-body><![CDATA[ko.bindingHandlers.jqDatePicker = {
    init: function (element, valueAccessor) {
        var $el = $(element);
    }
};]]></ac:plain-text-body></ac:structured-macro>`;
      const result = preprocessConfluenceHtml(html, 'test-page');
      expect(result).toContain('ko.bindingHandlers.jqDatePicker');
      expect(result).toContain('language-js');
    });

    test('handles code blocks with HTML templates', () => {
      const html = `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">xml</ac:parameter><ac:plain-text-body><![CDATA[<div class="widget">
<label data-bind="text: name"></label>
<input data-bind="value: current" />
</div>]]></ac:plain-text-body></ac:structured-macro>`;
      const result = preprocessConfluenceHtml(html, 'test-page');
      expect(result).toContain('&lt;div class=');
      expect(result).toContain('&lt;label');
      expect(result).toContain('&lt;input');
    });

    test('handles code blocks with CDATA containing special chars', () => {
      const html = `<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[a < b && c > d]]></ac:plain-text-body></ac:structured-macro>`;
      const result = preprocessConfluenceHtml(html, 'test-page');
      expect(result).toContain('a &lt; b &amp;&amp; c &gt; d');
    });
  });

  describe('Link handling edge cases', () => {
    test('handles page titles with French characters', () => {
      const html = '<ac:link><ri:page ri:content-title="Discussion : connexions entre AUI" /></ac:link>';
      const result = preprocessConfluenceHtml(html, 'test-page');
      expect(result).toContain('CONFLUENCE_LINK:discussion-connexions-entre-aui');
    });

    test('handles page titles with multiple special characters', () => {
      const html = '<ac:link><ri:page ri:content-title="HTML templates / AUI & CUI Interface (Work in progress)" /></ac:link>';
      const result = preprocessConfluenceHtml(html, 'test-page');
      expect(result).toContain('CONFLUENCE_LINK:html-templates-aui-cui-interface-work-in-progress');
    });
  });

  describe('Empty and malformed content', () => {
    test('handles empty HTML', () => {
      const result = preprocessConfluenceHtml('', 'test-page');
      expect(result).toBe('');
    });

    test('handles HTML with only whitespace', () => {
      const result = preprocessConfluenceHtml('   \n\t  ', 'test-page');
      expect(result.trim()).toBe('');
    });

    test('handles unclosed tags gracefully', () => {
      const html = '<p>Text without closing tag';
      // Should not throw
      expect(() => preprocessConfluenceHtml(html, 'test-page')).not.toThrow();
    });

    test('handles nested tables', () => {
      const html = '<table><tr><td><table><tr><td>Nested</td></tr></table></td></tr></table>';
      const result = preprocessConfluenceHtml(html, 'test-page');
      expect(result).toContain('Nested');
    });
  });

  describe('Special macro handling', () => {
    test('removes TOC macro', () => {
      const html = '<ac:structured-macro ac:name="toc" /><p>Content after TOC</p>';
      const result = preprocessConfluenceHtml(html, 'test-page');
      expect(result).not.toContain('toc');
      expect(result).toContain('Content after TOC');
    });

    test('preserves images inside unknown macros', () => {
      const html = '<ac:structured-macro ac:name="gallery"><ac:rich-text-body><img src="img1.png" /><img src="img2.png" /></ac:rich-text-body></ac:structured-macro>';
      const result = preprocessConfluenceHtml(html, 'test-page');
      expect(result).toContain('<img src="img1.png" />');
      expect(result).toContain('<img src="img2.png" />');
    });
  });

  describe('Panel handling variations', () => {
    test('handles panel with nested HTML', () => {
      const html = '<ac:structured-macro ac:name="info"><ac:rich-text-body><p><strong>Important:</strong> This is <em>info</em></p></ac:rich-text-body></ac:structured-macro>';
      const result = preprocessConfluenceHtml(html, 'test-page');
      expect(result).toContain('<blockquote>**INFO:**');
      expect(result).toContain('<strong>Important:</strong>');
    });

    test('handles Atlassian Editor panel with warning type', () => {
      const html = '<div class="ak-editor-panel" data-panel-type="warning"><div class="ak-editor-panel__content">Warning message</div></div>';
      const result = preprocessConfluenceHtml(html, 'test-page');
      expect(result).toBe('<blockquote>**WARNING:** Warning message</blockquote>');
    });
  });

  describe('Attachment edge cases', () => {
    test('handles attachments with special characters in filename', () => {
      const attachments = [{
        fileId: 'abc123',
        path: './attachments/test/file_with_special_chars.png'
      }];
      const html = '<img data-fileid="abc123" alt="test" />';
      const result = preprocessConfluenceHtml(html, 'test', attachments);
      expect(result).toContain('./attachments/test/file_with_special_chars.png');
    });

    test('preserves images when fileId not found in attachments', () => {
      const attachments = [{ fileId: 'other', path: './other.png' }];
      const html = '<img data-fileid="notfound" alt="test" />';
      const result = preprocessConfluenceHtml(html, 'test', attachments);
      expect(result).toContain('data-fileid="notfound"');
    });
  });
});

describe('Multiple features interaction', () => {
  let migrator;

  beforeEach(() => {
    migrator = new ConfluenceToVuePress({
      confluenceUrl: 'https://test.atlassian.net',
      rootPageId: '12345',
      email: 'test@example.com',
      apiToken: 'test-token'
    });
  });

  test('handles document with code blocks, tables, and text tags (HTML-escaped)', () => {
    const html = `
      <p>Use &lt;div&gt; and &lt;span&gt; for layout.</p>
      <pre><code class="language-html">&lt;div&gt;Code example&lt;/div&gt;</code></pre>
      <table><tbody><tr><td><ul><li>Item</li></ul></td></tr></tbody></table>
      <p>More about &lt;ul&gt; lists.</p>
    `;
    const result = migrator.convertToMarkdown(html);

    // Text mentions should be escaped with backticks
    expect(result).toContain('`<div>`');
    expect(result).toContain('`<span>`');
    expect(result).toContain('`<ul>`');

    // Code block content should be preserved
    expect(result).toContain('```html');

    // Table content should be preserved as HTML
    expect(result).toContain('<table>');
  });

  test('handles complex Confluence page structure', () => {
    const html = `
      <ac:structured-macro ac:name="info"><ac:rich-text-body>This is an info panel</ac:rich-text-body></ac:structured-macro>
      <ac:structured-macro ac:name="code"><ac:parameter ac:name="language">javascript</ac:parameter><ac:plain-text-body><![CDATA[const x = 1;]]></ac:plain-text-body></ac:structured-macro>
      <ac:link><ri:page ri:content-title="Other Page" /><ac:link-body>Link to other page</ac:link-body></ac:link>
      <table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>
    `;
    const result = migrator.convertToMarkdown(html);

    // Info panel converted to blockquote (asterisks may be escaped in markdown)
    expect(result).toMatch(/INFO:/);

    // Code block preserved
    expect(result).toContain('```javascript');
    expect(result).toContain('const x = 1;');

    // Link placeholder present
    expect(result).toContain('CONFLUENCE_LINK:other-page');

    // Table content preserved (may be converted to markdown table format)
    expect(result).toMatch(/Header|<table>/);
  });
});
