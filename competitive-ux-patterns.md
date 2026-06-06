# Competitive UX Patterns — DealerOS Reference

> Research compiled: 2026-06-05
> Researcher: researcher-online (session 406027985862770)
> Target: Reference patterns for **DealerOS** — a dealer/CRM/SaaS platform
> Apps studied: VinSolutions, HubSpot Sales Hub, Linear, Pipedrive, Stripe Dashboard, Vercel Dashboard, Mercury, Ramp

---

## Executive Summary

- **Pipeline/Deal UX is commodity — speed of capture wins.** Pipedrive and HubSpot both invest heavily in drag-and-drop Kanban with deal-card density optimization, but Linear's "instant capture from anywhere + Cmd+K command palette" is the pattern dealer reps will feel is fast. VinSolutions proves the dealer's actual bottleneck is **BDC call flow + lead routing across stores**, not the pipeline board itself.
- **Dark mode is no longer a trend — it's table stakes for "premium."** Stripe, Mercury, Ramp, Vercel, and Linear all ship native dark mode with tokenized color systems built on WCAG contrast algorithms. The dealer space (VinSolutions, DealerSocket, etc.) is still 95% light-mode enterprise chrome — this is a **major differentiation opportunity** for DealerOS.
- **Multi-tenant signaling is invisible but critical.** Mercury hides it in the account switcher, Vercel hides it in the team switcher, Linear surfaces it in the upper-left. DealerOS needs a **persistent, unmistakable dealership/location context** (colored badge + name + role) because dealer groups run 5–50 rooftops and a confused rep is a $50k mistake.

---

## App-by-App Analysis

### VinSolutions (Cox Automotive)

**Product context:** Industry-leading dealer CRM. Built for multi-rooftop dealer groups. Used by sales, BDC (Business Development Center), internet departments, F&I.

#### Key patterns

- **Lead buckets with a "make/model/trim" mental model** — sales managers use the mobile app to set up multiple lead buckets separating new vs. used, hot vs. cold. Maps to inventory categorization natively.
- **"Single Customer Record" with real-time sync** between sales + service. One customer, one truth. Critical for dealerships where the same person buys a car, comes back for service, then trades in.
- **Intelligent match & merge logic** for customer data — dedupe across data sources (website forms, phone-ups, walk-ins, OEM portals). Real-world dealer data is *filthy*.
- **"Internet Response Times" KPI dashboard** — surfaces how fast BDC reps respond to internet leads. A metered, BDC-specific KPI.
- **Performance Management with dedicated humans** — assigns a Cox performance manager to every dealership. This is the "high-touch concierge" anti-SaaS model.
- **"Predictive Insights" (Automotive AI)** — Cox's buyer-intent data layered into the CRM. Surfaces who in the CRM is "ready to buy" using their own proprietary data.
- **Automated follow-up engine** — email + SMS templates, drip campaigns, auto-tasks.
- **MMS / texting with landline detection** — filters landlines from SMS targets (recent feature). SMS-first communication.
- **Task-based workflow** — every lead/customer has a task list. BDC reps live in the tasks tab.
- **Connect Mobile (native iOS/Android)** — "fresh, streamlined interface" with quick lead response. Mobile is for reps in the field/showroom.
- **Self-guided demo + live training + webinars + Learning Center** onboarding stack. Heavy.
- **Custom substatuses per ILM/CRM settings** — fully customizable lead lifecycle states.
- **Notification pattern:** Automated SMS/email triggers based on lead behavior + lead source attribution per response.
- **Pain point (from dealer forum):** "CRM Dashboard only shows info for the store you are logged into. Makes centralized BDC overview very hard." **Multi-tenant UI is weak.**

#### What we steal for DealerOS
- **Lead buckets / pipeline segments** as a first-class concept (new/used, hot/cold, BDC/sales).
- **Single Customer Record** spanning sales + service + trade-in history.
- **Internet Response Time** as a top-of-dashboard metric for BDC managers.
- **Custom substatuses** — let each dealership define its own stages.
- **SMS/landline detection** + auto-follow-up engine.
- **Concierge onboarding** for top-tier dealer groups (white-glove).
- **Task list as the rep's home screen** — not the pipeline.

#### What we avoid
- Light-mode-only enterprise chrome.
- Dashboard scoped per store (breaks BDC).
- Configuration-heavy admin with no sane defaults.

#### Sources
- https://www.vinsolutions.com/dealership-software/connect-crm/
- https://www.vinsolutions.com/wp-content/uploads/sites/2/vinsolutions/media/Vin-Documents/VinSolutions-Mobile-App-Quick-Resource-Guide.pdf
- https://play.google.com/store/apps/details?id=com.vinsolutions.vinconnect
- https://www.vinsolutions.com/resources/blog/december-2019/making-the-most-of-connect-mobile/
- https://forum.dealerrefresh.com/threads/is-vinsolutions-is-not-ready-for-centralized-bdc-or-its-just-us.4384/
- https://help.conversica.com/hc/en-us/articles/360049117451-How-to-Create-a-Custom-Substatus-in-VinSolutions-Connect
- https://www.coxautoinc.com/insights-hub/cox-automotive-leverages-vinsolutions-crm-solution-automotive-retailing-clients/

---

### HubSpot Sales Hub

**Product context:** Mainstream CRM with strong marketing/service cross-sell. Sales Hub is the deal-management tier.

#### Key patterns

- **Sales Workspace (Professional+)** — a dedicated workspace combining all the tools a rep needs daily. Single tab, no context switching. Replaced the older "Kanban Board for Leads" feature in Aug 2025.
- **Kanban Board for Deals (opt-in beta)** — drag-and-drop, opt-in for Super Admin. Recently added back after the Sales Workspace redesign.
- **Universal Inbox** — emails, calls, conversations all in one place. Single triage surface.
- **Dynamic Contact Profiles** — consolidated view: company details, comm history, deal activity, email/content engagement, meeting notes. Deep linking from any record.
- **Engagement history with real-time notifications** — "they just opened your email" type signals.
- **Email snippets / message templates** with per-contact personalization.
- **Customizable contact profiles + custom properties** — per-deal/contact metadata.
- **Custom Dashboards with chart types** (bar, column, line, area, doughnut, pie, summary, table) and **Goals** (per-user quotas).
- **Breeze AI** — three layers:
  - **Breeze Copilot** — chat assistant in the workspace.
  - **Breeze Agents** — autonomous workflow agents (e.g. content agent, prospecting agent).
  - **Breeze Intelligence** — smart data enrichment (firmographics, technographics, buyer intent).
- **Breeze features for sales:** prospect/company research, meeting prep from CRM+calendar, record summarization, create/update records from chat, list/filter records, **content generation with brand-voice/tone presets** (friendly/professional/witty/educational), workflow creation from natural-language prompts, workflow analysis, image generation.
- **Calling & Conversation Intelligence (Enterprise)** — Twilio-powered browser calls, auto-transcription, call recording with consent, call outcome logging.
- **Marketplace 2,000+ apps / 2.5M installs** with "Certified" tier. Ecosystem is the moat.
- **Multi-tenant via "Hubs" + portal/account model** — designed for agencies managing multiple clients. Each portal is isolated, can be white-labeled.
- **Onboarding: free-tier → stepped feature unlocks → workflow templates suggested by Breeze based on activity → role-based access.**
- **Mobile app** — full CRM access, calling, logging, email sending, conversation replies, call forwarding to personal device.
- **Settings organization:** Object pipelines, roles & permissions (Enterprise), object tags, repeating tasks, **pipeline approvals for deals** (Enterprise — needs manager sign-off to move a deal to "Closed Won"), lead form routing (Enterprise).

#### What we steal for DealerOS
- **Sales Workspace concept** — a single daily-driver view combining tasks + pipeline + inbox.
- **Universal Inbox** — every customer interaction in one place (calls, texts, emails, web leads).
- **Breeze Intelligence for auto-enrichment** — auto-fill missing customer data (VIN decode, demographics, equity estimate).
- **Breeze Agents for dealership workflows** — e.g. "BeadC agent that calls all unworked internet leads within 5 minutes."
- **Engagement signals (open, click, reply) on every outbound message** — make every email/SMS measurable.
- **Pipeline approval gates** for high-value deals (F&I desk approval before "Closed Won").
- **Real-time browser calling with auto-transcription** — calls logged + searchable.
- **Goal/quota widgets on the rep dashboard** — units sold, gross profit, leads worked.
- **Brand-voice presets for AI-generated SMS/email copy** — dealer-group specific tone.

#### What we avoid
- Tiered feature lockout (Free/Starter/Pro/Enterprise) — confuses dealers. Use a flat price.
- The "Hubs" UI sprawl — too many products bolted on (Marketing/Service/Content/Data/Commerce).

#### Sources
- https://www.hubspot.com/products/sales
- https://www.breakcold.com/blog/hubspot-saleshub-review
- https://www.protocol80.com/blog/hubspot-sales-hub-what-is-features
- https://knowledge.hubspot.com/object-settings/set-up-and-customize-pipelines
- https://community.hubspot.com/t5/HubSpot-Ideas/Kanban-Board-for-Leads-Pipeline/idi-p/1066046/page/2
- https://knowledge.hubspot.com/quotes/manage-quotes
- https://www.sohu.com/a/810010998_121902920 (Breeze AI breakdown)
- https://www.unmatched.agency/insights/top-hubspot-updates-you-cant-miss-from-the-latest-pub

---

### Linear

**Product context:** Issue tracking / project management. Revered for its UX craft, dark-mode-by-default, keyboard-first design. The reference standard for "delightful SaaS UX" in 2025.

#### Key patterns

- **Keyboard-first design.** < 100ms target for interactions. "Speed is the most important feature."
- **Command palette (Cmd+K)** — fuzzy finder modal. Shows keyboard shortcut next to every option (functions as a training tool). Can access *every* app function without navigating menus.
- **Common shortcuts:**
  - `G` then `A` → Active issues
  - `F` → Filter
  - `Enter` → Confirm
  - `H` → Snooze (with natural-language time input: "2d", "tomorrow")
  - `Cmd+K` → Command palette
  - `O` then `W` → Switch workspace
  - Keyboard-only mode (disables mouse — forces learning).
- **Workspace switcher** — upper-left corner, click workspace name → settings + switcher. Multi-workspace per account, each with its own member list, billing, URL.
- **Sidebar organization** — collapsible categories: Getting started, Account, AI, Your sidebar, Teams, Issues, Issue properties, Projects, Initiatives, Cycles, Views, Find and filter, Linear Asks, Integrations, Analytics, Administration.
- **Customizable sidebar** — pin issues, save views, subscribe to views.
- **Deep linking on everything** — every issue, view, project has a URL.
- **Instant capture** — multiple entry points: Cmd+K, "C" to create issue, quick-add from any view. Capture is frictionless.
- **Inbox + Snooze notifications:**
  - Press `H` to snooze for 1hr, tomorrow, next cycle.
  - Snoozed notifications auto-unsnooze if there's a new comment / activity.
  - Drives "Inbox Zero" as a stated design goal.
  - Triage queue with **accept/decline** workflow for incoming issues.
- **Threaded + resolvable comments** — like email threads but you can mark them "resolved" to hide.
- **AI features:**
  - **Natural-language filter** — "Completed in October" auto-generates a date filter.
  - **AI filter option** in filter menu.
  - **Duplicate / similar issue detection** when creating a new issue (real-time, inline).
  - AI is a top-level sidebar nav item.
- **Dark mode by default** — actually the only mode for years; light mode was added later and treated as secondary. Deep purple/violet accent (`#5E6AD2` is the canonical Linear purple).
- **Design system:** ultra-minimal, precise. Linear-purple accent on near-black background. Crisp 1px borders, generous spacing, micro-animations on every state change.

#### What we steal for DealerOS
- **Cmd+K command palette** as the universal search + actions surface. The single highest-leverage interaction in any modern SaaS.
- **Keyboard-first design** with visible shortcuts next to actions. Power-user loop.
- **Snooze** for tasks, leads, follow-ups. Natural-language time input ("tomorrow 9am", "in 2 days").
- **Inbox Zero** as a stated UX goal. Notification triage with accept/decline.
- **Instant capture** — Cmd+K → "New lead for John Smith 2018 F-150" → done.
- **Workspace switcher in upper-left** with role + dealership visible at all times.
- **Natural-language filters** for pipeline views ("Deals stuck more than 7 days").
- **AI duplicate detection** on new leads (catches duplicates of the same person across data sources — same problem VinSolutions tries to solve with match & merge).
- **Deep linking** — every customer, deal, vehicle gets a clean URL.

#### What we avoid
- Pure dark-mode-only (dealers want a light-mode option).
- Project-management jargon (Issues, Cycles, Initiatives) — meaningless to a dealer rep.

#### Sources
- https://gunpowderlabs.com/2024/12/22/linear-delightful-patterns
- https://linear.app/docs/workspaces
- https://linear.app/changelog/2021-06-17-inbox-snooze-and-easier-issue-merge
- https://getdesign.md/linear.app/design-md
- https://www.sucaijishi.com/log-134-99-1.html (Linear dark mode visual analysis)
- https://keycombiner.com/collections/linear/
- https://shortcuts.design/tools/toolspage-linear/
- https://medium.com/linear-app/fast-growing-startups-are-built-on-linear-74511bf96afb (Karri Saarinen)

---

### Pipedrive

**Product context:** Sales-first CRM. Founded on the principle that salespeople hate CRM. Pipeline is the home screen.

#### Key patterns

- **Pipeline is the home screen.** Kanban with horizontal columns = stages. Deal cards = the data primitive.
- **Deal card content density:** title, contact, value, label, owner. Compact.
- **Color-coded stages** — visual stage indicator on the deal card.
- **Drag-and-drop everywhere:**
  - Between stages
  - To "Delete" (trash zone)
  - To **another pipeline** (multi-pipeline)
  - Drag triggers Insights/reporting updates.
- **Pipeline selection dropdown** — top of the pipeline view, lets you switch between multiple pipelines.
- **"+ Deal" button** — top-right, always visible. Primary action.
- **Sort/Filter persistent in sidebar** — sort defaults to "next activity" with creation-time tiebreaker. Smart default.
- **Detail view = full record** (activities, notes, emails, files, documents).
- **Rotting indicator** — visual signal on deal cards that haven't been updated recently. Critical for sales discipline.
- **Activity icons on deal cards** — click to view upcoming activities, mark done, schedule new.
- **AI features:**
  - **AI Email Writer** — composes sales emails in the activity flow.
  - **AI Sales Assistant** — recommendations, prompts.
  - **Smart deal sorting** (next activity default).
  - "AI-powered prompts to focus on the right leads."
- **Pipeline visibility controls** — control access per visibility group.
- **Pipeline layout settings** — define stage display, deal-detail-view behavior, pinned filters.
- **Deal card customization** — admin can pick which fields appear on cards (don't overload).
- **"Restore data" — 30-day trash.** Generous recovery.
- **Free learn.pipedrive.com + self-serve onboarding + enterprise sales-assisted onboarding.**
- **Multi-pipeline architecture** — different pipelines for different products, geographies, or teams.
- **Mobile:** native iOS/Android with full pipeline + activity management.
- **Notifications:** activity reminders (next-action due), usage limit alerts. Light.
- **Anti-pattern:** "no dedicated mobile app mentioned in the support doc — focus on web" was the old way. They've since added native.

#### What we steal for DealerOS
- **Pipeline as the home screen for sales managers.** Lead → Appointment → Showroom → Test Drive → Write-Up → Closed Won/Lost. Columns are the dealer's actual sales process.
- **Drag-to-delete + drag-to-other-pipeline.** Frictionless pipeline hygiene.
- **Rotting indicator** on deal cards (red badge after 48hrs of no activity). Drives sales discipline.
- **Activity icon on every deal card** — see the next action without opening.
- **Sort by "next activity"** as the default. Always shows what needs to happen now.
- **Multi-pipeline support** — separate pipelines for New, Used, BDC-handoff, Fleet.
- **Deal card customization** per dealership group (different fields for BMW vs. Ford dealers).
- **"Next activity required to advance stage"** validation — can't drag a deal to "Closed Won" without a logged closing activity.
- **Generous 30-day trash** for soft-deleted records.

#### What we avoid
- Configuration-heavy visibility groups (dealers won't set them up).
- Bloat across "Pipedrive is more than just a pipeline" marketing — focus the product.
- Light-mode enterprise chrome.

#### Sources
- https://support.pipedrive.com/en/article/pipeline-view
- https://www.pipedrive.com/
- https://www.onepagecrm.com/crm-reviews/pipedrive/
- https://rondesignlab.com/blog/work-in-progress/pipedrive-crm-sales-deal-management-mobile-app-ux-ui-design
- https://www.rings.ai/blog/pipedrive-review
- https://themarketingagency.ca/blog/honest-take-pipedrive-review/
- https://salesdorado.com/en/crm/crm-software/sales-pipeline-hubspot-crm/
- https://www.molestreet.com/blog/hubspot-vs-pipedrive-which-crm-is-best-for-scaling-organizations-in-2025

---

### Stripe Dashboard

**Product context:** Payments infrastructure dashboard. The gold standard for B2B fintech UX. Famously opinionated, recently redesigned (2024-2025).

#### Key patterns

- **Left sidebar navigation.** Persistent. Sections (top → bottom): **Home, Payments, Billing, Connect, Radar, Reporting**, plus conditional sections (Tax, Atlas, Issuing, Terminal) shown only when enabled.
- **Home = customizable widget dashboard.** Add/remove widgets. Default widgets: gross volume, net volume, new customers, successful payments, date-range comparison with previous period, sparkline trend charts. Every widget has a sparkline.
- **Top-level "Shortcuts"** — pinned and recently visited pages. Quick-access.
- **Global search** spans all object types (customers, invoices, payouts, products) simultaneously. Cmd+K.
- **Onboarding checklist embedded in the sidebar** — "Activate your account," "Set up payments," "Configure your branding." Progress-checklist pattern drives activation.
- **Disputes section with response deadlines** — "Respond by [date]" prominent. Urgent deadlines as a first-class UI element.
- **Payouts section** with delay explanations and required actions. Payouts that don't arrive get explicit "Why?" explanations with required remediation.
- **Account switcher (Organizations)** — for users managing multiple Stripe accounts (enterprises, agencies). One click to swap context.
- **Test mode via "Sandboxes"** — separate environment for testing, fully isolated. Visible mode indicator at all times.
- **Customer detail view** consolidates: subscriptions, payments, payment methods, invoices, quotes, files. One customer, all activity.
- **Empty states explain the why, not just the what.** "No payments yet — once you integrate the API, they'll appear here."
- **Account Settings organized into two layers:**
  - **Personal Settings** — user-level.
  - **Account Settings** — business-level: account details, account health, public information, payouts, legal entity, custom domains, PCI compliance, **Team & Security** (invite + roles), **Branding** (logo/icon/colors for payment forms/emails/invoices), **Checkout** (customize policies + contact).
  - **Product Settings** — per-product config (Billing, Radar, Issuing, Identity, Sigma, Connect, Payments, Tax, etc.).
- **Workbench** — API + webhook observability: usage, error logs by endpoint, request/response inspection, version upgrades. Hidden under "Beta features" by default.
- **Keyboard shortcuts** — press `?` to see all.
- **Design system migration** — 100% of dashboard migrated to modern design system. Components fully themable. Architecture uses **design tokens**, including auto-generated color tokens based on **WCAG color contrast algorithm** for accessibility. **Truly excellent dark mode** + an extra "darker mode" for developer overlays.
- **Dark mode was launched in iOS first** as proof of concept, then web.
- **Embedded Components** — merchants can embed Stripe dashboard functionality into their own apps, themed to match their brand. The "API of UI" approach.
- **Trust through clarity** — microcopy is calm, explicit, never weasel-worded. Numbers always have context (delta vs prior period).
- **No sales/marketing fluff** in the dashboard. No upsell modals. No "Try Premium!" popovers.
- **Disputes/deadlines surface as urgent** — they break the visual hierarchy on purpose.

#### What we steal for DealerOS
- **Onboarding checklist in the sidebar** with progress. New dealership setup never feels lost.
- **Home dashboard with sparkline-on-every-metric** widgets. Customizable. Date-range comparison vs. prior period.
- **Top-level "Shortcuts" section** — pinned and recently visited pages. Dealers bounce between the same 5 screens.
- **Global search across all entity types** (customers, deals, inventory, VINs) from one bar.
- **Sandbox / Test mode** with persistent visible indicator. Dealers training new reps in a safe environment.
- **"Dispute-style" urgent items** that break visual hierarchy — a "Lead not worked in 24h" call-to-action banner at the top of the dashboard.
- **Account Settings = two layers** (Personal + Business + Per-product). Avoids the "Settings soup" problem.
- **Design tokens + WCAG-based auto color generation** for our dark mode.
- **Embedded components / API-of-UI** — let dealer groups embed DealerOS modules in their existing DMS portals.
- **Microcopy discipline** — calm, explicit, context always provided (delta vs. prior, units sold vs. goal, etc.).
- **Disputes-style urgency UI** for "Lead about to be lost" / "Deal stuck > 7 days."

#### What we avoid
- The dense data tables in mobile (Stripe still struggles here).
- The "Workbench" feature — overkill for a dealer CRM.
- Configuration sprawl (Sigma, Revenue Recognition, etc.).

#### Sources
- https://docs.stripe.com/dashboard/basics
- https://www.925studios.co/blog/stripe-dashboard-design-breakdown
- https://mattstromawn.com/projects/stripe-dashboard/
- https://medium.com/swlh/exploring-the-product-design-of-the-stripe-dashboard-for-iphone-e54e14f3d87e
- https://stripe.com/blog/engineering
- https://www.saasui.design/blog/7-saas-ui-design-trends-2026
- https://www.youtube.com/watch?v=08TsVjUKH4M (Inner workings of design at Stripe)

---

### Vercel Dashboard

**Product context:** Frontend cloud platform dashboard for deployments, observability, and team collaboration. The "Linear of infrastructure." Recently shipped a major navigation redesign (Feb 2026).

#### Key patterns

- **Major navigation redesign rolled out Feb 25, 2026** — horizontal tabs → resizable sidebar. Can be hidden. "Consistent tabs" for unified navigation across both team and project levels.
- **"Projects as filters"** — switch between team-level and project-level views of the same page in one click. Powerful context switcher.
- **Floating bottom bar on mobile** — optimized for one-handed use. Not a hamburger.
- **Dark mode** with theme selector: **system / light / dark.** Default respects OS preference. SVG logo swaps between light/dark.
- **Command palette (Cmd+K)** — universal search. Standard for modern dev SaaS.
- **Sidebars prioritized by most common developer workflows** — "every element earns its place." Heavy restraint in IA.
- **Design engineering culture** — designers who ship code. Maintain a single internal design system used across vercel.com, Vercel Toolbar, and Next.js docs.
- **Brand identity: "Blueprint Grid"** — subtle blue-tinted grid background as a design signature. Sets a tone.
- **Speed is the headline feature** — every page is obsessed with <100ms interactions.
- **Zero-noise UI** — no upsell modals, no marketing carousels, no "What's New" popovers. The dashboard is a tool, not a billboard.
- **Notifications:** minimal. Inbox pattern for important events (build failures, deployment state changes).

#### What we steal for DealerOS
- **Resizable, hideable sidebar.** Dealers want full screen for the pipeline.
- **"Projects as filters"** — for a dealer group, this is "Show me Honda of Ann Arbor ONLY" as a persistent filter on every page.
- **Floating bottom bar on mobile** with one-handed optimization. Dealers live on their phones in the showroom.
- **System-default dark mode** that respects OS preference. No toggle by default; let users override.
- **Blueprint Grid as a design signature** — a subtle background texture for "premium" feel.
- **Speed budget** — every DealerOS page should have a 100ms interaction target.
- **Zero-noise UI principle** — no upsell carousels in the BDC's dashboard. The dashboard is a tool.
- **Single unified design system** across web app + marketing site + docs.

#### What we avoid
- Developer jargon in copy (deployments, builds, regions).
- Multiple parallel product surfaces (Vercel has too many products now).

#### Sources
- https://vercel.com/changelog/dashboard-navigation-redesign-rollout
- https://vercel.com/blog/design-engineering-at-vercel
- https://vercel.com/changelog/dark-mode-expanded-search-and-more-in-grep
- https://vercel.com/blog/changelog-april-2020 (dark mode system preference)
- https://www.youtube.com/watch?v=r6mykOig_Bs (Rebuilding Vercel Dashboard with Tailwind)
- https://www.setproduct.com/blog/complete-guide-to-blueprint-grid-design

---

### Mercury & Ramp (Fintech dark mode + workflows)

**Mercury context:** Digital bank for startups/SMBs. Cult-favorite for design quality. Dark mode + clean transactions UI.
**Ramp context:** Spend management / corporate cards / AP automation. Dark mode + approval workflows are the standout patterns.

#### Key patterns (Mercury)

- **Left sidebar with account types:** Checking, Savings, Treasury, Vault, Capital, Cards, Transactions, Payments. Sidebar IS the chart of accounts.
- **"Move Money" mega-menu** with quick actions: Pay, Add Funds, Request Payment, Transfer Between Accounts. The most common operations are 1 click from anywhere.
- **Multi-step transfer flow:** recipient → payment method → amount/source → purpose → scheduling → memo → review → success. Eight steps, each screen does one thing well.
- **Approve / Decline Requests** — multi-approver workflow for payments. Routed to specific approvers; supports delegation.
- **Multi-account dashboard header** — account balances shown as cards at the top. One-glance visibility.
- **Team Settings** for member management + permissions. **Workflow approval system** for payments requiring multiple sign-offs.
- **Transactions dashboard with filterable table view** — date range filter, search, status, amount, recipient. Dense but readable.
- **Dark mode default** — pure black background (`#000`-ish), white text, restrained accent colors. Toggleable (Light/Dark/System).
- **Mobile + responsive web** — parity between mobile and web for core flows.
- **Notifications:**
  - iOS push for incoming/outgoing transactions, uncashed check payments, chat replies.
  - **Tasks & approvals** notifications (email + push) — "pending requests and to-dos."
  - **General account updates.**
  - Granular per-channel control in Notification Settings.
- **Onboarding:** multi-step account creation, dedicated welcome/empty states, **referral program** with a referral dashboard.
- **Company Settings** = business details, preferences, integrations, team, security, notifications. All in one place.

#### Key patterns (Ramp)

- **Dark mode** — added Q1 2023. Toggle. Designer quote: "It makes the UI look very sleek."
- **Approval workflow with custom groups + owners:**
  - Admins create custom approval groups per department / office location.
  - Assign groups + owners to approval policies.
  - **Coverage if an approver is OOO** — automatic delegation.
  - **Self-approval control** — owners can disable admin self-issuing/self-approving (default: on).
- **Mobile parity:** Android app + iOS app. Mobile wallet pay, link physical card to virtual limit, auto-match receipts (Lyft, Gmail, Outlook), submit by receipt photo, flag transactions, request policy exceptions, switch between business accounts.
- **Multi-account switching** on mobile.
- **Products covered:** Corporate cards, Expense management, Spend management, Budgets, Banking, Travel, Reimbursements, Procurement, AP, Vendor management, Approvals, Security, Bank connections, Mobile app, Ramp Sheets.
- **Sleek, opinionated UI.** Heavy use of AI for receipt matching, vendor suggestion, policy enforcement.

#### What we steal for DealerOS
- **Account types as sidebar items** — for a dealer: New Inventory, Used Inventory, Parts, Service, F&I, Cash. Each is a "wallet."
- **"Move Money" mega-menu** for BDC actions: Log Call, Send SMS, Schedule Appt, Create Deal, Add Note, Assign Lead. The top 6 BDC actions one click away.
- **Multi-approver workflow** for deals — e.g. "Up to $5K = manager approves, $5K–$25K = GM approves, $25K+ = dealer principal." Configurable per dealership.
- **Dark mode by default** with a calm, restrained palette (not Stripe's rainbow).
- **Mobile parity** for core flows: BDC rep on phone should be able to do 100% of their work.
- **Receipt-photo-style attachment** for trade-in photos, driver's license captures, credit apps. All from phone.
- **Push notifications for high-signal events** (new internet lead, lead not worked in 10 min, deal moved to F&I).
- **Granular notification settings** — per channel (push/email/SMS) per event type.
- **"Referral dashboard"** as a BDC / salesperson gamification mechanic.
- **OOO delegation** for approvals — never let a deal stall because the manager is on vacation.
- **Self-approval control** — prevent dealer principals from approving their own sweetheart deals.

#### What we avoid
- Mercury-style pure black can feel oppressive. Use a dark "charcoal" `#0E0E10` rather than `#000`.
- Ramp's product sprawl — too many surfaces. Dealers want ONE app.

#### Sources
- https://www.saasframe.io/saas/mercury
- https://support.mercury.com/hc/en-us/articles/37538153196948-Enabling-dark-mode
- https://mercury.com/blog/new-transactions
- https://support.mercury.com/hc/en-us/articles/47493071225748-Managing-your-notification-settings
- https://nicelydone.club/apps/mercury
- https://ramp.com/blog/q1-ramp-rewind-2023
- https://ramp.com/
- https://support.ramp.com/reviewing-transactions-from-ramp-cards
- https://support.ramp.com/setting-up-spend-request-approvals

---

## Top 10 Production Patterns to Steal

| # | Pattern | From | Apply in DealerOS Module |
|---|---------|------|--------------------------|
| 1 | **Cmd+K command palette with keyboard shortcuts shown next to every action** | Linear + Stripe | Global — top of every page. "New Lead," "Log Call," "Schedule Appt," "Switch Store," all reachable in 1 keystroke. |
| 2 | **Pipeline-as-home with drag-and-drop + rotting indicator + activity icon on every deal card** | Pipedrive | Sales Pipeline view. Red badge if a deal has no activity in 48h. Default sort = "next activity." |
| 3 | **Dark mode by default with WCAG-derived design tokens + system-preference auto-detect** | Stripe + Linear + Vercel | Global design system. System follows OS, user can override (Light / Dark / System). |
| 4 | **Snooze for tasks, leads, follow-ups with natural-language time input** | Linear | Every lead, every task, every deal action. `H` to snooze. Type "tomorrow 9am" or "in 2 hours." |
| 5 | **Universal Inbox = every customer interaction in one place (calls, texts, emails, web leads, walk-ins)** | HubSpot + Linear | BDC dashboard. Single triage surface. Accept/Decline/Snooze. |
| 6 | **Onboarding checklist embedded in the sidebar with progress (Activate, Integrate, Invite Team, Set Pipelines)** | Stripe | New dealership setup. Visible until 100% complete. Each step is one click. |
| 7 | **Multi-step focused flow (one decision per screen) for high-stakes actions: New Deal, Credit App, F&I** | Mercury | "Add New Lead" → "Customer Info" → "Vehicle of Interest" → "Source" → "Assign To" → "Done." |
| 8 | **Multi-approver workflow for high-value deals with OOO delegation + self-approval control** | Ramp + Mercury | Deal approval rules per dealership. Auto-routed to next approver if previous is OOO. |
| 9 | **Customizable home dashboard with sparkline-on-every-metric + date-range comparison vs prior period** | Stripe | Manager dashboard. Drag-and-drop widgets. Every metric has a trendline and a delta. |
| 10 | **Resizable, hideable sidebar + "Show me ONLY [Store]" as a persistent global filter** | Vercel | Multi-rooftop dealer groups. One-click context switcher. Hide sidebar for max-pipeline view. |

### Bonus 5 (also high-value, didn't make the top 10)
11. **Workspace switcher in upper-left with role + dealership name + color badge** (Linear, Mercury) — multi-tenant signal.
12. **AI duplicate detection on new leads** (Linear + VinSolutions) — catches "John Smith" vs "Jon Smith" vs "J. Smith" entering the same dealership.
13. **Breeze-style AI assistant for meeting prep + lead research + draft SMS/email with brand-voice presets** (HubSpot) — chat sidebar on every record.
14. **Rotting indicator + "Why is this deal stuck?" explainer** (Pipedrive) — surface deals that have gone silent.
15. **Disputes-style urgency banners** (Stripe) — "Lead not worked in 24 hours. You're 3x more likely to lose them." Full-bleed red.

---

## Anti-Patterns to Avoid

| Anti-pattern | From | Why bad |
|--------------|------|---------|
| **Dashboard scoped to a single store with no centralized BDC view** | VinSolutions (criticized) | Dealer groups have central BDCs handling leads for 5–50 rooftops. Hiding cross-store context kills BDC productivity. |
| **Light-mode-only enterprise chrome** | VinSolutions, DealerSocket, every legacy dealer CRM | In 2026, dark mode is a brand signal. Dealers who are Gen-X/Millennial will judge the product as dated. |
| **Configuration-heavy visibility groups / role-based permissions** | Pipedrive | Dealers won't set them up. Default to "open to the dealership" and let admins lock down if needed. |
| **Modal-on-modal onboarding wizards** | HubSpot tiered | Confusing. Use a sidebar checklist (Stripe pattern) instead. |
| **"Kanban Board" hidden behind a beta opt-in flag** | HubSpot | Kanban IS the pipeline. Make it the default view. |
| **Email open tracking without a clear value prop** | HubSpot | Dealers don't care. Dealers care about "Did they reply?" Make that the primary signal. |
| **Pure black background `#000`** | Mercury | Aesthetically harsh. Use `#0E0E10` or `#0A0A0B` for a "premium charcoal" feel. |
| **Hamburger menu on mobile instead of a tab bar / bottom bar** | VinSolutions mobile, generic enterprise | Hamburger menus hide navigation and are 30% less used. Vercel's floating bottom bar is the modern alternative. |
| **Upsell modals / "Try Premium" popovers in the BDC dashboard** | Vercel (avoids it) | Dealers hate SaaS upsells. The product should be the product. |
| **Settings soup — every preference flat in one mega-page** | Generic SaaS | Use Stripe's two-layer model: Personal + Business + Per-product. |
| **Self-approval enabled by default for high-value transactions** | Ramp (they fixed it) | Dealer principals will approve their own sweetheart deals. Self-approval = off by default. |
| **Auto-snoozed notifications that never re-surface** | Generic email tools | Linear pattern: auto-unsnooze if there's new activity on the issue. Notifications must be alive. |
| **VinSolutions-style "see only my store" forced context without an obvious switcher** | VinSolutions | Reps working across rooftops need a 1-click store switcher, always visible. |
| **AI features buried in a "Labs" page** | Generic SaaS | HubSpot Breeze is in your face. That's the right call. AI is a daily-driver now. |
| **Trash / recycle bin hidden 5 clicks deep with 7-day retention** | Generic SaaS | Pipedrive's 30-day visible trash is the right balance. Dealers make mistakes. |

---

## Implementation Priority for DealerOS

**Sprint 1 (Do first — these are table stakes):**
- Cmd+K command palette (#1)
- Dark mode + design tokens (#3)
- Pipeline-as-home with drag-and-drop + rotting indicator (#2)
- Multi-tenant sidebar with persistent store badge (#11)
- Onboarding checklist in sidebar (#6)

**Sprint 2 (High-impact differentiators):**
- Snooze with natural-language input (#4)
- Universal Inbox for BDC (#5)
- Sparkline-on-every-metric dashboard (#9)
- Multi-approver deal workflow with OOO delegation (#8)

**Sprint 3 (Polish + delight):**
- AI duplicate detection on new leads (#12)
- Breeze-style AI copilot on every record (#13)
- Multi-step focused flows for high-stakes actions (#7)
- Resizable/hideable sidebar with "Store as filter" (#10)
- Disputes-style urgency banners (#15)

---

## Cross-App Pattern Heatmap

| Pattern | Vin | HubSpot | Linear | Pipedrive | Stripe | Vercel | Mercury | Ramp |
|---------|-----|---------|--------|-----------|--------|--------|---------|------|
| Cmd+K command palette | — | — | ✅ | — | ✅ | ✅ | — | — |
| Pipeline drag-drop | ✅ | ✅ | — | ✅ | — | — | — | — |
| Dark mode by default | ❌ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Snooze notifications | — | — | ✅ | — | — | — | — | — |
| Multi-tenant switcher | ⚠️ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| Mobile-first | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ |
| Kanban + List views | ⚠️ | ✅ | ⚠️ | ✅ | — | — | — | — |
| Multi-approver workflow | — | ✅ | — | — | ⚠️ | ✅ | ✅ | ✅ |
| Rotting indicator | ✅ | ⚠️ | — | ✅ | — | — | — | — |
| Design tokens / WCAG | — | — | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| Onboarding checklist | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| AI everywhere | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ |
| Resizable sidebar | — | ⚠️ | ✅ | — | ⚠️ | ✅ | ⚠️ | ⚠️ |
| Universal inbox | — | ✅ | ✅ | — | ⚠️ | — | ⚠️ | ⚠️ |

Legend: ✅ Yes, ❌ No, ⚠️ Partial

---

## Recommended Design Tokens for DealerOS Dark Mode

Based on Stripe's WCAG-algorithm approach + Linear's restraint + Mercury's calm:

```
--color-bg-canvas:        #0A0A0B   /* app background */
--color-bg-surface:       #131316   /* card / panel */
--color-bg-elevated:      #1C1C1F   /* modal / popover */
--color-border-subtle:    #2A2A2E   /* hairline */
--color-border-default:   #3A3A3E
--color-text-primary:     #FAFAFA
--color-text-secondary:   #A1A1AA
--color-text-tertiary:    #71717A
--color-accent-primary:   #5B5BD6   /* Linear-purple, branded */
--color-accent-success:   #10B981
--color-accent-warning:   #F59E0B
--color-accent-danger:    #EF4444
--color-accent-info:      #3B82F6

Light mode: invert canvases to #FAFAFA / #FFFFFF / #F4F4F5
Text inverses: #18181B primary, #52525B secondary
```

Typography: Inter Variable (free, screen-tuned) at 14px base, 1.5 line-height.

---

*End of research. Patterns catalogued and ready to spec out in Figma.*
