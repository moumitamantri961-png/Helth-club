import React from "react";
import { 
  Camera, 
  Image as ImageIcon, 
  Droplets, 
  Scale, 
  Sparkles, 
  Plus, 
  X,
  Utensils
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: string, data?: any) => void;
}

const actions = [
  { id: 'scan', label: 'Scan Food', icon: Camera, color: 'bg-brand', textColor: 'text-black' },
  { id: 'upload', label: 'Upload From Gallery', icon: ImageIcon, color: 'bg-white/10', textColor: 'text-white' },
  { id: 'water', label: 'Log Water', icon: Droplets, color: 'bg-blue-500/20', textColor: 'text-blue-400', subActions: [
    { label: '250ml', value: 250 },
    { label: '500ml', value: 500 },
    { label: '1L', value: 1000 }
  ]},
  { id: 'weight', label: 'Log Weight', icon: Scale, color: 'bg-orange-500/20', textColor: 'text-orange-400' },
  { id: 'coach', label: 'Ask AI Coach', icon: Sparkles, color: 'bg-purple-500/20', textColor: 'text-purple-400' },
  { id: 'custom', label: 'Add Custom Meal', icon: Utensils, color: 'bg-card', textColor: 'text-white' },
];

export const QuickActionSheet: React.FC<ActionSheetProps> = ({ isOpen, onClose, onAction }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 z-[120] p-6 pb-12 bg-bg/90 backdrop-blur-3xl border-t border-white/10 rounded-t-[3rem] shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
          >
            <div className="w-12 h-1 bg-white/10 rounded-full mx-auto mb-8" />
            
            <div className="grid grid-cols-2 gap-4">
              {actions.map((action) => (
                <div key={action.id} className="space-y-2">
                  <button
                    onClick={() => {
                      if (!action.subActions) {
                        onAction(action.id);
                        onClose();
                      }
                    }}
                    className={cn(
                      "w-full p-4 rounded-3xl flex flex-col items-center gap-3 transition-all active:scale-95 border border-white/5",
                      action.color,
                      action.textColor
                    )}
                  >
                    <action.icon className="h-6 w-6" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">{action.label}</span>
                  </button>
                  
                  {action.subActions && (
                    <div className="flex gap-2 justify-center mt-1">
                      {action.subActions.map((sub) => (
                        <button
                          key={sub.label}
                          onClick={() => {
                            onAction(action.id, sub.value);
                            onClose();
                          }}
                          className="px-2 py-1 rounded-lg bg-white/5 text-[8px] font-bold hover:bg-white/10 transition-colors"
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button 
              onClick={onClose}
              className="mt-8 mx-auto h-14 w-14 rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-90 transition-all"
            >
              <X className="h-6 w-6" />
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
