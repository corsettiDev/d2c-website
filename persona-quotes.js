/* GreenShield persona page quotes v1.1.0
 *
 * Loads on persona pages (e.g. /en-ca/personal/family) instead of
 * plan-card-display.js + plan-injector.js. Renders plan cards from the CMS
 * source, opens a native <dialog> quote modal, fetches live pricing from the
 * quote API, and stores inputs exactly as the quote flow does so the results
 * page and Apply flow carry on seamlessly.
 *
 * Load via utilities/script-loader.js from a Webflow Embed. Configuration
 * lives as data-* attributes on the Embed parent (copied onto this script
 * tag by the loader):
 *   data-api-url          - Production API root (required)
 *   data-api-url-staging  - Staging API root (used on *.webflow.io)
 *   data-persona          - Persona name for analytics events (default: "family")
 *   data-default-coverage - Default CoverageType preselect (default: "2")
 *
 * v1.1.0: "View All Plans" links ([data-persona-view-all]) reveal after a
 * successful quote and carry the confirmed inputs + plans=view-all to the
 * quote results page.
 *
 * Existing legacy scripts and their published versions remain unchanged.
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIGURATION
  // ============================================================

  const script = document.currentScript;
  const config = (name, fallback = '') => script?.getAttribute(name) || script?.parentElement?.getAttribute(name) || fallback;
  const staging = location.hostname.endsWith('.webflow.io');
  const api = (staging ? config('data-api-url-staging') : config('data-api-url')) || 'https://qagsd2cins.greenshield.ca';
  const defaultCoverage = config('data-default-coverage', '2');
  const persona = config('data-persona', 'family');
  const CORE = ['CoverageType', 'Dependents', 'Age', 'Province'];
  const LOCAL_KEY = 'dpr_local_data';
  const RESULTS_KEY = 'dpr_results_data';

  // ============================================================
  // LOCALIZATION
  // ============================================================

  const fr = (document.documentElement.lang || '').toLowerCase().startsWith('fr');
  const words = fr ? {
    confirm: 'Confirmer', loading: 'Chargement…', apply: 'Faire une demande', retry: 'Réessayer',
    invalid: 'Veuillez sélectionner votre couverture, votre âge, votre province et le nombre de personnes à charge, le cas échéant.',
    error: 'Impossible de charger les prix. Veuillez réessayer.', success: 'Vos prix ont été mis à jour.',
    initial: 'Confirmez vos renseignements pour voir vos prix.', unavailable: 'Prix non disponible pour ces renseignements.',
    hospital: "Ajouter l’hospitalisation facultative pour $", saved: 'Vos prix sont affichés. Le navigateur ne peut pas enregistrer vos renseignements.'
  } : {
    confirm: 'Confirm', loading: 'Loading…', apply: 'Apply now', retry: 'Try again',
    invalid: 'Please select your coverage, age range, province, and number of dependents where applicable.',
    error: 'We couldn’t load your prices. Please try again.', success: 'Your prices have been updated.',
    initial: 'Confirm your details to see your prices.', unavailable: 'Pricing is unavailable for these details.',
    hospital: 'Add optional hospital accommodation for $', saved: 'Your prices are shown. This browser couldn’t save your details for later.'
  };

  // ============================================================
  // STORAGE & TRACKING HELPERS
  // ============================================================

  function readStorage(kind, key) {
    try { const value = JSON.parse(window[kind].getItem(key) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch (_) { return {}; }
  }
  function writeStorage(kind, key, value) {
    try { window[kind].setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  }
  function clearResults() { try { sessionStorage.removeItem(RESULTS_KEY); } catch (_) {} }
  // Stored filter answers are only forwarded when they match the quote flow's own validation.
  function storedTier(prior) { return ['basic', 'comprehensive'].includes(prior.CoverageTier) ? prior.CoverageTier : null; }
  function storedReason(prior) { return prior.InsuranceReason !== '' && prior.InsuranceReason != null && [0, 1, 2].includes(Number(prior.InsuranceReason)) ? Number(prior.InsuranceReason) : null; }
  function track(event, extra = {}) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, persona, ...extra });
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  function initialize() {
    const page = document.querySelector('[data-persona-quote-page]');
    const form = page?.querySelector('[data-form-trigger="quote-form"]');
    const modal = form?.querySelector('[data-form-trigger="quote-modal"]');
    const source = page?.querySelector('[dpr-plan-injector-source]');
    if (!page || !form || !modal || !source || page.dataset.personaInitialized) return;
    page.dataset.personaInitialized = 'true';
    page.dataset.personaVersion = '1.1.0';
    const all = (selector, root = page) => Array.from(root.querySelectorAll(selector));
    const submit = form.querySelector('[data-form-trigger="get-quote"]');
    const summary = form.querySelector('[data-persona-summary]');
    const starts = all('[data-persona-start]');
    const status = page.querySelector('[data-persona-status]');
    const modalStatus = modal.querySelector('[data-persona-modal-status]');
    const targets = all('[dpr-plan-injector]:not([dpr-plan-injector-source])');
    const templates = new Map(all('[dpr-results-plan]', source).map(card => [card.getAttribute('dpr-results-plan'), card]));
    let confirmed = null;
    let quotes = new Map();
    let request = null;
    let generation = 0;
    let busy = false;
    let applicationBusy = false;
    let opener = null;
    let closingAfterSuccess = false;
    let oldOverflow = '';
    const optionsCache = new Map();
    const selectedOptions = new Map();

    // ============================================================
    // OPTIONAL CONTACT MODAL
    // ============================================================

    // Keep the existing Webflow content; promote its shell to a native dialog at runtime.
    const contactShell = page.querySelector('.gsi-quote-modal_component');
    let contactModal = contactShell;
    if (contactShell && contactShell.tagName !== 'DIALOG') {
      contactModal = document.createElement('dialog');
      Array.from(contactShell.attributes).forEach(a => contactModal.setAttribute(a.name, a.value));
      contactModal.append(...contactShell.childNodes);
      contactShell.replaceWith(contactModal);
    }
    const contactForm = contactModal?.querySelector('form');
    let pendingDetails = null;
    let transitioningToContact = false;
    let contactCompleted = false;
    let contactStatus = null;
    if (contactForm) {
      // Webflow can retain the exported HTML name after its field display name changes.
      ['FirstName','LastName','PhoneNumber','EmailAddress','PrivacyPolicy','MarketingPermission'].forEach(name => {
        const field = contactForm.querySelector(`#persona-contact-${name}`);
        if (!field) return;
        field.name = name;
        field.setAttribute('data-name', name);
        if (field.type === 'checkbox') {
          const label = field.closest('label');
          if (label) { label.id = `persona-contact-${name}-label`; label.setAttribute('for', field.id); }
          label?.querySelector('.w-form-label')?.setAttribute('for', field.id);
        }
      });
      contactModal.setAttribute('aria-label', fr ? 'Coordonnées facultatives' : 'Optional contact details');
      contactModal.querySelector('.contact-modal1_close-button')?.setAttribute('aria-label', fr ? 'Retour aux renseignements' : 'Back to coverage details');
      ['FirstName','LastName','PhoneNumber','EmailAddress'].forEach(name => {
        const field = contactForm.elements.namedItem(name);
        if (!field) return;
        field.parentElement.querySelector('label')?.setAttribute('for', field.id);
        field.autocomplete = {FirstName:'given-name',LastName:'family-name',PhoneNumber:'tel',EmailAddress:'email'}[name];
      });
      contactStatus = document.createElement('p');
      contactStatus.className = 'gsi-text-size-small';
      contactStatus.setAttribute('data-persona-contact-status', '');
      contactStatus.setAttribute('aria-live', 'polite');
      contactStatus.hidden = true;
      contactForm.querySelector('[type="submit"]')?.parentElement.before(contactStatus);
      contactForm.addEventListener('submit', e => {
        consume(e);
        if (busy || !contactForm.reportValidity()) return;
        const contacts = {};
        ['FirstName','LastName','PhoneNumber','EmailAddress'].forEach(name => { contacts[name] = contactForm.elements.namedItem(name)?.value.trim() || null; });
        contacts.PrivacyPolicy = contactForm.elements.namedItem('PrivacyPolicy')?.checked === true;
        contacts.MarketingPermission = contactForm.elements.namedItem('MarketingPermission')?.checked === true;
        quoteDetails(pendingDetails, 'contact', contacts);
      }, true);
      contactModal.addEventListener('close', () => {
        if (busy) { generation++; request?.abort(); busy = false; }
        if (contactCompleted) {
          contactCompleted = false;
          pendingDetails = null;
          document.body.style.overflow = oldOverflow;
          opener?.focus?.();
        } else {
          setState(confirmed && quotes.size ? 'ready' : 'empty');
          setMessage(status, confirmed ? words.success : words.initial);
          fillForm(pendingDetails || confirmed || defaultValues());
          modal.showModal();
        }
        updateForm();
      });
    }
    modal.setAttribute('aria-label', fr ? 'Confirmez vos renseignements' : 'Confirm your details');
    form.elements.Dependents?.setAttribute('aria-label', fr ? 'Nombre de personnes à charge' : 'Number of dependents');
    form.elements.Province?.setAttribute('aria-label', fr ? 'Province' : 'Province');

    // ============================================================
    // FORM STATE
    // ============================================================

    function hasChildren(data) { return data.CoverageType === '1' || data.CoverageType === '2'; }
    function allowed(name, value) {
      const elements = all(`[name="${name}"]`, form);
      return elements.some(el => el.tagName === 'SELECT' ? Array.from(el.options).some(o => o.value !== '' && o.value === String(value)) : el.value === String(value));
    }
    function normalize(data) {
      const result = {};
      CORE.forEach(key => { result[key] = data[key] == null ? '' : String(data[key]); });
      if (result.CoverageType === '0' || result.CoverageType === '3') result.Dependents = '0';
      return result;
    }
    function valid(data) {
      return ['CoverageType', 'Age', 'Province'].every(key => allowed(key, data[key])) && (!hasChildren(data) || allowed('Dependents', data.Dependents));
    }
    function readForm() {
      const result = {};
      CORE.forEach(key => { result[key] = form.elements.namedItem(key)?.value || ''; });
      return normalize(result);
    }
    function defaultValues() {
      const stored = readStorage('localStorage', LOCAL_KEY);
      const result = normalize(stored);
      const params = new URLSearchParams(location.search);
      CORE.forEach(key => { if (params.has(key) && allowed(key, params.get(key))) result[key] = params.get(key); });
      if (!allowed('CoverageType', result.CoverageType)) result.CoverageType = defaultCoverage;
      CORE.filter(key => key !== 'CoverageType').forEach(key => { if (!allowed(key, result[key])) result[key] = ''; });
      return normalize(result);
    }
    function fillForm(data) {
      CORE.forEach(key => all(`[name="${key}"]`, form).forEach(el => {
        if (el.type === 'radio') {
          el.checked = el.value === String(data[key] ?? '');
          el.parentElement.querySelector('.w-radio-input')?.classList.toggle('w--redirected-checked', el.checked);
        } else el.value = String(data[key] ?? '');
      }));
      updateForm();
    }
    function updateForm() {
      const data = readForm();
      const children = hasChildren(data);
      all('[data-persona-dependents]', modal).forEach(el => { el.hidden = !children; });
      if (form.elements.Dependents) form.elements.Dependents.required = children;
      const enabled = valid(data) && !busy;
      submit.setAttribute('aria-disabled', String(!enabled));
      submit.classList.toggle('is-active', enabled);
      submit.textContent = busy ? words.loading : words.confirm;
      if (contactForm) {
        contactForm.querySelectorAll('input,button').forEach(el => { el.disabled = busy; });
        contactForm.setAttribute('aria-busy', String(busy));
      }
    }
    function setMessage(el, text, error = false) {
      if (!el) return;
      el.textContent = text;
      el.hidden = !text;
      el.setAttribute('role', error ? 'alert' : 'status');
    }
    function summarize() {
      if (summary) summary.hidden = !confirmed;
      starts.forEach(el => { el.hidden = !!confirmed; });
      if (!confirmed) return;
      const coverage = fr ? {0:'Moi',1:'Moi et mes enfants',2:'Moi, mon conjoint et mes enfants',3:'Moi et mon conjoint'} : {0:'Myself',1:'Myself & Child(ren)',2:'Myself, Spouse/Partner & Child(ren)',3:'Myself & Significant Other'};
      const ages = {18:'18–44',45:'45–54',55:'55–59',60:'60–64',65:'65+'};
      const province = Array.from(form.elements.Province.options).find(o => o.value === confirmed.Province)?.textContent || '';
      const values = { ...confirmed, CoverageType: coverage[confirmed.CoverageType], Age: ages[confirmed.Age], Province: province };
      all('[data-persona-value]', summary).forEach(el => { el.textContent = values[el.getAttribute('data-persona-value')] || ''; });
      all('[data-persona-dependents]', summary).forEach(el => { el.hidden = !hasChildren(confirmed); });
    }

    // ============================================================
    // CONTINUATION & VIEW-ALL LINKS
    // ============================================================

    function updateContinuationLinks() {
      all('a[href]').forEach(a => {
        const url = new URL(a.getAttribute('href'), location.href);
        if (url.origin !== location.origin || !/\/personal\/get-(?:a-)?quote\/?$/.test(url.pathname)) return;
        CORE.forEach(key => { if (confirmed) url.searchParams.set(key, confirmed[key]); else url.searchParams.delete(key); });
        a.href = url.href;
      });
    }
    // "View All Plans" links reveal only once real prices are on the page, and
    // carry the confirmed inputs + plans=view-all so the quote results page
    // shows every plan without re-asking. The href (localized quote page URL)
    // is authored in Webflow; only its query string is managed here.
    function updateViewAllLinks() {
      const show = page.dataset.personaState === 'ready' && !!confirmed && quotes.size > 0;
      all('[data-persona-view-all]').forEach(el => {
        el.hidden = !show;
        const anchor = el.tagName === 'A' ? el : el.querySelector('a[href]');
        if (!anchor || !anchor.getAttribute('href') || !confirmed) return;
        const url = new URL(anchor.getAttribute('href'), location.href);
        CORE.forEach(key => url.searchParams.set(key, confirmed[key]));
        const prior = readStorage('localStorage', LOCAL_KEY);
        const tier = storedTier(prior);
        const reason = storedReason(prior);
        if (tier) url.searchParams.set('CoverageTier', tier); else url.searchParams.delete('CoverageTier');
        if (reason != null) url.searchParams.set('InsuranceReason', String(reason)); else url.searchParams.delete('InsuranceReason');
        url.searchParams.set('plans', 'view-all');
        anchor.href = url.href;
      });
    }

    // ============================================================
    // PLAN CARD RENDERING
    // ============================================================

    function uniqueClone(template, suffix) {
      const clone = template.cloneNode(true);
      clone.setAttribute('data-injected-plan', 'true');
      clone.setAttribute('data-persona-card', '');
      clone.classList.remove('hide');
      clone.style.removeProperty('display');
      // References are scoped per cloned card; never duplicate IDs across tabs.
      const ids = new Map();
      [clone, ...all('[id]', clone)].forEach(el => {
        if (el.id) { const old = el.id; el.id = `persona-${suffix}-${old}`; if (!ids.has(old)) ids.set(old, el.id); }
      });
      all('[for],[aria-controls],[aria-labelledby],[aria-describedby],[href^="#"]', clone).forEach(el => {
        ['for','aria-controls','aria-labelledby','aria-describedby'].forEach(attr => {
          if (el.hasAttribute(attr)) el.setAttribute(attr, el.getAttribute(attr).split(/\s+/).map(id => ids.get(id) || id).join(' '));
        });
        const anchor = el.getAttribute('href');
        if (anchor?.startsWith('#') && ids.has(anchor.slice(1))) el.setAttribute('href', '#' + ids.get(anchor.slice(1)));
      });
      all('dialog', clone).forEach(d => d.removeAttribute('open'));
      all('[data-tooltip-initialized]', clone).forEach(el => el.removeAttribute('data-tooltip-initialized'));
      all('[data-accordion-initialized]', clone).forEach(el => el.removeAttribute('data-accordion-initialized'));
      return clone;
    }
    function hospitalOption(quote) { return quote?.QuoteOptions?.find(o => o.OptionName === 'Hospital Accommodation' && Number.isFinite(Number(o.OptionPremium))); }
    function paintCard(card, quote, selected = selectedOptions.get(card.getAttribute('dpr-results-plan')) || false) {
      const priceAvailable = !!quote && page.dataset.personaState === 'ready';
      const option = hospitalOption(quote);
      const quebec = confirmed?.Province === '10';
      all('[data-results="dynamic-block"]', card).forEach(el => { el.hidden = !priceAvailable; });
      all('[dpr-results-price="price"]', card).forEach(el => {
        el.textContent = priceAvailable ? String(Math.round(Number(quote.Premium) + (selected && option ? Number(option.OptionPremium) : 0))) : '';
      });
      all('[dpr-quote-hospital="checkbox-wrapper"]', card).forEach(el => { el.hidden = !priceAvailable || !option; });
      all('[dpr-quote-hospital="check-trigger"]', card).forEach(el => { el.checked = selected; });
      all('[dpr-quote-hospital="text-line"]', card).forEach(el => { el.textContent = option ? words.hospital + Math.round(Number(option.OptionPremium)) : ''; });
      all('[dpr-results-apply="button"]', card).forEach(el => {
        el.hidden = !priceAvailable || quebec;
        if (quote) el.dataset.confirmation = quote.ConfirmationNumber;
        else delete el.dataset.confirmation;
      });
      all('[dpr-results-quebec="call"]', card).forEach(el => { el.hidden = !priceAvailable || !quebec; el.style.display = priceAvailable && quebec ? 'block' : 'none'; });
      all('[data-quebec-hide]', card).forEach(el => { el.hidden = !priceAvailable || quebec; });
      let notice = card.querySelector('[data-persona-unavailable]');
      if (!notice) { notice = document.createElement('p'); notice.className = 'gsi-text-size-small'; notice.setAttribute('data-persona-unavailable', ''); card.appendChild(notice); }
      notice.textContent = words.unavailable;
      notice.hidden = page.dataset.personaState !== 'ready' || !!quote;
    }
    function refreshCards() {
      targets.forEach((target, groupIndex) => {
        const cards = target.getAttribute('dpr-plan-injector').split(',').map(s => s.trim()).filter(Boolean);
        target.replaceChildren();
        cards.forEach((name, index) => {
          const template = templates.get(name);
          if (!template) { console.warn('[persona-quote] Missing CMS plan:', name); return; }
          const card = uniqueClone(template, `${groupIndex}-${index}`);
          paintCard(card, quotes.get(name));
          target.appendChild(card);
          window.TooltipSystem?.initialize?.(card);
        });
      });
      window.dispatchEvent(new CustomEvent('persona-plans-rendered', { detail: { success: page.dataset.personaState === 'ready' } }));
    }
    function setState(state) {
      page.dataset.personaState = state;
      targets.forEach(el => el.setAttribute('aria-busy', String(state === 'loading')));
      all('[data-persona-card]').forEach(card => paintCard(card, quotes.get(card.getAttribute('dpr-results-plan'))));
      updateViewAllLinks();
    }

    // ============================================================
    // QUOTE API
    // ============================================================

    function payload(data, contacts = {}) {
      const prior = readStorage('localStorage', LOCAL_KEY);
      const attribution = readStorage('localStorage', 'visitor_attribution');
      const result = {
        CoverageType: Number(data.CoverageType), Age: Number(data.Age), Province: Number(data.Province), Dependents: Number(data.Dependents || 0),
        CoverageTier: storedTier(prior),
        InsuranceReason: storedReason(prior),
        PreExisting: ['yes','no'].includes(prior.PreExisting) ? prior.PreExisting : null,
        PreExistingCoverage: ['yes','no'].includes(prior.PreExistingCoverage) ? prior.PreExistingCoverage : null,
        EmailAddress: contacts.EmailAddress || null, PhoneNumber: contacts.PhoneNumber || null,
        FirstName: contacts.FirstName || null, LastName: contacts.LastName || null, MarketingPermission: contacts.MarketingPermission === true,
        LeftGroupHealthPlan: null, Prescription: null, CoverOption: null, PhoneExtension: null
      };
      ['gclid','fbclid','utm_source','utm_medium','utm_campaign','utm_term','utm_content','referrer','ga_client_id','landing_page','user_agent','language'].forEach(k => { result[k] = attribution[k] || null; });
      return result;
    }
    async function fetchWithTimeout(url, options = {}) {
      const controller = options.controller || new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      try {
        const response = await fetch(url, { ...options, controller: undefined, signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
      } finally { clearTimeout(timeout); }
    }
    async function quoteDetails(data, fromModal, contacts = {}) {
      if (busy || applicationBusy) return;
      if (!valid(data)) { setMessage(modalStatus, words.invalid, true); return; }
      const id = ++generation;
      request = new AbortController();
      busy = true;
      const previous = confirmed;
      setState('loading');
      setMessage(status, words.loading);
      setMessage(modalStatus, words.loading);
      if (fromModal === 'contact') setMessage(contactStatus, words.loading);
      updateForm();
      track('persona_quote_request');
      try {
        const response = await fetchWithTimeout(`${api}/quoteset`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload(data, contacts)), controller:request });
        const result = await response.json();
        if (id !== generation) return;
        const validQuotes = (Array.isArray(result.PlanQuotes) ? result.PlanQuotes : []).filter(q => q.PlanName && q.ConfirmationNumber && q.Premium !== null && q.Premium !== '' && Number.isFinite(Number(q.Premium)) && Number(q.Premium) >= 0);
        if (!result.QuoteSetId || !validQuotes.length) throw new Error('Invalid quote response');
        confirmed = { ...data };
        quotes = new Map(validQuotes.map(q => [q.PlanName, q]));
        optionsCache.clear();
        selectedOptions.clear();
        const local = readStorage('localStorage', LOCAL_KEY);
        Object.assign(local, confirmed);
        const saved = writeStorage('localStorage', LOCAL_KEY, local);
        if (fromModal === 'contact') writeStorage('sessionStorage', 'dpr_session_data', contacts);
        writeStorage('sessionStorage', RESULTS_KEY, { results:result, dpr_local_storage:local, dpr_session_storage:fromModal === 'contact' ? contacts : null });
        setState('ready');
        summarize();
        updateContinuationLinks();
        refreshCards();
        setMessage(status, saved ? words.success : words.saved);
        setMessage(modalStatus, '');
        track('persona_quote_success', { plan_count:validQuotes.length });
        if (fromModal && modal.open) { closingAfterSuccess = true; modal.close(); }
        if (fromModal === 'contact' && contactModal?.open) { contactCompleted = true; contactModal.close(); }
      } catch (error) {
        if (id !== generation) return;
        // Previously confirmed prices are safe to retain only while the draft is uncommitted.
        setState(previous && quotes.size ? 'ready' : 'error');
        if (!previous) clearResults();
        setMessage(status, words.error, true);
        setMessage(modalStatus, words.error, true);
        if (fromModal === 'contact') setMessage(contactStatus, words.error, true);
        track('persona_quote_error');
        console.warn('[persona-quote] Quote request failed:', error.message);
      } finally {
        if (id === generation) { busy = false; request = null; updateForm(); }
      }
    }

    // ============================================================
    // MODAL FLOW
    // ============================================================

    function openQuote(button) {
      if (applicationBusy || modal.open) return;
      if (busy) { generation++; request?.abort(); busy = false; setState(confirmed ? 'ready' : 'empty'); }
      opener = button;
      fillForm(confirmed || defaultValues());
      setMessage(modalStatus, '');
      oldOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      modal.showModal();
      track('persona_quote_open');
    }
    modal.addEventListener('close', () => {
      if (transitioningToContact) {
        transitioningToContact = false;
        contactForm.reset();
        contactForm.querySelectorAll('.w--redirected-checked').forEach(el => el.classList.remove('w--redirected-checked'));
        setMessage(contactStatus, '');
        contactModal.showModal();
        track('persona_contact_open');
        return;
      }
      if (busy) { generation++; request?.abort(); busy = false; }
      if (!closingAfterSuccess) { setState(confirmed && quotes.size ? 'ready' : 'empty'); setMessage(status, confirmed ? words.success : words.initial); }
      closingAfterSuccess = false;
      fillForm(confirmed || defaultValues());
      document.body.style.overflow = oldOverflow;
      opener?.focus?.();
    });
    form.addEventListener('change', e => {
      if (!CORE.includes(e.target.name)) return;
      setMessage(modalStatus, '');
      updateForm();
    });
    function continueFromDetails() {
      if (busy || applicationBusy) return;
      const data = readForm();
      if (!valid(data)) { setMessage(modalStatus, words.invalid, true); return; }
      if (!contactForm) { quoteDetails(data, true); return; }
      pendingDetails = { ...data };
      transitioningToContact = true;
      modal.close();
    }
    form.addEventListener('submit', e => { e.preventDefault(); e.stopPropagation(); continueFromDetails(); });

    // ============================================================
    // APPLICATION FLOW
    // ============================================================

    async function apply(button) {
      if (applicationBusy || busy || page.dataset.personaState !== 'ready') return;
      const card = button.closest('[data-persona-card]');
      const name = card?.getAttribute('dpr-results-plan');
      const quote = quotes.get(name);
      if (!quote || confirmed?.Province === '10') return;
      applicationBusy = true;
      button.textContent = words.loading;
      button.setAttribute('aria-disabled', 'true');
      try {
        let confirmation = quote.ConfirmationNumber;
        const option = hospitalOption(quote);
        const selected = card.querySelector('[dpr-quote-hospital="check-trigger"]')?.checked;
        if (selected && option) {
          if (!optionsCache.has(confirmation)) {
            const response = await fetchWithTimeout(`${api}/quote/${encodeURIComponent(confirmation)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify([{OptionName:'Hospital Accommodation', Selected:true}]) });
            const updated = await response.json();
            if (!updated.ConfirmationNumber) throw new Error('Missing updated confirmation');
            optionsCache.set(confirmation, updated.ConfirmationNumber);
          }
          confirmation = optionsCache.get(confirmation);
        }
        const response = await fetchWithTimeout(`${api}/applicationUrl/${encodeURIComponent(confirmation)}${fr ? '?lang=fr' : ''}`);
        const raw = await response.text();
        let destination;
        try { const parsed = JSON.parse(raw); destination = typeof parsed === 'string' ? parsed : parsed.ApplicationUrl; } catch (_) { destination = raw; }
        const url = new URL(destination);
        if (url.protocol !== 'https:') throw new Error('Invalid application URL');
        const link = document.createElement('a');
        link.href = url.href;
        link.hidden = true;
        document.body.appendChild(link);
        if (typeof window.gtag !== 'undefined') link.dispatchEvent(new MouseEvent('mousedown', { bubbles:true }));
        const decorated = link.href;
        link.remove();
        track('persona_quote_apply', { plan_name:name });
        setTimeout(() => location.assign(decorated), 200);
      } catch (error) {
        button.textContent = words.retry;
        button.setAttribute('aria-disabled', 'false');
        applicationBusy = false;
        setMessage(status, words.error, true);
        console.warn('[persona-quote] Application request failed:', error.message);
      }
    }

    // ============================================================
    // EVENT DELEGATION
    // ============================================================

    function consume(e) { e.preventDefault(); e.stopImmediatePropagation(); }
    // Capture owned actions before legacy modal libraries / Webflow link handlers.
    page.addEventListener('click', e => {
      if (contactModal?.open) {
        if (e.target.closest('[data-persona-contact-skip]')) {
          consume(e);
          if (!busy) { track('persona_contact_skip'); quoteDetails(pendingDetails, 'contact'); }
          return;
        }
        if (e.target.closest('.contact-modal1_close-button,.contact-modal1_background-overlay') || e.target === contactModal) {
          consume(e); contactModal.close(); return;
        }
      }
      const target = e.target.closest?.('button,a,[role="button"],[data-form-trigger],[data-persona-retry]');
      if (target?.matches('[data-form-trigger="open-quote-modal"]')) { consume(e); openQuote(target); return; }
      if (target?.matches('[data-form-trigger="get-quote"]')) { consume(e); continueFromDetails(); return; }
      if (target?.matches('[data-persona-retry]')) { consume(e); if (confirmed) quoteDetails(confirmed, false); else openQuote(starts[0]); return; }
      if (target?.matches('[data-form-trigger="cancel"],[data-form="modal-close"],[data-form="modal-close-mirror"]')) {
        const dialog = target.closest('dialog');
        if (dialog) { consume(e); dialog.close(); return; }
      }
      if (target?.matches('[dpr-results-apply="button"]') && target.closest('[data-persona-card]')) { consume(e); apply(target); return; }
      // View-all is a real link; track the click and let navigation proceed.
      if (target?.closest?.('[data-persona-view-all]')) { track('persona_view_all'); return; }
      if (target?.tagName === 'BUTTON' && target.previousElementSibling?.tagName === 'DIALOG') {
        const dialog = target.previousElementSibling;
        if (target.closest('[data-persona-card]')) { consume(e); if (!dialog.open) dialog.showModal(); return; }
      }
      if (e.target.tagName === 'DIALOG' && e.target.open) {
        const rect = e.target.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) { consume(e); e.target.close(); }
      }
    }, true);
    page.addEventListener('keydown', e => {
      if (e.target.matches('[role="button"]') && ['Enter',' '].includes(e.key)) { e.preventDefault(); e.target.click(); }
    });
    page.addEventListener('change', e => {
      if (!e.target.matches('[dpr-quote-hospital="check-trigger"]')) return;
      if (applicationBusy) { e.target.checked = !e.target.checked; return; }
      const card = e.target.closest('[data-persona-card]');
      if (!card) return;
      const name = card.getAttribute('dpr-results-plan');
      const selected = e.target.checked;
      selectedOptions.set(name, selected);
      all('[data-persona-card]').filter(c => c.getAttribute('dpr-results-plan') === name).forEach(c => paintCard(c, quotes.get(name), selected));
    });
    window.addEventListener('load', () => all('[data-persona-card]').forEach(card => window.TooltipSystem?.initialize?.(card)), {once:true});

    // ============================================================
    // BOOT
    // ============================================================

    fillForm(defaultValues());
    setState('empty');
    summarize();
    refreshCards();
    setMessage(status, words.initial);
    const initial = defaultValues();
    if (valid(initial)) quoteDetails(initial, false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once:true});
  else initialize();
})();
