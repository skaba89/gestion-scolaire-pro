import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { adminQueries } from "@/queries/admin";
import { Student } from "@/queries/students";
import { toast } from "sonner";
import { OrderHeader } from "@/components/admin/orders/OrderHeader";
import { StudentSearch } from "@/components/admin/orders/StudentSearch";
import { AddItemForm } from "@/components/admin/orders/AddItemForm";
import { OrderCart } from "@/components/admin/orders/OrderCart";
import { OrderCheckout } from "@/components/admin/orders/OrderCheckout";
import { OrderReceipt } from "@/components/admin/orders/OrderReceipt";

interface CartItem {
    id: string;
    item_name: string;
    item_id?: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

export const OrderReception = () => {
    const { tenant } = useTenant();
    const { studentLabel } = useStudentLabel();
    const queryClient = useQueryClient();

    // State
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [paymentMethod, setPaymentMethod] = useState<string>("CASH");

    // Receipt State
    const [showReceipt, setShowReceipt] = useState(false);
    const [lastOrder, setLastOrder] = useState<any>(null);
    const [lastOrderItems, setLastOrderItems] = useState<CartItem[]>([]);
    const [lastStudent, setLastStudent] = useState<Student | null>(null);

    const createOrderMutation = useMutation({
        mutationFn: async () => {
            if (!tenant?.id) throw new Error("Tenant ID missing");

            const totalAmount = cart.reduce((sum, item) => sum + item.total_price, 0);
            const orderData = {
                student_id: selectedStudent?.id,
                total_amount: totalAmount,
                payment_method: paymentMethod,
                status: "COMPLETED"
            };

            // Save for receipt
            setLastOrderItems([...cart]);
            setLastStudent(selectedStudent);

            const result = await adminQueries.createOrder(tenant.id, orderData, cart);
            setLastOrder(result);
            return result;
        },
        onSuccess: () => {
            toast.success("Commande enregistrée avec succès");
            setShowReceipt(true);
            setCart([]);
            setSelectedStudent(null);
            setPaymentMethod("CASH");
            queryClient.invalidateQueries({ queryKey: ["admin-orders", tenant?.id] });
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la création de la commande");
        }
    });

    // Handlers
    const handleAddItem = (item: { name: string; price: number; quantity: number; item_id?: string }) => {
        const newItem: CartItem = {
            id: Math.random().toString(36).substr(2, 9),
            item_name: item.name,
            item_id: item.item_id,
            quantity: item.quantity,
            unit_price: item.price,
            total_price: item.price * item.quantity,
        };

        setCart(prev => [...prev, newItem]);
    };

    const handleUpdateQuantity = (id: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newQty = Math.max(1, item.quantity + delta);
                return {
                    ...item,
                    quantity: newQty,
                    total_price: item.unit_price * newQty
                };
            }
            return item;
        }));
    };

    const handleRemoveItem = (id: string) => {
        setCart(prev => prev.filter(item => item.id !== id));
    };

    const cartTotal = cart.reduce((sum, item) => sum + item.total_price, 0);

    return (
        <div className="space-y-6">
            <OrderHeader
                title="Réception de Commandes"
                description={`Gérez les ventes d'articles et uniformes pour vos ${studentLabel}s.`}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Section gauche: Sélection & Panier */}
                <div className="lg:col-span-2 space-y-8">
                    <StudentSearch
                        selectedStudent={selectedStudent}
                        onSelect={setSelectedStudent}
                    />

                    <AddItemForm onAdd={handleAddItem} />

                    <OrderCart
                        items={cart}
                        onUpdateQuantity={handleUpdateQuantity}
                        onRemove={handleRemoveItem}
                    />
                </div>

                {/* Section droite: Paiement */}
                <div className="space-y-8">
                    <OrderCheckout
                        total={cartTotal}
                        paymentMethod={paymentMethod}
                        onPaymentMethodChange={setPaymentMethod}
                        onSubmit={() => createOrderMutation.mutate()}
                        isSubmitting={createOrderMutation.isPending}
                        isDisabled={cart.length === 0}
                    />
                </div>
            </div>

            <OrderReceipt
                isOpen={showReceipt}
                onClose={() => setShowReceipt(false)}
                order={lastOrder}
                student={lastStudent}
                items={lastOrderItems}
            />
        </div>
    );
};

export default OrderReception;
