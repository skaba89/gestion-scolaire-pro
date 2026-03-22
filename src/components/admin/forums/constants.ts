export const forumCategories = [
    { value: "general", label: "Général", color: "bg-blue-500" },
    { value: "academic", label: "Académique", color: "bg-green-500" },
    { value: "events", label: "Événements", color: "bg-purple-500" },
    { value: "help", label: "Entraide", color: "bg-orange-500" },
    { value: "projects", label: "Projets", color: "bg-pink-500" },
];

export const getCategoryInfo = (category: string) => {
    return forumCategories.find((c) => c.value === category) || forumCategories[0];
};
