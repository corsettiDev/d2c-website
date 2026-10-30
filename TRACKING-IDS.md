# Tracking IDs — plan card apply flows

The contract between the plan cards and analytics (GTM / GA4 / Crazy Egg).
Implemented by `dpr-results.js` (quote pages) and `persona-quotes.js`
(persona pages); identical on every page that renders plan cards.

## The one rule analytics needs

**Conversion = click on `[data-gs-final-apply]`. Plan = the attribute's value.**

Every button whose click calls the quote API and redirects to the application
carries `data-gs-final-apply="{plan}"`. No other element ever carries it.
One GTM trigger (Click Element matches `[data-gs-final-apply]`) covers every
plan, flow, and page, and keeps working if flows are redesigned — the
attribute moves with the role.

- Rider offered → only the rider modal's **Continue to application** carries it
- No rider step → each direct apply button carries it (card, details modal, HQ popup)

## Plan slugs

`{plan}` is derived from the API PlanName: lowercase, trailing " PLAN"
stripped, non-alphanumerics → hyphens.

| PlanName | slug |
|---|---|
| ZONE 1 … ZONE 7 | `zone-1` … `zone-7` |
| ZONE FUNDAMENTAL PLAN | `zone-fundamental` |
| LINK 1 … LINK 4 | `link-1` … `link-4` |

These match the CMS **Plan Tag** field suffixes (`gs-st-results-apply-<slug>`).

## ID map

Pattern: `gs-st-{surface}-{action}-{plan}`.

| Surface | Button | ID |
|---|---|---|
| Card | Primary CTA (Apply now / HQ opener) | `gs-st-results-apply-{plan}` |
| Details modal ("See more details") | Apply now | `gs-st-details-apply-{plan}` |
| HQ interstitial (pre-existing popup) | Apply now / Continue | `gs-st-mu-apply-{plan}` |
| | Review GA plans | `gs-st-mu-ga-plans-{plan}` |
| | Back | `gs-st-mu-back-{plan}` |
| Rider modal (hospital accommodation) | Continue to application ⭐ | `gs-st-rider-continue-{plan}` |
| | Add coverage | `gs-st-rider-add-{plan}` |
| | Remove coverage | `gs-st-rider-remove-{plan}` |
| | Back | `gs-st-rider-back-{plan}` |
| Rider modal element itself | `<dialog>` | `gs-st-rider-modal-{plan}` |

⭐ carries `data-gs-final-apply` when the rider is offered.

## Flows (which button is final per plan type)

- **Direct plan** (no popups): card CTA → application. Card CTA is final.
- **Plan with rider**: card CTA → rider modal → Continue. Rider Continue is final.
- **HQ plan** (health questionnaire required): card CTA → HQ popup → Apply →
  rider modal (when offered) → Continue. Rider Continue is final; without a
  rider, the HQ Apply is final.

## Where ids come from

- **Card CTA ids** are also authored in the CMS (**Plan Tag** field, bound via
  the "plan tag" prop in the `Pricing Details / Dynamic Block` component), so
  they exist in the static markup before any script runs.
- **All ids are (re)stamped by the scripts** when quote results render
  (`fillChart` in dpr-results.js, `refreshCards` in persona-quotes.js), from
  the API PlanName. Dialogs are per-card CMS output, so stamping also removes
  duplicate template ids (e.g. the old static `gs-rider-modal`).
- Cloned cards (plan-injector.js, persona-quotes.js) copy attributes verbatim,
  so clones keep the same ids as their source.

## Rules when changing markup or flows

1. Never hand-type a tracking id on a button inside the card component —
   the scripts own them. Author new buttons with a role attribute
   (`dpr-rider="…"`, `data-mu-id="…"`, `dpr-results-apply="button"`) and add
   the stamping rule here and in both scripts.
2. `data-gs-final-apply` may only be set next to the code that calls
   `applicationUrl`. If a new step is added before the handoff, the attribute
   moves to the new final button.
3. Keep this file in sync — it is the reference the analytics team builds
   triggers against.
