import React, { useRef, useEffect, useState } from 'react';
import { Button } from './button';
import { Eraser, RotateCcw } from 'lucide-react';

interface SignaturePadProps {
    onSave: (dataUrl: string) => void;
    onClear?: () => void;
    width?: number;
    height?: number;
    className?: string;
    placeholder?: string;
}

const SignaturePad: React.FC<SignaturePadProps> = ({
    onSave,
    onClear,
    width = 400,
    height = 200,
    className = "",
    placeholder = "Signez ici"
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isEmpty, setIsEmpty] = useState(true);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Line style
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Clear canvas on init
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, []);

    const getCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as MouseEvent).clientX;
            clientY = (e as MouseEvent).clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        const { x, y } = getCoordinates(e);
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;

        const { x, y } = getCoordinates(e);
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        ctx.lineTo(x, y);
        ctx.stroke();
        setIsEmpty(false);
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        setIsDrawing(false);

        const canvas = canvasRef.current;
        if (canvas) {
            onSave(canvas.toDataURL('image/png'));
        }
    };

    const handleClear = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setIsEmpty(true);
        if (onClear) onClear();
        onSave("");
    };

    return (
        <div className={`space-y-2 ${className}`}>
            <div className="relative border-2 border-dashed border-muted-foreground/20 rounded-lg bg-white overflow-hidden touch-none">
                {isEmpty && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-muted-foreground/40 font-medium italic">
                        {placeholder}
                    </div>
                )}
                <canvas
                    ref={canvasRef}
                    width={width}
                    height={height}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseOut={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-full cursor-crosshair"
                />
            </div>
            <div className="flex justify-end gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClear}
                    className="text-xs h-8"
                >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Effacer
                </Button>
            </div>
        </div>
    );
};

export default SignaturePad;
