import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  X, 
  ChevronRight, 
  ChevronLeft,
  Sparkles,
  Users,
  BookOpen,
  BarChart3,
  Settings,
  MessageSquare,
  Check
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  targetSelector?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

const defaultSteps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Bienvenue sur SchoolFlow Pro !',
    description: 'Découvrez comment gérer efficacement votre établissement scolaire avec notre plateforme complète.',
    icon: <Sparkles className="h-8 w-8 text-primary" />,
    position: 'center'
  },
  {
    id: 'students',
    title: 'Gestion des étudiants',
    description: 'Gérez les inscriptions, suivez les présences et consultez les dossiers étudiants en quelques clics.',
    icon: <Users className="h-8 w-8 text-blue-500" />,
    position: 'center'
  },
  {
    id: 'courses',
    title: 'Cours et programmes',
    description: 'Organisez vos cours, créez des emplois du temps et suivez la progression académique.',
    icon: <BookOpen className="h-8 w-8 text-emerald-500" />,
    position: 'center'
  },
  {
    id: 'analytics',
    title: 'Analyses et rapports',
    description: 'Obtenez des insights détaillés sur les performances et tendances de votre établissement.',
    icon: <BarChart3 className="h-8 w-8 text-purple-500" />,
    position: 'center'
  },
  {
    id: 'messages',
    title: 'Communication intégrée',
    description: 'Communiquez facilement avec les parents, enseignants et étudiants via notre messagerie.',
    icon: <MessageSquare className="h-8 w-8 text-amber-500" />,
    position: 'center'
  },
  {
    id: 'settings',
    title: 'Personnalisez votre espace',
    description: 'Configurez les paramètres selon vos besoins et personnalisez votre tableau de bord.',
    icon: <Settings className="h-8 w-8 text-slate-500" />,
    position: 'center'
  }
];

interface OnboardingTourProps {
  steps?: OnboardingStep[];
  storageKey?: string;
  onComplete?: () => void;
  onSkip?: () => void;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  steps = defaultSteps,
  storageKey = 'onboarding-completed',
  onComplete,
  onSkip
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(storageKey);
    if (!completed) {
      // Delay showing onboarding for better UX
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep, steps.length]);

  const handlePrevious = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const handleComplete = useCallback(() => {
    localStorage.setItem(storageKey, 'true');
    setIsVisible(false);
    onComplete?.();
  }, [storageKey, onComplete]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(storageKey, 'true');
    setIsVisible(false);
    onSkip?.();
  }, [storageKey, onSkip]);

  const progress = ((currentStep + 1) / steps.length) * 100;
  const step = steps[currentStep];

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="w-full max-w-lg"
        >
          <Card className="relative overflow-hidden border-2 border-primary/20 shadow-2xl">
            {/* Progress bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-muted">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>

            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 z-10"
              onClick={handleSkip}
            >
              <X className="h-4 w-4" />
            </Button>

            <CardContent className="pt-10 pb-6">
              {/* Step indicator */}
              <div className="flex justify-center gap-1.5 mb-6">
                {steps.map((_, index) => (
                  <motion.div
                    key={index}
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors",
                      index === currentStep ? "bg-primary" : "bg-muted"
                    )}
                    animate={{
                      scale: index === currentStep ? 1.2 : 1
                    }}
                  />
                ))}
              </div>

              {/* Content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="text-center"
                >
                  <motion.div
                    className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring' }}
                  >
                    {step.icon}
                  </motion.div>

                  <h2 className="text-2xl font-bold mb-3">{step.title}</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Navigation */}
              <div className="flex items-center justify-between mt-8">
                <Button
                  variant="ghost"
                  onClick={handlePrevious}
                  disabled={currentStep === 0}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Précédent
                </Button>

                <Button
                  variant="ghost"
                  onClick={handleSkip}
                  className="text-muted-foreground"
                >
                  Passer
                </Button>

                <Button
                  onClick={handleNext}
                  className="gap-1"
                >
                  {currentStep === steps.length - 1 ? (
                    <>
                      Terminer
                      <Check className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Suivant
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// Tooltip Tour for specific elements
interface TooltipStep {
  target: string;
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface TooltipTourProps {
  steps: TooltipStep[];
  storageKey?: string;
  onComplete?: () => void;
}

export const TooltipTour: React.FC<TooltipTourProps> = ({
  steps,
  storageKey = 'tooltip-tour-completed',
  onComplete
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const completed = localStorage.getItem(storageKey);
    if (!completed && steps.length > 0) {
      setIsVisible(true);
    }
  }, [storageKey, steps.length]);

  useEffect(() => {
    if (!isVisible || currentStep >= steps.length) return;

    const step = steps[currentStep];
    const element = document.querySelector(step.target);
    
    if (element) {
      const rect = element.getBoundingClientRect();
      const pos = {
        top: rect.top + rect.height / 2,
        left: rect.left + rect.width / 2
      };
      
      setPosition(pos);
      
      // Scroll element into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentStep, isVisible, steps]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      localStorage.setItem(storageKey, 'true');
      setIsVisible(false);
      onComplete?.();
    }
  };

  if (!isVisible || currentStep >= steps.length) return null;

  const step = steps[currentStep];

  return (
    <motion.div
      className="fixed z-[100] p-4 bg-popover border rounded-lg shadow-lg max-w-xs"
      style={{
        top: position.top + 20,
        left: position.left,
        transform: 'translateX(-50%)'
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h4 className="font-semibold mb-1">{step.title}</h4>
      <p className="text-sm text-muted-foreground mb-3">{step.content}</p>
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">
          {currentStep + 1} / {steps.length}
        </span>
        <Button size="sm" onClick={handleNext}>
          {currentStep === steps.length - 1 ? 'Terminer' : 'Suivant'}
        </Button>
      </div>
    </motion.div>
  );
};
