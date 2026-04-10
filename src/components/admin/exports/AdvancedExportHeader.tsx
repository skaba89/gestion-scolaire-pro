interface AdvancedExportHeaderProps {
    title: string;
    description: string;
}

export const AdvancedExportHeader = ({ title, description }: AdvancedExportHeaderProps) => {
    return (
        <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
        </div>
    );
};
