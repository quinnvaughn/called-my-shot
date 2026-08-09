import { defineConfig, defineRecipe } from "@pandacss/dev";

export default defineConfig({
  // Whether to use css reset
  preflight: true,

  // Where to look for your css declarations
  include: ["./src/**/*.{js,jsx,ts,tsx}", "./pages/**/*.{js,jsx,ts,tsx}"],

  // Files to exclude
  exclude: [],

  // Generate JSX components (HStack, VStack, Box, Flex, Grid, etc.) alongside the style-prop functions
  jsxFramework: "react",

  // Vite's resolver expects .js for extensionless imports like "#styled-system/css"
  outExtension: "js",

  // Useful for theme customization
  theme: {
    extend: {
      tokens: {
        fonts: {
          // Shortcuts for the two display fonts loaded in __root.tsx alongside the
          // system sans stack — reference via fontFamily: "heading" / "mono".
          heading: { value: "'Archivo Black', sans-serif" }, // headings (see landing.html mockups)
          mono: { value: "'Space Mono', monospace" }, // eyebrows, labels, numeric/stat callouts
        },
        colors: {
          // Brand palette — raw values, named the way the product already names them
          // (see the prototype HTML: landing.html / feed.html / create-question.html).
          ink: { value: "#0B0B0C" }, // app background, deepest layer
          card: { value: "#151513" }, // primary surface: cards, panels, inputs, nav rail
          cardMuted: { value: "#1B1B18" }, // nested/inset surface: selected rows, tab tracks, dropdowns
          border: { value: "#2A2A28" }, // default hairline border
          track: { value: "#3E3E3A" }, // was --bar in the mockups — declared but not yet used anywhere; reserved for progress-track backgrounds
          bone: { value: "#F5F1E8" }, // primary text
          linen: { value: "#D8D4C9" }, // softer body-copy tone (hero subhead, info-card paragraphs) — hardcoded inline in the mockups, never promoted to a var there
          dim: { value: "#8A8A84" }, // secondary/meta text
          steel: { value: "#6B6B66" }, // tertiary text, placeholders, inactive icons
          signal: { value: "#FF5A1F" }, // brand accent — CTAs, active/selected state, focus ring
          signalMuted: { value: "#3A1E12" }, // opaque accent-tinted background for badges/chips (not the same as signal at low alpha)
          verified: { value: "#34D399" }, // success / correct-call / positive value
          loss: { value: "#E24B4A" }, // error / wrong-call / negative value
          overlay: { value: "#060607" }, // modal scrim base color (used as rgba, e.g. overlay/70)
        },
      },
      keyframes: {
        spin: {
          to: { transform: "rotate(360deg)" },
        },
      },
      semanticTokens: {
        colors: {
          // Purpose-based aliases — components should reference these, not the raw palette above.
          bg: {
            canvas: { value: "{colors.ink}" },
            surface: { value: "{colors.card}" },
            subtle: { value: "{colors.cardMuted}" },
            overlay: { value: "{colors.overlay}" },
          },
          border: {
            default: { value: "{colors.border}" },
            emphasized: { value: "{colors.track}" },
          },
          fg: {
            default: { value: "{colors.bone}" },
            body: { value: "{colors.linen}" },
            muted: { value: "{colors.dim}" },
            subtle: { value: "{colors.steel}" },
          },
          // Brand hierarchy — primary/secondary reflect identity (CTAs, active state, emphasis),
          // independent of the status tokens below even where they share a raw color today.
          primary: {
            default: { value: "{colors.signal}" },
            subtle: { value: "{colors.signalMuted}" },
            // text/icon color to place on top of a solid `primary.default` fill (e.g. primary buttons)
            contrast: { value: "{colors.ink}" },
          },
          secondary: {
            default: { value: "{colors.verified}" },
            contrast: { value: "{colors.ink}" },
          },
          // Status feedback — reused today (secondary === success), but kept as separate
          // tokens so status meaning can diverge from brand color without a rename later.
          success: {
            default: { value: "{colors.verified}" },
          },
          danger: {
            default: { value: "{colors.loss}" },
          },
        },
      },
      recipes: {
        // Also exported as a plain fn (`button()` from #styled-system/recipes) for
        // styling non-<button> elements — e.g. a Link that should look like a button.
        button: defineRecipe({
          className: "button",
          base: {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "2",
            fontFamily: "inherit",
            cursor: "pointer",
            transition: "opacity 0.15s ease, color 0.15s ease",
            _disabled: {
              cursor: "default",
              opacity: 0.6,
            },
            _focusVisible: {
              outline: "2px solid {colors.primary.default}",
              outlineOffset: "2px",
            },
          },
          variants: {
            variant: {
              solid: {
                bg: "primary.default",
                color: "primary.contrast",
                fontWeight: "bold",
                borderRadius: "lg",
                paddingBlock: "2.5",
                paddingInline: "4.5",
                _hover: { opacity: 0.88 },
              },
              ghost: {
                bg: "transparent",
                color: "fg.default",
                fontWeight: "medium",
                _hover: { color: "fg.muted" },
              },
            },
            size: {
              sm: {
                fontSize: "sm",
              },
              lg: {
                fontSize: "md",
                letterSpacing: "wide",
                fontFamily: "heading",
                textTransform: "uppercase",
              },
            },
            fullWidth: {
              true: { width: "full" },
            },
          },
          compoundVariants: [
            {
              variant: "solid",
              size: "lg",
              css: {
                paddingBlock: "4",
                paddingInline: "7",
                borderRadius: "xl",
              },
            },
          ],
          defaultVariants: {
            variant: "solid",
            size: "sm",
          },
        }),
      },
    },
  },

  // The output directory for your css system
  outdir: "styled-system",
});
