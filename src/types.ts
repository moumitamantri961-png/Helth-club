export enum Confidence {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low'
}

export interface FoodScan {
  id?: string;
  foodName: string;
  confidence: Confidence;
  portionSize: string;
  calories: number;
  proteinG: number;
  fatG: number;
  carbohydratesG: number;
  sugarG: number;
  sodiumMg: number;
  fiberG: number;
  allergens: string[];
  healthTip: string;
  imageUrl: string;
  timestamp: any; // Firestore Timestamp
  userId: string;
}

export enum Page {
  HOME = 'home',
  ANALYSIS = 'analysis',
  HISTORY = 'history',
  SETTINGS = 'settings',
  ONBOARDING = 'onboarding'
}

export interface UserProfile {
  uid: string;
  displayName: string;
  goal: 'Lose Weight' | 'Gain Muscle' | 'Maintain';
  dailyCalorieGoal: number;
  dailyProteinGoal: number;
  dailyWaterGoal: number;
  currentWeight?: number;
  targetWeight?: number;
  onboardingComplete: boolean;
}

export interface WaterLog {
  id?: string;
  amountMl: number;
  timestamp: any;
  userId: string;
}
