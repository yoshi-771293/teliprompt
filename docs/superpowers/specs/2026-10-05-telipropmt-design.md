# Telipropmt — Design

Simple teleprompter web app. Static site (HTML/CSS/JS, no build), deployed to Vercel.

## Screens
- **Editor:** textarea for script, saved-scripts list (localStorage: save/load/delete), settings, Start button.
- **Prompter:** full-screen scrolling text. Fixed highlight band at vertical center; line in band is bright and slightly scaled; other lines fade (opacity + blur) with distance. Control bar auto-hides while playing.

## Scrolling
- `requestAnimationFrame`, pixels/sec derived from WPM (words per line measured from rendered text → px/sec = WPM/60 × avg px per word).
- Active line = line whose center is nearest the band, recomputed each frame.
- Pause keeps position; manual scroll/line nudge supported.

## Controls
Space play/pause · ↑/↓ speed · ←/→ (and PageUp/PageDown) prev/next line · +/− font size · M mirror · T theme · Esc back to editor.
Settings persisted: WPM, font size, mirror, theme, countdown (off/3s/5s).

## Countdown
Large 3-2-1 overlay before scrolling begins.

## Theme
Dark/light via CSS variables; follows system by default, manual toggle.

## Out of scope (v1)
Voice following, word-by-word highlight, second-device remote.

## Files
`index.html`, `style.css`, `app.js`. Deploy: GitHub → Vercel preview first; main only on request.
