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
  //
  // Same issue for table: `sortActive`, `numeric`, and `selected` are always
  // passed through variables (isActive/canSort, numeric, active), never a
  // literal `true` at the call site, so the scanner never finds them either.
  staticCss: {
    recipes: {
      dropdown: [{ placement: ["top", "bottom"] }],
      table: [{ sortActive: ["true"] }, { numeric: ["true"] }, { selected: ["true"] }],
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
          // Brand palette — light theme. Was originally a dark palette (near-black
          // canvas, off-white text); flipped so every color choice (team colors
          // especially) is picked against a white background instead.
          paper: { value: "#FFFFFF" }, // app background, canvas (was `ink`)
          card: { value: "#FFFFFF" }, // primary surface: cards, panels, inputs, nav rail — same white as paper, separated by border/shadow
          cardMuted: { value: "#F6F6F4" }, // nested/inset surface: selected rows, tab tracks, dropdowns — kept close to neutral gray (not tan/beige) so it doesn't muddy together with the warm orange accent; barely-there against white on purpose
          border: { value: "#E5E2D9" }, // default hairline border
          track: { value: "#C9C4B5" }, // emphasized border (see Tabs); also reserved for progress-track backgrounds
          ink: { value: "#14140F" }, // primary text (was `bone`)
          linen: { value: "#4A4941" }, // softer body-copy tone (hero subhead, info-card paragraphs)
          dim: { value: "#6B6B62" }, // secondary/meta text
          steel: { value: "#767267" }, // tertiary text, placeholders, inactive icons — darkened from #96938A (only 3:1 on white), which was tuned for a dark background and read as barely-there once flipped
          signal: { value: "#C2410C" }, // brand accent — CTAs, active/selected state, focus ring; darkened from #FF5A1F to hold 4.5:1 as text on white
          signalMuted: { value: "#FCEAE0" }, // pale accent-tinted background for badges/chips (not the same as signal at low alpha)
          verified: { value: "#15803D" }, // success / correct-call / positive value; darkened from #34D399, which was ~1.9:1 on white - confirmed illegible as text, tried and reverted
          verifiedMuted: { value: "#E1F3E7" }, // pale success-tinted background for the "Called" status chip
          // The original, un-darkened mockup green - #15803D above is darkened
          // specifically so it holds contrast as *text* on white; that reason
          // doesn't apply to a filled shape (a bar, a chart segment) with no
          // text sitting on top of it, where the darker tone just reads dull.
          verifiedVibrant: { value: "#34D399" },
          loss: { value: "#C22B2A" }, // error / wrong-call / negative value; darkened from #E24B4A
          caution: { value: "#A6650E" }, // warning / disputed / under-review value; darkened from #E8A33D
          cautionMuted: { value: "#FBEEDA" }, // pale caution-tinted background for the disputed-resolution banner
          overlay: { value: "#0B0B0C" }, // modal scrim base color (used as rgba, e.g. overlay/70) — stays dark in both themes
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
            canvas: { value: "{colors.paper}" },
            surface: { value: "{colors.card}" },
            subtle: { value: "{colors.cardMuted}" },
            overlay: { value: "{colors.overlay}" },
          },
          border: {
            default: { value: "{colors.border}" },
            emphasized: { value: "{colors.track}" },
          },
          fg: {
            default: { value: "{colors.ink}" },
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
            contrast: { value: "{colors.paper}" },
          },
          secondary: {
            default: { value: "{colors.verified}" },
            contrast: { value: "{colors.paper}" },
          },
          // Status feedback — reused today (secondary === success), but kept as separate
          // tokens so status meaning can diverge from brand color without a rename later.
          success: {
            default: { value: "{colors.verified}" },
            subtle: { value: "{colors.verifiedMuted}" },
            // For filled shapes (bars, chart segments), not text - see
            // verifiedVibrant above for why this is brighter than default.
            vibrant: { value: "{colors.verifiedVibrant}" },
          },
          danger: {
            default: { value: "{colors.loss}" },
          },
          warning: {
            default: { value: "{colors.caution}" },
            subtle: { value: "{colors.cautionMuted}" },
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
        table: defineSlotRecipe({
          className: "table",
          slots: [
            "wrapper",
            "table",
            "headerCell",
            "headerLabel",
            "cell",
            "row",
            "pageButton",
            "paginationRow",
          ],
          base: {
            wrapper: {
              width: "full",
              overflowX: "auto",
            },
            table: {
              width: "full",
              minWidth: "600px",
              // Fixed layout hands column sizing to the <colgroup> below instead
              // of the browser's content-based auto algorithm — needed so a
              // column left without an explicit width (eg. "Member") stretches
              // to fill whatever space the other, explicitly-sized columns
              // don't use.
              tableLayout: "fixed",
              // `collapse` breaks border-radius/overflow:hidden clipping on a
              // <table> in most browsers - the outer border silently never
              // rendered no matter what color it was set to. `separate` +
              // zeroed spacing looks identical here since no cell defines its
              // own top/left/right border for collapse to merge in the first
              // place - only the table's own outer border was at stake.
              borderCollapse: "separate",
              borderSpacing: "0",
              fontFamily: "body",
              backgroundColor: "bg.surface",
              border: "1px solid {colors.border.emphasized}",
              borderRadius: "2xl",
              overflow: "hidden",
              // Now that the table's own bottom border actually renders (see
              // above), the last row's own borderBottom sits flush against it
              // and doubles up the line.
              "& tbody tr:last-child > td": {
                borderBottom: "none",
              },
            },
            headerCell: {
              color: "fg.subtle",
              fontFamily: "mono",
              fontSize: "xs",
              letterSpacing: "wide",
              textTransform: "uppercase",
              opacity: "0.8",
              cursor: "default",
              borderBottom: "1px solid {colors.border.default}",
              userSelect: "none",
              whiteSpace: "nowrap",
              textAlign: "left",
              padding: "3.5",
            },
            headerLabel: {
              display: "inline-flex",
              alignItems: "center",
              gap: "1",
              whiteSpace: "nowrap",
            },
            cell: {
              fontSize: "sm",
              color: "fg.default",
              borderBottom: "1px solid {colors.border.default}",
              whiteSpace: "nowrap",
              padding: "3.5",
            },
            row: {},
            pageButton: {
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "9",
              height: "9",
              paddingInline: "3",
              borderRadius: "lg",
              border: "1px solid",
              borderColor: "border.default",
              fontFamily: "mono",
              fontSize: "sm",
              backgroundColor: "bg.surface",
              color: "fg.default",
            },
            paginationRow: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "3",
              paddingTop: "6",
            },
          },
          variants: {
            sortActive: {
              true: {
                headerCell: {
                  color: "primary.default",
                  opacity: "1",
                },
              },
            },
            sortable: {
              true: {
                headerCell: {
                  cursor: "pointer",
                },
              },
            },
            numeric: {
              true: {
                // Numeric headers center to sit over their centered cells —
                // left-aligning them here would let the header label drift
                // away from its own column's values as the column stretches
                // wider than the label.
                headerCell: { textAlign: "right" },
                cell: { textAlign: "right" },
              },
            },
            selected: {
              true: {
                row: { backgroundColor: "primary.subtle" },
              },
            },
            pageActive: {
              true: {
                pageButton: {
                  backgroundColor: "primary.default",
                  color: "primary.contrast",
                  borderColor: "primary.default",
                },
              },
            },
            pageDisabled: {
              true: {
                pageButton: {
                  opacity: "0.4",
                  cursor: "not-allowed",
                },
              },
            },
            pageLink: {
              true: {
                pageButton: {
                  cursor: "pointer",
                  _hover: { borderColor: "primary.default" },
                },
              },
            },
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
              // On a light background, dimming the text on hover (the old dark-theme
              // treatment) reads as the button going *away*, not as a hover state -
              // a soft fill behind the text is a clearer "you're over me" signal
              // without ever lowering contrast.
              ghost: {
                bg: "transparent",
                color: "fg.default",
                fontWeight: "medium",
                borderRadius: "lg",
                _hover: { bg: "bg.subtle" },
                _disabled: { _hover: { bg: "transparent" } },
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
                  borderColor: "border.default",
                },
                _disabled: {
                  _hover: { borderColor: "transparent" },
                },
              },
              // Same treatment as solid, but ink-on-paper instead of signal-on-paper —
              // a neutral solid CTA that doesn't reach for the brand accent color
              // (see join-btn in the groups.html mockup, formerly the "white" variant
              // back when the theme was dark and this was the light-on-dark option).
              dark: {
                bg: "ink",
                color: "paper",
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
              variant: ["solid", "outline", "dark"],
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
