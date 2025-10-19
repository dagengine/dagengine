
# 00 - Quickstart

> See dag-ai turn 12 customer reviews into actionable insights in 10 seconds

## 🚀 Run It
```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY=sk-ant-xxx to .env
npm run 00
```

## 🎬 What You'll See
```
🚀 dag-ai Quickstart: Review Analysis

📊 Analyzing 12 customer reviews...

⏭️  Skipped spam: "BUY CHEAP PILLS NOW!!! CLICK..."
⏭️  Skipped spam: "⭐⭐⭐⭐⭐ AMAZING!!! www.spam-link..."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 ANALYSIS RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Filtered 2 spam reviews

🟢 PRICING
├─ Insight: Customers love the value and appreciate transparent pricing
├─ Action: Promote annual discount more prominently on pricing page
├─ Impact: medium
└─ Quote: "Best investment we made this year. ROI in first month."

🔴 SUPPORT
├─ Insight: Response time is the primary pain point causing frustration
├─ Action: Hire additional support staff or implement chat automation
├─ Impact: high
└─ Quote: "Support takes forever to respond. Waited 6 hours..."

🟢 FEATURES
├─ Insight: Feature set is strong and meets customer needs well
├─ Action: Highlight automation capabilities in marketing materials
├─ Impact: low
└─ Quote: "Amazing features! The automation saves us hours..."

🟡 UX
├─ Insight: Onboarding experience needs significant improvement
├─ Action: Create interactive tutorial and improve documentation
├─ Impact: medium
└─ Quote: "Interface is confusing. Took weeks to figure out..."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 EXECUTIVE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Overall sentiment is mixed with clear strengths in pricing and 
features but critical issues in support response times and onboarding.

🎯 Top Priorities:
   1. Reduce support response time to under 1 hour
   2. Redesign onboarding flow with interactive tutorials
   3. Promote annual discount on pricing page

💰 Estimated Impact: 20-30% reduction in churn

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ 8.3s | 💰 $0.0156 | 🎯 17% cost savings
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ What just happened?
   ✓ Filtered spam automatically (saved API calls)
   ✓ Analyzed sentiment + categories in parallel
   ✓ Grouped reviews by category
   ✓ Deep-analyzed each category
   ✓ Generated executive summary

📚 Next steps:
   → Learn structure: npm run 01
   → See dependencies: npm run 02
   → Try with your data: npm run 00 -- --help
```

## 💡 What Just Happened?

### 1. **Spam Filtering** (Cost Optimization)
```
12 reviews → 2 spam detected → Skip expensive analysis
Savings: 17% fewer API calls
```

### 2. **Parallel Processing** (Speed)
```
sentiment (10 reviews in parallel)
    +
categorize (10 reviews in parallel)
    ↓
Time: ~3 seconds (vs 6s sequential)
```

### 3. **Smart Grouping** (Transformation)
```
10 reviews → 4 categories
    ↓
Analyze 4 categories (not 10 reviews)
Savings: 60% fewer deep analysis calls
```

### 4. **Multi-Tier Models** (Cost + Quality)
```
Spam filter: Fast/cheap model (Haiku)
Deep analysis: Powerful model (Sonnet)
Smart selection saves money
```

## 🎯 Core Features Demonstrated

| Feature | What You Saw | Why It Matters |
|---------|--------------|----------------|
| **Skip Logic** | Spam filtered automatically | Save 15-40% cost |
| **Parallelization** | Sentiment + categorize together | 2x faster |
| **Transformation** | 10 reviews → 4 groups | 60% fewer calls |
| **Dependencies** | Summary waits for analysis | Automatic orchestration |
| **Multi-scope** | Per-review + cross-review | The killer feature |

## ⏭️ Next Steps

**Learn more:**
- [01 - Hello World](../legacy/01-hello-world) - Plugin structure basics
- [02 - Dependencies](../02-dependencies) - Dependency graphs
- [03 - Dual Scope](../03-dual-scope) - Section vs Global

**Try with your data:**
```bash
# Coming soon: Load your own reviews
npm run 00 -- --file=your-reviews.csv
```

## ❓ FAQ

**Q: Can I use more reviews?**  
A: Yes! Change `SAMPLE_REVIEWS` in `data.ts` or load from file.

**Q: How much would 100 reviews cost?**  
A: ~$0.15 with spam filtering, ~$0.20 without. (vs $1.50 naive approach)

**Q: Can I use OpenAI?**  
A: Yes! Change provider in `selectProvider()` method.

**Q: Is this production-ready?**  
A: This is simplified for learning. See [Production Template](../13-production-template) for deployment.