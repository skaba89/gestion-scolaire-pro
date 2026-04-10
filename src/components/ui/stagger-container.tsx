import { motion, Variants } from "framer-motion";
import { ReactNode } from "react";

interface StaggerContainerProps {
    children: ReactNode;
    className?: string;
    delayChildren?: number;
    staggerChildren?: number;
}

export const StaggerContainer = ({
    children,
    className,
    delayChildren = 0.1,
    staggerChildren = 0.1
}: StaggerContainerProps) => {
    return (
        <motion.div
            variants={{
                hidden: { opacity: 0 },
                show: {
                    opacity: 1,
                    transition: {
                        staggerChildren,
                        delayChildren,
                    },
                },
            }}
            initial="hidden"
            animate="show"
            className={className}
        >
            {children}
        </motion.div>
    );
};

interface StaggerItemProps {
    children: ReactNode;
    className?: string;
    index?: number;
}

const itemVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

export const StaggerItem = ({ children, className }: StaggerItemProps) => {
    return (
        <motion.div variants={itemVariants} className={className}>
            {children}
        </motion.div>
    );
};
