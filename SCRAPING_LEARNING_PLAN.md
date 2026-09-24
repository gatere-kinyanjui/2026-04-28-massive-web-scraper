# Web Scraping Learning Plan — TypeScript + Node.js

## TOP 3 THINGS TO UNDERSTAND

1. **How to inspect HTML in DevTools before writing any code** — This is the single most time-saving skill. Right-click → Inspect on any element → Copy selector gives you a working selector in 2 seconds. Skipping this step is the #1 reason scrapers fail.

2. **The difference between Cheerio and a browser** — Cheerio parses HTML string to DOM-like object. It cannot execute JavaScript. If a site shows data that wasn't in the initial HTML response, you need Playwright. This determines your entire technical approach.

3. **PostgreSQL upsert is your deduplication strategy** — `ON CONFLICT DO UPDATE` is how you handle re-scraping without duplicates. Understanding this before writing any code keeps you from designing flawed schema.

---

## SECTION 1: Mental Model — How Web Scraping Actually Works

### The Full Pipeline

```
[Scraper] → [HTTP Request] → [Internet] → [Target Server] → [HTML Response] → 
[Scraper] → [Parse with Cheerio] → [Structured Data] → [PostgreSQL]
```

**What actually happens at the HTTP layer:**

Your scraper opens a TCP connection to port 80 (HTTP) or 443 (HTTPS), sends an HTTP request with method, path, headers, then waits for a response. The server processes your request and sends back a status line, headers, and body.

**Status codes that matter most:**

- **200 OK** — Success. You got what you asked for. Parse the response body.
- **301/302 Moved** — Redirect. Axios follows these automatically by default, but you should understand it happens.
- **403 Forbidden** — Server explicitly rejected you. Your User-Agent or IP is flagged. This is the wall.
- **429 Too Many Requests** — You triggered rate limiting. Back off.
- **503 Service Unavailable** — Server is overloaded or blocking. Retry later.

**Static vs. SPA (Single Page Application):**

- **Static HTML**: Server returns complete HTML with all data embedded. Books.toscrape.com is this. Axios + Cheerio works perfectly.
- **SPA/JS-rendered**: Server returns minimal HTML + JavaScript that runs in browser to fetch data. You need a headless browser (Playwright/Puppeteer) that executes JavaScript.

**How to tell which you're dealing with:**
1. Fetch the page with Axios
2. Log the response length
3. If the data you want appears in the raw HTML string → static → Cheerio
4. If not → either inspect the network tab to find the API endpoint, or use Playwright

**CSS Selectors vs. XPath:**

- **CSS selectors** (`li.product a`) — More common, simpler, what 90% of scrapers use. Works in browser DevTools and Cheerio.
- **XPath** (`//div[@class="product"]//a`) — More powerful for traversal, useful when CSS can't express what you need. Cheerio supports both.

**Why sites block scrapers:**

- **User-Agent**: Server checks if it's a known browser. Sending `axios/1.26.0` is an immediate flag.
- **Request frequency**: Too many requests per second triggers rate limiting.
- **Header fingerprinting**: Missing Accept-Language, Accept-Encoding signals automation.
- **TLS fingerprint**: The TLS client hello reveals library fingerprints. Proxy services handle this.

**Essential reads tonight:**
- MDN HTTP Overview (status codes): https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
- DevTools Inspector: Open any page → F12 → Click element → Right-click → Copy selector (this is your workflow)

**Reference level (read later):**
- Cloudflare's TLS fingerprinting explanation (search: Cloudflare TLS fingerprinting blog)

---

## SECTION 2: Project Architecture Decision Guide

### HTTP Client: Axios over native fetch

**Why Axios:**
- Configurable timeouts (`timeout: 10000`) — critical when sites hang
- Interceptors for automatic retry logic — clean separation of concerns
- Automatic JSON transformation
- Response object gives you `status`, `headers`, `data`, `config` directly

**What specifically matters:**
- `axios.get(url, { timeout: 10000, headers: {...} })`
- Response interceptors for retry logic
- Request interceptors for auto-adding User-Agent

**Reference:** Axios docs — Config defaults section: https://axios-http.com/docs/config_defaults

### HTML Parser: Cheerio

**What it does:**
Parses an HTML string into a traversable DOM-like object. NOT a browser — it cannot execute JavaScript or render CSS.

**Limitations:**
- No JavaScript execution
- No CSS rendering
- Doesn't handle WebGL, canvas, or interactive elements

**Methods I will use most:**
- `.find(selector)` — Find descendant elements
- `.text()` — Get text content
- `.attr(attribute)` — Get attribute value
- `.each(function)` — Iterate over elements

**Reference:** Cheerio docs — Selectoring: https://cheerio.js.org/docs/basics/loading#selecting

### Database Client: node-postgres (pg) over Prisma

**Why raw pg:**
- Write actual SQL → understand PostgreSQL deeply
- Parameterised queries (`$1`, `$2`) teach you SQL injection prevention by doing it
- Connection pooling is explicit and visible — you configure it
- No ORM magic to hide performance problems

**What to understand:**
- Connection pool: `new Pool({...})` reuses connections
- Parameterised queries: `await client.query('SELECT * FROM users WHERE id = $1', [id])`

**Reference:** node-postgres — Parameterized queries: https://node-postgres.com/features/queries#parameterized-queries

### Project File Structure

```
/src
  /config        — Configuration (URLs, delays, User-Agent)
  /fetch        — HTTP client logic (single page fetcher)
  /parse        — Cheerio parsing logic (HTML → typed objects)
  /storage      — PostgreSQL operations (upserts, connection)
  /utils        — Helpers (delays, retry logic)
  /types        — TypeScript interfaces
  main.ts       — Entry point, orchestration
  /data         — Raw HTML dumps for debugging (gitignore)
/scripts       — SQL migration scripts
.env            — Database credentials (gitignore)
```

**Why separation:**
Fetching, parsing, and storing must never be in the same function because:
1. Testing becomes impossible (you can't test parse with mock HTML)
2. Debugging becomes chaotic (where did it fail?)
3. Reuse is blocked (can't fetch without parsing)

---

> Recommendation: pnpm
> Why for this project:
> Metric
> Clean install
> Disk usage
> Strict deps
> Growth 2024→2026
> Citations:
> - PkgPulse 2026 benchmark: https://www.pkgpulse.com/blog/npm-vs-yarn-vs-pnpm-2026
> - DevTools Guide 2026: https://devtoolsguide.com/package-managers-compared
> - DevToolsWatch 2026: https://devtoolswatch.com/en/pnpm-vs-npm-vs-yarn-2026
> Specifics for your scraper project:
> 1. Strict dependency enforcement — pnpm catches phantom dependency bugs at install time, not runtime. Your scrape won't mysteriously fail because cheerio wasn't in your package.json.
> 2. Content-addressable store — pnpm symlinks from a global store. One copy of cheerio across all projects. For a throwaway learning project this matters less, but it builds correct habits.
> 3. Fast enough — 16s vs 28s for cold install. Not transformative for one project, but the 52% faster cached install adds up over weeks.
> Why NOT the others:
> - npm: Slowest, flat node_modules hides missing dependencies
> - Yarn Berry: Good, but PnP has compatibility edge cases with legacy tools
> - Bun: Fastest (8s), but Bun itself is still maturing as a runtime — using it just for bun install while running Node is inconsistent
> One-liner to start:
> `corepack enable && corepack prepare pnpm@latest --activate`
> Then `pnpm init` and `install` your deps.

## SECTION 3: Implementation Roadmap — Phase by Phase

### Phase 1: Project Setup (15 min)

**What to build:** Working TypeScript project with dependencies installed.

**What to understand:**
- npm init -y creates package.json
- `npm install axios cheerio pg dotenv`
- `npm install -D typescript @types/node @types/axios @types/cheerio @types/pg ts-node`

**Where to read it:**
- TypeScript docs: https://www.typescriptlang.org/docs/
- tsconfig basics: https://www.typescriptlang.org/docs/handbook/tsconfig-json.html

**The trap:** Not creating a proper tsconfig.json. Without `"esModuleInterop": true`, Axios imports break.

**How I know it's working:** `npx ts-node --version` runs without error.

---

### Phase 2: Fetching a Single Page — Raw HTML to Console (20 min)

**What to build:** Function that fetches books.toscrape.com/catalogue and logs the HTML.

**What to understand:**
- Axios.get() returns a response object
- The HTML is in `response.data`
- Logging is your diagnostic tool

**Concept illustration only:**
```typescript
// This fetches a page and logs first 200 chars of HTML
import axios from 'axios';

async function fetchPage(url: string) {
  const response = await axios.get(url);
  console.log(response.data.slice(0, 200));
}
```

**The trap:** Not logging the response status and headers first. Always verify 200 before parsing.

**How I know it's working:** HTML appears in console, starts with `<!DOCTYPE html>`.

---

### Phase 3: Inspecting HTML and Writing First Selectors (20 min)

**What to build:** Use DevTools to find selectors, then write test code to extract one element.

**What to understand workflow:**
1. Fetched HTML → Save to file (data/page.html)
2. Open file in browser
3. Right-click element → Inspect
4. Right-click HTML in DevTools → Copy → Copy selector
5. Use that selector in Cheerio code

**Where to read it:**
- DevTools selector copy: Open any page in Chrome → F12 → Right-click element → Copy → Copy selector

**The trap:** Copy selector gives browser-generated selector, often overly specific (like `#main > div:nth-child(3)`). Simplify it by understanding the HTML structure yourself.

**How I know it's working:** Logging a single book's title to console shows clean text.

---

### Phase 4: Parsing One Page into Typed TypeScript Array (30 min)

**What to build:** Function that extracts all book entries from one page into a `Book[]` array.

**What to understand:**
- TypeScript interfaces define your data shape before parsing
- Iterating with `.each()` gives you index and the element
- `.text()` and `.attr()` extract values
- Handle missing data gracefully (availability might be empty)

**Where to read it:**
- Cheerio iteration: https://cheerio.js.org/docs/basics/loading#iterating

**Concept illustration only:**
```typescript
interface Book {
  title: string;
  price: string;
  rating: number;
  availability: string;
  url: string;
}

const $ = cheerio.load(html);
const books: Book[] = [];

$('li.product').each((_, el) => {
  const book: Book = {
    title: $(el).find('h3 a').attr('title') || '',
    // ... extract other fields
  };
  books.push(book);
});
```

**The trap:** Not handling empty/null values. Sites change — what exists today might be missing tomorrow. Handle with `|| ''` or optional chaining.

**How I know it's working:** Console.log shows array of 20 Book objects with all fields populated.

---

### Phase 5: Adding Pagination — Looping Through All Pages (20 min)

**What to build:** Loop that fetches all pages until no more "next" link exists.

**What to understand:**
- Books.toscrape uses `/catalogue/page-${n}.html` format
- Check for "next" button or current page number
- Loop until 404 or no next link

**The trap:** Infinite loop if always treating as has next. Verify the "next" link actually exists.

**How I know it's working:** Console shows 1000+ books extracted (50 pages × 20 books).

---

### Phase 6: Adding Polite Scraping Behaviour (30 min)

**What to build:** Random delays, realistic headers, retry with exponential backoff.

**What to understand:**
- Random delay: `Math.random() * (max - min) + min` ms
- Headers: User-Agent, Accept, Accept-Language
- Retry with exponential backoff: Attempt → wait → attempt → wait exponential

**Concept illustration only:**
```typescript
// User-Agent header that looks like a real browser
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

async function fetchWithRetry(url: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios.get(url, { timeout: 10000, headers });
    } catch (err) {
      await delay(Math.pow(2, i) * 1000 + Math.random() * 1000);
    }
  }
}
```

**Where to read it:**
- Axios timeout: Set in config — https://axios-http.com/docs/req_config
- Exponential backoff: Search "exponential backoff jitter" for the math

**The trap:** Not adding jitter. Pure exponential backoff causes "thundering herd" where everyone retries at the same time. Add random jitter.

**How I know it's working:** Delays visible in console timing, no 429 errors.

---

### Phase 7: Setting Up PostgreSQL Schema (15 min)

**What to build:** Two tables — listings and scrape_runs.

**What to understand:**
- listings: scraped data with unique constraint
- scrape_runs: metadata about each scrape (started_at, completed_at, pages_scraped)

**Concept illustration only:**
```sql
CREATE TABLE listings (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  price VARCHAR(20),
  rating INTEGER,
  availability VARCHAR(100),
  url VARCHAR(500) UNIQUE NOT NULL,
  scraped_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE scrape_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  pages_scraped INTEGER,
  records_inserted INTEGER
);
```

**The trap:** Not setting UNIQUE on url. Without it, upserts won't detect duplicates.

**How I know it's working:** `\dt` shows tables, `\d listings` shows schema.

---

### Phase 8: Writing the Upsert Function (20 min)

**What to build:** `INSERT ... ON CONFLICT DO UPDATE` function.

**What to understand:**
- ON CONFLICT (url) DO UPDATE - unique constraint triggers update
- Update all fields to latest scraped data

**Concept illustration only:**
```sql
INSERT INTO listings (title, price, rating, availability, url)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (url) DO UPDATE SET
  title = EXCLUDED.title,
  price = EXCLUDED.price,
  rating = EXCLUDED.rating,
  availability = EXCLUDED.availability,
  scraped_at = NOW();
```

**The trap:** Not including all columns in DO UPDATE causes stale data when columns are missing from INSERT.

**How I know it's working:** Running twice inserts same URLs, updates instead of duplicates.

---

### Phase 9: Wiring Everything Together in main.ts (15 min)

**What to build:** Orchestration function that calls fetch → parse → store for all pages.

**The trap:** Not handling errors gracefully. Wrap each page in try-catch so one page failure doesn't crash entire run.

**How I know it's working:** Running `npx ts-node main.ts` completes with "Scraping complete" message and DB records.

---

### Phase 10: Verifying Data Integrity (10 min)

**What to build:** Query that confirms data is in DB correctly.

**Query:**
```sql
SELECT COUNT(*) as total, COUNT(DISTINCT url) as unique_urls FROM listings;
SELECT * FROM listings ORDER BY scraped_at DESC LIMIT 5;
SELECT * FROM scrape_runs ORDER BY started_at DESC LIMIT 1;
```

**The trap:** COUNT(*) matching unique_urls proves no duplicates. If they don't match, upsert failed.

**How I know it's working:** Total equals unique_urls, sample rows look correct.

---

## SECTION 4: The Concepts I Must Truly Understand

### 1. CSS Selectors

**Plain-English explanation:**
CSS selectors pattern-match HTML elements. `ul.products li` selects li elements inside ul with class products. Specificity matters: `.class` has lower specificity than `#id`, which has lower than `[data-attr]`.

**Why it matters:**
Cheerio's `.find()` takes CSS selectors. Writing precise selectors extracts clean data. Overly broad selectors grab garbage; overly specific break on site changes.

**Resource:**
MDN CSS Selectors: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors

**Self-test question:**
Can I write a selector to get only the third book on the page using `:nth-child()`?

---

### 2. Cheerio's jQuery-like API

**Plain-English explanation:**
Cheerio loads HTML string into a traversable object. `$(element).find('h3')` returns child h3 elements. Unlike browser jQuery, it cannot execute JavaScript or make network requests.

**Why it matters:**
Most scraping uses Cheerio. Understanding its API is non-negotiable. Browser jQuery tutorials mostly transfer — but you must remember: no JS execution.

**Resource:**
Cheerio docs: https://cheerio.js.org/docs/basics/loading

**Self-test question:**
Can I traverse up to a parent element using `.parent()` or `.parents()`?

---

### 3. Axios Interceptors and Timeout

**Plain-English explanation:**
Interceptors run before request sends (request) or after response arrives (response). You can modify config or retry on specific error codes. Timeout aborts hanging requests.

**Why it matters:**
Request interceptor auto-adds User-Agent. Response interceptor logs timing. Timeout prevents infinite hangs.

**Resource:**
Axios interceptors: https://axios-http.com/docs/interceptors

**Self-test question:**
Can I use a request interceptor to add a random delay before every request?

---

### 4. Exponential Backoff with Jitter

**Plain-English explanation:**
After failure, wait 2^n seconds before retry: 1s, 2s, 4s, 8s... Adding jitter adds random(0, wait) to prevent synchronized retries. Full formula: `wait = min(cap, base * 2^n + random(0, base))`

**Why it matters:**
Without jitter, all clients retry at identical times → thundering herd → more 429s. Jitter spreads load.

**Resource:**
Search "exponential backoff with jitter algorithm" — AWS has good docs on this

**Self-test question:**
Can I implement jitter in 3 lines of TypeScript?

---

### 5. PostgreSQL ON CONFLICT

**Plain-English explanation:**
`INSERT ... ON CONFLICT (column) DO UPDATE SET col = EXCLUDED.col` — if unique constraint violated, update instead. EXCLUDED refers to values attempted in INSERT.

**Why it matters:**
Scrapers run repeatedly. Without upsert, you get duplicate records or must delete-first. Upsert handles re-scraping cleanly.

**Resource:**
PostgreSQL upsert docs: https://www.postgresql.org/docs/current/sql-insert.html

**Self-test question:**
Can I write an upsert that updates all columns except the primary key?

---

### 6. TypeScript Interfaces for Scraped Data

**Plain-English explanation:**
Define shape before parsing: `interface Book { title: string; price: number; }`. Compiler catches missing fields at build time, not runtime.

**Why it matters:**
Scraper debugging is hard. TypeScript catches "this field is missing" at compile time. Without types, you find bugs in production.

**Resource:**
TypeScript interfaces: https://www.typescriptlang.org/docs/handbook/interfaces.html

**Self-test question:**
Can I make an interface with optional fields using `?` (e.g., `availability?: string`)?

---

### 7. robots.txt

**Plain-English explanation:**
File at domain root (books.toscrape.com/robots.txt) specifies which paths crawlers may access. Disallow means "don't crawl this." It's a request protocol, not enforcement.

**Why it matters:**
Ethical scraping checks robots.txt first. Legally, aggressive scraping can exceed authorized access. Checking robots.txt is your baseline.

**Resource:**
robots.txt spec: https://www.robotstxt.org/robotstxt.html

**Self-test question:**
Can I fetch and parse robots.txt to programmatically check if a path is allowed?

---

### 8. HTTP Headers That Matter

**Plain-English explanation:**
- User-Agent: Identifies client (e.g., "Mozilla/5.0...")
- Accept: Tells server what response format (text/html)
- Accept-Language: Preferred languages
- Referer: What page user came from (commonly checked)

**Why it matters:**
Servers check headers to identify scrapers. Missing/wrong headers = 403. Setting them realistically avoids detection.

**Resource:**
MDN HTTP Headers: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers

**Self-test question:**
Can I set all four headers in an Axios config object?

---

## SECTION 5: Debugging Playbook

### 1. Cheerio Returns Empty Arrays — Selectors Not Matching

**Symptom:** `console.log(books)` shows `[]` after parsing.

**Most likely cause:** Selector doesn't match any elements on the page. HTML structure differs from expectation.

**Diagnostic step:**
1. Save raw HTML to file: `fs.writeFileSync('debug.html', response.data)`
2. Open debug.html in browser
3. Use DevTools to verify element exists and has expected structure

**Where to look:** Compare what DevTools shows (Inspect → Copy selector) vs. what your code uses.

---

### 2. Axios Throws Timeout or ECONNREFUSED

**Symptom:** `Error: timeout of 10000ms exceeded` or `ECONNREFUSED`.

**Most likely cause:** Network issue, site down, or firewall blocking.

**Diagnostic step:**
1. Test with curl: `curl -v https://books.toscrape.com`
2. If curl works, compare headers to your Axios request

**Where to look:** Axios timeout config, network/firewall.

---

### 3. Getting 403 Forbidden

**Symptom:** Response status is 403.

**Most likely cause:** User-Agent flagged as automated or IP blocked.

**Diagnostic step:**
1. Check your User-Agent header - should look like a real browser
2. Test with curl -A "Mozilla/5.0..." to verify

**Where to look:** Axios headers config. Change User-Agent to Chrome on Windows.

---

### 4. Getting 429 Too Many Requests

**Symptom:** Response status is 429.

**Most likely cause:** Rate limiting triggered from too many requests too fast.

**Diagnostic step:**
1. Increase delay between requests
2. Add jitter to delay
3. Consider adding proxy

**Where to look:** Your delay function. Increase minimum delay to 2000ms.

---

### 5. PostgreSQL Upsert Throws Unique Constraint Unexpectedly

**Symptom:** `unique constraint violation` error.

**Most likely cause:** UNIQUE constraint on wrong column, or missing conflict column in ON CONFLICT clause.

**Diagnostic step:**
1. Check constraint: `\d listings` in psql
2. Verify ON CONFLICT matches the constraint column

**Where to look:** Table schema and upsert SQL.

---

### 6. Pagination Loop Runs Forever or Stops Too Early

**Symptom:** Infinite loop or missing pages.

**Most likely cause:** Incorrect "next page" detection logic.

**Diagnostic step:**
1. Log current page URL and next button presence
2. Check page 1, page 2, last page URL patterns

**Where to look:** Pagination logic in your main loop.

---

### 7. Scraped Data Looks Correct in Console but DB Rows Missing

**Symptom:** Books log to console, but `SELECT COUNT(*)` shows 0.

**Most likely cause:** Insert wrapped in transaction that never committed, or error swallowed.

**Diagnostic step:**
1. Add logging after every insert
2. Check for silent errors in catch blocks

**Where to look:** Storage function error handling.

---

### Diagnostic Workflow: Dumping Raw HTML

```bash
# 1. In your fetch function, add:
import fs from 'fs';
fs.writeFileSync('./data/debug.html', response.data);

// 2. Run your scraper once
npx ts-node src/fetch.ts

// 3. Open data/debug.html in browser
# In terminal: open ./data/debug.html (macOS) or start ./data/debug.html (Windows)

// 4. Right-click element → Inspect → Right-click HTML → Copy → Copy selector

// 5. Use that selector in your parse code
```

This workflow is your best friend. Never guess at selectors — verify in browser DevTools.

---

## SECTION 6: The Broader Scraping Landscape

### Why books.toscrape.com is Deliberately Easy

This site exists to teach scraping. It has:
- Static HTML with all data in the page
- Clean, consistent CSS classes
- Predictable pagination (/page-1.html, /page-2.html)
- No JavaScript rendering
- No rate limiting
- No bot detection

**What breaks on a real target site (ordered by difficulty):**

1. **JavaScript rendering** — Data loads via JavaScript/AJAX after page load. Static fetcher gets empty HTML. Solutions: Find API endpoint, or use Playwright.

2. **CAPTCHA** — Challenges that only humans can solve. Solutions: Solve service (2Captcha), interact organically, or use residential proxy.

3. **Login/auth** — Data behind authentication. Solutions: Obtain sessions, cookies, or credentials.

4. **Anti-bot fingerprinting** — TLS/header detection flags automation. Solutions: Undici/fpcollection for TLS fingerprint, realistic headers, residential proxy.

5. **Behavioral analysis** — Mouse movements, scroll patterns, timing. Solutions: Slow down, add human-like delays.

6. **IP blocking** — Too many requests from one IP. Solutions: Rotate proxies.

### The Escalation Ladder

```
Level 1: Static + Axios + Cheerio     → Easy sites (books.toscrape)
Level 2: Headless browser (Playwright) → JS-rendered (SERP)
Level 3: Proxy rotation              → Rate-limited sites
Level 4: Managed unblocking API      → Aggressively protected
```

**Technical and business reason to move up each step:**
- Cost: Level 1 costs nothing ($0), Level 4 costs per-request ($/1000)
- Speed: Levels 1-2 run fast locally, Level 4 has API overhead
- Reliability: Higher levels handle more of the blocking problem

### What a Residential Proxy Is

A residential proxy uses IP addresses assigned to real consumer devices (home WiFi, mobile networks). They appear as genuine users because they're tied to real ISPs. Datacenter proxies come from cloud servers (AWS, DigitalOcean) — easy to detect and block.

Massive's core product provides residential proxies — harder to detect, more expensive, but necessary for difficult targets. Understanding this signals you know the difference between datacenter and residential.

### What Selector Drift Is

Sites change their HTML structure to break scrapers. A class changes from `.product-title` to `.product-name`, your scraper returns 0 results, but no error is thrown. Silent failure.

Production scrapers detect drift by:
- Alerting on unexpected drop in records
- Versioning selectors in config
- Running canonical set of pages and comparing

### First Questions a Massive Support Engineer Would Ask

When a customer reports "my scraper stopped working overnight":
1. "What does the response status code show now?"
2. "Are you seeing any error messages in the logs?"
3. "Has the target site's HTML structure changed?"
4. "What proxy are you using, and has that IP been flagged?"
5. "Can you show me the raw response you're getting?"

These questions systematically isolate the problem. Good candidates know to ask these.

### Interview-Critical Reading

- **Proxyway** — Residential proxies explained: https://proxyway.com/guides/
- **Apify Blog** — Scraping at scale: https://blog.apify.com/
- **ZenRows** — Anti-bot handbook: https://www.zenrows.com/blog/

Read one of these alongside building to build the context professionals carry.

---

## SECTION 7: Stretch Goals

### 1. Structured Logging ( Pino)

**What it adds:** JSON-structured logging with levels (info, warn, error), timestamps, request IDs.

**Why it signals maturity:** Production systems need structured logs for searching, filtering, alerting. `console.log()` doesn't scale.

**Resource:** Pino docs — https://getpino.io/#/

---

### 2. scrape_runs Tracking Table

**What it adds:** Records metadata about each run (pages_scraped, records_inserted, duration, errors).

**Why it signals maturity:** You can answer "how many records did we get yesterday?" and "did we scrape successfully?" — monitoring basics.

**Read first:** Your Phase 7 schema — expand with duration calculation.

---

### 3. Retry Middleware with Exponential Backoff

**What it adds:** Reusable wrapper function that retries failed requests with configurable backoff.

**Why it signals maturity:** Copy-pasting retry logic into every function is junior. Abstracting it is professional.

**Resource:** npm search "axios-retry" or write your own using interceptors.

---

### 4. Config-Driven Selectors

**What it adds:** Selectors loaded from JSON config rather than hard-coded. Change target site by editing config.

**Why it signals maturity:** The same codebase with different config files targets different sites. Shows architectural thinking.

**Read first:** Separate selectors into `config/books-toscrape.json` and load with `fs.readFileSync`.

---

### 5. Playwright for One Route

**What it adds:** One route uses Playwright instead of Axios to handle JS-rendered content.

**Why it signals maturity:** You know the escalation ladder and can choose the right tool per-route, not project-wide.

**Resource:** Playwright docs — https://playwright.dev/

---

## SECTION 8: README Outline

```
# Book Listings Scraper

## Project Overview
(2-3 sentences: what it scrapes, what it outputs, tech stack)

## What I Learned
(4-5 bullet points: biggest insights during build)

## Technical Decisions
(Why Axios, why Cheerio, why pg — 2 sentences each)

## If I Were To Scale This
(3-4 bullet points: what changes for production)

## Setup

## Usage

## Sample Output
```

**What each section signals:**
- **Project Overview** — Clear thinking
- **What I Learned** — Self-aware engineer whoreflects
- **Technical Decisions** — Can justify choices (interview-critical)
- **If I Were To Scale This** — Thinks beyond MVP

---

## Final Notes

You have the stack. You have the target. The key is inspecting HTML in DevTools BEFORE writing code.

Build in phases. Verify each phase works. Don't wire everything together until each piece is tested individually.

Tonight: Phase 1 + Phase 2. Get HTML in console. That's tonight's win.
