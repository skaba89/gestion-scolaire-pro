import { useTenant } from "@/contexts/TenantContext";

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  locale: string;
  position: "before" | "after";
}

export const CURRENCIES: Record<string, CurrencyConfig> = {
  EUR: { code: "EUR", symbol: "€", name: "Euro", locale: "fr-FR", position: "after" },
  USD: { code: "USD", symbol: "$", name: "Dollar US", locale: "en-US", position: "before" },
  XOF: { code: "XOF", symbol: "FCFA", name: "Franc CFA BCEAO", locale: "fr-FR", position: "after" },
  XAF: { code: "XAF", symbol: "FCFA", name: "Franc CFA CEMAC", locale: "fr-FR", position: "after" },
  GBP: { code: "GBP", symbol: "£", name: "Livre Sterling", locale: "en-GB", position: "before" },
  MAD: { code: "MAD", symbol: "DH", name: "Dirham Marocain", locale: "fr-MA", position: "after" },
  TND: { code: "TND", symbol: "DT", name: "Dinar Tunisien", locale: "fr-TN", position: "after" },
  DZD: { code: "DZD", symbol: "DA", name: "Dinar Algérien", locale: "fr-DZ", position: "after" },
  GNF: { code: "GNF", symbol: "GNF", name: "Franc Guinéen", locale: "fr-GN", position: "after" },
  NGN: { code: "NGN", symbol: "₦", name: "Naira", locale: "en-NG", position: "before" },
  GHS: { code: "GHS", symbol: "₵", name: "Cédi", locale: "en-GH", position: "before" },
  KES: { code: "KES", symbol: "KSh", name: "Shilling Kenyan", locale: "en-KE", position: "before" },
  ZAR: { code: "ZAR", symbol: "R", name: "Rand Sud-Africain", locale: "en-ZA", position: "before" },
  EGP: { code: "EGP", symbol: "£E", name: "Livre Égyptienne", locale: "ar-EG", position: "after" },
  INR: { code: "INR", symbol: "₹", name: "Roupie Indienne", locale: "en-IN", position: "before" },
  CNY: { code: "CNY", symbol: "¥", name: "Yuan Chinois", locale: "zh-CN", position: "before" },
  JPY: { code: "JPY", symbol: "¥", name: "Yen Japonais", locale: "ja-JP", position: "before" },
  BRL: { code: "BRL", symbol: "R$", name: "Real Brésilien", locale: "pt-BR", position: "before" },
  MXN: { code: "MXN", symbol: "$", name: "Peso Mexicain", locale: "es-MX", position: "before" },
  CAD: { code: "CAD", symbol: "$", name: "Dollar Canadien", locale: "en-CA", position: "before" },
  AUD: { code: "AUD", symbol: "$", name: "Dollar Australien", locale: "en-AU", position: "before" },
  CHF: { code: "CHF", symbol: "CHF", name: "Franc Suisse", locale: "fr-CH", position: "after" },
  RWF: { code: "RWF", symbol: "FRw", name: "Franc Rwandais", locale: "rw-RW", position: "after" },
  UGX: { code: "UGX", symbol: "USh", name: "Shilling Ougandais", locale: "en-UG", position: "before" },
  TZS: { code: "TZS", symbol: "TSh", name: "Shilling Tanzanien", locale: "sw-TZ", position: "before" },
  MGA: { code: "MGA", symbol: "Ar", name: "Ariary Malgache", locale: "mg-MG", position: "after" },
  MUR: { code: "MUR", symbol: "Rs", name: "Roupie Mauricienne", locale: "en-MU", position: "before" },
  CDF: { code: "CDF", symbol: "FC", name: "Franc Congolais", locale: "fr-CD", position: "after" },
  AOA: { code: "AOA", symbol: "Kz", name: "Kwanza Angolais", locale: "pt-AO", position: "after" },
};

export const useCurrency = () => {
  const { tenant } = useTenant();
  
  const settings = tenant?.settings as Record<string, any> | undefined;
  const currencyCode = settings?.currency || "XOF";
  const currencyConfig = CURRENCIES[currencyCode] || CURRENCIES.XOF;
  
  const formatCurrency = (value: number): string => {
    const formattedNumber = new Intl.NumberFormat(currencyConfig.locale, { 
      minimumFractionDigits: 0,
      maximumFractionDigits: 2 
    }).format(value);
    
    if (currencyConfig.position === "before") {
      return `${currencyConfig.symbol}${formattedNumber}`;
    }
    return `${formattedNumber} ${currencyConfig.symbol}`;
  };
  
  const formatCurrencyCompact = (value: number): string => {
    if (value >= 1000000) {
      const formatted = (value / 1000000).toFixed(1);
      return currencyConfig.position === "before" 
        ? `${currencyConfig.symbol}${formatted}M`
        : `${formatted}M ${currencyConfig.symbol}`;
    }
    if (value >= 1000) {
      const formatted = (value / 1000).toFixed(1);
      return currencyConfig.position === "before"
        ? `${currencyConfig.symbol}${formatted}K`
        : `${formatted}K ${currencyConfig.symbol}`;
    }
    return formatCurrency(value);
  };
  
  return {
    currency: currencyConfig,
    currencyCode,
    formatCurrency,
    formatCurrencyCompact,
    allCurrencies: CURRENCIES
  };
};
