// backend/psp-paypal.jsw
import { getPayPalCheckout } from "backend/paypal.web";
import wixData from 'wix-data';

async function logToCMS(fn, type, msg, details = {}) {
    try { await wixData.insert('logs', { timestamp: new Date(), functionName: fn, logType: type, message: msg, details: JSON.parse(JSON.stringify(details)) }); }
    catch (e) { console.error('log failed', e); }
}

export const connectAccount = async (options) => {
    await logToCMS('connectAccount', 'INFO', 'Connecting PayPal (AU)');
    const { credentials } = options;
    if (!credentials?.clientId || !credentials?.clientSecret) {
        return { error: { message: 'Missing PayPal Client ID or Secret', code: 'INVALID_CREDENTIALS' } };
    }
    await logToCMS('connectAccount', 'SUCCESS', 'PayPal account connected');
    return { credentials };
};

export const createTransaction = async (options) => {
    await logToCMS('createTransaction', 'INFO', 'Creating PayPal order (AUD)');

    const { order, wixTransactionId } = options;
    const items = order?.description?.items || [];
    const shipping = order?.description?.shippingAddress || {};
    const buyerEmail = shipping.email;
    const shippingName = `${shipping.firstName || ''} ${shipping.lastName || ''}`.trim() || 'Customer';
    const shippingPhone = shipping.phone;

    const shippingAddress = {
        line1: shipping.address || '',
        line2: shipping.address2 || '',
        city: shipping.city || '',
        state: shipping.subdivision || '',     // e.g. NSW, VIC, QLD
        postal_code: shipping.zipCode || '',
        country: shipping.countryCode || 'AU'    // ← Australia
    };

    // Force AUD – Wix sometimes sends lowercase or empty
    const currency = (order?.description?.currency || 'AUD').toUpperCase();
    const successUrl = order?.returnUrls?.successUrl;
    const cancelUrl = order?.returnUrls?.cancelUrl;
    const shippingCost = order?.description?.charges?.shipping; // in cents

    try {
        if (items.length === 0) throw new Error('No line items');
        if (!buyerEmail || !successUrl || !cancelUrl) throw new Error('Missing required fields');

        // Items from Wix are already in dollars (not cents)
        // Just pass them through to getPayPalCheckout
        const itemsTotal = items.reduce((sum, item) => {
            const price = parseFloat(item.price) || 0;
            return sum + price;
        }, 0);

        const shippingAmount = parseFloat(shippingCost) || 0;
        const subtotal = itemsTotal + shippingAmount;

        // PayPal Transaction Fee: 2.9% + $0.30 AUD
        const paypalFeePercentage = 0.029; // 2.9%
        const paypalFixedFee = 0.30; // $0.30 in dollars
        const paypalFee = Number(((subtotal * paypalFeePercentage) + paypalFixedFee).toFixed(2));

        await logToCMS('createTransaction', 'INFO', 'Order totals calculated', {
            itemsTotal,
            shippingAmount,
            subtotal,
            paypalFee,
            grandTotal: subtotal + paypalFee
        });

        const result = await getPayPalCheckout(
            items,
            wixTransactionId,
            shippingName,
            shippingPhone,
            shippingAddress,
            buyerEmail,
            currency,        // AUD
            successUrl,
            cancelUrl,
            shippingAmount,  // Shipping in dollars
            paypalFee        // PayPal transaction fee (2.9% + $0.30)
        );

        await logToCMS('createTransaction', 'SUCCESS', 'PayPal order created', {
            totalAUD: result.url
        });

        return {
            redirectUrl: result.url
        };

    } catch (err) {
        await logToCMS('createTransaction', 'ERROR', 'PayPal failed', { message: err.message });
        return { error: { message: err.message || 'PayPal checkout failed', code: 'PAYPAL_CHECKOUT_FAILED' } };
    }
};

export const refundTransaction = async () => {
    return { error: { message: 'Refunds not implemented yet', code: 'REFUND_NOT_SUPPORTED' } };
};