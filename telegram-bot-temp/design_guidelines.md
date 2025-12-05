# Design Guidelines: Binary Signals Bot Status Dashboard

## Design Approach

**Selected Approach**: Reference-based drawing from TradingView's data density, Stripe Dashboard's clarity, and Linear's dark UI aesthetics.

**Core Principles**:
- **Glanceable Metrics**: All critical stats visible without scrolling
- **Real-time Confidence**: Live status indicators that build trust
- **Professional Restraint**: Fintech-grade polish without unnecessary decoration
- **Dark-First**: Optimized for extended monitoring sessions

## Typography System

**Font Stack**: Inter (primary), JetBrains Mono (metrics/timestamps)

**Hierarchy**:
- Page Title: 32px, semibold, tracking tight
- Section Headers: 20px, medium
- Metric Values: 48px bold (primary stats), 24px medium (secondary)
- Labels: 14px, medium, reduced opacity
- Timestamps: 12px monospace, muted
- Footer Credits: 11px, regular "Made by Kaif"

## Layout System

**Spacing Primitives**: Tailwind units 4, 6, 8, 12 (p-4, gap-6, mb-8, py-12)

**Grid Structure**:
- Container: max-w-7xl, centered
- Dashboard Grid: 3-column on desktop (grid-cols-3), 1-column mobile
- Stat Cards: 2-column nested grids within larger cards
- Vertical Rhythm: py-8 between major sections, gap-6 for card grids

## Component Library

### Dashboard Layout Structure

**Header Bar** (sticky):
- Logo/Title left, "Made by Kaif" signature right
- Live status indicator with pulse animation
- Minimal height (h-16), subtle bottom border

**Hero Stats Section**:
- 3-card grid showcasing primary metrics
- Large metric value + label + trend indicator
- Cards: rounded-xl, subtle border, glass-morphism effect
- Icons: Use Heroicons (chart-bar, signal, clock variants)

**Volatility Monitor Panel**:
- Full-width card with inner 2-column layout
- Left: Current volatility gauge (large circular progress indicator)
- Right: 24-hour volatility timeline (horizontal bar chart visualization)
- Traffic light color indicators (green/yellow/red zones)
- Real-time timestamp at bottom

**Bot Activity Grid**:
- 2-column layout (3-column on xl screens)
- Cards showing: Total Signals Today, Success Rate, Active Users, Uptime %
- Each card: Icon top-left, metric center, comparison badge bottom-right
- Consistent card padding (p-6)

**Signal History Table**:
- Minimal table design with alternating row transparency
- Columns: Timestamp (monospace), Asset, Direction (with arrow icons), Status (badge)
- Max 10 recent signals, "View All" link at bottom
- Sticky header on scroll

### Card Components

**Metric Card**:
- Rounded corners (rounded-xl)
- Padding: p-6
- Icon: w-10 h-10, teal/green accent
- Metric: Large bold number
- Label: Muted text below
- Optional: Small trend badge ("+12% today")

**Status Badge**:
- Pill shape (rounded-full)
- Small padding (px-3 py-1)
- Dot indicator left of text
- Variants: Active (green), Warning (yellow), Error (red), Neutral (gray)

**Volatility Gauge**:
- Circular progress ring (stroke-based SVG or chart library)
- Center: Large percentage value
- Surrounding text: "Current Volatility"
- Color segments based on percentage ranges

### Navigation & Actions

**No traditional navigation needed** - single-page dashboard

**Action Buttons** (if needed):
- Minimal ghost buttons (border-only)
- Full buttons only for primary actions
- Icons from Heroicons (refresh-icon for manual update)

## Images

**No hero image needed** - This is a data dashboard, not a marketing page. Lead with metrics immediately.

**Icon Usage**:
- Status icons via Heroicons CDN
- Trading direction: Use arrow-up, arrow-down icons
- Volatility: Use chart-bar, signal icons
- System status: Use status-online, exclamation-triangle

## Animation Guidelines

**Minimal, purposeful only**:
- Live status pulse (subtle, 2s interval)
- Metric value count-up on load (numbers increment smoothly)
- Skeleton loaders for data fetch states
- No scroll animations, no background effects

## Data Visualization Approach

**Volatility Timeline**: Horizontal segmented bar showing last 24 hours, color-coded by volatility level (green/yellow/red segments)

**Success Rate**: Simple percentage with optional small sparkline chart beneath

**Use Chart.js or similar lightweight library** for any dynamic charts - keep styling minimal with clean gridlines

## Layout Specifications

**Desktop** (lg:):
- 3-column main grid
- 2-column nested layouts within cards
- Full table width

**Tablet** (md:):
- 2-column main grid
- Stack nested layouts to 1-column

**Mobile** (base):
- Single column throughout
- Maintain card hierarchy
- Sticky header remains

**Footer**:
- Minimal, centered
- "Made by Kaif" in small muted text
- Optional: Last updated timestamp
- Padding: py-6

## Critical Design Notes

- **No background patterns** - solid dark background only
- **Subtle borders** on cards for definition without distraction
- **Consistent card elevation** - avoid varying shadow depths
- **Monospace for all numerical data** - timestamps, percentages, prices
- **Live indicators** - small pulsing dot for "Bot Active" status
- **Glass-morphism cards** - subtle backdrop blur effect on card backgrounds for depth

**Quality Mandate**: Every metric must be instantly readable from 2 feet away. Dense information presented with generous breathing room through strategic spacing, not cramped layouts.