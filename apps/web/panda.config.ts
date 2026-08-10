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
          // Loaded in __root.tsx — reference via fontFamily: "body" / "heading" / "mono".
          body: { value: "'Inter', sans-serif" }, // default — applied globally in styles.css
          heading: { value: "'Archivo Black', sans-serif" }, // headings (see landing.html mockups)
          mono: { value: "'Space Mono', monospace" }, // eyebrows, labels, numeric/stat callouts
        },
        fontSizes: {
          // Panda's default 2xs (0.5rem / 8px) is illegible in practice — the
          // mockups' smallest real text (labels, fineprint) sits around 10-11px,
          // so bump it there instead of leaving an unused 8px step in the scale.
          "2xs": { value: "0.625rem" }, // 10px
        },
        colors: {
          // Brand palette — raw values, named the way the product already names them
          // (see the prototype HTML: landing.html / feed.html / create-question.html).
          ink: { value: "#0B0B0C" }, // app background, deepest layer
          card: { value: "#151513" }, // primary surface: cards, panels, inputs, nav rail
          cardMuted: { value: "#1B1B18" }, // nested/inset surface: selected rows, tab tracks, dropdowns
          border: { value: "#3D3D38" }, // default hairline border — lightened from #2A2A28, which barely showed up against card/cardMuted at 1px
          track: { value: "#52524A" }, // emphasized border (see Tabs); also reserved for progress-track backgrounds — lightened from #3E3E3A to stay a clear step above border above
          bone: { value: "#F5F1E8" }, // primary text
          linen: { value: "#D8D4C9" }, // softer body-copy tone (hero subhead, info-card paragraphs) — hardcoded inline in the mockups, never promoted to a var there
          dim: { value: "#9E9E95" }, // secondary/meta text — lightened from #8A8A84 to keep a clear step above steel below
          steel: { value: "#8C8C85" }, // tertiary text, placeholders, inactive icons — lightened again from #787873, still too close to illegible
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
              cursor: "not-allowed",
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
                _hover: { opacity: 0.88 },
                _disabled: { _hover: { opacity: 0.6 } },
              },
              ghost: {
                bg: "transparent",
                color: "fg.default",
                fontWeight: "medium",
                _hover: { color: "fg.muted" },
                _disabled: { _hover: { color: "fg.default" } },
              },
              // Same as ghost, but reserves a transparent border so a border
              // can fade in on hover without shifting layout.
              outline: {
                bg: "transparent",
                color: "fg.default",
                fontWeight: "medium",
                borderRadius: "lg",
                border: "1px solid transparent",
                _hover: {
                  color: "fg.muted",
                  borderColor: "border.default",
                },
                _disabled: {
                  _hover: { color: "fg.default", borderColor: "transparent" },
                },
              },
            },
            size: {
              sm: {
                fontSize: "sm",
                paddingBlock: "2.5",
                paddingInline: "4.5",
              },
              // Same treatment as lg, just tighter padding — the hero CTA is
              // meant to feel bigger than a modal's submit button.
              md: {
                fontSize: "md",
                letterSpacing: "wide",
                fontFamily: "heading",
                textTransform: "uppercase",
                paddingBlock: "3",
                paddingInline: "5",
              },
              lg: {
                fontSize: "md",
                letterSpacing: "wide",
                fontFamily: "heading",
                textTransform: "uppercase",
                paddingBlock: "4",
                paddingInline: "7",
              },
            },
            fullWidth: {
              true: { width: "full" },
            },
          },
          compoundVariants: [
            {
              variant: ["solid", "outline"],
              size: "lg",
              css: {
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
