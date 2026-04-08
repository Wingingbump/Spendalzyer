
# CLAUDE.md — AI Financial Advisor

## The Vision

We're building an AI-native personal financial advisor — one that actually knows you. Not a chatbot that regurgitates generic advice, but something that remembers your goals, watches your spending patterns, understands your life context, and connects all of it to give you guidance that feels like it came from a trusted advisor who's known you for years.

The key insight driving everything: **the gap in AI financial tools isn't model intelligence — it's context.** LLMs already know everything in a CFP curriculum. What they lack is YOU — your specific numbers, your goals, your patterns, your history. We're building the context layer that bridges that gap.

The product succeeds when a user gets a response like: *"Based on your goal of buying a house in 2 years that you mentioned last month, and your current savings rate of 6% that I can see from your transactions, you're on track to have $8,400 saved by then. A standard down payment on a median home in your area would be closer to $24,000. Here's what closing that gap actually looks like..."* — where the AI references their actual goal AND their actual numbers AND connects them. That moment is the entire product.

---

## Where We Are

Layer 1 is built: Plaid API integration pulling live transactions from Capital One, Discover, Venmo, and bank accounts. Basic categorization, storage, React dashboard, FastAPI backend, PostgreSQL via Supabase.

Everything else is ahead of us. The rough build order:

1. **Memory Layer** — the foundation. User profiles, goals, financial events, advice history, and semantic memory with pgvector. Onboarding flow to seed initial context. `store_memory()` and `retrieve_relevant_memories()` are the two most important functions in the entire codebase.
2. **Knowledge Base** — RAG pipeline so the advisor can ground responses in real financial knowledge (IRS publications, CFP fundamentals, current rate data).
3. **Reasoning + Advice** — the prompt construction layer that assembles user context + knowledge into a system prompt, calls Claude, and runs compliance checks.
4. **Action Layer** — future. Requires partnerships and permissions we don't have yet.

This ordering is intentional. Memory comes first because every layer above it depends on having rich, accurate user context. Don't skip ahead.

---

## How the Advisor Should Work

When a user sends a message, before the LLM sees anything, we need to assemble their world:

1. Embed their message and semantically search past conversation memory for relevant context
2. Pull their structured profile (life stage, income, expenses, behavioral preferences)
3. Pull their active goals
4. Pull relevant transaction history from our stored data — the time range and filters should depend on what the user is actually asking about, not a fixed window
5. Pull relevant knowledge base chunks via RAG
6. Pull advice history — what we've told them before and how they responded
7. Assemble all of this into a structured system prompt, then call Claude
8. After generating a response, extract any new memory-worthy items and store them

The system prompt has a specific structure — user identity, financial snapshot, goals, memories, knowledge, advice history, and tone guidance — and these sections should stay distinct. Each one grounds the model differently.

---

## The Data Model

The database needs to capture who the user is across multiple dimensions that evolve over time:

**User Financial Profile** — the stable identity layer. Life context (age, life stage, dependents, employment) captured at onboarding, plus a behavioral profile learned over time: risk tolerance, spending triggers, what kinds of nudges they respond to, how they prefer to communicate. This is one row per user — things that change slowly or rarely.

**Financial Snapshots** — the time-series layer. Income, expenses, debt, assets, savings rate — derived from Plaid on a regular cadence and stored as a history, not overwritten. This is what lets the advisor say "your savings rate has improved from 4% to 8% over the last three months" or spot a concerning trend before the user notices it. Without snapshot history, the advisor has no memory of where the user has been financially — only where they are right now.

**User Goals** — what they're working toward. Each goal has a type, target amount, current progress, deadline, and priority. Seeded during onboarding with their top 3, then updated as goals evolve or new ones emerge from conversation.

**Financial Events** — significant moments worth remembering. Job changes, large unexpected expenses, windfalls, debt payoffs, goal achievements. These give the advisor temporal context — not just where the user is, but what's happened to them.

**Advice History** — every piece of advice the AI gives, categorized, with how the user responded (followed, ignored, partially followed) and the measured outcome if we can track it. This is how the advisor learns what actually works for each person.

**Conversation Memory** — the core memory table. Stores text with pgvector embeddings for semantic search. Each memory is typed (goal, concern, preference, event, behavior, context), scored by importance, and tagged with its source. This is what gets searched before every LLM call — it's the beating heart of personalization.

---

## How the Advisor Should Talk

The advisor should be  **direct, specific, and actionable** . No hedging, no "consult a professional" cop-outs for straightforward questions. If someone asks "should I pay off my credit card or invest?", give them a real answer with their real numbers.

The one rule: **be honest when you don't know.** A confident wrong answer about taxes or investment returns is worse than saying "I'm not sure about that." Accuracy over confidence, always.

---

## Principles

**Be direct.** The advisor should give specific, actionable advice with real numbers. No generic platitudes, no unnecessary hedging. If someone's spending $400/month on DoorDash and wants to save for a house, say that.

**Memory is the product.** The quality of the advisor is directly proportional to the quality of memory retrieval. When choosing where to invest effort, memory accuracy wins over almost everything else.

**Context window is precious.** When building prompts, be surgical. Include what's relevant, leave out what isn't. A focused prompt with the right context produces better advice than a bloated one with everything.

**Plaid is the source of truth.** User-entered financial data should never silently override what Plaid shows. If they conflict, reconcile explicitly.

**Simple over clever.** This is a solo developer project. Readable, maintainable code beats elegant abstractions. Don't abstract until a pattern repeats. Keep the stack minimal.

**Log every LLM call.** We need to debug bad responses. At minimum: prompt tokens, completion tokens, latency, and enough context to reproduce the call.
