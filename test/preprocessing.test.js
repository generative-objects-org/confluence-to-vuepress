/**
 * Unit tests for HTML preprocessing functions
 */

const { preprocessConfluenceHtml } = require('../src/migrator');

describe('preprocessConfluenceHtml', () => {
  describe('Confluence images', () => {
    test('converts ac:image with ri:attachment to local img', () => {
      const html = '<ac:image><ri:attachment ri:filename="test.png" /></ac:image>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<img src="./attachments/my-page/test.png" alt="test.png" />');
    });

    test('sanitizes filename with spaces', () => {
      const html = '<ac:image><ri:attachment ri:filename="test image.png" /></ac:image>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<img src="./attachments/my-page/test_image.png" alt="test_image.png" />');
    });

    test('sanitizes filename with colons', () => {
      const html = '<ac:image><ri:attachment ri:filename="image2013-10-18 18:1:19.png" /></ac:image>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<img src="./attachments/my-page/image2013-10-18_18_1_19.png" alt="image2013-10-18_18_1_19.png" />');
    });

    test('converts ac:image with ri:url to external img', () => {
      const html = '<ac:image><ri:url ri:value="https://example.com/image.png" /></ac:image>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<img src="https://example.com/image.png" alt="external-image" />');
    });

    test('converts blob images with data-fileid', () => {
      const attachments = [{ fileId: 'abc123', path: './attachments/my-page/blob.png' }];
      const html = '<img data-fileid="abc123" alt="blob image" />';
      const result = preprocessConfluenceHtml(html, 'my-page', attachments);
      expect(result).toBe('<img src="./attachments/my-page/blob.png" alt="blob image" />');
    });
  });

  describe('SVG and decorative elements', () => {
    test('removes SVG elements', () => {
      const html = '<p>Text<svg class="icon"><path d="M0 0"/></svg>More text</p>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<p>TextMore text</p>');
    });

    test('removes heading anchor wrappers', () => {
      const html = '<h1><span class="heading-anchor-wrapper">Heading</span></h1>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<h1></h1>');
    });

    test('removes anchor buttons', () => {
      const html = '<button data-testid="anchor-button">Copy link</button>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('');
    });

    test('removes visually hidden spans', () => {
      const html = '<span data-testid="visually-hidden">Hidden text</span>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('');
    });
  });

  describe('Confluence panels', () => {
    test('converts info panel to blockquote', () => {
      const html = '<ac:structured-macro ac:name="info"><ac:rich-text-body>Info content</ac:rich-text-body></ac:structured-macro>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<blockquote>**INFO:** Info content</blockquote>');
    });

    test('converts warning panel to blockquote', () => {
      const html = '<ac:structured-macro ac:name="warning"><ac:rich-text-body>Warning content</ac:rich-text-body></ac:structured-macro>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<blockquote>**WARNING:** Warning content</blockquote>');
    });

    test('converts note panel to blockquote', () => {
      const html = '<ac:structured-macro ac:name="note"><ac:rich-text-body>Note content</ac:rich-text-body></ac:structured-macro>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<blockquote>**NOTE:** Note content</blockquote>');
    });

    test('converts tip panel to blockquote', () => {
      const html = '<ac:structured-macro ac:name="tip"><ac:rich-text-body>Tip content</ac:rich-text-body></ac:structured-macro>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<blockquote>**TIP:** Tip content</blockquote>');
    });

    test('converts Atlassian Editor panels', () => {
      const html = '<div class="ak-editor-panel" data-panel-type="info"><div class="ak-editor-panel__content">Panel content</div></div>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<blockquote>**INFO:** Panel content</blockquote>');
    });
  });

  describe('Code macros', () => {
    test('converts code macro with language', () => {
      const html = '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">javascript</ac:parameter><ac:plain-text-body><![CDATA[console.log("hello");]]></ac:plain-text-body></ac:structured-macro>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      // Quotes inside code are preserved (only <, >, & are escaped)
      expect(result).toBe('<pre><code class="language-javascript">console.log("hello");</code></pre>');
    });

    test('converts code macro without language', () => {
      const html = '<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[plain code]]></ac:plain-text-body></ac:structured-macro>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<pre><code class="language-">plain code</code></pre>');
    });

    test('escapes HTML in code blocks', () => {
      const html = '<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[<div>HTML</div>]]></ac:plain-text-body></ac:structured-macro>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toContain('&lt;div&gt;HTML&lt;/div&gt;');
    });

    test('converts tabs to newlines in code blocks', () => {
      const html = '<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[line1\tline2\tline3]]></ac:plain-text-body></ac:structured-macro>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toContain('line1\nline2\nline3');
    });

    test('handles code macro with XML language', () => {
      const html = '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">xml</ac:parameter><ac:plain-text-body><![CDATA[<element attr="value" />]]></ac:plain-text-body></ac:structured-macro>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      // Quotes inside code are preserved, only <, >, & are escaped
      expect(result).toBe('<pre><code class="language-xml">&lt;element attr="value" /&gt;</code></pre>');
    });
  });

  describe('Macro handling', () => {
    test('removes self-closing macros (like TOC)', () => {
      const html = '<p>Before</p><ac:structured-macro ac:name="toc" /><p>After</p>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      // Note: </p><p> gets converted to <br/> in table processing
      expect(result).not.toContain('toc');
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });

    test('removes other macros but preserves images inside', () => {
      const html = '<ac:structured-macro ac:name="unknown"><ac:rich-text-body><img src="test.png" /></ac:rich-text-body></ac:structured-macro>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<img src="test.png" />');
    });

    test('removes ac:parameter tags', () => {
      const html = '<ac:parameter ac:name="test">value</ac:parameter>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('');
    });
  });

  describe('Table HTML cleanup', () => {
    test('removes colgroup elements', () => {
      const html = '<table><colgroup><col width="100" /></colgroup><tbody><tr><td>Cell</td></tr></tbody></table>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).not.toContain('colgroup');
      expect(result).toContain('<td>Cell</td>');
    });

    test('removes data attributes from tables', () => {
      const html = '<table data-layout="default" class="confluenceTable"><tr><td>Cell</td></tr></table>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toContain('<table>');
      expect(result).not.toContain('data-layout');
    });

    test('strips p tags from table cells', () => {
      const html = '<table><tr><td><p>Cell content</p></td></tr></table>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toContain('<td>Cell content</td>');
    });

    test('strips p tags with attributes from table cells', () => {
      const html = '<table><tr><td><p class="some-class">Cell content</p></td></tr></table>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toContain('<td>Cell content</td>');
    });

    test('does NOT strip pre tags (regression test)', () => {
      const html = '<table><tr><td><pre>code</pre></td></tr></table>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toContain('<pre>code</pre>');
    });

    test('converts multiple p tags to br in cells', () => {
      const html = '<table><tr><td><p>Line 1</p><p>Line 2</p></td></tr></table>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toContain('Line 1<br/>Line 2');
    });

    test('moves header row from tbody to thead', () => {
      const html = '<table><tbody><tr><th>Header 1</th><th>Header 2</th></tr><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody></table>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toContain('<thead><tr><th>Header 1</th><th>Header 2</th></tr></thead>');
    });

    test('cleans up attributes on th/td', () => {
      const html = '<table><tr><td class="confluenceTd" style="color:red">Cell</td></tr></table>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toContain('<td>Cell</td>');
    });
  });

  describe('Confluence links', () => {
    test('converts ac:link with ac:link-body', () => {
      const html = '<ac:link><ri:page ri:content-title="Target Page" /><ac:link-body>Link Text</ac:link-body></ac:link>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<a href="CONFLUENCE_LINK:target-page">Link Text</a>');
    });

    test('converts ac:link with ac:plain-text-link-body', () => {
      const html = '<ac:link><ri:page ri:content-title="Target Page" /><ac:plain-text-link-body><![CDATA[Link Text]]></ac:plain-text-link-body></ac:link>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<a href="CONFLUENCE_LINK:target-page">Link Text</a>');
    });

    test('converts ac:link without link body (uses page title)', () => {
      const html = '<ac:link><ri:page ri:content-title="Target Page" /></ac:link>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<a href="CONFLUENCE_LINK:target-page">Target Page</a>');
    });

    test('slugifies page titles with special characters', () => {
      const html = '<ac:link><ri:page ri:content-title="AUI & CUI Interface (Work in progress)" /></ac:link>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('<a href="CONFLUENCE_LINK:aui-cui-interface-work-in-progress">AUI & CUI Interface (Work in progress)</a>');
    });
  });

  describe('Loadable wrapper spans', () => {
    test('removes data-loadable wrapper spans but keeps content', () => {
      const html = '<span data-loadable-vc-wrapper="true">Content inside</span>';
      const result = preprocessConfluenceHtml(html, 'my-page');
      expect(result).toBe('Content inside');
    });
  });
});
