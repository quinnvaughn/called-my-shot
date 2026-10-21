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
      table: [
        { sortActive: ["true"] },
        { numeric: ["true"] },
        { selected: ["true"] },
        { wide: ["true"] },
      ],
      // Same reasoning as dropdown/table above - combobox's `highlighted` and
      // select's `active`/`open` are always passed through a variable
      // (isHighlighted, isActive, open state), never a literal at the call site.
      combobox: [{ highlighted: ["true"] }],
      select: [
        { active: ["true"] },
        { open: ["true"] },
        { hasError: ["true"] },
      ],
      // Same reasoning again - the calendar grid/time controls below always
      // compute these from date math or toggle state, never a literal at the
      // call site.
      dateTimePicker: [
        { open: ["true"] },
        { hasError: ["true"] },
        { dayOutside: ["true"] },
        { dayToday: ["true"] },
        { daySelected: ["true"] },
        { dayDisabled: ["true"] },
        { ampmActive: ["true"] },
      ],
      // modal's `size` prop and tabs' `active`/`stretch`/`variant` are
      // always passed through a variable (a component prop, active-tab
      // comparison, the list's variant handed down through context, etc.),
      // never a literal at the call site - same reasoning as above.
      modal: [{ size: ["sm", "md"] }],
      tabs: [
        { active: ["true"] },
        { stretch: ["true"] },
        { variant: ["underline", "pill"] },
      ],
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
          "4xs": { value: "9px" }, // field avg marker label - smaller than 3xs on purpose
          "3xs": { value: "0.625rem" }, // 10px
          "2xs": { value: "0.6875rem" }, // 11px
        },
        colors: {
          // Brand palette — dark theme. Was flipped to light (white canvas, near-
          // black text) so every color choice would be picked against a white
          // background instead; flipped back. Several tokens below were darkened
          // during the light flip purely to hold text contrast on white (signal,
          // verified, loss, caution, steel) — moving back to dark restores each
          // one to its original, more-saturated value, since that's the value
          // that actually holds contrast against a near-black canvas. Light-mode
          // values are noted per token in case this flips again.
          paper: { value: "#0B0B0C" }, // app background, canvas (light theme: #FFFFFF)
          card: { value: "#151513" }, // primary surface: cards, panels, inputs, nav rail
          cardMuted: { value: "#1B1B18" }, // nested/inset surface: selected rows, tab tracks, dropdowns
          border: { value: "#2A2A28" }, // default hairline border
          track: { value: "#3E3E3A" }, // emphasized border (see Tabs); also reserved for progress-track backgrounds
          ink: { value: "#F5F1E8" }, // primary text (light theme: #14140F)
          linen: { value: "#D8D4C9" }, // softer body-copy tone (hero subhead, info-card paragraphs)
          dim: { value: "#8A8A84" }, // secondary/meta text
          steel: { value: "#96938A" }, // tertiary text, placeholders, inactive icons — only ~3:1 on white, which is exactly why it got darkened to #767267 for the light theme; back to full value now that it's on a dark canvas again
          signal: { value: "#FF5A1F" }, // brand accent — CTAs, active/selected state, focus ring; light theme darkened this to #C2410C to hold 4.5:1 as text on white
          signalMuted: { value: "#3A1E12" }, // pale accent-tinted background for badges/chips (not the same as signal at low alpha)
          // Secondary brand accent — labels and non-outcome status: eyebrows,
          // badges, completion progress, live dots. Sits 47° of hue off
          // `verified`, far enough that a label never reads as a won call.
          sky: { value: "#6AC0FF" }, // 9.9:1 on paper, 9.2:1 on card
          skyMuted: { value: "#162633" }, // pale sky-tinted background — pitched at verifiedMuted's luminance, so sky-on-skyMuted holds ~7.8:1
          // Same color as verifiedVibrant below — the light theme split these in
          // two only because #34D399 as *text* on white measured ~1.9:1 (illegible;
          // darkened to #15803D), while the raw value was still fine as a filled
          // shape with no text on it. On a dark canvas that whole problem goes
          // away, so both tokens converge back on the one original green.
          verified: { value: "#34D399" }, // success / correct-call / positive value
          verifiedMuted: { value: "#112921" }, // pale success-tinted background for the "Called" status chip
          verifiedVibrant: { value: "#34D399" }, // for filled shapes (bars, chart segments) — see note above
          loss: { value: "#E24B4A" }, // error / wrong-call / negative value; light theme darkened this to #C22B2A
          lossMuted: { value: "#2E1616" }, // pale danger-tinted background for loss/negative badges
          caution: { value: "#E8A33D" }, // warning / disputed / under-review value; light theme darkened this to #A6650E
          cautionMuted: { value: "#2C2213" }, // pale caution-tinted background for the disputed-resolution banner
          overlay: { value: "#0B0B0C" }, // modal scrim base color (used as rgba, e.g. overlay/70) — stays dark in both themes
        },
        // Named by purpose, not layer number, so nothing has to pick a raw
        // number (and risk picking one that loses to some other raw number
        // elsewhere) to answer "does this render above an open modal" - it's
        // the one question basically every portalled/fixed-position element
        // in this file eventually has to answer. Reference by key (e.g.
        // `zIndex: "popover"`), never a literal number, for anything that's
        // `position: fixed`/`absolute` and portalled or otherwise capable of
        // overlapping page content.
        zIndex: {
          // Modal's own scrim + box (ui/modal.tsx).
          overlay: { value: "100" },
          // A popover's own internal backdrop, e.g. date-time-picker's
          // mobile bottom-sheet scrim - sits below that popover's content,
          // but still above `overlay` so it isn't buried if the picker is
          // opened from inside a modal.
          popoverScrim: { value: "109" },
          // Portalled popover content - dropdown/combobox/select/date-time-
          // picker. Always above `overlay`: any of these can be opened from
          // a form inside a modal, and a popover that's behind the modal
          // that spawned it is unusable.
          popover: { value: "110" },
          // The walkthrough launcher (onboarding/walkthrough-launcher.tsx) -
          // a fixed pill floating over page content. Deliberately BELOW
          // `overlay`: it is a standing offer, not something that should sit
          // on top of a modal the user actually opened. The landing page's
          // lock-in bar (landing-page/guest-picks/guest-picks-lock-bar.tsx)
          // is the same kind of offer and shares it.
          launcher: { value: "90" },
          // The onboarding walkthrough's dimming layer (ui/coachmark.tsx) -
          // a single box-shadow ring that darkens everything except the
          // element being explained.
          coachmarkSpotlight: { value: "119" },
          // The coachmark bubble itself. Top of the stack on purpose: it can
          // be pointing at a select or dropdown, and a tooltip explaining a
          // control that renders behind that control explains nothing.
          coachmark: { value: "120" },
          // Toasts (ui/toast.tsx). Above `overlay` and `popover`, because a
          // toast can come out of an action taken inside a modal and has to
          // be readable over it; below the coachmark, which is explaining
          // the screen the toast is sitting on.
          toast: { value: "115" },
        },
      },
      keyframes: {
        spin: {
          to: { transform: "rotate(360deg)" },
        },
        // Live-status dot (see the pending-call badge) - a plain opacity pulse
        // reads as "still active" without competing for attention the way a
        // color or size change would.
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
        // Sheet panel entrances (ui/sheet.tsx): rising from the bottom edge
        // below md, sliding in from the right edge from md up.
        sheetUp: {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        sheetIn: {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        toastIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // A game entry's perfect-card / oh-fer stamp (GameVerdictStamp):
        // comes down large and lands tilted, like a rubber stamp on paper.
        stampDown: {
          from: { opacity: "0", transform: "scale(1.8) rotate(-4deg)" },
          to: { opacity: "1", transform: "scale(1) rotate(-4deg)" },
        },
      },
      semanticTokens: {
        colors: {
          // Purpose-based aliases — components should reference these, not the raw palette above.
          bg: {
            canvas: { value: "{colors.paper}" },
            surface: { value: "{colors.card}" },
            subtle: { value: "{colors.cardMuted}" },
            // Something floating over the page that has to read as separate
            // from it at a glance (the space rail's tooltips): a clear step
            // lighter than any surface.
            raised: { value: "{colors.border}" },
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
            default: { value: "{colors.sky}" },
            subtle: { value: "{colors.skyMuted}" },
            contrast: { value: "{colors.paper}" },
          },
          // Status feedback. `success` is reserved for one thing: a positive
          // outcome or good performance — a call that landed, a winning point
          // total, a strong grade or return. Anything that merely *happened*
          // (a ballot filled in, a game underway, a question resolved) belongs
          // to `secondary`, even where it feels vaguely positive; otherwise
          // green stops carrying information, which is how it ended up on
          // eyebrows and a "Final" tag that rendered over a loss.
          success: {
            default: { value: "{colors.verified}" },
            subtle: { value: "{colors.verifiedMuted}" },
            // For filled shapes (bars, chart segments), not text - see
            // verifiedVibrant above for why this is brighter than default.
            vibrant: { value: "{colors.verifiedVibrant}" },
          },
          danger: {
            default: { value: "{colors.loss}" },
            subtle: { value: "{colors.lossMuted}" },
            // text/icon color to place on top of a solid `danger.default` fill (e.g. destructive buttons)
            contrast: { value: "{colors.paper}" },
          },
          warning: {
            default: { value: "{colors.caution}" },
            subtle: { value: "{colors.cautionMuted}" },
          },
        },
      },
      // Typography only: textStyles can't carry color, so each use pairs
      // `textStyle` with its own `color` in the same css() call.
      textStyles: {
        // Field labels, eyebrows, stat captions.
        label: {
          value: {
            fontFamily: "mono",
            fontSize: "2xs",
            letterSpacing: "wide",
            textTransform: "uppercase",
          },
        },
        // label one size down, for dense rows and chart axes.
        labelSm: {
          value: {
            fontFamily: "mono",
            fontSize: "3xs",
            letterSpacing: "wide",
            textTransform: "uppercase",
          },
        },
        // Section and panel headings inside a card or modal.
        sectionHeading: {
          value: {
            fontFamily: "mono",
            fontSize: "xs",
            letterSpacing: "wide",
            textTransform: "uppercase",
          },
        },
        // Sentence-case mono detail text: timestamps, counts, records.
        metaSm: {
          value: { fontFamily: "mono", fontSize: "3xs" },
        },
        meta: {
          value: { fontFamily: "mono", fontSize: "2xs" },
        },
        metaLg: {
          value: { fontFamily: "mono", fontSize: "xs" },
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
              textStyle: "label",
              color: "fg.subtle",
            },
            group: {
              display: "flex",
              alignItems: "center",
              gap: "2",
              width: "full",
              backgroundColor: "bg.canvas",
              border: "1px solid {colors.border.default}",
              borderRadius: "lg",
              paddingInline: "3.5",
              transition: "border-color 0.15s ease",
              _focusWithin: {
                border: "1px solid {colors.primary.default}",
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
                  border: "1px solid {colors.danger.default}",
                },
              },
            },
          },
        }),
        // Same shape as textInput, minus the icon/iconButton slots and the
        // group/field split those exist for - a textarea never has a leading/
        // trailing icon to lay out next to, so the border/background/padding
        // that textInput puts on `group` just lives on `field` directly here.
        textarea: defineSlotRecipe({
          className: "textarea",
          slots: ["root", "label", "field", "description", "error", "count"],
          base: {
            root: {
              display: "flex",
              flexDirection: "column",
              gap: "1.5",
            },
            label: {
              display: "block",
              textStyle: "label",
              color: "fg.subtle",
            },
            field: {
              display: "block",
              width: "full",
              // Taller on a phone, where the narrow width fits only a few
              // words a line. It also grows with what's typed, up to half the
              // screen, where field-sizing is supported; elsewhere it stays
              // at the minimum and scrolls.
              minHeight: { base: "36", sm: "24" },
              maxHeight: "50vh",
              fieldSizing: "content",
              resize: "vertical",
              backgroundColor: "bg.canvas",
              border: "1px solid {colors.border.default}",
              borderRadius: "lg",
              padding: "3.5",
              color: "fg.default",
              fontFamily: "inherit",
              fontSize: "sm",
              lineHeight: "relaxed",
              outline: "none",
              transition: "border-color 0.15s ease",
              _placeholder: {
                color: "fg.subtle",
              },
              _focus: {
                border: "1px solid {colors.primary.default}",
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
            count: {
              display: "block",
              textStyle: "meta",
              color: "fg.subtle",
              textAlign: "right",
            },
          },
          variants: {
            error: {
              true: {
                field: {
                  border: "1px solid {colors.danger.default}",
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
              border: "1px solid {colors.border.default}",
              borderRadius: "xl",
              padding: "1.5",
              boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
              zIndex: "popover",
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
        combobox: defineSlotRecipe({
          className: "combobox",
          slots: [
            "content",
            "groupLabel",
            "option",
            "optionIcon",
            "optionText",
            "optionMeta",
            "empty",
          ],
          base: {
            content: {
              display: "flex",
              flexDirection: "column",
              position: "absolute",
              top: "calc(100% + 6px)",
              left: "0",
              right: "0",
              gap: "0.5",
              backgroundColor: "bg.surface",
              border: "1px solid {colors.border.default}",
              borderRadius: "xl",
              padding: "1.5",
              maxHeight: "80",
              overflowY: "auto",
              boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
              zIndex: "popover",
            },
            groupLabel: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              textStyle: "labelSm",
              color: "fg.subtle",
              padding: "{spacing.2} {spacing.2.5} {spacing.1}",
            },
            option: {
              display: "flex",
              alignItems: "center",
              gap: "2.5",
              width: "full",
              textAlign: "left",
              borderRadius: "md",
              paddingBlock: "2",
              paddingInline: "2.5",
              cursor: "pointer",
              transition: "background-color 0.15s ease",
            },
            optionIcon: {
              flexShrink: "0",
              display: "flex",
              alignItems: "center",
              color: "fg.subtle",
            },
            optionText: {
              flex: "1",
              minWidth: "0",
              fontSize: "xs",
              color: "fg.default",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            },
            optionMeta: {
              flexShrink: "0",
              textStyle: "metaSm",
              color: "fg.subtle",
            },
            empty: {
              padding: "4 2.5",
              textAlign: "center",
              textStyle: "meta",
              color: "fg.subtle",
            },
          },
          variants: {
            highlighted: {
              true: {
                option: {
                  backgroundColor: "bg.subtle",
                },
              },
            },
          },
        }),
        select: defineSlotRecipe({
          className: "select",
          slots: [
            "root",
            "trigger",
            "triggerLabel",
            "caret",
            "content",
            "groupLabel",
            "option",
            "description",
            "error",
          ],
          base: {
            // A flex column so trigger + description/error stack the same
            // way TextInput/Textarea's root does - Content itself is
            // portalled (see ui/select.tsx) and positioned from the
            // trigger's own bounding rect, so it doesn't need this to be a
            // positioning root anymore.
            root: {
              display: "flex",
              flexDirection: "column",
              gap: "1.5",
            },
            trigger: {
              display: "flex",
              alignItems: "center",
              gap: "2.5",
              width: "full",
              backgroundColor: "bg.surface",
              border: "1px solid {colors.border.default}",
              borderRadius: "lg",
              paddingBlock: "2.5",
              paddingInline: "3.5",
              fontFamily: "mono",
              fontSize: "xs",
              letterSpacing: "wide",
              color: "fg.default",
              cursor: "pointer",
              transition: "border-color 0.15s ease",
              _hover: {
                border: "1px solid {colors.border.emphasized}",
              },
            },
            triggerLabel: {
              flex: "1",
              minWidth: "0",
              textAlign: "left",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            },
            caret: {
              flexShrink: "0",
              color: "fg.subtle",
              transition: "transform 0.15s ease",
            },
            content: {
              display: "flex",
              flexDirection: "column",
              position: "absolute",
              top: "calc(100% + 6px)",
              left: "0",
              right: "0",
              gap: "0.5",
              backgroundColor: "bg.surface",
              border: "1px solid {colors.border.default}",
              borderRadius: "xl",
              padding: "1.5",
              maxHeight: "80",
              overflowY: "auto",
              boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
              zIndex: "popover",
            },
            groupLabel: {
              textStyle: "labelSm",
              color: "fg.subtle",
              padding: "{spacing.2} {spacing.2.5} {spacing.1}",
            },
            option: {
              display: "flex",
              alignItems: "center",
              gap: "2.5",
              width: "full",
              textAlign: "left",
              borderRadius: "md",
              paddingBlock: "2",
              paddingInline: "2.5",
              fontSize: "xs",
              color: "fg.default",
              cursor: "pointer",
              transition: "background-color 0.15s ease, color 0.15s ease",
              _hover: {
                backgroundColor: "bg.subtle",
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
            open: {
              true: {
                trigger: {
                  border: "1px solid {colors.primary.default}",
                },
                caret: {
                  transform: "rotate(180deg)",
                },
              },
            },
            hasError: {
              true: {
                trigger: {
                  border: "1px solid {colors.danger.default}",
                },
              },
            },
            active: {
              true: {
                option: {
                  backgroundColor: "primary.subtle",
                  color: "primary.default",
                },
              },
            },
          },
        }),
        // Custom date+time picker (calendar grid + hour/minute/AM-PM controls)
        // replacing the native <input type="datetime-local"> - that control's
        // popup UI is entirely browser-drawn and can't be themed, so it stuck
        // out against every other field in the app.
        dateTimePicker: defineSlotRecipe({
          className: "date-time-picker",
          slots: [
            "root",
            "trigger",
            "triggerLabel",
            "triggerIcon",
            "content",
            "calendarHeader",
            "navButton",
            "monthLabel",
            "weekdayRow",
            "weekday",
            "dayGrid",
            "day",
            "timeRow",
            "timeField",
            "timeSeparator",
            "ampmGroup",
            "ampmButton",
            "footer",
            "description",
            "error",
            "scrim",
            "dragHandle",
          ],
          base: {
            root: {
              display: "flex",
              flexDirection: "column",
              gap: "1.5",
            },
            trigger: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "2",
              width: "full",
              backgroundColor: "bg.canvas",
              border: "1px solid {colors.border.default}",
              borderRadius: "lg",
              paddingBlock: "3",
              paddingInline: "3.5",
              fontSize: "sm",
              color: "fg.default",
              cursor: "pointer",
              transition: "border-color 0.15s ease, opacity 0.15s ease",
              _hover: {
                border: "1px solid {colors.border.emphasized}",
              },
              // Locked to a picked game's kickoff (see game-field.tsx) - same
              // native :disabled treatment as the button recipe's _disabled,
              // rather than a separate variant prop to thread through.
              _disabled: {
                cursor: "not-allowed",
                opacity: 0.6,
                _hover: {
                  border: "1px solid {colors.border.default}",
                },
              },
            },
            triggerLabel: {
              flex: "1",
              minWidth: "0",
              textAlign: "left",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            },
            triggerIcon: {
              flexShrink: "0",
              color: "fg.subtle",
            },
            // Below `md`, date-time-picker.tsx stops setting an inline
            // top/left (that's the trigger-relative placement the layout
            // effect computes) and lets this take over instead - a sheet
            // pinned to the bottom of the viewport, full width, rather than
            // a small box hanging off wherever the trigger happens to sit.
            // Above `md` the inline style wins per-property and this half of
            // each responsive pair is simply never visible.
            content: {
              display: "flex",
              flexDirection: "column",
              gap: "2",
              position: "fixed",
              top: { base: "auto", md: "0" },
              bottom: { base: "0", md: "auto" },
              left: { base: "0", md: "0" },
              right: { base: "0", md: "auto" },
              // Trimmed from 320px - narrower cells (day is aspect-ratio 1,
              // so width drives height) is the single biggest lever on this
              // popover's total height, which is what decides whether it
              // fits below the trigger without flipping above it.
              width: { base: "full", md: "292px" },
              // Never wider than the viewport itself - the JS clamp in
              // date-time-picker.tsx only slides left/right within the space
              // this leaves, it doesn't shrink the box.
              maxWidth: { base: "full", md: "calc(100vw - 16px)" },
              maxHeight: { base: "85vh", md: "none" },
              overflowY: { base: "auto", md: "visible" },
              backgroundColor: "bg.surface",
              border: "1px solid {colors.border.default}",
              borderRadius: { base: "0", md: "xl" },
              // Top corners stay rounded on the mobile sheet too - only the
              // bottom ones flatten out to sit flush with the screen edge.
              borderTopLeftRadius: "xl",
              borderTopRightRadius: "xl",
              padding: "3",
              paddingBottom: {
                base: "calc({spacing.6} + env(safe-area-inset-bottom))",
                md: "3",
              },
              boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
              zIndex: "popover",
            },
            scrim: {
              position: "fixed",
              inset: "0",
              backgroundColor: "bg.overlay/60",
              zIndex: "popoverScrim",
            },
            dragHandle: {
              display: { base: "block", md: "none" },
              alignSelf: "center",
              width: "9",
              height: "1",
              borderRadius: "full",
              backgroundColor: "border.emphasized",
              marginBottom: "1",
            },
            calendarHeader: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            },
            navButton: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "6",
              height: "6",
              borderRadius: "md",
              color: "fg.subtle",
              cursor: "pointer",
              transition: "background-color 0.15s ease, color 0.15s ease",
              _hover: {
                backgroundColor: "bg.subtle",
                color: "fg.default",
              },
            },
            monthLabel: {
              textStyle: "sectionHeading",
              color: "fg.default",
            },
            weekdayRow: {
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
            },
            weekday: {
              textAlign: "center",
              textStyle: "labelSm",
              color: "fg.subtle",
              paddingBlock: "1",
            },
            dayGrid: {
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "1",
            },
            day: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              aspectRatio: "1",
              width: "full",
              border: "none",
              borderRadius: "md",
              backgroundColor: "transparent",
              fontFamily: "inherit",
              fontSize: "xs",
              color: "fg.default",
              cursor: "pointer",
              transition: "background-color 0.15s ease, color 0.15s ease",
              _hover: {
                backgroundColor: "bg.subtle",
              },
            },
            timeRow: {
              display: "flex",
              alignItems: "center",
              gap: "2",
              borderTop: "1px solid {colors.border.default}",
              paddingTop: "2",
            },
            timeField: {
              width: "12",
              backgroundColor: "bg.canvas",
              border: "1px solid {colors.border.default}",
              borderRadius: "md",
              paddingBlock: "1.5",
              textAlign: "center",
              fontFamily: "mono",
              fontSize: "sm",
              color: "fg.default",
              outline: "none",
              _focus: {
                border: "1px solid {colors.primary.default}",
              },
            },
            timeSeparator: {
              fontSize: "sm",
              color: "fg.subtle",
            },
            ampmGroup: {
              display: "flex",
              marginLeft: "auto",
              border: "1px solid {colors.border.default}",
              borderRadius: "md",
              overflow: "hidden",
            },
            ampmButton: {
              border: "none",
              backgroundColor: "transparent",
              paddingInline: "2.5",
              paddingBlock: "2",
              textStyle: "label",
              color: "fg.subtle",
              cursor: "pointer",
              transition: "background-color 0.15s ease, color 0.15s ease",
              _hover: {
                backgroundColor: "bg.subtle",
              },
            },
            footer: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid {colors.border.default}",
              paddingTop: "2",
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
            open: {
              true: {
                trigger: { border: "1px solid {colors.primary.default}" },
              },
            },
            hasError: {
              true: {
                trigger: { border: "1px solid {colors.danger.default}" },
              },
            },
            dayOutside: {
              true: {
                day: { color: "fg.subtle" },
              },
            },
            // Only ever passed when the day isn't also selected (see
            // date-time-picker.tsx) - keeps this from having to out-fight
            // daySelected's background in the cascade for the current-day
            // cell.
            dayToday: {
              true: {
                day: { fontWeight: "bold", color: "primary.default" },
              },
            },
            daySelected: {
              true: {
                day: {
                  backgroundColor: "primary.default",
                  color: "primary.contrast",
                  fontWeight: "bold",
                  _hover: { backgroundColor: "primary.default" },
                },
              },
            },
            dayDisabled: {
              true: {
                day: {
                  opacity: "0.35",
                  cursor: "not-allowed",
                  pointerEvents: "none",
                },
              },
            },
            ampmActive: {
              true: {
                ampmButton: {
                  backgroundColor: "primary.default",
                  color: "primary.contrast",
                },
              },
            },
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
              textStyle: "sectionHeading",
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
              // `table-layout: fixed` above holds every column to a set width
              // instead of growing to fit content, and `nowrap` means long
              // content can't wrap to a second line either - without this,
              // it does the one thing left available to it: render past the
              // cell's own boundary and visually overlap whatever's next.
              overflow: "hidden",
              textOverflow: "ellipsis",
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
              border: "1px solid {colors.border.default}",
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
            // Opt-in for a table with a column that can't be meaningfully
            // truncated (eg. a free-text title) - switches column sizing
            // from the fixed/<colgroup>-driven layout every other table
            // variant uses to the browser's natural content-based algorithm,
            // and drops the ellipsis clipping that goes with `fixed` sizing.
            // The wrapper's existing horizontal scroll is what makes the
            // rest of a too-wide row reachable, instead of hiding it.
            wide: {
              true: {
                table: { tableLayout: "auto" },
                cell: { overflow: "visible", textOverflow: "clip" },
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
                  border: "1px solid {colors.primary.default}",
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
                  _hover: { border: "1px solid {colors.primary.default}" },
                },
              },
            },
          },
        }),
        modal: defineSlotRecipe({
          className: "modal",
          slots: ["overlay", "box", "closeButton", "title", "description"],
          base: {
            overlay: {
              position: "fixed",
              inset: 0,
              zIndex: "overlay",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "5",
              backgroundColor: "bg.overlay/70",
              backdropFilter: "blur(6px)",
            },
            box: {
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: "5.5",
              width: "full",
              maxWidth: "sm",
              // Overlay centers this with `padding: 5` on all sides, so cap
              // height to the remaining viewport and let the box itself
              // scroll - otherwise tall content (e.g. the create-account
              // form) overflows past the screen edges with nothing scrollable.
              maxHeight: "calc(100dvh - {spacing.10})",
              overflowY: "auto",
              backgroundColor: "bg.surface",
              border: "1px solid {colors.border.default}",
              borderRadius: "2xl",
              padding: "7",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
            },
            closeButton: {
              position: "absolute",
              top: "3.5",
              right: "3.5",
              width: "8",
              height: "8",
              borderRadius: "full",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "fg.muted",
              _hover: {
                backgroundColor: "bg.subtle",
                color: "fg.default",
                cursor: "pointer",
              },
            },
            title: {
              fontFamily: "heading",
              fontSize: "xl",
            },
            description: {
              fontSize: "xs",
              color: "fg.muted",
            },
          },
          variants: {
            size: {
              sm: { box: { maxWidth: "sm" } },
              md: { box: { maxWidth: "md" } },
            },
          },
          defaultVariants: {
            size: "sm",
          },
        }),
        // A panel pinned to a screen edge (ui/sheet.tsx) for lists that read
        // as a roster rather than a dialog. Below md it's a bottom sheet
        // capped at 85dvh; from md up it's a full-height column on the right.
        sheet: defineSlotRecipe({
          className: "sheet",
          slots: [
            "overlay",
            "panel",
            "dragHandle",
            "header",
            "title",
            "closeButton",
            "body",
          ],
          base: {
            overlay: {
              position: "fixed",
              inset: 0,
              zIndex: "overlay",
              backgroundColor: "bg.overlay/70",
              backdropFilter: "blur(6px)",
            },
            panel: {
              position: "fixed",
              display: "flex",
              flexDirection: "column",
              top: { base: "auto", md: "0" },
              right: "0",
              bottom: "0",
              left: { base: "0", md: "auto" },
              width: { base: "full", md: "360px" },
              maxWidth: "full",
              height: { base: "auto", md: "100dvh" },
              maxHeight: { base: "85dvh", md: "none" },
              backgroundColor: "bg.surface",
              borderTop: {
                base: "1px solid {colors.border.default}",
                md: "none",
              },
              borderLeft: {
                base: "none",
                md: "1px solid {colors.border.default}",
              },
              borderTopLeftRadius: { base: "xl", md: "0" },
              borderTopRightRadius: { base: "xl", md: "0" },
              // Clear of the home indicator in the Home Screen app.
              paddingBottom: {
                base: "env(safe-area-inset-bottom)",
                md: "0",
              },
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
              animation: {
                base: "sheetUp 0.22s ease",
                md: "sheetIn 0.22s ease",
              },
            },
            dragHandle: {
              display: { base: "block", md: "none" },
              alignSelf: "center",
              flexShrink: "0",
              width: "9",
              height: "1",
              marginTop: "2.5",
              borderRadius: "full",
              backgroundColor: "border.emphasized",
            },
            header: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "3",
              flexShrink: "0",
              padding: "{spacing.4} {spacing.5}",
              borderBottom: "1px solid {colors.border.default}",
            },
            title: {
              fontFamily: "heading",
              fontSize: "lg",
            },
            closeButton: {
              width: "8",
              height: "8",
              flexShrink: "0",
              borderRadius: "full",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "fg.muted",
              _hover: {
                backgroundColor: "bg.subtle",
                color: "fg.default",
                cursor: "pointer",
              },
            },
            body: {
              flex: "1",
              minHeight: "0",
              overflowY: "auto",
              padding: "{spacing.4} {spacing.3} {spacing.6}",
            },
          },
        }),
        // Underlined tabs by default, not bordered pill buttons - a shared
        // baseline rule (each trigger's bottom border) plus one
        // accent-colored border per active tab is what actually reads as
        // "tabs" rather than "a row of buttons." Only the border's color
        // changes between states, so it's one literal `borderBottom` string
        // per state rather than splitting border/borderColor.
        //
        // The pill variant is the app shell's row of a space's sections on
        // phones, a level above any underlined tabs on the page under it, so
        // the two never read as one row of tabs continuing another. It
        // scrolls sideways rather than wrapping when the sections outgrow
        // the screen.
        tabs: defineSlotRecipe({
          className: "tabs",
          slots: ["list", "trigger"],
          base: {
            list: {
              display: "flex",
            },
            trigger: {
              // Flex so anything after the label (a CountBadge) centers
              // vertically on it rather than sitting on its text baseline.
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              color: "fg.subtle",
              backgroundColor: "transparent",
              cursor: "pointer",
              _hover: {
                color: "fg.default",
              },
            },
          },
          variants: {
            variant: {
              underline: {
                list: {
                  gap: "5",
                  borderBottom: "1px solid {colors.border.default}",
                },
                trigger: {
                  textStyle: "sectionHeading",
                  fontWeight: "semibold",
                  padding: "{spacing.2.5} {spacing.0.5}",
                  marginBottom: "-1px",
                  borderBottom: "2px solid transparent",
                  transition: "color 0.15s ease, border-color 0.15s ease",
                },
              },
              pill: {
                list: {
                  gap: "2",
                  overflowX: "auto",
                  scrollbarWidth: "none",
                  "&::-webkit-scrollbar": { display: "none" },
                },
                trigger: {
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                  textStyle: "label",
                  fontWeight: "bold",
                  padding: "{spacing.2} {spacing.3}",
                  borderRadius: "lg",
                  border: "1px solid {colors.border.default}",
                  transition:
                    "color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease",
                },
              },
            },
            active: {
              true: {
                trigger: {
                  color: "fg.default",
                },
              },
            },
            stretch: {
              true: {
                list: {
                  "& > *": {
                    flex: 1,
                  },
                },
              },
            },
          },
          compoundVariants: [
            {
              variant: "underline",
              active: true,
              css: {
                trigger: {
                  borderBottom: "2px solid {colors.primary.default}",
                },
              },
            },
            // Where you are, not something to press, so the default
            // foreground rather than primary.
            {
              variant: "pill",
              active: true,
              css: {
                trigger: {
                  color: "bg.canvas",
                  backgroundColor: "fg.default",
                  border: "1px solid {colors.fg.default}",
                  _hover: { color: "bg.canvas" },
                },
              },
            },
          ],
          defaultVariants: {
            variant: "underline",
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
            // invite-join-btn) is uppercase Archivo Black regardless of how big it is.
            // Ghost and outline stay sentence-case Inter. `size` below is purely a
            // padding/font-size scale — keeping the two axes separate means picking
            // a size never silently opts a button in or out of caps.
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
              // Ghost with its border always drawn, so it reads as a button at rest.
              outline: {
                bg: "transparent",
                color: "fg.default",
                fontWeight: "medium",
                borderRadius: "lg",
                border: "1px solid {colors.border.default}",
                _hover: { bg: "bg.subtle" },
                _disabled: { _hover: { bg: "transparent" } },
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
              // Solid's treatment on the danger fill, for destructive confirms
              // (delete, void).
              danger: {
                bg: "danger.default",
                color: "danger.contrast",
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
              variant: ["solid", "outline", "dark", "danger"],
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
