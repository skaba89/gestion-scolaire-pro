interface PublicProgramsHeroProps {
    title: string;
    description: string;
}

export const PublicProgramsHero = ({ title, description }: PublicProgramsHeroProps) => {
    return (
        <section className="bg-gradient-to-b from-muted/50 to-background py-16">
            <div className="container mx-auto px-4">
                <div className="max-w-3xl">
                    <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                        {title}
                    </h1>
                    <p className="text-lg text-muted-foreground">
                        {description}
                    </p>
                </div>
            </div>
        </section>
    );
};
