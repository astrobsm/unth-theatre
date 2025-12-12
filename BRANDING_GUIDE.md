# Theatre Manager - Branding & Design Guide

## Color Palette

The Theatre Manager application uses a professional medical/healthcare color scheme that conveys trust, cleanliness, and professionalism.

### Primary Colors (Teal/Green)
Represents health, healing, and medical care.

```
primary-50:  #e6f7f5  (Lightest - backgrounds)
primary-100: #c2ebe5
primary-200: #9ddfd5
primary-300: #78d3c5
primary-400: #53c7b5
primary-500: #2eac95  (Main brand color)
primary-600: #258a77  (Buttons, headers)
primary-700: #1d6959
primary-800: #14473b  (Sidebar dark)
primary-900: #0c261e  (Darkest - sidebar)
```

### Secondary Colors (Blue)
Represents trust, stability, and professionalism.

```
secondary-50:  #e8f4f8
secondary-100: #c5e3ee
secondary-200: #a1d2e4
secondary-300: #7dc1da
secondary-400: #59b0d0
secondary-500: #3596b6  (Secondary brand)
secondary-600: #2a788f
secondary-700: #205a68
secondary-800: #153c41
secondary-900: #0b1e1a
```

### Accent Colors (Orange/Gold)
Represents energy, warmth, and attention.

```
accent-50:  #fff5e6
accent-100: #ffe4b8
accent-200: #ffd38a
accent-300: #ffc25c
accent-400: #ffb12e
accent-500: #ff9800  (Accent/highlights)
accent-600: #cc7a00
accent-700: #995b00
accent-800: #663d00
accent-900: #331e00
```

## Logo Placement

### Logo File Location
Place your hospital logo at: `public/logo.png`

**Recommended specifications:**
- Format: PNG with transparent background (preferred) or SVG
- Minimum width: 200px
- Aspect ratio: Maintain original proportions
- File size: < 500KB for optimal loading

### Logo Usage

#### Login/Register Pages
- Size: Large (80px height)
- Position: Centered above the title
- Background: White card with shadow

#### Dashboard Sidebar
- Size: Standard (48px height)
- Position: Top of sidebar, centered
- Background: Dark teal gradient

#### Header (Future Implementation)
- Size: Small (32px height)
- Position: Left side of header
- Background: White

## Typography

### Font Family
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 
             'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
```

### Font Sizes
- **Headings:**
  - H1: 2.25rem (36px) - Page titles
  - H2: 1.5rem (24px) - Section titles
  - H3: 1.25rem (20px) - Subsections

- **Body Text:**
  - Regular: 1rem (16px)
  - Small: 0.875rem (14px)
  - Extra small: 0.75rem (12px)

### Font Weights
- **Bold:** 700 - Main titles
- **Semibold:** 600 - Subtitles, buttons
- **Medium:** 500 - Labels
- **Regular:** 400 - Body text

## Gradients

### Primary Gradient
```css
background: linear-gradient(135deg, #2eac95 0%, #3596b6 100%);
```
**Usage:** Headers, hero sections, feature highlights

### Secondary Gradient
```css
background: linear-gradient(135deg, #3596b6 0%, #2a788f 100%);
```
**Usage:** Alternative sections, cards

### Sidebar Gradient
```css
background: linear-gradient(to bottom, #14473b 0%, #0c261e 100%);
```
**Usage:** Navigation sidebar

## Component Styles

### Cards
```css
background: white
border-radius: 0.75rem (12px)
box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1)
padding: 1.5rem (24px)
border: 1px solid #f3f4f6
```

### Buttons

#### Primary Button
```css
background: #258a77 (primary-600)
hover: #1d6959 (primary-700)
color: white
padding: 10px 20px
border-radius: 0.5rem (8px)
font-weight: 600
box-shadow: medium
```

#### Secondary Button
```css
background: #c5e3ee (secondary-100)
hover: #a1d2e4 (secondary-200)
color: #153c41 (secondary-800)
border: 1px solid #7dc1da (secondary-300)
```

### Input Fields
```css
border: 1px solid #d1d5db (gray-300)
border-radius: 0.5rem (8px)
padding: 10px 16px
focus: 2px ring primary-500
```

## Status Colors

### Success
- Background: #dcfce7 (green-100)
- Text: #166534 (green-800)
- Border: #86efac (green-300)

### Warning
- Background: #fef3c7 (yellow-100)
- Text: #92400e (yellow-800)
- Border: #fde047 (yellow-300)

### Error
- Background: #fee2e2 (red-100)
- Text: #991b1b (red-800)
- Border: #fca5a5 (red-300)

### Info
- Background: #dbeafe (blue-100)
- Text: #1e40af (blue-800)
- Border: #93c5fd (blue-300)

## Icons

### Icon Library
Lucide React - https://lucide.dev/

### Icon Sizes
- **Small:** 16px (w-4 h-4)
- **Medium:** 20px (w-5 h-5)
- **Large:** 24px (w-6 h-6)
- **Extra Large:** 32px (w-8 h-8)

### Icon Colors
- Primary actions: primary-600
- Secondary actions: secondary-600
- Destructive: red-600
- Success: green-600

## Spacing

### Padding
- **xs:** 0.5rem (8px)
- **sm:** 0.75rem (12px)
- **md:** 1rem (16px)
- **lg:** 1.5rem (24px)
- **xl:** 2rem (32px)

### Margins
- **xs:** 0.5rem (8px)
- **sm:** 0.75rem (12px)
- **md:** 1rem (16px)
- **lg:** 1.5rem (24px)
- **xl:** 2rem (32px)

## Shadows

### Light Shadow
```css
box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
```

### Medium Shadow
```css
box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
```

### Large Shadow
```css
box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
```

### Extra Large Shadow
```css
box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
```

## Animations

### Transitions
- **Default:** 200ms ease-in-out
- **Fast:** 150ms ease-in-out
- **Slow:** 300ms ease-in-out

### Hover Effects
- Scale: transform: scale(1.05)
- Shadow increase: From medium to large
- Color darkening: 1 shade darker

## Accessibility

### Contrast Ratios
All text meets WCAG AA standards:
- Normal text: 4.5:1 minimum
- Large text: 3:1 minimum
- UI components: 3:1 minimum

### Focus States
All interactive elements have visible focus indicators:
- Ring: 2px solid primary-500
- Offset: 2px

## Responsive Design

### Breakpoints
```css
sm: 640px   /* Small devices (phones) */
md: 768px   /* Medium devices (tablets) */
lg: 1024px  /* Large devices (desktops) */
xl: 1280px  /* Extra large devices */
2xl: 1536px /* 2X Extra large devices */
```

## Usage Guidelines

### Do's
✅ Use primary colors for main actions and navigation
✅ Use secondary colors for supporting elements
✅ Use accent colors sparingly for highlights
✅ Maintain consistent spacing throughout
✅ Ensure all text has sufficient contrast
✅ Use the logo consistently across all pages

### Don'ts
❌ Don't use custom colors outside the palette
❌ Don't mix different shades randomly
❌ Don't reduce logo size below minimum
❌ Don't use low-contrast color combinations
❌ Don't override font families
❌ Don't use excessive animations

## Implementation

### Adding Logo
1. Place logo file as `public/logo.png`
2. Logo will automatically appear on:
   - Login page
   - Registration page
   - Dashboard sidebar
3. Fallback: Text-only header if logo file is missing

### Using Colors in Code

**Tailwind Classes:**
```html
<!-- Primary -->
<div class="bg-primary-600 text-white">Primary Button</div>

<!-- Secondary -->
<div class="bg-secondary-100 text-secondary-800">Secondary Button</div>

<!-- Gradients -->
<div class="bg-gradient-to-r from-primary-600 to-secondary-600">Header</div>
```

**Custom CSS:**
```css
.custom-element {
  background-color: rgb(46, 172, 149); /* primary-500 */
  color: white;
}
```

---

**University of Nigeria Teaching Hospital Ituku Ozalla**  
*Theatre Manager System - Design System v1.0*
