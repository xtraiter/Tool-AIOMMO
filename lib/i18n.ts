"use client";

import { useUiPreferences } from "./uiPreferences";

/** Returns `tr(vi, en)`: the Vietnamese or English string for the language the user picked in the header. */
export function useTr() {
  const { locale } = useUiPreferences();
  return (vi: string, en: string) => (locale === "en" ? en : vi);
}
