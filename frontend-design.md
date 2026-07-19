# Frontend Design System

## Core Philosophy: Minimalism & Clarity
The frontend architecture relies on a minimalistic aesthetic, emphasizing content, telemetry data clarity, and raw developer observability over excessive decorative elements. 

## Branding Colors

Our palette is highly restricted to maintain a stark, functional interface:

- **Background (Primary):** `#f3f1ea` - A soft, warm off-white that reduces eye strain compared to pure white.
- **Background (Inverted/Console):** `#111111` or `#09090b` - Pure dark background for telemetry traces and code blocks to create extreme contrast.
- **Text (Primary):** `#111111` - Used for primary headings and body copy on light backgrounds.
- **Text (Secondary):** `#111111` with varying opacities (`/60`, `/45`, etc.) for metadata, subtitles, and less important information.
- **Accent (Primary):** `#d7ff73` (Lime Green) - The primary call-to-action and highlight color.
- **Accent (Secondary):** `#9bca24` (Darker Lime) - Used for hover states, active pulses, and secondary highlights.

## Typography
- **Headings:** Bold, tightly tracked (`tracking-tight`), and high-impact. Use `font-sans` with `clamp()` for responsive fluid sizing on marketing pages.
- **Telemetry & Data:** Always use `font-mono` with small sizes (`text-[10px]` or `text-xs`) to emulate a terminal/console environment. Use uppercase for labels.

## Component Guidelines

### Borders & Dividers
- Use subtle borders (`border-black/10` or `border-white/10`) to delineate sections without cluttering the UI. 
- Avoid heavy drop shadows; use clean, crisp 1px borders and slight glassmorphism (`backdrop-blur-sm`, `bg-white/50`) to create depth.

### Interactive Elements
- **Buttons:** Solid backgrounds for primary actions (`bg-[#d7ff73] text-black`), and transparent/white backgrounds with subtle borders for secondary actions. Always include `transition-all` or `transition-colors` for smooth interaction.
- **Hover States:** Slight background shifts or border darkening (`hover:bg-[#c8ef68]`, `hover:border-black/20`).
- **Telemetry Logs:** Clickable log items should have a clear active state (e.g., inverted colors: `bg-[#111] text-white`).

### Animations & Visuals
- Use animations sparingly. Reserve them for status indicators (e.g., `animate-pulse` on a green dot to show pipeline activity) or data visualization (e.g., the `DitherSink` particle canvas).
- Visualizers should feel raw and technical (wireframes, pixelated grids, dithered shaders) rather than polished and glossy.
