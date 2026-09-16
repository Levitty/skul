# Tutagora website — design scorecard

This is the rubric the marketing site is built and judged against. Two lists:
the tells that mark a page as machine-made, and the traits shared by pages that
people actually admire (the reference brief was atoms.co: one sentence, one
image, almost no chrome). Every line is a pass/fail check, not a mood.

Sources that shaped it: the "purple gradient problem" and "AI design slop"
writing from 2025–2026 (Tailwind's own author apologised for indigo-500 becoming
the default of every generated UI), plus the Awwwards-side principles of
typography-as-architecture, whitespace as a feature, and restraint.

## Part A — Tells of a generated website (each one present = fail)

Colour and surface

- A1. Purple, indigo or violet as the brand colour, or any purple→cyan gradient.
- A2. Dark mode by default with neon accents and glowing card borders.
- A3. Glassmorphism: frosted panels, blur, translucent cards.
- A4. Radial "glow" or blurred blob shapes floating behind the hero.
- A5. Shadows used to separate things instead of whitespace or a 1px rule.
- A6. Tailwind default palette values (emerald-500, indigo-500, slate-900) used as-is.

Typography

- A7. Inter (or Manrope, Poppins, Plus Jakarta) in every weight, everywhere.
- A8. One typeface doing display and body with no scale contrast.
- A9. Centred hero headline with a pill badge sitting directly above it.
- A10. Gradient text or text-shadow on headings.

Layout and structure

- A11. The canned skeleton: hero → three feature cards → logo strip → pricing → FAQ → footer.
- A12. Exactly three cards in a row, each with an icon, a heading and two lines.
- A13. A horizontal stat banner ("10K+ students · 500+ schools · 99% uptime"), especially with invented numbers.
- A14. A "1 · 2 · 3 how it works" step row.
- A15. Everything centred; no asymmetry, no left edge to read down.
- A16. Uniform border-radius on every element (rounded-xl on all the things).
- A17. Lucide/Heroicons line icons in coloured circles as decoration.

Copy

- A18. Words: seamless, empower, unlock, streamline, comprehensive, leverage, next-generation, all-in-one, elevate, supercharge, effortless.
- A19. Headlines that say nothing specific about the product or the place it is used.
- A20. Fake social proof: testimonials with stock names, made-up logos, made-up metrics.
- A21. Emoji in headings.

Motion and imagery

- A22. Bounce, float or pulse animations on hover that nobody asked for.
- A23. Fade-in-on-scroll on every element.
- A24. AI-generated or stock photography of smiling people at laptops.
- A25. Abstract 3D blobs, isometric illustrations, or "dashboard mockups" that show no real data.

## Part B — Traits of a beautiful website (each one present = pass)

- B1. One idea per screen. The hero is a sentence, not a paragraph and a form.
- B2. Typography carries the design: a display face with real character, a quiet text face, a clear scale (at least 5:1 between the biggest and smallest size on the page).
- B3. A left reading edge. Headlines and body share a grid line the eye returns to.
- B4. Whitespace is a decision. Section padding is generous and consistent (not "gap-8" by reflex).
- B5. Separation by rule and space, not by boxes. Few or no cards.
- B6. Two, at most three colours: ink, paper, one accent. The accent has a reason to exist.
- B7. Imagery shows the real thing. For a product, that means real outputs (a receipt, a report card, a message), rendered honestly.
- B8. Copy is specific: names the place, the currency, the tools people already use. Short sentences. No filler.
- B9. Numbers are tabular, aligned and true. Nothing is invented.
- B10. Motion is rare and earns its place (a hover underline, a considered transition), never ambient.
- B11. Works at phone width without a separate design: the same hierarchy, just reflowed.
- B12. Fast: self-hosted fonts, no JS needed to read the page, no image heavier than the point it makes.
- B13. Details are finished: real favicon, correct title, focus states, proper hyphenation of long words, no orphaned link.
- B14. It could not be swapped onto another company's site unchanged. The page belongs to this product.

## How to use

Build, then screenshot at 1440 and 390 wide. Walk every line. Any A-line present:
fix it or delete the element. Fewer than 12 of 14 B-lines: rework the page, not
the details.
