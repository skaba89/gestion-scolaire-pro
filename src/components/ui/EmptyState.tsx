import React from 'react';
import Lottie from 'lottie-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
    title: string;
    description?: string;
    animationData?: any;
    actionLabel?: string;
    onAction?: () => void;
    icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    title,
    description,
    animationData,
    actionLabel,
    onAction,
    icon
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center p-8 text-center min-h-[400px]"
        >
            <div className="w-64 h-64 mb-6 flex items-center justify-center relative">
                {animationData ? (
                    <Lottie animationData={animationData} loop={true} />
                ) : (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                            type: "spring",
                            stiffness: 260,
                            damping: 20,
                            delay: 0.2
                        }}
                        className="relative"
                    >
                        <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl animate-pulse" />
                        <div className="relative flex items-center justify-center w-32 h-32 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-3xl border border-primary/20 backdrop-blur-xl shadow-xl">
                            {icon || <div className="w-16 h-16 bg-primary/30 rounded-full" />}
                        </div>
                    </motion.div>
                )}
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">{title}</h3>
            {description && (
                <p className="text-muted-foreground max-w-sm mb-6">{description}</p>
            )}
            {actionLabel && onAction && (
                <Button onClick={onAction} className="btn-gradient">
                    {actionLabel}
                </Button>
            )}
        </motion.div>
    );
};
