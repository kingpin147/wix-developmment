import { Permissions, webMethod } from 'wix-web-module';
import wixPayBackend from 'wix-pay-backend';

export const createMyPayment = webMethod(Permissions.Anyone, async (paymentData) => {
    const { items, totalPrice, userInfo } = paymentData;

    console.log("Received payment request:", { totalPrice, userInfo });

    const paymentItems = items.map(item => ({
        name: item.name,
        price: Number(item.price),
        quantity: item.quantity || 1
    }));

    try {
        const payment = await wixPayBackend.createPayment({
            items: paymentItems,
            amount: Number(totalPrice),
            currency: "AUD",
            userInfo: userInfo // Pass customer details (address etc.)
        });

        console.log("Payment created:", payment);

        // Wix Pay returns the payment object – the ID is payment.id (not _id)
        return { paymentId: payment.id };   // ← THIS IS THE KEY FIX

    } catch (err) {
        console.error("Create payment error:", err);
        throw new Error("Failed to create payment: " + err.message);
    }
});