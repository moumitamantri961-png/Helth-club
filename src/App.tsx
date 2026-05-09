/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  History, 
  Settings as SettingsIcon, 
  Upload, 
  Trash2, 
  ChevronRight, 
  Loader2, 
  LogOut,
  Flame,
  Dna,
  Droplets,
  Beef,
  Sparkles,
  MessageSquare,
  Utensils,
  Calendar,
  Activity,
  Award,
  Bell,
  Search,
  ChevronLeft,
  ArrowRight,
  Plus,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  setDoc,
  serverTimestamp,
  Timestamp,
  getDoc,
  limit
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, signIn, signOut } from './lib/firebase';
import { analyzeFoodImage } from './services/geminiService';
import { generateBodyPlan, COACH_QUESTIONS, CoachQuestion, chatWithCoach } from './services/coachService';
import { Confidence, FoodScan, Page, UserProfile, WaterLog, MealPlan } from './types';
import { cn, formatTimestamp } from './lib/utils';
import ReactMarkdown from 'react-markdown';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>(Page.HOME);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('theme') as any) || 'system';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [scans, setScans] = useState<FoodScan[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<FoodScan | null>(null);
  const [proactiveAdvice, setProactiveAdvice] = useState<string | null>(null);
  
  // Coach Chat State
  const [coachStep, setCoachStep] = useState(0);
  const [coachChat, setCoachChat] = useState<{role: 'coach' | 'user', message: string}[]>([
    {role: 'coach', message: "Hi! I'm your AI Body Coach. Let's build your transformation plan. Ready?"}
  ]);
  const [onboardingData, setOnboardingData] = useState<Partial<UserProfile>>({});
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'warn'} | null>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [coachChat]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const profileDoc = await getDoc(doc(db, 'users', u.uid));
        if (profileDoc.exists()) {
          const pData = profileDoc.data() as UserProfile;
          setProfile(pData);
          if (!pData.onboardingComplete) {
            setCurrentPage(Page.ONBOARDING);
          }
        } else {
          setCurrentPage(Page.ONBOARDING);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let timer: any;
    if (currentPage === Page.COACH) {
      setIsImmersive(false);
      timer = setTimeout(() => setIsImmersive(true), 5000);
    } else {
      setIsImmersive(false);
    }
    return () => clearTimeout(timer);
  }, [currentPage]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.setAttribute('data-theme', systemTheme);
    } else {
      root.setAttribute('data-theme', theme);
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const caloriesToday = scans.reduce((acc, s) => {
    const d = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp);
    if (d.toDateString() === new Date().toDateString()) return acc + s.calories;
    return acc;
  }, 0);

  const waterToday = waterLogs.reduce((acc, w) => {
    const d = w.timestamp?.toDate ? w.timestamp.toDate() : new Date(w.timestamp);
    if (d.toDateString() === new Date().toDateString()) return acc + w.amountMl;
    return acc;
  }, 0);

  const proteinToday = scans.reduce((acc, s) => {
    const d = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp);
    if (d.toDateString() === new Date().toDateString()) return acc + s.proteinG;
    return acc;
  }, 0);

  // Proactive Coaching Logic
  useEffect(() => {
    if (!profile || scans.length < 3) return;
    
    const recentScans = scans.slice(0, 5);
    const lowProteinCount = recentScans.filter(s => s.proteinG < 10).length;
    const highSugarCount = recentScans.filter(s => s.sugarG > 15).length;
    
    if (lowProteinCount >= 3) {
      setProactiveAdvice("Your protein intake seems low in your recent meals. Try adding some paneer or chicken! 🍗");
    } else if (highSugarCount >= 2) {
      setProactiveAdvice("Detected high sugar in multiple meals lately. Watching your glucose is key for your goal! 🍫");
    } else if (waterToday < (profile.dailyWaterGoal * 0.4)) {
      setProactiveAdvice("You're behind on hydration today. Grab a glass of water now! 💧");
    } else {
      setProactiveAdvice(null);
    }
  }, [scans, waterToday, profile]);

  useEffect(() => {
    if (!user) return;
    
    // Fetch user profile
    const fetchProfile = async () => {
      const pDoc = await getDoc(doc(db, 'users', user.uid));
      if (pDoc.exists()) setProfile(pDoc.data() as UserProfile);
    };
    fetchProfile();

    // Scans listener
    const scansQ = query(
      collection(db, 'scans'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );
    const unscans = onSnapshot(scansQ, (snapshot) => {
      setScans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FoodScan)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'scans'));

    // Meal Plan listener
    const mealQ = query(
      collection(db, 'mealPlans'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const unmeal = onSnapshot(mealQ, (snapshot) => {
      if (!snapshot.empty) {
        setMealPlan({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MealPlan);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mealPlans'));

    const waterQ = query(
      collection(db, 'water'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );
    const unwater = onSnapshot(waterQ, (snapshot) => {
      setWaterLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WaterLog)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'water'));

    // Chat listener
    const chatQ = query(
      collection(db, 'coach_chats'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'asc')
    );
    const unchat = onSnapshot(chatQ, (snapshot) => {
      if (!snapshot.empty) {
        setCoachChat(snapshot.docs.map(doc => doc.data() as any));
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'coach_chats'));

    return () => {
      unscans();
      unwater();
      unmeal();
      unchat();
    };
  }, [user]);

  const handleCoachResponse = async (field: keyof UserProfile, value: any) => {
    const newData = { ...onboardingData, [field]: value };
    setOnboardingData(newData);
    const userMsg = { role: 'user' as const, message: String(value), timestamp: serverTimestamp(), userId: user!.uid };
    setCoachChat(prev => [...prev, userMsg]);
    try {
      await addDoc(collection(db, 'coach_chats'), userMsg);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'coach_chats');
    }
    
    if (coachStep < COACH_QUESTIONS.length - 1) {
      setCoachStep(prev => prev + 1);
      setTimeout(async () => {
        const coachMsg = { role: 'coach' as const, message: COACH_QUESTIONS[coachStep + 1].question, timestamp: serverTimestamp(), userId: user!.uid };
        setCoachChat(prev => [...prev, coachMsg]);
        try {
          await addDoc(collection(db, 'coach_chats'), coachMsg);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'coach_chats');
        }
      }, 300);
    } else if (!profile?.coachOnboardingComplete) {
      // All questions finished, generate plan
      setIsGeneratingPlan(true);
      setCoachChat(prev => [...prev, { role: 'coach', message: "Genius! Generating your personalized body transformation plan now..." }]);
      try {
        const plan = await generateBodyPlan(newData);
        const fullProfile = {
          ...newData,
          uid: user!.uid,
          displayName: user!.displayName || 'Elite Athlete',
          onboardingComplete: true,
          coachOnboardingComplete: true,
          dailyCalorieGoal: plan.dailyCalorieGoal,
          dailyProteinGoal: plan.dailyProteinGoal,
          dailyCarbsGoal: plan.dailyCarbsGoal,
          dailyFatGoal: plan.dailyFatGoal,
          dailyWaterGoal: plan.dailyWaterGoal,
          isPremium: true
        };
        try {
          await setDoc(doc(db, 'users', user!.uid), fullProfile);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${user!.uid}`);
        }
        try {
          await addDoc(collection(db, 'mealPlans'), {
            userId: user!.uid,
            meals: plan.recommendedMeals,
            createdAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'mealPlans');
        }
        setProfile(fullProfile as UserProfile);
        setCoachChat(prev => [...prev, { role: 'coach', message: "Your plan is ready! Go to your dashboard to see your new targets. You can keep asking me anything here!" }]);
        setToast({ message: "Body Transformation Plan Generated! 🔥", type: 'success' });
      } catch (err) {
        console.error(err);
        setCoachChat(prev => [...prev, { role: 'coach', message: "Oops, something went wrong. Let's try again." }]);
      } finally {
        setIsGeneratingPlan(false);
      }
    }
  };

  const sendContinuousChatMessage = async (message: string) => {
    if (!message.trim() || !profile) return;
    const userMsg = { role: 'user' as const, message, timestamp: serverTimestamp(), userId: user!.uid };
    setCoachChat(prev => [...prev, userMsg]);
    try {
      await addDoc(collection(db, 'coach_chats'), userMsg);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'coach_chats');
    }
    
    setIsGeneratingPlan(true);
    try {
      const response = await chatWithCoach(profile, coachChat, message);
      const coachMsg = { role: 'coach' as const, message: response, timestamp: serverTimestamp(), userId: user!.uid };
      setCoachChat(prev => [...prev, coachMsg]);
      try {
        await addDoc(collection(db, 'coach_chats'), coachMsg);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'coach_chats');
      }
    } catch (err) {
      console.error(err);
      setCoachChat(prev => [...prev, { role: 'coach', message: "I'm having trouble connecting right now. Please try again." }]);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const saveOnboarding = async () => {
    if (!user) return;
    const fullProfile: UserProfile = {
      ...onboardingData,
      uid: user.uid,
      displayName: user.displayName || 'User',
      onboardingComplete: true,
    } as UserProfile;
    
    try {
      await setDoc(doc(db, 'users', user.uid), fullProfile);
      setProfile(fullProfile);
      setCurrentPage(Page.HOME);
    } catch (error) {
      console.error("Onboarding Save Failed:", error);
      alert("Failed to save profile. Please check your connection.");
    }
  };

  const addWater = async (amount: number) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'water'), {
        amountMl: amount,
        timestamp: serverTimestamp(),
        userId: user.uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'water');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImage(file);
  };

  const processImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setSelectedImage(base64);
      setCurrentPage(Page.ANALYSIS);
      await performAnalysis(base64.split(',')[1], file.type);
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setShowCamera(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg');
      
      // Stop camera stream
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      
      setShowCamera(false);
      setSelectedImage(base64);
      setCurrentPage(Page.ANALYSIS);
      performAnalysis(base64.split(',')[1], 'image/jpeg');
    }
  };

  const performAnalysis = async (base64Data: string, mimeType: string) => {
    setAnalyzing(true);
    setLastResult(null);
    try {
      const result = await analyzeFoodImage(base64Data, mimeType);
      const scanData: Omit<FoodScan, 'id'> = {
        ...result,
        imageUrl: `data:${mimeType};base64,${base64Data}`,
        timestamp: serverTimestamp(),
        userId: user!.uid
      };
      try {
        const docRef = await addDoc(collection(db, 'scans'), scanData);
        setLastResult({ id: docRef.id, ...scanData } as FoodScan);
        setToast({ message: "Food analyzed successfully! 🥗", type: 'success' });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'scans');
      }
    } catch (error) {
      console.error("Analysis Failed:", error);
      setToast({ message: "Analysis failed. Make it clearer!", type: 'warn' });
      setCurrentPage(Page.HOME);
    } finally {
      setAnalyzing(false);
    }
  };

  const deleteScan = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this entry?")) {
      try {
        await deleteDoc(doc(db, 'scans', id));
      } catch (err) {
        console.error("Delete failed:", err);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-sage-50">
        <Loader2 className="h-10 w-10 animate-spin text-sage-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="mb-8 rounded-full bg-sage-100 p-6">
          <Camera className="h-16 w-16 text-sage-600" />
        </div>
        <h1 className="mb-2 font-serif text-4xl font-bold text-sage-900">NutriSnap AI</h1>
        <p className="mb-8 max-w-xs text-sage-600">
          Analyze any dish instantly. Track your calories and stay healthy with the power of AI.
        </p>
        <button 
          onClick={signIn}
          className="flex w-full max-w-sm items-center justify-center gap-3 rounded-xl bg-sage-900 py-4 font-semibold text-white transition-all hover:bg-sage-800 active:scale-95"
        >
          <img src="https://www.google.com/favicon.ico" className="h-5 w-5" alt="Google" />
          Continue with Google
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      {/* Redesigned Header - Hidden on Coach Page */}
      <AnimatePresence>
        {currentPage !== Page.COACH && (
          <motion.header 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="sticky top-0 z-50 flex items-center justify-between bg-bg/80 p-6 backdrop-blur-lg"
          >
            <div className="flex items-center gap-3">
              <img src={user.photoURL || ""} className="h-10 w-10 rounded-full border-2 border-brand" alt="Profile" />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Good Morning!</span>
                <h2 className="text-sm font-bold">{user.displayName || "Elite User"}</h2>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="rounded-full bg-card p-2 shadow-inner">
                <Bell className="h-5 w-5 text-text-dim" />
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <main className={cn("flex-1 p-6", currentPage === Page.COACH && "p-0 overflow-hidden")}>
        <AnimatePresence mode="wait">
          {currentPage === Page.ONBOARDING && (
            <motion.div 
              key="onboarding"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col justify-center min-h-[70vh] space-y-8"
            >
              <div className="space-y-2">
                <h1 className="text-4xl font-bold font-serif italic">Transform Your Body</h1>
                <p className="text-text-dim">Our AI Coach builds a personalized nutrition and workout plan just for you.</p>
              </div>
              
              <div className="relative overflow-hidden rounded-[2.5rem] bg-brand p-8 text-black shadow-[0_0_50px_-10px_rgba(204,255,0,0.5)]">
                <div className="relative z-10">
                  <h3 className="text-2xl font-bold mb-4">Ready to start?</h3>
                  <button 
                    onClick={() => setCurrentPage(Page.COACH)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black py-4 font-bold text-white transition-all active:scale-95"
                  >
                    Start My Body Plan
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </div>
                <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-white opacity-20 blur-3xl" />
              </div>
            </motion.div>
          )}

          {currentPage === Page.COACH && (
            <motion.div 
              key="coach"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-bg flex flex-col h-[100dvh] safe-area-bottom"
            >
              {/* Immersive Mobile Header */}
              <AnimatePresence>
                {!isImmersive && (
                  <motion.div 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    className="p-6 flex items-center justify-between border-b border-white/5 bg-bg/80 backdrop-blur-xl"
                  >
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setCurrentPage(Page.HOME)} 
                        className="p-3 bg-card rounded-full active:scale-95 transition-all text-text"
                      >
                        <ChevronLeft />
                      </button>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="h-10 w-10 rounded-full bg-brand/20 flex items-center justify-center border border-brand/50">
                            <Sparkles className="h-5 w-5 text-brand" />
                          </div>
                          <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-bg animate-pulse" />
                        </div>
                        <div>
                          <h2 className="text-sm font-bold leading-none">AI Body Coach</h2>
                          <span className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Active Now</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Chat Canvas */}
              <div 
                className="flex-1 overflow-y-auto space-y-6 scrollbar-hide px-6 py-6 pb-24" 
                id="coach-chat-container"
                onClick={() => setIsImmersive(false)}
              >
                {coachChat.map((chat, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    key={i} 
                    className={cn(
                      "group flex flex-col max-w-[85%] gap-1",
                      chat.role === 'coach' ? "self-start" : "self-end items-end ml-auto"
                    )}
                  >
                    <div className={cn(
                      "p-4 rounded-[2rem] text-sm leading-relaxed shadow-sm",
                      chat.role === 'coach' 
                        ? "bg-card text-text rounded-tl-sm" 
                        : "bg-brand text-black font-semibold rounded-tr-sm shadow-[0_4px_15px_rgba(204,255,0,0.2)]"
                    )}>
                      <ReactMarkdown>{chat.message}</ReactMarkdown>
                    </div>
                  </motion.div>
                ))}
                {isGeneratingPlan && (
                  <div className="flex items-center gap-3 px-2">
                     <div className="h-10 w-10 rounded-full bg-brand/10 animate-pulse flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-brand" />
                     </div>
                     <span className="text-[10px] font-bold text-brand uppercase tracking-widest">Coach is thinking...</span>
                  </div>
                )}
                <div ref={chatEndRef} className="h-10" />
              </div>

              {/* Mobile One-Hand Input Area */}
              <div className="absolute bottom-0 left-0 right-0 p-6 pt-10 bg-gradient-to-t from-bg via-bg/95 to-transparent pointer-events-none">
                <div className="relative flex flex-col gap-4 pointer-events-auto">
                  {!profile?.coachOnboardingComplete && coachStep < COACH_QUESTIONS.length && (
                    <motion.div 
                      layout
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="bg-card p-6 rounded-[2.5rem] shadow-2xl border border-brand/20 backdrop-blur-xl"
                    >
                      <p className="text-[10px] font-bold text-brand uppercase tracking-[0.2em] mb-3">Step {coachStep + 1} of {COACH_QUESTIONS.length}</p>
                      <h3 className="text-xl font-bold mb-6 leading-tight font-serif italic">{COACH_QUESTIONS[coachStep].question}</h3>
                      
                      <div className="grid gap-3 max-h-[30vh] overflow-y-auto pr-1">
                        {COACH_QUESTIONS[coachStep].type === 'select' && COACH_QUESTIONS[coachStep].options?.map(opt => (
                          <button 
                            key={opt}
                            onClick={() => handleCoachResponse(COACH_QUESTIONS[coachStep].field, opt)}
                            className="w-full py-5 px-6 rounded-2xl bg-card-light hover:bg-brand hover:text-black transition-all text-left font-bold border border-white/5 active:scale-[0.98] text-sm"
                          >
                            {opt}
                          </button>
                        ))}
                        {COACH_QUESTIONS[coachStep].type === 'number' && (
                          <div className="flex gap-2">
                            <input 
                              type="number" 
                              autoFocus
                              placeholder="Type score..."
                              onKeyDown={(e) => {
                                if(e.key === 'Enter') handleCoachResponse(COACH_QUESTIONS[coachStep].field, (e.target as any).value);
                              }}
                              className="flex-1 bg-card-light p-4 rounded-2xl focus:outline-none focus:ring-2 ring-brand/50 font-bold text-text text-sm" 
                            />
                            <button 
                              onClick={() => {
                                const val = (document.querySelector('input[type="number"]') as any).value;
                                if(val) handleCoachResponse(COACH_QUESTIONS[coachStep].field, val);
                              }}
                              className="bg-brand text-black p-4 rounded-2xl aspect-square flex items-center justify-center active:scale-90"
                            >
                              <ArrowRight />
                            </button>
                          </div>
                        )}
                        {COACH_QUESTIONS[coachStep].type === 'slider' && (
                          <div className="space-y-6 px-2 py-2">
                            <div className="text-6xl font-bold text-center text-brand font-serif italic">
                              <span id="slider-value-display">{onboardingData[COACH_QUESTIONS[coachStep].field] ?? (COACH_QUESTIONS[coachStep].min || 0)}</span>
                            </div>
                            <input 
                              type="range" 
                              min={COACH_QUESTIONS[coachStep].min ?? 0}
                              max={COACH_QUESTIONS[coachStep].max ?? 10}
                              defaultValue={(onboardingData[COACH_QUESTIONS[coachStep].field] as number) ?? (COACH_QUESTIONS[coachStep].min || 0)}
                              onChange={(e) => {
                                const display = document.getElementById('slider-value-display');
                                if (display) display.innerText = e.target.value;
                              }}
                              className="w-full accent-brand h-2 bg-card-light rounded-lg appearance-none cursor-pointer" 
                              id="onboarding-slider"
                            />
                            <button 
                              onClick={() => {
                                const val = (document.getElementById('onboarding-slider') as HTMLInputElement).value;
                                handleCoachResponse(COACH_QUESTIONS[coachStep].field, parseInt(val));
                              }}
                              className="w-full bg-brand text-black py-5 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-brand/20 active:scale-95 transition-all text-sm mb-2"
                            >
                              Next Step <ArrowRight className="h-5 w-5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {profile?.coachOnboardingComplete && (
                    <div className="bg-card p-2 rounded-[3.5rem] flex items-center gap-2 border border-white/10 shadow-[0_15px_40px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
                       <button className="h-12 w-12 rounded-full flex items-center justify-center text-text-dim hover:text-brand transition-colors active:scale-90">
                          <Plus className="h-6 w-6" />
                       </button>
                       <input 
                        type="text" 
                        onFocus={() => setIsImmersive(false)}
                        placeholder="Message AI Coach..." 
                        className="flex-1 bg-transparent p-4 focus:outline-none font-medium text-sm text-text" 
                        onKeyDown={(e) => {
                          if(e.key === 'Enter') {
                            sendContinuousChatMessage((e.target as any).value);
                            (e.target as any).value = '';
                          }
                        }}
                       />
                       <button 
                        onClick={() => {
                          const input = document.querySelector('input[placeholder="Message AI Coach..."]') as HTMLInputElement;
                          if(input.value) {
                            sendContinuousChatMessage(input.value);
                            input.value = '';
                          }
                        }}
                        className="h-12 w-12 rounded-full bg-brand text-black flex items-center justify-center shadow-lg active:scale-90 transition-all"
                       >
                          <ArrowRight className="h-5 w-5" />
                       </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {currentPage === Page.HOME && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 pb-12"
            >
              {/* PulseUp Aesthetic Nutrition Dashboard */}
              <section>
                {proactiveAdvice && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="mb-4 bg-brand/10 border border-brand/20 p-4 rounded-[1.5rem] flex items-start gap-3"
                  >
                     <Sparkles className="h-5 w-5 text-brand shrink-0 mt-1" />
                     <p className="text-xs font-medium italic opacity-90">{proactiveAdvice}</p>
                  </motion.div>
                )}
                <h3 className="text-lg font-bold mb-4">Your Daily Nutrition</h3>
                <div className="grid grid-cols-3 gap-3">
                   <div className="aspect-[4/5] rounded-[2rem] bg-card p-4 flex flex-col justify-between border border-white/5">
                      <div className="h-8 w-8 rounded-xl bg-orange-500/20 flex items-center justify-center">
                         <Flame className="h-4 w-4 text-orange-500" />
                      </div>
                      <div>
                         <div className="text-xs text-text-dim mb-1">Calories</div>
                         <div className="text-lg font-bold">{caloriesToday} <span className="text-[10px] text-text-muted">Kcal</span></div>
                         <div className="text-[8px] text-text-muted">/ {profile?.dailyCalorieGoal || 2000} burned</div>
                      </div>
                   </div>
                   <div className="aspect-[4/5] rounded-[2rem] bg-card p-4 flex flex-col justify-between border border-white/5">
                      <div className="h-8 w-8 rounded-xl bg-blue-500/20 flex items-center justify-center">
                         <Dna className="h-4 w-4 text-blue-500" />
                      </div>
                      <div>
                         <div className="text-xs text-text-dim mb-1">Proteins</div>
                         <div className="text-lg font-bold">{proteinToday} <span className="text-[10px] text-text-muted">gm</span></div>
                         <div className="text-[8px] text-text-muted">/ {profile?.dailyProteinGoal || 100} Kcal</div>
                      </div>
                   </div>
                   <div className="aspect-[4/5] rounded-[2rem] bg-card p-4 flex flex-col justify-between border border-white/5">
                      <div className="h-8 w-8 rounded-xl bg-brand/20 flex items-center justify-center">
                         <Utensils className="h-4 w-4 text-brand" />
                      </div>
                      <div>
                         <div className="text-xs text-text-dim mb-1">Carbs</div>
                         <div className="text-lg font-bold">{scans.reduce((a,s) => a + (s.carbohydratesG || 0), 0)} <span className="text-[10px] text-text-muted">gm</span></div>
                         <div className="text-[8px] text-text-muted">/ {profile?.dailyCarbsGoal || 250} Kcal</div>
                      </div>
                   </div>
                </div>
              </section>

              {/* Central Progress Ring */}
              <div className="flex flex-col items-center py-6">
                <div className="relative">
                   <svg className="h-56 w-56 -rotate-90">
                      <circle cx="112" cy="112" r="95" fill="transparent" stroke="#1c1c1c" strokeWidth="15" />
                      <circle 
                        cx="112" cy="112" r="95" fill="transparent" stroke="#ccff00" strokeWidth="15" 
                        strokeDasharray={596}
                        strokeDashoffset={596 - (596 * (caloriesToday / (profile?.dailyCalorieGoal || 2000)))}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                      />
                   </svg>
                   <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xs text-text-dim mb-1 uppercase tracking-widest font-bold">Day 12</span>
                      <div className="flex items-center gap-2">
                         <Utensils className="h-5 w-5 text-brand" />
                         <span className="text-4xl font-bold">{caloriesToday}</span>
                      </div>
                      <span className="text-xs text-text-muted">{profile?.dailyCalorieGoal || 2000} Kcal</span>
                   </div>
                </div>
              </div>

              {/* Daily Meal Plan */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">Daily Meal</h3>
                  <button className="text-xs text-text-dim hover:text-brand">Edit plan 🗓️</button>
                </div>
                
                {mealPlan ? (
                  <div className="space-y-3">
                    {mealPlan.meals.map((meal, i) => (
                      <div key={i} className="glass-card flex items-center justify-between p-4 rounded-[2rem]">
                         <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-card-light flex items-center justify-center text-brand">
                               {meal.type === 'Breakfast' ? '🥣' : meal.type === 'Lunch' ? '🥗' : '🍱'}
                            </div>
                            <div>
                               <div className="font-bold">{meal.name}</div>
                               <div className="text-[10px] text-text-dim uppercase tracking-wider">{meal.type} • {meal.calories} kcal</div>
                            </div>
                         </div>
                         <button className="h-10 w-10 rounded-full bg-brand/10 flex items-center justify-center text-brand">
                            <Plus className="h-5 w-5" />
                         </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[2rem] bg-card p-6 border border-dashed border-white/10 text-center">
                     <p className="text-text-dim text-sm mb-4">You haven't generated a meal plan yet.</p>
                     <button 
                      onClick={() => setCurrentPage(Page.COACH)}
                      className="text-brand font-bold text-sm bg-brand/10 px-6 py-2 rounded-full"
                    >
                      Generate My Day
                    </button>
                  </div>
                )}
              </section>

              {/* Floating Action Button for Scanner */}
              <div className="fixed bottom-28 right-6 z-50 flex flex-col gap-3">
                 <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="h-14 w-14 rounded-full bg-card text-brand border border-white/10 shadow-xl flex items-center justify-center active:scale-95 transition-all"
                 >
                    <Upload className="h-6 w-6" />
                 </button>
                 <button 
                  onClick={startCamera}
                  className="h-16 w-16 rounded-full bg-brand text-black shadow-[0_0_30px_rgba(204,255,0,0.4)] flex items-center justify-center active:scale-95 transition-all"
                 >
                    <Search className="h-8 w-8" />
                 </button>
              </div>
            </motion.div>
          )}

          {currentPage === Page.PROGRESS && (
            <motion.div 
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Progress</h2>
                <button 
                  onClick={async () => {
                    const weight = prompt("Enter your current weight (kg):");
                    if(weight && user) {
                      try {
                        await addDoc(collection(db, 'progress'), {
                          userId: user.uid,
                          weight: parseFloat(weight),
                          timestamp: serverTimestamp(),
                          energyLevel: 8
                        });
                        setToast({ message: "Weight logged successfully! 💪", type: 'success' });
                      } catch (error) {
                        handleFirestoreError(error, OperationType.WRITE, 'progress');
                      }
                    }
                  }}
                  className="bg-brand text-black px-4 py-2 rounded-full font-bold text-xs shadow-lg"
                >
                  + Log Weight
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card p-6 rounded-[2rem]">
                   <TrendingUp className="text-brand mb-2" />
                   <div className="text-2xl font-bold">78.5 <span className="text-xs text-text-muted">Kg</span></div>
                   <div className="text-[10px] text-text-dim uppercase">Current Weight</div>
                </div>
                <div className="bg-card p-6 rounded-[2rem]">
                   <Activity className="text-blue-500 mb-2" />
                   <div className="text-2xl font-bold">12 <span className="text-xs text-text-muted">Days</span></div>
                   <div className="text-[10px] text-text-dim uppercase">Streak</div>
                </div>
              </div>

              <section className="bg-card p-6 rounded-[2.5rem]">
                <h3 className="font-bold mb-4">Growth Chart</h3>
                <div className="h-40 flex items-end justify-between gap-1">
                   {[40, 70, 45, 90, 65, 85, 100].map((h, i) => (
                     <div key={i} className="flex-1 bg-brand-dark/20 rounded-full relative group">
                        <motion.div 
                          initial={{ height: 0 }}
                          animate={{ height: `${h}%` }}
                          className="w-full bg-brand rounded-full absolute bottom-0 shadow-lg"
                        />
                     </div>
                   ))}
                </div>
                <div className="flex justify-between mt-4 text-[10px] text-text-muted font-bold">
                   <span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span>
                </div>
              </section>

              <div className="glass-card p-6 rounded-[2.5rem] border border-brand/20">
                 <div className="flex items-center gap-4 mb-4">
                    <div className="h-12 w-12 rounded-2xl bg-brand text-black flex items-center justify-center">
                       <Award className="h-6 w-6" />
                    </div>
                    <div>
                       <h4 className="font-bold">Elite Status Achieved</h4>
                       <p className="text-xs text-text-dim">You're in the top 5% of users this week.</p>
                    </div>
                 </div>
                 <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
                    <div className="h-full w-[85%] bg-brand" />
                 </div>
              </div>
            </motion.div>
          )}

          {currentPage === Page.HISTORY && (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
               <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">Meal History</h2>
                  <div className="relative group">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                     <input 
                      type="text" 
                      placeholder="Search meals..." 
                      className="bg-card py-2 pl-9 pr-4 rounded-xl text-xs focus:outline-none focus:ring-1 ring-brand w-40"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                     />
                  </div>
               </div>
               
               <div className="space-y-3">
                 {scans.filter(s => s.foodName.toLowerCase().includes(searchQuery.toLowerCase())).map(scan => (
                   <div 
                    key={scan.id} 
                    onClick={() => {
                      setLastResult(scan);
                      setSelectedImage(scan.imageUrl);
                      setCurrentPage(Page.ANALYSIS);
                    }}
                    className="bg-card p-4 rounded-[2rem] flex items-center gap-4 active:scale-[0.98] transition-all border border-white/5"
                   >
                      <img src={scan.imageUrl} className="h-16 w-16 rounded-2xl object-cover" />
                      <div className="flex-1">
                         <div className="font-bold">{scan.foodName}</div>
                         <div className="text-xs text-text-dim">{scan.calories} kcal • {scan.proteinG}g P</div>
                         <div className="text-[8px] text-text-muted mt-1 uppercase tracking-widest">{formatTimestamp(scan.timestamp)}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-text-muted" />
                   </div>
                 ))}
               </div>
               
               {scans.length === 0 && (
                 <div className="py-20 text-center text-text-dim">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>No meals tracked yet.</p>
                 </div>
               )}
            </motion.div>
          )}

          {/* Analysis View (keeping it largely similar but matching theme) */}
          {currentPage === Page.ANALYSIS && lastResult && (
            <motion.div key="analysis" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                <button onClick={() => setCurrentPage(Page.HOME)} className="p-2 bg-card rounded-full"><ChevronLeft /></button>
                <div className="relative aspect-square rounded-[3rem] overflow-hidden shadow-2xl">
                   <img src={selectedImage || ""} className="w-full h-full object-cover" />
                </div>
                <div className="space-y-6">
                   <div className="flex items-center justify-between">
                      <h2 className="text-3xl font-bold font-serif italic">{lastResult.foodName}</h2>
                      <span className="px-4 py-1 bg-brand text-black font-bold rounded-full text-xs">{lastResult.calories} Kcal</span>
                   </div>
                   <div className="grid grid-cols-3 gap-4">
                      <div className="bg-card p-4 rounded-3xl text-center border border-white/5">
                         <div className="text-brand font-bold">{lastResult.proteinG}g</div>
                         <div className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Protein</div>
                      </div>
                      <div className="bg-card p-4 rounded-3xl text-center border border-white/5">
                         <div className="text-blue-500 font-bold">{lastResult.carbohydratesG}g</div>
                         <div className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Carbs</div>
                      </div>
                      <div className="bg-card p-4 rounded-3xl text-center border border-white/5">
                         <div className="text-orange-500 font-bold">{lastResult.fatG}g</div>
                         <div className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Fat</div>
                      </div>
                   </div>
                   <div className="bg-brand/10 p-6 rounded-[2.5rem] border border-brand/20">
                      <h4 className="font-bold mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI Insight</h4>
                      <p className="text-sm italic opacity-80">{lastResult.healthTip}</p>
                   </div>
                </div>
            </motion.div>
          )}
          {currentPage === Page.SETTINGS && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold">Profile & Settings</h2>
              
              <div className="bg-card p-6 rounded-[2rem] flex items-center gap-4">
                 <img src={user.photoURL || ""} className="h-16 w-16 rounded-full border-2 border-brand" />
                 <div>
                    <h3 className="font-bold">{user.displayName}</h3>
                    <div className="text-xs text-text-dim">{profile?.goal} • {profile?.isPremium ? 'Premium Member 💎' : 'Free Tier'}</div>
                 </div>
              </div>

              <div className="space-y-4">
                 <div className="bg-card p-6 rounded-[2rem] space-y-4">
                    <h3 className="font-bold flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand" /> Appearance</h3>
                    <div className="grid grid-cols-3 gap-2">
                       {['light', 'dark', 'system'].map((t) => (
                         <button 
                          key={t}
                          onClick={() => setTheme(t as any)}
                          className={cn(
                            "py-3 rounded-xl border transition-all text-xs font-bold uppercase tracking-widest",
                            theme === t ? "bg-brand text-black border-brand" : "bg-card-light border-white/5 text-text-dim"
                          )}
                         >
                           {t}
                         </button>
                       ))}
                    </div>
                 </div>

                 <button className="w-full flex items-center justify-between p-4 bg-card rounded-2xl">
                    <div className="flex items-center gap-3">
                       <Bell className="h-5 w-5 text-brand" />
                       <span className="font-bold">Notifications</span>
                    </div>
                    <ChevronLeft className="h-5 w-5 rotate-180 opacity-20" />
                 </button>
                 <button className="w-full flex items-center justify-between p-4 bg-card rounded-2xl">
                    <div className="flex items-center gap-3">
                       <Award className="h-5 w-5 text-yellow-500" />
                       <span className="font-bold">Achievements</span>
                    </div>
                    <ChevronLeft className="h-5 w-5 rotate-180 opacity-20" />
                 </button>
                 <button 
                  onClick={() => signOut()}
                  className="w-full flex items-center justify-center gap-2 p-4 bg-red-500/10 text-red-500 rounded-2xl font-bold"
                 >
                    <LogOut className="h-5 w-5" />
                    Sign Out
                 </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Redesigned Camera Overlay */}
      {showCamera && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[100] flex flex-col bg-black"
        >
          <div className="flex items-center justify-between p-6">
            <button onClick={() => setShowCamera(false)} className="rounded-full bg-white/10 p-3 text-white">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <div className="text-center">
               <h3 className="font-bold text-white uppercase tracking-widest text-xs">AI Vision</h3>
               <p className="text-[10px] text-white/50">Analyzing nutrients in real-time</p>
            </div>
            <div className="w-12" />
          </div>
          
          <div className="relative flex-1 overflow-hidden m-4 rounded-[3rem]">
            <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
            
            {/* Scanner Animation */}
            <motion.div 
              animate={{ top: ['0%', '100%', '0%'] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute left-0 right-0 h-1 bg-brand shadow-[0_0_20px_#ccff00] z-20"
            />

            <div className="absolute inset-0 border-[2px] border-brand/20 m-12 rounded-3xl pointer-events-none">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-brand rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-brand rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-brand rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-brand rounded-br-xl" />
            </div>
          </div>
          
          <div className="flex h-40 items-center justify-center p-6 bg-black">
            <button 
              onClick={capturePhoto}
              className="h-24 w-24 rounded-full border-4 border-white/20 p-2 active:scale-90 transition-transform"
            >
              <div className="h-full w-full rounded-full bg-brand shadow-[0_0_40px_rgba(204,255,0,0.4)] flex items-center justify-center">
                 <Camera className="h-8 w-8 text-black" />
              </div>
            </button>
          </div>
        </motion.div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className={cn(
              "fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-2",
              toast.type === 'success' ? "bg-brand text-black" : "bg-red-500 text-white"
            )}
          >
            {toast.type === 'success' ? <Sparkles className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {currentPage !== Page.COACH && (
          <motion.nav 
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between bg-bg/80 px-8 py-6 backdrop-blur-xl border-t border-white/5"
          >
            <NavButton icon={<Utensils />} active={currentPage === Page.HOME} onClick={() => setCurrentPage(Page.HOME)} />
            <NavButton icon={<Activity />} active={currentPage === Page.PROGRESS} onClick={() => setCurrentPage(Page.PROGRESS)} />
            <div className="relative -top-10">
               <button 
                onClick={startCamera}
                className="h-16 w-16 rounded-full bg-brand text-black shadow-[0_10px_30px_-5px_rgba(204,255,0,0.5)] flex items-center justify-center scale-110 active:scale-100 transition-all font-bold"
               >
                  <Plus className="h-8 w-8" />
               </button>
            </div>
            <NavButton icon={<Sparkles />} active={false} onClick={() => setCurrentPage(Page.COACH)} />
            <NavButton icon={<SettingsIcon />} active={currentPage === Page.SETTINGS} onClick={() => setCurrentPage(Page.SETTINGS)} />
          </motion.nav>
        )}
      </AnimatePresence>

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

function MiniStat({ label, current, target, unit, icon }: { label: string, current: number, target: number, unit: string, icon: React.ReactNode }) {
  const percentage = Math.min(Math.round((current / target) * 100), 100);
  return (
    <div className="flex flex-col items-center">
       <div className="mb-1 flex items-center gap-1">
         {icon}
         <span className="text-[8px] font-bold uppercase text-sage-400">{label}</span>
       </div>
       <div className="text-xs font-bold text-sage-900">{Math.round(current)}{unit}</div>
       <div className="mt-1 h-1 w-full max-w-[40px] rounded-full bg-sage-50 overflow-hidden">
         <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className="h-full bg-sage-400"
         />
       </div>
    </div>
  );
}

function NavButton({ icon, active, onClick }: { icon: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative flex flex-col items-center gap-1 transition-all">
      <div className={cn(
        "p-2 rounded-2xl transition-all",
        active ? "text-brand scale-110" : "text-text-muted hover:text-text-dim"
      )}>
        {icon}
      </div>
      {active && <motion.div layoutId="nav-dot" className="h-1 w-1 rounded-full bg-brand" />}
    </button>
  );
}

function NutritionMetric({ icon, label, value, unit, color, total }: { icon: React.ReactNode, label: string, value: number, unit: string, color: string, total?: number }) {
  const percentage = total ? Math.min(Math.round((value / total) * 100), 100) : 100;
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] font-bold uppercase text-sage-400 tracking-wider font-sans">{label}</span>
      </div>
      <div className="mb-3">
        <span className="text-xl font-bold">{value}</span>
        <span className="ml-1 text-xs text-sage-500">{unit}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-sage-50">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className={cn("h-full", color)} 
        />
      </div>
    </div>
  );
}

function DetailRow({ label, value, unit }: { label: string, value: number, unit: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-sage-500">{label}</span>
      <span className="text-sm font-bold">{value}{unit}</span>
    </div>
  );
}
