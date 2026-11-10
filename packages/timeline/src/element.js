// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// <och-timeline>: the offline editor (dist/openchronology-offline.html) in a sandboxed frame of
// any page, opened at a timeline given inline, by address or by script. scripts/timeline-package.mjs
// builds it into packages/timeline/dist/timeline.js with the offline file in place of OFFLINE_HTML.
(() => {
  const OFFLINE_HTML = '__OFFLINE_HTML__';
  if (customElements.get('och-timeline')) return;
  /**
   * The timeline with what every one has filled in when left out, so a page (or a model writing
   * one) can give only what matters: the format and version, an empty description, and a time
   * display named by its mode alone ("gregorian") with the editor's defaults for the rest.
   */
  const completed = (doc) => {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return doc;
    const filled = { format: 'openchronology', version: 1, description: '', events: [], ...doc };
    if (typeof filled.presentation === 'string')
      filled.presentation = {
        version: 1,
        mode: filled.presentation,
        significantDigits: 6,
        unit: '',
        scale: '1/1',
        origin: '0/1',
        offsetMinutes: 0,
      };
    return filled;
  };
  /** JSON safe inside a <script> element: no `<` at all, so never `</script`. */
  const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

  class OchTimeline extends HTMLElement {
    static observedAttributes = ['src', 'height', 'theme', 'mode', 'title'];
    #frame = null;
    #timeline = undefined;
    #observer = null;
    #request = 0;

    /** The timeline shown, as .ochx JSON; setting it shows another. */
    get timeline() {
      return this.#timeline;
    }
    set timeline(value) {
      this.#timeline = value;
      this.#show();
    }

    connectedCallback() {
      if (!this.shadowRoot) {
        const root = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent =
          ':host{display:block;box-sizing:border-box;inline-size:100%;block-size:var(--och-height,600px);border:1px solid var(--och-border,#8884);border-radius:var(--och-radius,8px);overflow:hidden}iframe{display:block;inline-size:100%;block-size:100%;border:0}p{margin:0;padding:1em;font:14px system-ui,sans-serif;color:#b3261e}';
        root.append(style);
      }
      this.#height();
      // The element can be connected before its children are parsed: the inline timeline then
      // arrives later, so changes to it show again.
      this.#observer = new MutationObserver(() => this.#show());
      this.#observer.observe(this, { childList: true, subtree: true, characterData: true });
      this.#show();
    }
    disconnectedCallback() {
      this.#observer?.disconnect();
      this.#observer = null;
    }
    attributeChangedCallback(name) {
      if (name === 'height') this.#height();
      else if (this.shadowRoot) this.#show();
    }

    #height() {
      const height = this.getAttribute('height');
      if (height)
        this.style.setProperty('--och-height', /^\d+$/.test(height) ? height + 'px' : height);
      else this.style.removeProperty('--och-height');
    }
    /** The timeline to show: set by script, else inline, else at `src`. */
    async #document() {
      if (this.#timeline !== undefined)
        return typeof this.#timeline === 'string' ? JSON.parse(this.#timeline) : this.#timeline;
      const inline = this.querySelector('script[type="application/json"]')?.textContent?.trim();
      if (inline) return JSON.parse(inline);
      const src = this.getAttribute('src');
      if (src) {
        const response = await fetch(new URL(src, document.baseURI));
        if (!response.ok) throw new Error(`${src}: ${response.status} ${response.statusText}`);
        return response.json();
      }
      return null;
    }
    async #show() {
      if (!this.shadowRoot) return;
      const request = ++this.#request;
      let doc;
      try {
        doc = await this.#document();
      } catch (error) {
        if (request === this.#request) this.#fail(error);
        return;
      }
      if (request !== this.#request) return;
      const theme = this.getAttribute('theme');
      const mode = this.getAttribute('mode') === 'view' ? ' data-mode="view"' : '';
      let html = OFFLINE_HTML;
      if (theme === 'light' || theme === 'dark')
        html = html.replace(/<html\b/i, `<html data-theme="${theme}"`);
      if (doc)
        html = html.replace(
          /<body\b[^>]*>/i,
          (body) =>
            `${body}<script type="application/json" id="och-document"${mode}>${scriptJson(completed(doc))}</script>`,
        );
      // An identical page is not reloaded, which would lose what the reader has done.
      if (this.#frame?.isConnected && this.#frame.srcdoc === html) return;
      const frame = document.createElement('iframe');
      frame.title = this.getAttribute('title') || doc?.title || 'Timeline';
      // Scripts only, in an origin of its own: the page around it is out of its reach.
      frame.setAttribute(
        'sandbox',
        'allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals',
      );
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.srcdoc = html;
      for (const old of this.shadowRoot.querySelectorAll('iframe, p')) old.remove();
      this.shadowRoot.append(frame);
      this.#frame = frame;
    }
    #fail(error) {
      for (const old of this.shadowRoot.querySelectorAll('iframe, p')) old.remove();
      this.#frame = null;
      const message = document.createElement('p');
      message.textContent = `This timeline could not be opened: ${error?.message ?? error}`;
      this.shadowRoot.append(message);
    }
  }
  customElements.define('och-timeline', OchTimeline);
})();
