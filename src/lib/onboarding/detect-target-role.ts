/**
 * Target-role helper prompts.
 *
 * LLM-based intent detection now lives in `detect-target-role-llm.ts`. This module retains
 * the localized user-facing strings: the CV-upload clarifying question and the post-switch
 * acknowledgement.
 */

/**
 * Clarifying question to ask after CV upload if target role is not set
 */
export function getTargetRoleQuestion(locale: "en" | "de" | "fr"): string {
  const questions = {
    en: "I've reviewed your CV! 👀 Before we dive deeper, what role are you targeting? For example: Product Manager, UX Designer, Software Engineer, etc. This helps me tailor all my advice to your goals! 🎯",
    de: "Ich habe deinen Lebenslauf überprüft! 👀 Bevor wir tiefer einsteigen, welche Rolle strebst du an? Zum Beispiel: Produktmanager, UX-Designer, Softwareentwickler, usw. Das hilft mir, alle meine Ratschläge auf deine Ziele abzustimmen! 🎯",
    fr: "J'ai examiné ton CV! 👀 Avant d'aller plus loin, quel rôle vises-tu? Par exemple: Chef de produit, Designer UX, Ingénieur logiciel, etc. Cela m'aide à adapter tous mes conseils à tes objectifs! 🎯"
  };
  return questions[locale] || questions.en;
}

/**
 * Localized acknowledgement shown after silently switching the active target role
 * (locked decision D-02). The already-normalized `role` string is interpolated verbatim —
 * it is NOT translated. Falls back to `en` for an unknown locale, mirroring
 * `getTargetRoleQuestion`.
 */
export function getTargetRoleAck(locale: "en" | "de" | "fr", role: string): string {
  const acks = {
    en: `Got it — I'll optimize everything for ${role} now. 🎯`,
    de: `Verstanden — ich optimiere ab jetzt alles für ${role}. 🎯`,
    fr: `C'est noté — j'optimise désormais tout pour ${role}. 🎯`
  };
  return acks[locale] || acks.en;
}
