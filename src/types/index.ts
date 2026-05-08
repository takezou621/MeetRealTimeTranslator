export interface ExtensionSettings {
  apiKey: string;
  yourLanguage: string;
  partnerLanguage: string;
  outputVolume: number;
  isEnabled: boolean;
}

export type TranslationStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
}
