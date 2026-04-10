import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CURRENCIES } from "@/hooks/useCurrency";

interface SchoolInfoStepProps {
    data: any;
    onUpdate: (data: any) => void;
}

export const SchoolInfoStep = ({ data, onUpdate }: SchoolInfoStepProps) => {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onUpdate({ ...data, logo: file });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold">Informations de l'Établissement</h2>
                    <p className="text-muted-foreground">Commençons par les informations de base</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <Label htmlFor="name" className="required">Nom de l'établissement</Label>
                    <Input
                        id="name"
                        value={data.name || ''}
                        onChange={(e) => onUpdate({ ...data, name: e.target.value })}
                        placeholder="Lycée Victor Hugo"
                        className="mt-2"
                    />
                </div>

                <div>
                    <Label htmlFor="type" className="required">Type d'établissement</Label>
                    <Select
                        value={data.type}
                        onValueChange={(v) => onUpdate({ ...data, type: v })}
                    >
                        <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Sélectionner un type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="primary">École Primaire</SelectItem>
                            <SelectItem value="middle">Collège</SelectItem>
                            <SelectItem value="high">Lycée</SelectItem>
                            <SelectItem value="university">Université</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label htmlFor="country" className="required">Pays</Label>
                    <Select
                        value={data.country}
                        onValueChange={(v) => onUpdate({ ...data, country: v })}
                    >
                        <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Sélectionner un pays" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="GN">Guinée</SelectItem>
                            <SelectItem value="FR">France</SelectItem>
                            <SelectItem value="SN">Sénégal</SelectItem>
                            <SelectItem value="CI">Côte d'Ivoire</SelectItem>
                            <SelectItem value="CM">Cameroun</SelectItem>
                            <SelectItem value="BF">Burkina Faso</SelectItem>
                            <SelectItem value="ML">Mali</SelectItem>
                            <SelectItem value="BJ">Bénin</SelectItem>
                            <SelectItem value="TG">Togo</SelectItem>
                            <SelectItem value="NE">Niger</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label htmlFor="currency" className="required">Devise</Label>
                    <Select
                        value={data.currency}
                        onValueChange={(v) => onUpdate({ ...data, currency: v })}
                    >
                        <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Sélectionner une devise" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="GNF">
                                {CURRENCIES.GNF.name} ({CURRENCIES.GNF.symbol})
                            </SelectItem>
                            {Object.values(CURRENCIES)
                                .filter(c => c.code !== 'GNF')
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((currency) => (
                                    <SelectItem key={currency.code} value={currency.code}>
                                        {currency.name} ({currency.symbol})
                                    </SelectItem>
                                ))
                            }
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label htmlFor="phone">Téléphone</Label>
                    <Input
                        id="phone"
                        type="tel"
                        value={data.phone || ''}
                        onChange={(e) => onUpdate({ ...data, phone: e.target.value })}
                        placeholder="+33 1 23 45 67 89"
                        className="mt-2"
                    />
                </div>

                <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        value={data.email || ''}
                        onChange={(e) => onUpdate({ ...data, email: e.target.value })}
                        placeholder="contact@etablissement.fr"
                        className="mt-2"
                    />
                </div>

                <div className="md:col-span-2">
                    <Label htmlFor="address">Adresse</Label>
                    <Textarea
                        id="address"
                        value={data.address || ''}
                        onChange={(e) => onUpdate({ ...data, address: e.target.value })}
                        placeholder="123 Rue de l'Éducation, 75001 Paris"
                        className="mt-2"
                        rows={3}
                    />
                </div>

                <div className="md:col-span-2">
                    <Label htmlFor="logo">Logo de l'établissement</Label>
                    <div className="mt-2 flex items-center gap-4">
                        <Input
                            id="logo"
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => document.getElementById('logo')?.click()}
                            className="gap-2"
                        >
                            <Upload className="w-4 h-4" />
                            {data.logo ? 'Changer le logo' : 'Télécharger un logo'}
                        </Button>
                        {data.logo && (
                            <span className="text-sm text-muted-foreground">
                                {data.logo.name}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
