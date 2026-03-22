import { useRef } from "react";
import { Printer, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useCurrency } from "@/hooks/useCurrency";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Student } from "@/queries/students";

interface ReceiptItem {
    item_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

interface OrderReceiptProps {
    isOpen: boolean;
    onClose: () => void;
    order: {
        id: string;
        order_date: string;
        total_amount: number;
        payment_method: string;
    } | null;
    student: Student | null;
    items: ReceiptItem[];
}

export const OrderReceipt = ({ isOpen, onClose, order, student, items }: OrderReceiptProps) => {
    const { formatCurrency } = useCurrency();
    const receiptRef = useRef<HTMLDivElement>(null);

    if (!order) return null;

    const handlePrint = () => {
        const printContent = receiptRef.current;
        if (!printContent) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
                <head>
                    <title>Reçu de Caisse - ${order.id.slice(0, 8)}</title>
                    <style>
                        body { font-family: 'Courier New', Courier, monospace; padding: 20px; color: #000; }
                        .receipt { max-width: 300px; margin: 0 auto; }
                        .header { text-align: center; margin-bottom: 20px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
                        .info { font-size: 12px; margin-bottom: 15px; }
                        .table { width: 100%; font-size: 12px; border-collapse: collapse; }
                        .table th { text-align: left; border-bottom: 1px solid #000; }
                        .total { margin-top: 15px; border-top: 1px double #000; padding-top: 5px; font-weight: bold; text-align: right; }
                        .footer { text-align: center; margin-top: 20px; font-size: 10px; }
                        @media print {
                            body { padding: 0; }
                            .no-print { display: none; }
                        }
                    </style>
                </head>
                <body>
                    ${printContent.innerHTML}
                    <script>
                        window.onload = function() { window.print(); window.close(); };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const getPaymentMethodLabel = (method: string) => {
        switch (method) {
            case "CASH": return "Espèces";
            case "CARD": return "Carte Bancaire";
            case "TRANSFER": return "Virement";
            default: return "Autre";
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[425px] overflow-hidden">
                <DialogHeader>
                    <div className="flex items-center gap-2 text-green-600 mb-2">
                        <CheckCircle2 className="h-5 w-5" />
                        <DialogTitle>Commande Terminée</DialogTitle>
                    </div>
                </DialogHeader>

                <div className="bg-muted/30 p-6 rounded-xl border border-dashed border-primary/20">
                    <div ref={receiptRef} className="receipt-content">
                        <div className="header">
                            <h2 style={{ margin: '0 0 5px 0', fontSize: '18px' }}>REÇU DE CAISSE</h2>
                            <p style={{ margin: '0', fontSize: '12px' }}>{format(new Date(order.order_date), 'PPP à p', { locale: fr })}</p>
                        </div>

                        <div className="info" style={{ marginTop: '15px' }}>
                            <p style={{ margin: '3px 0' }}><strong>N° :</strong> {order.id.slice(0, 8).toUpperCase()}</p>
                            {student && (
                                <p style={{ margin: '3px 0' }}><strong>Client :</strong> {student.last_name} {student.first_name}</p>
                            )}
                            <p style={{ margin: '3px 0' }}><strong>Règlement :</strong> {getPaymentMethodLabel(order.payment_method)}</p>
                        </div>

                        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '15px' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', fontSize: '12px', borderBottom: '1px solid #000' }}>Art.</th>
                                    <th style={{ textAlign: 'center', fontSize: '12px', borderBottom: '1px solid #000' }}>Qté</th>
                                    <th style={{ textAlign: 'right', fontSize: '12px', borderBottom: '1px solid #000' }}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td style={{ padding: '4px 0', fontSize: '12px' }}>{item.item_name}</td>
                                        <td style={{ padding: '4px 0', textAlign: 'center', fontSize: '12px' }}>{item.quantity}</td>
                                        <td style={{ padding: '4px 0', textAlign: 'right', fontSize: '12px' }}>{formatCurrency(item.total_price)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="total" style={{ marginTop: '15px', borderTop: '1px double #000', paddingTop: '8px', textAlign: 'right' }}>
                            <p style={{ margin: '0', fontSize: '16px', fontWeight: 'bold' }}>TOTAL : {formatCurrency(order.total_amount)}</p>
                        </div>

                        <div className="footer" style={{ marginTop: '25px', textAlign: 'center', fontSize: '10px' }}>
                            <p>Merci de votre confiance !</p>
                            <p>À bientôt</p>
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex flex-row justify-between sm:justify-between items-center gap-2 mt-4">
                    <Button variant="ghost" onClick={onClose} className="gap-2">
                        <X className="h-4 w-4" />
                        Fermer
                    </Button>
                    <Button onClick={handlePrint} className="gap-2 bg-primary hover:bg-primary/90">
                        <Printer className="h-4 w-4" />
                        Imprimer le reçu
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
