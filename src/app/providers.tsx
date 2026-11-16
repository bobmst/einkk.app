"use client";
// MUI theme (Material UI, the maintained sibling of the Joy UI enikk.app uses).
// Light and dark follow the viewer's system until they toggle; the colours
// match the season survey (accent #0070D7).
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { themeStorage } from "@/lib/theme-storage";

// Text roles. A page says what its text is (variant="note"); this file says how each role looks,
// so changing a role changes every text of that kind, and nothing else. The secondary ones are
// MUI's own sizes in the secondary text colour, which follows light and dark through the CSS
// variable (Typography's color="text.secondary" does nothing in MUI 9).
//   label       overline, secondary: small section labels
//   note        caption, secondary: footnotes and small notes
//   muted       body2, secondary: form help and intros
//   mutedLarge  body1, secondary: full-size secondary lines
declare module "@mui/material/styles" {
  interface TypographyVariants {
    label: React.CSSProperties;
    note: React.CSSProperties;
    muted: React.CSSProperties;
    mutedLarge: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    label?: React.CSSProperties;
    note?: React.CSSProperties;
    muted?: React.CSSProperties;
    mutedLarge?: React.CSSProperties;
  }
}
declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    label: true;
    note: true;
    muted: true;
    mutedLarge: true;
  }
}

const fontFamily = "var(--font-roboto), system-ui, 'Hiragino Sans', 'Noto Sans CJK JP', 'Malgun Gothic', 'Microsoft YaHei', sans-serif";
const base = createTheme({ typography: { fontFamily } }).typography;
const secondary = (from: "overline" | "caption" | "body2" | "body1"): React.CSSProperties =>
  ({ ...base[from], color: "var(--mui-palette-text-secondary)" });

const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: { palette: { primary: { main: "#0070D7" }, background: { default: "#f6f7f9" } } },
    dark: {
      palette: {
        primary: { main: "#4da3ff" },
        background: { default: "#0d1014", paper: "#161a20" },
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily,
    h1: { fontSize: "1.5rem", fontWeight: 700 },
    h2: { fontSize: "1.15rem", fontWeight: 600 },
    label: secondary("overline"),
    note: secondary("caption"),
    muted: secondary("body2"),
    mutedLarge: secondary("body1"),
  },
  components: {
    MuiCard: { defaultProps: { variant: "outlined" } },
    MuiButton: { defaultProps: { disableElevation: true } },
    // each role keeps the element of the variant it is built from
    MuiTypography: { defaultProps: { variantMapping: { label: "span", note: "span", muted: "p", mutedLarge: "p" } } },
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme} defaultMode="system" storageManager={themeStorage}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}
