# d2c-website

Custom JavaScript tools for the D2C GreenShield insurance website built on Webflow.

## Overview

This repository contains custom JavaScript modules that power the Direct-to-Consumer (D2C) insurance quote flow on the GreenShield website. The system handles multi-stage quote generation, form management, marketing attribution tracking, and results display with dynamic plan filtering and sorting.

## Core Quote Flow System

### 1. Quote Form (dpr-quote.js)

**Purpose:** Collects user information and preferences for insurance coverage

**Key Features:**
- Real-time URL parameter synchronization for all tracked fields
- Dual storage strategy for data persistence
- Webflow form integration via Superform API
- Privacy-conscious data separation

**Tracked Fields:**
- `CoverageType` - Individual, family, etc.
- `Dependents` - Number of dependents
- `Age` - Applicant age
- `Province` - Coverage province
- `CoverageTier` - Basic or comprehensive
- `InsuranceReason` - Reason for coverage (0, 1, or 2)
- `PreExisting` - Pre-existing conditions (yes/no)
- `PreExistingCoverage` - Coverage for pre-existing conditions

**Data Flow:**
1. Page loads → Prefill form from URL parameters
2. User changes field → URL updates via `replaceState()` (no history entry)
3. User submits form → Save data to storage and redirect to results page

**Storage Strategy:**
- **localStorage** (`dpr_local_data`): Non-personal data (coverage preferences, demographics)
- **sessionStorage** (`dpr_session_data`): Personal data (FirstName, LastName, PhoneNumber, EmailAddress, MarketingPermission)

**Script Attributes:**
- `data-url` - Redirect URL after form submission (results page)

---

### 2. Results Display (dpr-results.js)

**Purpose:** Fetches quotes from API, displays plan pricing, and enables application submission

**Key Features:**

#### Field Management System
- Prefills all forms from multiple data sources with priority: URL params > localStorage > sessionStorage
- Syncs all fields with same name across entire page
- Tracks which fields came from sessionStorage (excluded from URL updates)
- Real-time field synchronization across multiple forms

#### API Integration
- **Endpoint:** `${rootApiURL}/quoteset` (configurable via `data-api-url` attribute)
- Builds payload from localStorage + sessionStorage + attribution data
- Validates required fields before API call (conditional logic based on InsuranceReason)
- Returns `QuoteSetId` and array of `PlanQuotes` with pricing

#### Results Display
- Populates plan prices dynamically from API response
- Shows/hides plans based on filter criteria
- Wires up "Apply Now" buttons with application URLs
- Hospital accommodation optional pricing (checkbox toggles price)

#### Province-Based Button Display
- **Quebec Province Handling (Province == 10):**
  - Shows Quebec-specific call button (`[dpr-results-quebec="call"]`)
  - Hides standard "Apply Now" button
  - Call button is pre-configured in Webflow (no JavaScript handlers required)
- **Other Provinces:**
  - Shows standard "Apply Now" button with application URL functionality
  - Hides Quebec call button
- Button visibility updates automatically after successful API calls

#### Plan Sorting & Filtering System
- **Intelligent Plan Ranking:** Determines top 3 recommended plans based on:
  - `InsuranceReason` (0, 1, or 2)
  - `CoverageTier` (basic or comprehensive)
  - `PreExisting` (yes or no)
  - `PreExistingCoverage` (yes or no)
- **Granular Plan Ordering:** Separate ordering logic for distinct user scenarios:
  - Users without pre-existing conditions (`PreExisting == 'no'`)
  - Users with pre-existing conditions and current coverage (`PreExisting == 'yes' && PreExistingCoverage == 'yes'`)
  - Users with pre-existing conditions but no current coverage (`PreExisting == 'yes' && PreExistingCoverage == 'no'`)
- **Display Modes:**
  - `plans=suggested` - Shows only top 3 recommended plans (default)
  - `plans=all` - Shows all available plans
- **Dynamic Reordering:** Top 3 plans always appear first in DOM order
- **Error Resilience:** Filter and sorting logic applies even when API calls fail, ensuring consistent plan ordering regardless of API availability

#### Modal Quote Update System
- Modal opens → Saves current field values
- User clicks "Get Quote" → Triggers new API call and closes modal
- User clicks "Cancel" or closes modal → Restores saved values
- Prevents data loss from abandoned edits

#### UI State Management
- **Skeleton Loaders:** Display on elements with `[dpr-code-skeleton]` attribute during API calls
- **Error Bar:** Shows/hides element with `[dpr-results="error-bar"]` on API failures
- **Dynamic Content Blocks:** Elements with `[data-results="dynamic-block"]` hide on API failure (prices/buttons)
- **Loading States:** Button text updates and disabling during async operations
- **Error State Filtering:** Plan filtering and ordering still applies when API fails, showing filtered plan structure with error message

#### Hospital Accommodation Feature
- Optional add-on from API `QuoteOptions` array
- Checkbox toggles between base premium and base + hospital option premium
- Prices displayed as whole numbers (no cents)
- Text configurable via `data-hospital-text` attribute
- Checkbox state NOT persisted (resets to unchecked on page load)

#### Application URL Flow
1. User clicks "Apply Now" button
2. Fetches application URL via `${rootApiURL}/applicationUrl/{confirmationNumber}`
3. Decorates URL with GTM auto-linker for cross-domain tracking
4. Redirects user to GreenShield application page

**Storage Strategy:**
- **Results Storage:** Saves complete API response to `sessionStorage.dpr_results_data` with original form data
- **Field Updates:** Updates `localStorage.dpr_local_data` or `sessionStorage.dpr_session_data` based on field type
- **Session-Only Tracking:** Maintains `sessionOnlyFields` Set to exclude personal data from URL params

**Required HTML Attributes:**

*Modal Elements:*
- `[data-form-trigger="quote-modal"]` - Modal dialog element
- `[data-form-trigger="quote-form"]` - Form inside modal
- `[data-form-trigger="open-quote-modal"]` - Button to open modal
- `[data-form-trigger="get-quote"]` - Submit button (triggers API call)
- `[data-form-trigger="cancel"]` - Cancel button

*Results Display:*
- `[dpr-results-plan="PLAN NAME"]` - Plan container (e.g., "ZONE 2", "LINK 1")
- `[dpr-results-price="price"]` - Price display element
- `[dpr-results-apply="button"]` - Apply Now button (shown for non-Quebec provinces)
- `[dpr-results-quebec="call"]` - Quebec call button (shown only when Province == 10)
- `[dpr-code-skeleton]` - Elements that should show skeleton loader during API calls
- `[dpr-results="error-bar"]` - Error message container
- `[data-results="dynamic-block"]` - Content blocks that hide when API fails (e.g., prices, buttons)

*Hospital Accommodation:*
- `[dpr-quote-hospital="checkbox-wrapper"]` - Container for checkbox UI
- `[dpr-quote-hospital="check-trigger"]` - Checkbox input
- `[dpr-quote-hospital="text-line"]` - Text line showing hospital price

*Filter Fields:*
- Form fields with names: `InsuranceReason`, `CoverageTier`, `PreExisting`, `PreExistingCoverage`, `plans`

**Script Attributes:**
- `data-redirect-url` - URL to redirect if required fields are missing
- `data-api-url` - Root API URL (default: `https://qagsd2cins.greenshield.ca`)
- `data-hospital-text` - Hospital accommodation text prefix (default: "Add optional hospital accommodation for $")
- `data-apply-button-text` - Apply button text (default: "Apply Now")

**Plan Names (must match API response):**
- ZONE 2, ZONE 3, ZONE 4, ZONE 5, ZONE 6, ZONE 7
- ZONE FUNDAMENTAL PLAN
- LINK 1, LINK 2, LINK 3, LINK 4

**Conditional Field Requirements:**
- `Dependents` - Required unless `CoverageType == 0` or `CoverageType == 3`
- `PreExisting` - Not required if `InsuranceReason == 2`
- `PreExistingCoverage` - Not required if `InsuranceReason == 2` OR `PreExisting == 'no'`

---

### 3. Plan Comparison & Filtering (plan-card-display.js)

**Purpose:** Standalone plan display system with intelligent filtering, comparison features, and API integration

**Key Features:**

#### API Integration
- **Endpoint:** `${rootApiURL}/quoteset` (same as dpr-results.js)
- Builds payload from localStorage + attribution data
- Personal fields (sessionStorage) set to null
- Validates only API-required fields (simplified validation)
- Dispatches 'plans-populated' CustomEvent when complete (success/fail)

#### Plan Filtering System
- **Three Filter Modes:**
  - `showAll` (default) - Reorder plans with filtered plans first, all visible
  - `limit` - Reorder plans, hide non-matching
  - `hideOnly` - Preserve original order, hide non-matching
- **Filter Criteria:** InsuranceReason and CoverageTier
- **Static Filter Scenarios:** Predefined plan lists for specific combinations that override dynamic logic
  - Examples: "0:comprehensive", "1:basic", "2:all", etc.
- **Dynamic Intersection Logic:** Intersects InsuranceReason and CoverageTier filter sets when no static scenario matches
- **Filter State Persistence:** Saves to `localStorage.dpr_local_data`
- **'all' Value Handling:** When filter is 'all', removes field from localStorage to prevent interference

#### Plan Comparison Feature
- Select up to 3 plans via checkboxes
- Compare button activates comparison mode
- In comparison mode:
  - Non-selected plans hidden
  - Filters reset to 'all' and disabled
  - Checkboxes disabled
  - Remove buttons hidden
- Clear button exits comparison mode
- Comparison state not persisted (resets on page load)

#### Form Field Syncing
- Prefills forms from localStorage on page load
- Syncs all fields with same name across page
- Updates localStorage on change
- Triggers filter update when filter fields change

#### UI State Management
- **Skeleton Loaders:** Same as dpr-results.js
- **Dynamic Blocks:** Hide when API fails or validation fails
- **Compare Component:** Shows/hides based on selection state

#### Plan Display & Interactivity
- Populates plan prices from API response
- Hospital accommodation checkbox (same as dpr-results.js)
- Apply Now buttons with application URL API
- Quebec province handling (call button vs apply button)
- GTM cross-domain tracking on redirects

#### Event Coordination
- **Dispatches 'plans-populated' event:**
  - After API call completes (success or fail)
  - Event detail: `{ success: boolean }`
  - Used by plan-injector.js and tooltip-system.js
- **Global flag:** `window.__plansPopulatedData` for race condition handling

**Required HTML Attributes:**

*Plan Display:*
- `[dpr-results-plan="PLAN NAME"]` - Plan container (not injected plans)
- `[data-injected-plan]` - Marks injected plans (excluded from filtering)
- `[dpr-results-price="price"]` - Price display element
- `[dpr-results-apply="button"]` - Apply Now button
- `[dpr-results-quebec="call"]` - Quebec call button
- `[dpr-code-skeleton]` - Skeleton loader targets
- `[data-results="dynamic-block"]` - Hide on API failure

*Hospital Accommodation:* (same as dpr-results.js)
- `[dpr-quote-hospital="checkbox-wrapper"]`
- `[dpr-quote-hospital="check-trigger"]`
- `[dpr-quote-hospital="text-line"]`

*Comparison Feature:*
- `[data-compare="component"]` - Compare component wrapper
- `[data-compare="compare-button"]` - Compare/Clear button
- `[data-compare="outer-wrapper"]` - Comparison slot wrapper (3 total)
- `[data-compare="plan-wrapper"]` - Inner plan wrapper (gets 'active' class)
- `[data-compare="plan-name"]` - Plan name display
- `[data-compare="plan-remove"]` - Remove plan button
- `[data-compare-trigger="PLAN NAME"]` - Checkbox for selecting plan

**Script Attributes:**
- `data-api-url` - Root API URL (default: `https://qagsd2cins.greenshield.ca`)
- `data-filter-style` - Filter mode: "showAll", "limit", or "hideOnly" (default: "showAll")
- `data-hospital-text` - Hospital accommodation text prefix
- `data-apply-button-text` - Apply button text

**Static Filter Scenarios:**
```javascript
{
  '0:comprehensive': ['LINK 4', 'LINK 3', 'ZONE 7', 'ZONE 6'],
  '1:all': ['LINK 4', 'LINK 3', 'LINK 2', 'LINK 1', 'ZONE 7', 'ZONE 6', 'ZONE 5', 'ZONE 4', 'ZONE FUNDAMENTAL PLAN'],
  '1:basic': ['LINK 2', 'LINK 1', 'ZONE 4', 'ZONE FUNDAMENTAL PLAN'],
  '1:comprehensive': ['LINK 4', 'LINK 3', 'LINK 1', 'ZONE 4'],
  '2:all': ['LINK 4', 'LINK 3', 'LINK 2', 'ZONE 7', 'ZONE 6', 'ZONE 5', 'ZONE FUNDAMENTAL PLAN', 'ZONE 3', 'ZONE 2'],
  '2:comprehensive': ['LINK 4', 'ZONE 7', 'ZONE 3']
}
```

---

### 4. Individual Plan Page (plan-page.js)

**Purpose:** Displays pricing and details for a single plan on dedicated plan pages

**Key Features:**

#### Data Retrieval
- Reads plan data from `sessionStorage.dpr_results_data`
- Matches plan by `PlanName` using `[data-plan-page-name]` attribute
- Displays price from API response
- No API call made (uses cached data from previous quote)

#### Plan Display
- Shows quote wrapper when data found
- Displays plan price (whole numbers only)
- Apply button with application URL API call
- Hospital accommodation checkbox (if available)
- Quebec province handling (call button vs apply button)

#### Province Handling
- Checks `Province` field from `localStorage.dpr_local_data`
- Quebec (Province == 10): Hide apply button, show call button
- Other provinces: Show apply button, hide call button

#### Application Flow
- Same as dpr-results.js:
  1. Fetch application URL via API
  2. Decorate with GTM auto-linker
  3. Redirect to GreenShield enrollment

#### Hospital Accommodation
- Same functionality as dpr-results.js
- Checkbox toggles between base and base + hospital price
- State not persisted

**Required HTML Attributes:**

*Plan Page Elements:*
- `[data-plan-page-name="PLAN NAME"]` - Element with plan name (e.g., "ZONE 2")
- `[data-plan-page="quoteWrapper"]` - Container to show when data loaded
- `[data-plan-page="priceWrapper"]` - Price display element
- `[data-plan-page="applyBtnWrapper"]` - Apply button wrapper
- `[data-plan-page="applyBtn"]` - Apply Now button
- `[data-plan-page="quebecCall"]` - Quebec call button

*Hospital Accommodation:*
- `[data-plan-page="hospitalCheckbox"]` - Checkbox wrapper
- `[data-plan-page="hospitalToggle"]` - Checkbox input
- `[data-plan-page="hospitalText"]` - Text line with price

**Script Attributes:**
- `data-api-url` - Root API URL
- `data-hospital-text` - Hospital accommodation text prefix

**Initialization:**
- Runs on DOMContentLoaded
- Also runs with 100ms delay as fallback

---

### 5. Utility: Quebec Province Check (utilities/quebec-check.js)

**Purpose:** Provides global Quebec province detection utility

**Key Features:**

#### Global Function
- `window.isQuebec()` - Returns true if Province == 10, false otherwise
- Safe localStorage access with error handling
- Checks `localStorage.dpr_local_data.Province`

#### Event Notification
- Dispatches 'quebec-ready' CustomEvent when initialized
- Event detail: `{ isQuebec: boolean }`
- Uses setTimeout(0) to ensure function is available before event

#### Usage Patterns

**Synchronous:**
```javascript
if (window.isQuebec && window.isQuebec()) {
  // Show Quebec-specific content
}
```

**Event-based (handles race conditions):**
```javascript
// Hybrid pattern
if (window.isQuebec) {
  // Already loaded - use immediately
  applyLogic(window.isQuebec());
} else {
  // Wait for ready event
  window.addEventListener('quebec-ready', function(event) {
    applyLogic(event.detail.isQuebec);
  }, { once: true });
}
```

---

### 6. Utility: Tooltip System (utilities/tooltip-system.js)

**Purpose:** Manages simple and accordion tooltips with dynamic content support

**Key Features:**

#### Simple Tooltips
- Click icon to open/close
- Automatically closes other tooltips when one opens
- Optional static mode (stays open, no outside-click-close)
- Configurable via `data-tooltip-style="static"` attribute

#### Accordion Tooltips
- Expandable content sections with smooth animations
- Height transitions with auto calculation
- Margin-bottom animations for spacing
- State tracking: closed, opening, open, closing

#### Dynamic Content Support
- Global API: `window.TooltipSystem.initialize(root)`
- Prevents duplicate initialization with `data-tooltip-initialized` flags
- Listens for 'plans-populated' event to re-initialize
- Integrates with Webflow CMS content loading

#### Webflow Integration
- Uses `window.Webflow.push()` for CMS content readiness
- Fallback to window 'load' event

**Required HTML Attributes:**

*Simple Tooltips:*
- `[data-tooltip="component"]` - Tooltip component wrapper
- `[data-tooltip="icon"]` - Click trigger (icon/button)
- `[data-tooltip="description"]` - Content to show/hide
- `[data-tooltip-style="static"]` - Optional: prevents outside-click-close

*Accordion Tooltips:*
- `.gsi-faq_accordion-icon.cc-plans-cms-modal` - Accordion container
- `.tooltip-wrapper.gsi-tooltip` - Individual tooltip wrapper
- `.gsi-tooltip-button` - Click trigger
- `.gsi-modal-tooltip` - Content to expand/collapse
- `.gsi-modal-tooltip-padding.gsi-modal-margin-bottom` - Optional margin animation

**Event Listeners:**
- 'plans-populated' - Re-initializes tooltips on dynamic content

---

### 7. Utility: Plan Card Injector (utilities/plan-injector.js)

**Purpose:** Clones plan cards from source to target locations with full interactivity preservation

**Key Features:**

#### Plan Card Cloning
- Deep clones plan cards from source container
- Injects into multiple target locations
- Clears existing target content before injection
- Marks cloned cards with `data-injected-plan="true"` attribute

#### Interactivity Rewiring
- **Apply Buttons:** Re-attaches click handlers with application URL API
- **Hospital Checkboxes:** Re-attaches change handlers for price toggling
- **Tooltips:** Clears initialization flags and calls `TooltipSystem.initialize()`
- **Quebec Handling:** Sets button visibility based on Province
- **Comparison Checkboxes:** Disables on injected cards (they don't participate)

#### Event Coordination
- Listens for 'plans-populated' event from plan-card-display.js
- Handles race condition with `window.__plansPopulatedData` global flag
- Works even if API fails (injects static content)

#### Source and Target Configuration

**Source Container:**
```html
<div dpr-plan-injector-source>
  <!-- Plan cards populated by plan-card-display.js -->
</div>
```

**Injection Targets:**
```html
<div dpr-plan-injector="LINK 1, LINK 2"></div>
<div dpr-plan-injector="ZONE FUNDAMENTAL PLAN, ZONE 5"></div>
```

**Script Attributes:**
- `data-api-url` - Root API URL (must match plan-card-display.js)

**Process Flow:**
1. plan-card-display.js populates source container
2. plan-card-display.js dispatches 'plans-populated' event
3. plan-injector.js receives event
4. plan-injector.js clones specified plans
5. plan-injector.js re-wires all interactivity
6. plan-injector.js re-initializes tooltips
7. Injected cards are fully functional clones

---

## Supporting Systems

### Marketing Attribution Tracking (attribution-tracker.js)

**Purpose:** Captures and persists marketing attribution data for lead source tracking

**Class:** `AttributionTracker`

**Tracked Data:**
- `gclid`, `fbclid` - Ad platform click IDs
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` - UTM parameters
- `referrer` - HTTP referrer
- `landing_page` - Initial landing page URL
- `ga_client_id` - Google Analytics 4 client ID
- `user_agent` - Browser user agent
- `language` - Browser language

**Features:**
- 90-day data persistence in localStorage (`visitor_attribution`)
- Auto-initialization via `data-auto-init="attribution-tracker"` attribute
- Dispatches `attribution-ready` custom event when data is collected
- Used by quote APIs to track lead sources

**Storage:**
- **localStorage** (`visitor_attribution`): All attribution data with 90-day TTL

---

### Environment-Based Script Loader (utilities/script-loader.js)

**Purpose:** Dynamically loads scripts based on environment (staging vs production)

**Features:**
- Domain detection: `*.webflow.io` → staging, otherwise → production
- Automatically copies all `data-*` attributes from parent script to loaded script
- Supports `async` and `defer` attributes

**Required Attributes:**
- `data-prod` - Production script URL (required)
- `data-staging` - Staging script URL (optional, falls back to prod)

**Example Usage:**
```html
<script src="script-loader.js"
        data-prod="https://cdn.example.com/dpr-quote.js"
        data-staging="https://staging-cdn.example.com/dpr-quote.js"
        data-url="/quote-results"
        async>
</script>
```

---

## API Integration

### Quote API

**Endpoint:** `POST ${rootApiURL}/quoteset`

**Request Payload:**
```javascript
{
  // Core quote fields (numbers)
  CoverageType: Number,
  Province: Number,
  Age: Number,
  Dependents: Number,
  CoverageTier: Number,
  InsuranceReason: Number,

  // Coverage options
  PreExisting: String | null,
  PreExistingCoverage: Number | null,

  // Contact information
  EmailAddress: String | null,
  PhoneNumber: String | null,
  MarketingPermission: Boolean,

  // Personal information
  FirstName: String | null,
  LastName: String | null,

  // Attribution tracking (all nullable)
  gclid: String | null,
  fbclid: String | null,
  utm_source: String | null,
  utm_medium: String | null,
  utm_campaign: String | null,
  utm_term: String | null,
  utm_content: String | null,
  referrer: String | null,
  ga_client_id: String | null,
  landing_page: String | null,
  user_agent: String | null,
  language: String | null,

  // Legacy fields (for backward compatibility)
  LeftGroupHealthPlan: null,
  Prescription: null,
  CoverOption: null,
  PhoneExtension: null
}
```

**Response:**
```javascript
{
  QuoteSetId: String,
  PlanQuotes: [
    {
      PlanName: String,
      Premium: Number,
      ConfirmationNumber: String,
      QuoteOptions: [
        {
          OptionName: String,
          OptionPremium: Number
        }
      ]
    }
  ]
}
```

### Application URL API

**Endpoint:** `GET ${rootApiURL}/applicationUrl/{confirmationNumber}`

**Response:** Plain text URL or JSON with `ApplicationUrl` property

---

## Development Patterns

### IIFE Structure
All scripts use immediately-invoked function expressions to avoid global scope pollution:
```javascript
(function() {
  // Module code
})();
```

### DOM Ready Check
```javascript
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
```

### Storage Error Handling
Always wrap localStorage/sessionStorage access in try-catch blocks:
```javascript
try {
  localStorage.setItem('key', JSON.stringify(data));
} catch (e) {
  console.warn('Failed to save to localStorage:', e);
}
```

### Webflow Radio Button Sync
Webflow uses custom radio styling that requires manual class management:
```javascript
// Remove checked class from all radios
for (const radio of elements) {
  const customInput = radio.parentElement?.querySelector('.w-radio-input');
  if (customInput) {
    customInput.classList.remove('w--redirected-checked');
  }
}

// Add checked class to selected radio
radio.checked = true;
const customInput = radio.parentElement?.querySelector('.w-radio-input');
if (customInput) {
  customInput.classList.add('w--redirected-checked');
}
```

---

## File Structure

```
/
├── dpr-quote.js              # Stage 1: Quote form page
├── dpr-results.js            # Stage 2: Results display page (fully implemented)
├── plan-card-display.js      # Plan comparison and filtering utility
├── plan-page.js              # Individual plan page handler
├── attribution-tracker.js    # Marketing attribution tracking
├── utilities/
│   ├── script-loader.js          # Environment-based script loader
│   ├── superform-auto-next.js    # Form navigation utilities
│   ├── quebec-check.js           # Quebec province detection utility
│   ├── tooltip-system.js         # Tooltip management system
│   └── plan-injector.js          # Plan card cloning/injection
├── .archive/
│   ├── get-quote-v5_5.js     # Legacy quote system (reference)
│   └── plan-page-v1.js       # Legacy plan page (reference)
├── contact.js                # Contact page functionality (minimal)
├── pip.js                    # Product information page (minimal)
├── README.md                 # This file - comprehensive documentation
└── CLAUDE.md                 # AI assistant instructions for Claude Code
```

---

## Storage Keys Reference

| Key | Storage Type | Purpose | Data Type |
|-----|-------------|---------|-----------|
| `dpr_local_data` | localStorage | Non-personal quote preferences | Object |
| `dpr_session_data` | sessionStorage | Personal contact information | Object |
| `dpr_results_data` | sessionStorage | API response with original form data | Object |
| `visitor_attribution` | localStorage | Marketing attribution (90-day TTL) | Object |

---

## Browser Compatibility

- Modern browsers with ES6+ support
- LocalStorage and SessionStorage required
- Fetch API for async requests
- URLSearchParams for query string manipulation
- CustomEvent for attribution tracking

---

## Notes

- **Privacy & Data Separation:**
  - All personal data (names, email, phone) stored ONLY in sessionStorage (cleared when browser/tab closes)
  - Non-personal data (coverage preferences) persists in localStorage across sessions
  - URL parameters ONLY contain non-personal data
  - Personal data NEVER appears in URLs or localStorage

- **Plan Filtering & Sorting:**
  - Quote results automatically refresh when filter fields change
  - Plan sorting and filtering works independently of API availability
  - Filters apply even when API calls fail
  - Plan sorting algorithm handles all combinations of InsuranceReason, CoverageTier, and PreExisting conditions
  - Granular ordering for distinct user scenarios (with/without pre-existing conditions and coverage)

- **Quebec Province Handling:**
  - Quebec (Province == 10) displays call button instead of "Apply Now" button due to provincial regulations
  - Quebec handling implemented in: dpr-results.js, plan-card-display.js, plan-page.js, plan-injector.js
  - Global utility function: `window.isQuebec()` from utilities/quebec-check.js

- **Event Coordination:**
  - Scripts communicate via CustomEvents: 'plans-populated', 'quebec-ready', 'attribution-ready'
  - plan-injector.js and tooltip-system.js listen for 'plans-populated' event
  - Race condition handling via global flags (e.g., `window.__plansPopulatedData`)

- **Hospital Accommodation:**
  - Optional add-on from API QuoteOptions array
  - Checkbox state NOT persisted (resets to unchecked)
  - Prices displayed as whole numbers (no cents)
  - Implemented in: dpr-results.js, plan-card-display.js, plan-page.js, plan-injector.js

- **Cloned Plan Cards:**
  - plan-injector.js clones plans with full interactivity
  - Event handlers must be re-wired on cloned elements
  - Tooltips must be re-initialized on cloned elements
  - Injected cards marked with `data-injected-plan` attribute

- **GTM Cross-Domain Tracking:**
  - All external redirects decorated with GTM auto-linker
  - Required before redirecting to application URLs
  - Ensures analytics continuity across domains
