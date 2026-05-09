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
  ONBOARDING = 'onboarding',
  COACH = 'coach',
  PROGRESS = 'progress'
}

export interface UserProfile {
  uid: string;
  displayName: string;
  goal: string;
  age?: number;
  gender?: string;
  height?: number;
  weight?: number;
  activityLevel?: string;
  workoutsPerWeek?: number;
  dietType?: string;
  allergies?: string[];
  budget?: string;
  location?: string;
  sleepDuration?: number;
  injuries?: string;
  medicalRestrictions?: string;
  dailySchedule?: string;
  dailyCalorieGoal: number;
  dailyProteinGoal: number;
  dailyCarbsGoal?: number;
  dailyFatGoal?: number;
  dailyWaterGoal: number;
  goalWeight?: number;
  bmi?: number;
  bmr?: number;
  tdee?: number;
  onboardingComplete: boolean;
  coachOnboardingComplete?: boolean;
  isPremium?: boolean;
}

export interface MealPlan {
  id?: string;
  userId: string;
  meals: {
    type: string;
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    portion: string;
    ingredients?: string[];
  }[];
  createdAt: any;
}

export interface WaterLog {
  id?: string;
  amountMl: number;
  timestamp: any;
  userId: string;
}
