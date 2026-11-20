// The origin the pages name themselves with: the base of og:image, og:url and the like (#120).
// Production is einkk.app. uat's build is the one made with STATE_PREVIEW=1
// (.github/workflows/deploy.yml), so its link previews name uat.einkk.app and show the card from
// there, before a release puts the same image on einkk.app.
export const PRODUCTION_ORIGIN = "https://einkk.app";
export const UAT_ORIGIN = "https://uat.einkk.app";

export const siteOrigin = (env: Record<string, string | undefined>) =>
  env.STATE_PREVIEW === "1" ? UAT_ORIGIN : PRODUCTION_ORIGIN;
