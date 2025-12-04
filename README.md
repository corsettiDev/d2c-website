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
- Supports future hospital accommodation options (stored but not displayed)

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

*Filter Fields:*
- Form fields with names: `InsuranceReason`, `CoverageTier`, `PreExisting`, `PreExistingCoverage`, `plans`

**Script Attributes:**
- `data-redirect-url` - URL to redirect if required fields are missing
- `data-api-url` - Root API URL (default: `https://qagsd2cins.greenshield.ca`)

**Plan Names (must match API response):**
- ZONE 2, ZONE 3, ZONE 4, ZONE 5, ZONE 6, ZONE 7
- ZONE FUNDAMENTAL PLAN
- LINK 1, LINK 2, LINK 3, LINK 4

**Conditional Field Requirements:**
- `Dependents` - Required unless `CoverageType == 0` or `CoverageType == 3`
- `PreExisting` - Not required if `InsuranceReason == 2`
- `PreExistingCoverage` - Not required if `InsuranceReason == 2` OR `PreExisting == 'no'`

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
├── dpr-results.js            # Stage 2: Results display page
├── attribution-tracker.js    # Marketing attribution tracking
├── utilities/
│   ├── script-loader.js          # Environment-based script loader
│   └── superform-auto-next.js    # Form navigation utilities
├── .archive/
│   └── get-quote-v5_5.js     # Legacy quote system (reference)
├── contact.js                # Contact page functionality
├── plan-explorer.js          # Plan comparison tool
├── pip.js                    # Product information page
└── CLAUDE.md                 # AI assistant instructions
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

- All personal data (names, email, phone) stored only in sessionStorage (cleared when browser/tab closes)
- Non-personal data (coverage preferences) persists in localStorage across sessions
- URL parameters only contain non-personal data
- Quote results automatically refresh when filter fields change
- Plan sorting and filtering works independently of API availability - filters apply even when API calls fail
- Plan sorting algorithm handles all combinations of InsuranceReason, CoverageTier, and PreExisting conditions with granular ordering for distinct user scenarios
- Quebec province (Province == 10) displays a call button instead of the standard "Apply Now" button due to provincial regulations
