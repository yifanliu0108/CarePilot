import { createContext } from "react";

export type HealthProfile = {
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  sleepRating: number | null;
  cognitiveRating: number | null;
  digestiveRating: number | null;
  musculoskeletalRating: number | null;
  immuneRating: number | null;
  /** Optional quick-check symptom chip ids (mirrors API profile). */
  symptomTagIds?: string[];
  completedOnboarding: boolean;
};

export type Me = {
  username: string;
  email: string;
  profile: HealthProfile;
};

export type SessionContextValue = {
  sessionId: string | null;
  me: Me | null;
  loading: boolean;
  refreshMe: () => Promise<void>;
  login: (username: string, email: string) => Promise<void>;
  logout: () => void;
};

export const SessionContext = createContext<SessionContextValue | null>(null);
