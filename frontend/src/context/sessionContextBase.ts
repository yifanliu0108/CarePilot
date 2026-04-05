import { createContext } from "react";

/** Persisted when nutrition chat returns mealPlanUpdate (server). */
export type ChatMealPlanContext = {
  updatedAt: string;
  symptomsMentioned: string[];
  categoryBoosts: string[];
  weeklyDayMeals: Array<{
    day: string;
    breakfast: string;
    lunch: string;
    dinner: string;
    snacks: string[];
  }> | null;
};

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
  completedOnboarding: boolean;
  /** Quick-check multi-select symptom chip ids */
  symptomTagIds?: string[];
  chatMealPlanContext?: ChatMealPlanContext | null;
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
