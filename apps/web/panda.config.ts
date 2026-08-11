import {
  defineConfig,
  defineRecipe,
  defineSlotRecipe,
} from "@pandacss/dev";

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

  // dropdown's `placement` prop only ever reaches the recipe call through a
  // variable (account-menu.tsx passes it via a ternary, not a literal), so
  // Panda's static scanner can't discover the "top" variant on its own —
  // force both here or its CSS silently never gets generated.
  staticCss: {
    recipes: {
      dropdown: [{ placement: ["top", "bottom"] }],
    },
  },

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
          // so the scale is shifted down a notch to make room for both sizes
          // (default xs stays 12px, unchanged).
          "3xs": { value: "0.625rem" }, // 10px
          "2xs": { value: "0.6875rem" }, // 11px
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
      slotRecipes: {
        // Registered (rather than built via runtime `sva()`) so its base styles land
        // in the `recipes` cascade layer, which always loses to `utilities` — letting
        // a consumer's `css({ padding: ... })` override reliably beat e.g. the
        // trigger's `padding: "0"` reset regardless of atomic-class extraction order.
        textInput: defineSlotRecipe({
          className: "text-input",
          slots: [
            "root",
            "label",
            "group",
            "field",
            "icon",
            "iconButton",
            "description",
            "error",
          ],
          base: {
            root: {
              display: "flex",
              flexDirection: "column",
              gap: "1.5",
            },
            label: {
              display: "block",
              fontFamily: "mono",
              fontSize: "2xs",
              letterSpacing: "wide",
              color: "fg.subtle",
              textTransform: "uppercase",
            },
            group: {
              display: "flex",
              alignItems: "center",
              gap: "2",
              width: "full",
              backgroundColor: "bg.canvas",
              border: "1px solid",
              borderColor: "border.default",
              borderRadius: "lg",
              paddingInline: "3.5",
              transition: "border-color 0.15s ease",
              _focusWithin: {
                borderColor: "primary.default",
              },
            },
            field: {
              flex: "1",
              minWidth: "0",
              width: "full",
              backgroundColor: "transparent",
              border: "none",
              outline: "none",
              color: "fg.default",
              fontFamily: "inherit",
              fontSize: "sm",
              paddingBlock: "3",
              _placeholder: {
                color: "fg.subtle",
              },
            },
            icon: {
              flexShrink: "0",
              display: "flex",
              alignItems: "center",
              color: "fg.subtle",
            },
            iconButton: {
              flexShrink: "0",
              display: "flex",
              alignItems: "center",
              background: "none",
              border: "none",
              padding: "0",
              cursor: "pointer",
              color: "fg.subtle",
              _hover: {
                color: "fg.default",
              },
            },
            description: {
              fontSize: "xs",
              color: "fg.muted",
            },
            error: {
              fontSize: "xs",
              color: "danger.default",
            },
          },
          variants: {
            error: {
              true: {
                group: {
                  borderColor: "danger.default",
                },
              },
            },
          },
        }),
        dropdown: defineSlotRecipe({
          className: "dropdown",
          slots: ["root", "trigger", "content", "item"],
          base: {
            root: {
              position: "relative",
            },
            trigger: {
              background: "none",
              border: "none",
              padding: "0",
              margin: "0",
              font: "inherit",
              color: "inherit",
              cursor: "pointer",
            },
            content: {
              display: "flex",
              flexDirection: "column",
              position: "absolute",
              right: "0",
              minWidth: "44",
              gap: "0.5",
              backgroundColor: "bg.surface",
              border: "1px solid",
              borderColor: "border.default",
              borderRadius: "xl",
              padding: "1.5",
              boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
              zIndex: "30",
            },
            item: {
              width: "full",
              textAlign: "left",
              fontSize: "sm",
              color: "fg.default",
              borderRadius: "md",
              paddingBlock: "2.5",
              paddingInline: "3",
              cursor: "pointer",
              transition: "background-color 0.15s ease, opacity 0.15s ease",
              _hover: {
                backgroundColor: "fg.default/10",
              },
            },
          },
          variants: {
            variant: {
              default: {},
              primary: {
                item: {
                  color: "primary.default",
                  fontWeight: "bold",
                },
              },
            },
            placement: {
              bottom: {
                content: {
                  top: "calc(100% + 8px)",
                  bottom: "auto",
                },
              },
              top: {
                content: {
                  top: "auto",
                  bottom: "calc(100% + 8px)",
                },
              },
            },
          },
          defaultVariants: {
            variant: "default",
            placement: "bottom",
          },
        }),
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
            whiteSpace: 'nowrap',
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
            // Text treatment (font family, case, weight) is a property of the *variant*,
            // not the size — every mockup CTA (primary-btn, join-btn, modal-submit,
            // invite-join-btn) is uppercase Archivo Black regardless of how big it is,
            // and outline buttons (secondary-btn, confirm-cancel) are uppercase Space
            // Mono regardless of size too. Only ghost stays sentence-case Inter. `size`
            // below is purely a padding/font-size scale — keeping the two axes separate
            // means picking a size never silently opts a button in or out of caps.
            variant: {
              solid: {
                bg: "primary.default",
                color: "primary.contrast",
                fontFamily: "heading",
                textTransform: "uppercase",
                letterSpacing: "wide",
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
              // Same shape as ghost, but reserves a transparent border so a border
              // can fade in on hover without shifting layout. Mono + uppercase to
              // match the mockups' secondary-btn / confirm-cancel treatment.
              outline: {
                bg: "transparent",
                color: "fg.default",
                fontFamily: "mono",
                textTransform: "uppercase",
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
              // Same treatment as solid, but bone-on-ink instead of signal-on-ink
              // (see join-btn in the groups.html mockup).
              white: {
                bg: "bone",
                color: "ink",
                fontFamily: "heading",
                textTransform: "uppercase",
                letterSpacing: "wide",
                borderRadius: "lg",
                _hover: { opacity: 0.88 },
                _disabled: { _hover: { opacity: 0.6 } },
              },
            },
            size: {
              sm: {
                fontSize: "xs",
                paddingBlock: "2.5",
                paddingInline: "4.5",
              },
              // Same font-size as lg, just tighter padding — a modal submit is
              // meant to feel smaller than the landing hero's CTA.
              md: {
                fontSize: "sm",
                paddingBlock: "3",
                paddingInline: "5",
              },
              lg: {
                fontSize: "md",
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
              variant: ["solid", "outline", "white"],
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
