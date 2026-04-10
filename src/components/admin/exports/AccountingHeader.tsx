interface AccountingHeaderProps {
    title: string;
    description: string;
}

export const AccountingHeader = ({ title, description }: AccountingHeaderProps) => {
    return (
        <div>
            <h1 className="text-3xl font-bold text-foreground">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
        </div>
    );
};
